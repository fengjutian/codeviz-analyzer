"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    openProjectDialog: () => electron_1.ipcRenderer.invoke("open-project-dialog"),
    analyzeProject: (projectPath) => electron_1.ipcRenderer.invoke("analyze-project", projectPath),
    readSourceFile: (filePath) => electron_1.ipcRenderer.invoke("read-source-file", filePath),
    openSourceLocation: (payload) => electron_1.ipcRenderer.invoke("open-source-location", payload),
    exportGraph: (outDir, formats) => electron_1.ipcRenderer.invoke("export-graph", { outDir, formats }),
    // 执行追踪 API
    runExecutionTrace: (payload) => electron_1.ipcRenderer.invoke("run-execution-trace", payload),
    exportExecutionGraph: (outDir, format) => electron_1.ipcRenderer.invoke("export-execution-graph", { outDir, format }),
    getLatestExecutionGraph: () => electron_1.ipcRenderer.invoke("get-latest-execution-graph"),
    // 控制流图 API
    extractControlFlow: (payload) => electron_1.ipcRenderer.invoke("extract-control-flow", payload),
    // React 组件流程图 API
    extractReactFlow: (payload) => electron_1.ipcRenderer.invoke("extract-react-flow", payload),
    // 复杂度分析 API
    calculateComplexity: (payload) => electron_1.ipcRenderer.invoke("calculate-complexity", payload),
    // 执行时间线 API
    getExecutionTimeline: (payload) => electron_1.ipcRenderer.invoke("get-execution-timeline", payload),
    onAnalysisProgress: (listener) => {
        const wrapped = (_event, data) => listener(data);
        electron_1.ipcRenderer.on("analysis-progress", wrapped);
        return () => electron_1.ipcRenderer.removeListener("analysis-progress", wrapped);
    },
};
electron_1.contextBridge.exposeInMainWorld("codeviz", api);
//# sourceMappingURL=preload.js.map