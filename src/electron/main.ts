import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { analyzeProject } from "../core/analyzer";
import { exportJson } from "../exporters/jsonExporter";
import { exportMermaid } from "../exporters/mermaidExporter";
import { KnowledgeGraph } from "../types";

let mainWindow: BrowserWindow | null = null;
let latestGraph: KnowledgeGraph | null = null;

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
  void win.loadFile(htmlPath);
  return win;
}

app.whenReady().then(() => {
  mainWindow = createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
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

  const graph = await analyzeProject(projectPath, {
    onProgress: (phase, payload) => {
      if (mainWindow) {
        mainWindow.webContents.send("analysis-progress", { phase, payload });
      }
    },
  });

  latestGraph = graph;
  return graph;
});

ipcMain.handle("export-graph", async (_event, payload: { outDir: string; formats: string[] }) => {
  if (!latestGraph) {
    throw new Error("没有可导出的分析结果，请先执行分析。");
  }


  const outDir = payload.outDir;
  const formats = payload.formats.map((f) => f.toLowerCase());

  const outputs: string[] = [];
  if (formats.includes("json")) {
    outputs.push(await exportJson(latestGraph, outDir));
  }
  if (formats.includes("mermaid")) {
    outputs.push(await exportMermaid(latestGraph, outDir));
  }

  return outputs;
});
