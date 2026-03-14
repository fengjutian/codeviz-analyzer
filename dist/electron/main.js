"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const promises_1 = require("node:fs/promises");
const node_child_process_1 = require("node:child_process");
const node_path_1 = __importDefault(require("node:path"));
const node_url_1 = require("node:url");
const analyzer_1 = require("../core/analyzer");
const jsonExporter_1 = require("../exporters/jsonExporter");
const mermaidExporter_1 = require("../exporters/mermaidExporter");
let mainWindow = null;
let latestGraph = null;
const DEBUG_LOG_ENABLED = process.env.CODEVIZ_DEBUG === "1" || !electron_1.app.isPackaged;
function debugLog(message, payload) {
    if (!DEBUG_LOG_ENABLED)
        return;
    if (payload === undefined) {
        console.log(`[codeviz] ${message}`);
        return;
    }
    console.log(`[codeviz] ${message}`, payload);
}
function launchDetached(command, args, useShell = false) {
    return new Promise((resolve) => {
        const cp = (0, node_child_process_1.spawn)(command, args, {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
            shell: useShell,
        });
        let settled = false;
        cp.once("error", () => {
            if (!settled) {
                settled = true;
                resolve(false);
            }
        });
        cp.once("spawn", () => {
            if (!settled) {
                settled = true;
                cp.unref();
                resolve(true);
            }
        });
    });
}
function getWindowsCodeExecutableCandidates() {
    const localAppData = process.env.LOCALAPPDATA;
    const programFiles = process.env.ProgramFiles;
    const programFilesX86 = process.env["ProgramFiles(x86)"];
    const candidates = [
        localAppData ? node_path_1.default.join(localAppData, "Programs", "Microsoft VS Code", "Code.exe") : "",
        localAppData ? node_path_1.default.join(localAppData, "Programs", "VS Code Insiders", "Code - Insiders.exe") : "",
        programFiles ? node_path_1.default.join(programFiles, "Microsoft VS Code", "Code.exe") : "",
        programFilesX86 ? node_path_1.default.join(programFilesX86, "Microsoft VS Code", "Code.exe") : "",
    ];
    return candidates.filter(Boolean);
}
async function openInVSCodeByCommand(filePath, line, column) {
    const target = `${filePath}:${line}:${column}`;
    const args = ["-g", target, "--reuse-window"];
    if (process.platform === "win32") {
        if (await launchDetached("code", args, true)) {
            return true;
        }
        if (await launchDetached("cmd.exe", ["/c", "code", ...args])) {
            return true;
        }
    }
    else if (await launchDetached("code", args)) {
        return true;
    }
    if (process.platform !== "win32") {
        return false;
    }
    const candidates = getWindowsCodeExecutableCandidates();
    for (const executable of candidates) {
        if (await launchDetached(executable, args)) {
            return true;
        }
    }
    return false;
}
function createMainWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1380,
        height: 860,
        minWidth: 1080,
        minHeight: 680,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: node_path_1.default.join(__dirname, "preload.js"),
        },
    });
    const htmlPath = node_path_1.default.resolve(__dirname, "../../src/renderer/index.html");
    debugLog("renderer html", htmlPath);
    void win.loadFile(htmlPath);
    if (DEBUG_LOG_ENABLED) {
        win.webContents.openDevTools({ mode: "detach" });
        debugLog("DevTools 已自动打开");
    }
    return win;
}
electron_1.app.whenReady().then(() => {
    debugLog("Electron app ready", { debug: DEBUG_LOG_ENABLED, platform: process.platform });
    mainWindow = createMainWindow();
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            debugLog("activate: recreate main window");
            mainWindow = createMainWindow();
        }
    });
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
electron_1.ipcMain.handle("open-project-dialog", async () => {
    debugLog("IPC open-project-dialog");
    const result = await electron_1.dialog.showOpenDialog({
        properties: ["openDirectory"],
        title: "选择要分析的项目目录",
    });
    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths[0];
});
electron_1.ipcMain.handle("analyze-project", async (_event, projectPath) => {
    if (!projectPath) {
        throw new Error("projectPath 不能为空");
    }
    debugLog("IPC analyze-project start", { projectPath });
    const startedAt = Date.now();
    const graph = await (0, analyzer_1.analyzeProject)(projectPath, {
        onProgress: (phase, payload) => {
            debugLog(`analyze progress: ${phase}`, payload);
            if (mainWindow) {
                mainWindow.webContents.send("analysis-progress", { phase, payload });
            }
        },
    });
    latestGraph = graph;
    debugLog("IPC analyze-project done", {
        elapsedMs: Date.now() - startedAt,
        modules: graph.modules.length,
        symbols: graph.symbols.length,
        edges: graph.edges.length,
    });
    return graph;
});
electron_1.ipcMain.handle("export-graph", async (_event, payload) => {
    if (!latestGraph) {
        throw new Error("没有可导出的分析结果，请先执行分析。");
    }
    const outDir = payload.outDir;
    const formats = payload.formats.map((f) => f.toLowerCase());
    debugLog("IPC export-graph", { outDir, formats });
    const outputs = [];
    if (formats.includes("json")) {
        outputs.push(await (0, jsonExporter_1.exportJson)(latestGraph, outDir));
    }
    if (formats.includes("mermaid")) {
        outputs.push(await (0, mermaidExporter_1.exportMermaid)(latestGraph, outDir));
    }
    debugLog("export completed", outputs);
    return outputs;
});
electron_1.ipcMain.handle("read-source-file", async (_event, filePath) => {
    if (!filePath) {
        throw new Error("filePath 不能为空");
    }
    const source = await (0, promises_1.readFile)(filePath, "utf-8");
    return source;
});
electron_1.ipcMain.handle("open-source-location", async (_event, payload) => {
    const filePath = String(payload?.filePath ?? "");
    const line = Math.max(1, Number(payload?.line ?? 1));
    const column = Math.max(1, Number(payload?.column ?? 1));
    if (!filePath) {
        throw new Error("filePath 不能为空");
    }
    const resolvedPath = node_path_1.default.resolve(filePath);
    if (await openInVSCodeByCommand(resolvedPath, line, column)) {
        return { mode: "vscode" };
    }
    const normalizedPath = resolvedPath.replace(/\\/g, "/");
    const vscodeUrl = `vscode://file/${encodeURI(normalizedPath)}:${line}:${column}`;
    try {
        const fileUrl = (0, node_url_1.pathToFileURL)(resolvedPath).toString();
        await electron_1.shell.openExternal(vscodeUrl);
        debugLog("open-source-location fallback openExternal", { vscodeUrl, fileUrl });
        return { mode: "vscode" };
    }
    catch {
        const fallbackError = await electron_1.shell.openPath(resolvedPath);
        if (fallbackError) {
            throw new Error(fallbackError);
        }
        return { mode: "default" };
    }
});
//# sourceMappingURL=main.js.map