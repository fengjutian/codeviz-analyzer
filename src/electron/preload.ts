import { contextBridge, ipcRenderer } from "electron";
import { ExecutionGraph, KnowledgeGraph } from "../types";

type TraceResult = {
  success: boolean;
  graph?: ExecutionGraph;
  error?: string;
};

type ProgressEventPayload = {
  phase: "scan" | "parse" | "graph";
  payload: unknown;
};

const api = {
  openProjectDialog: (): Promise<string | null> => ipcRenderer.invoke("open-project-dialog"),
  analyzeProject: (projectPath: string): Promise<KnowledgeGraph> => ipcRenderer.invoke("analyze-project", projectPath),
  readSourceFile: (filePath: string): Promise<string> => ipcRenderer.invoke("read-source-file", filePath),
  openSourceLocation: (payload: { filePath: string; line?: number; column?: number }): Promise<{ mode: "vscode" | "default" }> =>
    ipcRenderer.invoke("open-source-location", payload),
  exportGraph: (outDir: string, formats: string[]): Promise<string[]> =>
    ipcRenderer.invoke("export-graph", { outDir, formats }),
  // 执行追踪 API
  runExecutionTrace: (payload: {
    projectPath: string;
    entryScript: string;
    timeout?: number;
    maxDepth?: number;
  }): Promise<TraceResult> => ipcRenderer.invoke("run-execution-trace", payload),
  exportExecutionGraph: (outDir: string, format: "sequence" | "heatmap" | "json"): Promise<string> =>
    ipcRenderer.invoke("export-execution-graph", { outDir, format }),
  getLatestExecutionGraph: (): Promise<TraceResult | null> => ipcRenderer.invoke("get-latest-execution-graph"),
  // 控制流图 API
  extractControlFlow: (payload: {
    filePath: string;
    functionName?: string;
  }): Promise<{
    success: boolean;
    functionName?: string;
    moduleName?: string;
    mermaidCode?: string;
    nodeCount?: number;
    edgeCount?: number;
    functions?: Array<{
      functionName: string;
      mermaidCode: string;
      nodeCount: number;
      edgeCount: number;
    }>;
    error?: string;
  }> => ipcRenderer.invoke("extract-control-flow", payload),
  // React 组件流程图 API
  extractReactFlow: (payload: {
    filePath: string;
    componentName?: string;
  }): Promise<{
    success: boolean;
    componentName?: string;
    moduleName?: string;
    isForwardRef?: boolean;
    displayName?: string;
    mermaidCode?: string;
    nodeCount?: number;
    edgeCount?: number;
    components?: Array<{
      componentName: string;
      mermaidCode: string;
      nodeCount: number;
      edgeCount: number;
    }>;
    error?: string;
  }> => ipcRenderer.invoke("extract-react-flow", payload),
  onAnalysisProgress: (listener: (event: ProgressEventPayload) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, data: ProgressEventPayload) => listener(data);
    ipcRenderer.on("analysis-progress", wrapped);
    return () => ipcRenderer.removeListener("analysis-progress", wrapped);
  },
};

contextBridge.exposeInMainWorld("codeviz", api);
