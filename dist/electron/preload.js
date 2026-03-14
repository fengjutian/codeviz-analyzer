"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    openProjectDialog: () => electron_1.ipcRenderer.invoke("open-project-dialog"),
    analyzeProject: (projectPath) => electron_1.ipcRenderer.invoke("analyze-project", projectPath),
    exportGraph: (outDir, formats) => electron_1.ipcRenderer.invoke("export-graph", { outDir, formats }),
    onAnalysisProgress: (listener) => {
        const wrapped = (_event, data) => listener(data);
        electron_1.ipcRenderer.on("analysis-progress", wrapped);
        return () => electron_1.ipcRenderer.removeListener("analysis-progress", wrapped);
    },
};
electron_1.contextBridge.exposeInMainWorld("codeviz", api);
//# sourceMappingURL=preload.js.map