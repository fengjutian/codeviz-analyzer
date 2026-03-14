import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeProject } from "../core/analyzer";
import { exportJson } from "../exporters/jsonExporter";
import { exportMermaid } from "../exporters/mermaidExporter";
import { KnowledgeGraph } from "../types";

let mainWindow: BrowserWindow | null = null;
let latestGraph: KnowledgeGraph | null = null;
const DEBUG_LOG_ENABLED = process.env.CODEVIZ_DEBUG === "1" || !app.isPackaged;

function debugLog(message: string, payload?: unknown): void {
  if (!DEBUG_LOG_ENABLED) return;
  if (payload === undefined) {
    console.log(`[codeviz] ${message}`);
    return;
  }
  console.log(`[codeviz] ${message}`, payload);
}

function launchDetached(command: string, args: string[], useShell = false): Promise<boolean> {
  return new Promise((resolve) => {
    const cp = spawn(command, args, {
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

function getWindowsCodeExecutableCandidates(): string[] {
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  const candidates = [
    localAppData ? path.join(localAppData, "Programs", "Microsoft VS Code", "Code.exe") : "",
    localAppData ? path.join(localAppData, "Programs", "VS Code Insiders", "Code - Insiders.exe") : "",
    programFiles ? path.join(programFiles, "Microsoft VS Code", "Code.exe") : "",
    programFilesX86 ? path.join(programFilesX86, "Microsoft VS Code", "Code.exe") : "",
  ];
  return candidates.filter(Boolean);
}

async function openInVSCodeByCommand(filePath: string, line: number, column: number): Promise<boolean> {
  const target = `${filePath}:${line}:${column}`;
  const args = ["-g", target, "--reuse-window"];

  if (process.platform === "win32") {
    if (await launchDetached("code", args, true)) {
      return true;
    }
    if (await launchDetached("cmd.exe", ["/c", "code", ...args])) {
      return true;
    }
  } else if (await launchDetached("code", args)) {
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

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 1080,
    minHeight: 680,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const htmlPath = path.resolve(__dirname, "../../src/renderer/index.html");
  debugLog("renderer html", htmlPath);
  void win.loadFile(htmlPath);

  if (DEBUG_LOG_ENABLED) {
    win.webContents.openDevTools({ mode: "detach" });
    debugLog("DevTools 已自动打开");
  }

  return win;
}

app.whenReady().then(() => {
  debugLog("Electron app ready", { debug: DEBUG_LOG_ENABLED, platform: process.platform });
  mainWindow = createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      debugLog("activate: recreate main window");
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("open-project-dialog", async () => {
  debugLog("IPC open-project-dialog");
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "选择要分析的项目目录",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("analyze-project", async (_event, projectPath: string) => {
  if (!projectPath) {
    throw new Error("projectPath 不能为空");
  }

  debugLog("IPC analyze-project start", { projectPath });
  const startedAt = Date.now();
  const graph = await analyzeProject(projectPath, {
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

ipcMain.handle("export-graph", async (_event, payload: { outDir: string; formats: string[] }) => {
  if (!latestGraph) {
    throw new Error("没有可导出的分析结果，请先执行分析。");
  }

  const outDir = payload.outDir;
  const formats = payload.formats.map((f) => f.toLowerCase());
  debugLog("IPC export-graph", { outDir, formats });

  const outputs: string[] = [];
  if (formats.includes("json")) {
    outputs.push(await exportJson(latestGraph, outDir));
  }
  if (formats.includes("mermaid")) {
    outputs.push(await exportMermaid(latestGraph, outDir));
  }

  debugLog("export completed", outputs);
  return outputs;
});

ipcMain.handle("read-source-file", async (_event, filePath: string) => {
  if (!filePath) {
    throw new Error("filePath 不能为空");
  }
  const source = await readFile(filePath, "utf-8");
  return source;
});

ipcMain.handle(
  "open-source-location",
  async (_event, payload: { filePath: string; line?: number; column?: number }) => {
    const filePath = String(payload?.filePath ?? "");
    const line = Math.max(1, Number(payload?.line ?? 1));
    const column = Math.max(1, Number(payload?.column ?? 1));
    if (!filePath) {
      throw new Error("filePath 不能为空");
    }

    const resolvedPath = path.resolve(filePath);

    if (await openInVSCodeByCommand(resolvedPath, line, column)) {
      return { mode: "vscode" as const };
    }

    const normalizedPath = resolvedPath.replace(/\\/g, "/");
    const vscodeUrl = `vscode://file/${encodeURI(normalizedPath)}:${line}:${column}`;

    try {
      const fileUrl = pathToFileURL(resolvedPath).toString();
      await shell.openExternal(vscodeUrl);
      debugLog("open-source-location fallback openExternal", { vscodeUrl, fileUrl });
      return { mode: "vscode" as const };
    } catch {
      const fallbackError = await shell.openPath(resolvedPath);
      if (fallbackError) {
        throw new Error(fallbackError);
      }
      return { mode: "default" as const };
    }
  }
);
