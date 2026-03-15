import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeProject } from "../core/analyzer";
import { runWithTrace } from "../core/executionTracer";
import { exportJson } from "../exporters/jsonExporter";
import { exportMermaid } from "../exporters/mermaidExporter";
import { exportExecutionGraph } from "../exporters/executionGraph";
import { extractControlFlow, extractModuleControlFlow, toMermaidCFG } from "../exporters/controlFlowExporter";
import { extractReactComponentFlow, toMermaidRCF, extractModuleReactFlows } from "../exporters/reactComponentFlowExporter";
import { calculateCyclomaticComplexity, toComplexityMermaid, toTimelineMermaid, toDepthTreeMermaid } from "../exporters/executionVisualizer";
import { analyzeCodeUnderstanding, extractDocumentation, generateSymbolExplanation } from "../exporters/codeUnderstanding";
import { KnowledgeGraph, ExecutionGraph, SymbolNode } from "../types";

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

// 存储最新的执行追踪结果
let latestExecutionGraph: Awaited<ReturnType<typeof runWithTrace>> | null = null;

// 执行追踪 IPC 处理
ipcMain.handle("run-execution-trace", async (_event, payload: {
  projectPath: string;
  entryScript: string;
  timeout?: number;
  maxDepth?: number;
}) => {
  const { projectPath, entryScript, timeout = 30000, maxDepth = 100 } = payload;

  if (!projectPath || !entryScript) {
    throw new Error("projectPath 和 entryScript 不能为空");
  }

  debugLog("IPC run-execution-trace start", { projectPath, entryScript, timeout, maxDepth });
  const startedAt = Date.now();

  try {
    // 动态加载入口脚本
    const scriptPath = path.resolve(projectPath, entryScript);
    const module = await import(pathToFileURL(scriptPath).href);

    const result = await runWithTrace(
      async () => {
        if (typeof module.default === "function") {
          return module.default();
        }
        return module.default;
      },
      projectPath,
      {
        entry_point: entryScript,
        timeout,
        max_depth: maxDepth,
        capture_params: true,
        capture_return: true,
      }
    );

    latestExecutionGraph = result;

    debugLog("IPC run-execution-trace done", {
      elapsedMs: Date.now() - startedAt,
      success: result.success,
      entries: result.graph?.traces[0]?.entries.length ?? 0,
    });

    return result;
  } catch (error) {
    debugLog("IPC run-execution-trace error", String(error));
    return {
      success: false,
      error: String(error),
    };
  }
});

// 导出执行图 IPC 处理
ipcMain.handle("export-execution-graph", async (_event, payload: {
  outDir: string;
  format: "sequence" | "heatmap" | "json";
}) => {
  const { outDir, format } = payload;

  if (!latestExecutionGraph?.graph) {
    throw new Error("没有可导出的执行追踪结果，请先运行追踪");
  }

  debugLog("IPC export-execution-graph", { outDir, format });

  const outputPath = await exportExecutionGraph(latestExecutionGraph.graph, outDir, format);
  debugLog("export execution graph completed", outputPath);

  return outputPath;
});

// 获取最新执行追踪结果
ipcMain.handle("get-latest-execution-graph", async () => {
  return latestExecutionGraph;
});

// 控制流图 IPC 处理
ipcMain.handle("extract-control-flow", async (_event, payload: {
  filePath: string;
  functionName?: string;
}) => {
  const { filePath, functionName } = payload;

  if (!filePath) {
    throw new Error("filePath 不能为空");
  }

  debugLog("IPC extract-control-flow start", { filePath, functionName });

  try {
    const sourceCode = await readFile(filePath, "utf-8");
    const moduleName = path.basename(filePath);

    let result;
    if (functionName) {
      // 提取单个函数的控制流图
      const graph = extractControlFlow(sourceCode, moduleName, functionName);
      if (!graph) {
        return { success: false, error: `无法提取函数 ${functionName} 的控制流图` };
      }
      const mermaidCode = toMermaidCFG(graph);
      result = {
        success: true,
        functionName,
        moduleName,
        mermaidCode,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
      };
    } else {
      // 提取整个模块的所有函数控制流图
      const graphs = extractModuleControlFlow(sourceCode, moduleName);
      if (graphs.length === 0) {
        return { success: false, error: "未找到可提取控制流图的函数" };
      }
      result = {
        success: true,
        moduleName,
        functions: graphs.map((g) => ({
          functionName: g.functionName,
          mermaidCode: toMermaidCFG(g),
          nodeCount: g.nodes.length,
          edgeCount: g.edges.length,
        })),
      };
    }

    debugLog("IPC extract-control-flow done", result);
    return result;
  } catch (error) {
    debugLog("IPC extract-control-flow error", String(error));
    return { success: false, error: String(error) };
  }
});

// React 组件流程图 IPC 处理器
ipcMain.handle("extract-react-flow", async (_event, payload: { filePath: string; componentName?: string }) => {
  const { filePath, componentName } = payload;
  if (!filePath) {
    throw new Error("filePath 不能为空");
  }

  debugLog("IPC extract-react-flow start", { filePath, componentName });

  try {
    const sourceCode = await readFile(filePath, "utf-8");
    const moduleName = path.basename(filePath);

    let result;
    if (componentName) {
      // 提取单个组件的流程图
      const flow = extractReactComponentFlow(sourceCode, moduleName, componentName);
      if (!flow || flow.nodes.length === 0) {
        return { success: false, error: `无法提取组件 ${componentName} 的流程图` };
      }
      const mermaidCode = toMermaidRCF(flow);
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
    } else {
      // 提取整个模块的所有 React 组件
      const flows = extractModuleReactFlows(sourceCode, moduleName);
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
  } catch (error) {
    debugLog("IPC extract-react-flow error", String(error));
    return { success: false, error: String(error) };
  }
});

ipcMain.handle("calculate-complexity", async (_event, payload: { filePath: string }) => {
  const { filePath } = payload;
  if (!filePath) {
    throw new Error("filePath 不能为空");
  }

  debugLog("IPC calculate-complexity start", { filePath });

  try {
    const sourceCode = await readFile(filePath, "utf-8");
    const report = calculateCyclomaticComplexity(sourceCode, filePath);
    const mermaidCode = toComplexityMermaid(report);

    debugLog("IPC calculate-complexity done", { symbols: report.symbols.length });
    return {
      success: true,
      filePath,
      report,
      mermaidCode,
    };
  } catch (error) {
    debugLog("IPC calculate-complexity error", String(error));
    return { success: false, error: String(error) };
  }
});

ipcMain.handle("get-execution-timeline", async (_event, payload: { graph: ExecutionGraph }) => {
  const { graph } = payload;
  if (!graph) {
    throw new Error("没有可用的执行图");
  }

  debugLog("IPC get-execution-timeline start");

  try {
    const mermaidCode = graph.timeline ? toTimelineMermaid(graph.timeline) : "";
    const depthMermaid = graph.depth_tree ? toDepthTreeMermaid(graph.depth_tree) : "";

    debugLog("IPC get-execution-timeline done");
    return {
      success: true,
      timeline: graph.timeline,
      depthTree: graph.depth_tree,
      mermaidCode,
      depthMermaid,
    };
  } catch (error) {
    debugLog("IPC get-execution-timeline error", String(error));
    return { success: false, error: String(error) };
  }
});

ipcMain.handle("analyze-code-understanding", async (_event, payload: { filePath: string; symbols?: SymbolNode[] }) => {
  const { filePath, symbols } = payload;
  if (!filePath) {
    throw new Error("filePath 不能为空");
  }

  debugLog("IPC analyze-code-understanding start", { filePath });

  try {
    const sourceCode = await readFile(filePath, "utf-8");
    const understanding = analyzeCodeUnderstanding(sourceCode, filePath, symbols ?? []);

    debugLog("IPC analyze-code-understanding done", { symbols: understanding.symbols.length });
    return {
      success: true,
      filePath,
      understanding,
    };
  } catch (error) {
    debugLog("IPC analyze-code-understanding error", String(error));
    return { success: false, error: String(error) };
  }
});

ipcMain.handle("extract-code-documentation", async (_event, payload: { filePath: string }) => {
  const { filePath } = payload;
  if (!filePath) {
    throw new Error("filePath 不能为空");
  }

  debugLog("IPC extract-code-documentation start", { filePath });

  try {
    const sourceCode = await readFile(filePath, "utf-8");
    const docs = extractDocumentation(sourceCode, filePath);

    debugLog("IPC extract-code-documentation done", { docs: docs.length });
    return {
      success: true,
      filePath,
      docs,
    };
  } catch (error) {
    debugLog("IPC extract-code-documentation error", String(error));
    return { success: false, error: String(error) };
  }
});
