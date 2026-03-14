"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportJson = exportJson;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
function sortGraph(graph) {
    return {
        ...graph,
        modules: [...graph.modules].sort((a, b) => a.module_name.localeCompare(b.module_name)),
        symbols: [...graph.symbols].sort((a, b) => a.id.localeCompare(b.id)),
        edges: [...graph.edges].sort((a, b) => a.id.localeCompare(b.id)),
        diagnostics: [...graph.diagnostics].sort((a, b) => (a.file ?? "").localeCompare(b.file ?? "")),
    };
}
async function exportJson(graph, outDir, fileName = "analysis.json") {
    await (0, promises_1.mkdir)(outDir, { recursive: true });
    const filePath = node_path_1.default.join(outDir, fileName);
    const stable = sortGraph(graph);
    await (0, promises_1.writeFile)(filePath, `${JSON.stringify(stable, null, 2)}\n`, "utf-8");
    return filePath;
}
//# sourceMappingURL=jsonExporter.js.map