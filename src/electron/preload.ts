import { contextBridge, ipcRenderer } from "electron";
import { ExecutionGraph, KnowledgeGraph, SymbolNode } from "../types";

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
  // 复杂度分析 API
  calculateComplexity: (payload: {
    filePath: string;
  }): Promise<{
    success: boolean;
    filePath?: string;
    report?: {
      file_path: string;
      symbols: Array<{
        symbol_id: string;
        symbol_name: string;
        complexity: number;
        decision_points: number;
        lines_of_code: number;
        nesting_depth: number;
      }>;
      avg_complexity: number;
      max_complexity: number;
      high_complexity_count: number;
    };
    mermaidCode?: string;
    error?: string;
  }> => ipcRenderer.invoke("calculate-complexity", payload),
  // 执行时间线 API
  getExecutionTimeline: (payload: {
    graph: ExecutionGraph;
  }): Promise<{
    success: boolean;
    timeline?: {
      execution_id: string;
      total_duration: number;
      max_depth: number;
    };
    depthTree?: {
      symbol_id: string;
      symbol_name: string;
      max_depth: number;
      call_count: number;
      total_duration: number;
    };
    mermaidCode?: string;
    depthMermaid?: string;
    error?: string;
  }> => ipcRenderer.invoke("get-execution-timeline", payload),
  // 代码理解分析 API
  analyzeCodeUnderstanding: (payload: {
    filePath: string;
    symbols?: SymbolNode[];
  }): Promise<{
    success: boolean;
    filePath?: string;
    understanding?: {
      file_path: string;
      file_summary: string;
      symbols: Array<{
        symbol_id: string;
        symbol_name: string;
        symbol_type: string;
        what_it_does: string;
        how_it_works: string;
        parameters: Array<{ name: string; purpose: string }>;
        returns: string;
        side_effects: string[];
        complexity: string;
        suggestions: string[];
      }>;
      key_concepts: string[];
      usage_patterns: string[];
      dependencies_summary: string;
    };
    error?: string;
  }> => ipcRenderer.invoke("analyze-code-understanding", payload),
  // 代码文档提取 API
  extractCodeDocumentation: (payload: {
    filePath: string;
  }): Promise<{
    success: boolean;
    filePath?: string;
    docs?: Array<{
      summary?: string;
      description?: string;
      params?: Array<{ name: string; description: string }>;
      returns?: string;
      examples?: string[];
      see_also?: string[];
      throws?: string[];
      deprecated?: string;
    }>;
    error?: string;
  }> => ipcRenderer.invoke("extract-code-documentation", payload),
  onAnalysisProgress: (listener: (event: ProgressEventPayload) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, data: ProgressEventPayload) => listener(data);
    ipcRenderer.on("analysis-progress", wrapped);
    return () => ipcRenderer.removeListener("analysis-progress", wrapped);
  },
};

contextBridge.exposeInMainWorld("codeviz", api);
