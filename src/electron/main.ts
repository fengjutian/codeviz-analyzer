import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
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
