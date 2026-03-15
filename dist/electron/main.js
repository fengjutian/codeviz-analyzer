"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const executionTracer_1 = require("../core/executionTracer");
const jsonExporter_1 = require("../exporters/jsonExporter");
const mermaidExporter_1 = require("../exporters/mermaidExporter");
const executionGraph_1 = require("../exporters/executionGraph");
const controlFlowExporter_1 = require("../exporters/controlFlowExporter");
const reactComponentFlowExporter_1 = require("../exporters/reactComponentFlowExporter");
const executionVisualizer_1 = require("../exporters/executionVisualizer");
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
// 存储最新的执行追踪结果
let latestExecutionGraph = null;
// 执行追踪 IPC 处理
electron_1.ipcMain.handle("run-execution-trace", async (_event, payload) => {
    const { projectPath, entryScript, timeout = 30000, maxDepth = 100 } = payload;
    if (!projectPath || !entryScript) {
        throw new Error("projectPath 和 entryScript 不能为空");
    }
    debugLog("IPC run-execution-trace start", { projectPath, entryScript, timeout, maxDepth });
    const startedAt = Date.now();
    try {
        // 动态加载入口脚本
        const scriptPath = node_path_1.default.resolve(projectPath, entryScript);
        const module = await Promise.resolve(`${(0, node_url_1.pathToFileURL)(scriptPath).href}`).then(s => __importStar(require(s)));
        const result = await (0, executionTracer_1.runWithTrace)(async () => {
            if (typeof module.default === "function") {
                return module.default();
            }
            return module.default;
        }, projectPath, {
            entry_point: entryScript,
            timeout,
            max_depth: maxDepth,
            capture_params: true,
            capture_return: true,
        });
        latestExecutionGraph = result;
        debugLog("IPC run-execution-trace done", {
            elapsedMs: Date.now() - startedAt,
            success: result.success,
            entries: result.graph?.traces[0]?.entries.length ?? 0,
        });
        return result;
    }
    catch (error) {
        debugLog("IPC run-execution-trace error", String(error));
        return {
            success: false,
            error: String(error),
        };
    }
});
// 导出执行图 IPC 处理
electron_1.ipcMain.handle("export-execution-graph", async (_event, payload) => {
    const { outDir, format } = payload;
    if (!latestExecutionGraph?.graph) {
        throw new Error("没有可导出的执行追踪结果，请先运行追踪");
    }
    debugLog("IPC export-execution-graph", { outDir, format });
    const outputPath = await (0, executionGraph_1.exportExecutionGraph)(latestExecutionGraph.graph, outDir, format);
    debugLog("export execution graph completed", outputPath);
    return outputPath;
});
// 获取最新执行追踪结果
electron_1.ipcMain.handle("get-latest-execution-graph", async () => {
    return latestExecutionGraph;
});
// 控制流图 IPC 处理
electron_1.ipcMain.handle("extract-control-flow", async (_event, payload) => {
    const { filePath, functionName } = payload;
    if (!filePath) {
        throw new Error("filePath 不能为空");
    }
    debugLog("IPC extract-control-flow start", { filePath, functionName });
    try {
        const sourceCode = await (0, promises_1.readFile)(filePath, "utf-8");
        const moduleName = node_path_1.default.basename(filePath);
        let result;
        if (functionName) {
            // 提取单个函数的控制流图
            const graph = (0, controlFlowExporter_1.extractControlFlow)(sourceCode, moduleName, functionName);
            if (!graph) {
                return { success: false, error: `无法提取函数 ${functionName} 的控制流图` };
            }
            const mermaidCode = (0, controlFlowExporter_1.toMermaidCFG)(graph);
            result = {
                success: true,
                functionName,
                moduleName,
                mermaidCode,
                nodeCount: graph.nodes.length,
                edgeCount: graph.edges.length,
            };
        }
        else {
            // 提取整个模块的所有函数控制流图
            const graphs = (0, controlFlowExporter_1.extractModuleControlFlow)(sourceCode, moduleName);
            if (graphs.length === 0) {
                return { success: false, error: "未找到可提取控制流图的函数" };
            }
            result = {
                success: true,
                moduleName,
                functions: graphs.map((g) => ({
                    functionName: g.functionName,
                    mermaidCode: (0, controlFlowExporter_1.toMermaidCFG)(g),
                    nodeCount: g.nodes.length,
                    edgeCount: g.edges.length,
                })),
            };
        }
        debugLog("IPC extract-control-flow done", result);
        return result;
    }
    catch (error) {
        debugLog("IPC extract-control-flow error", String(error));
        return { success: false, error: String(error) };
    }
});
// React 组件流程图 IPC 处理器
electron_1.ipcMain.handle("extract-react-flow", async (_event, payload) => {
    const { filePath, componentName } = payload;
    if (!filePath) {
        throw new Error("filePath 不能为空");
    }
    debugLog("IPC extract-react-flow start", { filePath, componentName });
    try {
        const sourceCode = await (0, promises_1.readFile)(filePath, "utf-8");
        const moduleName = node_path_1.default.basename(filePath);
        let result;
        if (componentName) {
            // 提取单个组件的流程图
            const flow = (0, reactComponentFlowExporter_1.extractReactComponentFlow)(sourceCode, moduleName, componentName);
            if (!flow || flow.nodes.length === 0) {
                return { success: false, error: `无法提取组件 ${componentName} 的流程图` };
            }
            const mermaidCode = (0, reactComponentFlowExporter_1.toMermaidRCF)(flow);
            result = {
                success: true,
                componentName: flow.componentName,
                moduleName,
                isForwardRef: flow.isForwardRef,
                displayName: flow.displayName,
                mermaidCode,
                nodeCount: flow.nodes.length,
                edgeCount: flow.edges.length,
            };
        }
        else {
            // 提取整个模块的所有 React 组件
            const flows = (0, reactComponentFlowExporter_1.extractModuleReactFlows)(sourceCode, moduleName);
            if (flows.length === 0) {
                return { success: false, error: "未找到 React 组件" };
            }
            result = {
                success: true,
                moduleName,
                components: flows.map((f) => ({
                    componentName: f.componentName,
                    mermaidCode: f.mermaidCode,
                    nodeCount: f.nodeCount,
                    edgeCount: f.edgeCount,
                })),
            };
        }
        debugLog("IPC extract-react-flow done", result);
        return result;
    }
    catch (error) {
        debugLog("IPC extract-react-flow error", String(error));
        return { success: false, error: String(error) };
    }
});
electron_1.ipcMain.handle("calculate-complexity", async (_event, payload) => {
    const { filePath } = payload;
    if (!filePath) {
        throw new Error("filePath 不能为空");
    }
    debugLog("IPC calculate-complexity start", { filePath });
    try {
        const sourceCode = await (0, promises_1.readFile)(filePath, "utf-8");
        const report = (0, executionVisualizer_1.calculateCyclomaticComplexity)(sourceCode, filePath);
        const mermaidCode = (0, executionVisualizer_1.toComplexityMermaid)(report);
        debugLog("IPC calculate-complexity done", { symbols: report.symbols.length });
        return {
            success: true,
            filePath,
            report,
            mermaidCode,
        };
    }
    catch (error) {
        debugLog("IPC calculate-complexity error", String(error));
        return { success: false, error: String(error) };
    }
});
electron_1.ipcMain.handle("get-execution-timeline", async (_event, payload) => {
    const { graph } = payload;
    if (!graph) {
        throw new Error("没有可用的执行图");
    }
    debugLog("IPC get-execution-timeline start");
    try {
        const mermaidCode = graph.timeline ? (0, executionVisualizer_1.toTimelineMermaid)(graph.timeline) : "";
        const depthMermaid = graph.depth_tree ? (0, executionVisualizer_1.toDepthTreeMermaid)(graph.depth_tree) : "";
        debugLog("IPC get-execution-timeline done");
        return {
            success: true,
            timeline: graph.timeline,
            depthTree: graph.depth_tree,
            mermaidCode,
            depthMermaid,
        };
    }
    catch (error) {
        debugLog("IPC get-execution-timeline error", String(error));
        return { success: false, error: String(error) };
    }
});
//# sourceMappingURL=main.js.map