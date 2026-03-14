import { contextBridge, ipcRenderer } from "electron";
import { KnowledgeGraph } from "../types";

type ProgressEventPayload = {
  phase: "scan" | "parse" | "graph";
  payload: unknown;
};

const api = {
  openProjectDialog: (): Promise<string | null> => ipcRenderer.invoke("open-project-dialog"),
  analyzeProject: (projectPath: string): Promise<KnowledgeGraph> => ipcRenderer.invoke("analyze-project", projectPath),
  exportGraph: (outDir: string, formats: string[]): Promise<string[]> =>
    ipcRenderer.invoke("export-graph", { outDir, formats }),
  onAnalysisProgress: (listener: (event: ProgressEventPayload) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, data: ProgressEventPayload) => listener(data);
    ipcRenderer.on("analysis-progress", wrapped);
    return () => ipcRenderer.removeListener("analysis-progress", wrapped);
  },
};

contextBridge.exposeInMainWorld("codeviz", api);
