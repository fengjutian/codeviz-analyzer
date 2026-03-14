"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toMermaid = toMermaid;
exports.exportMermaid = exportMermaid;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
function nodeId(raw) {
    return raw.replace(/[^a-zA-Z0-9_]/g, "_");
}
function toMermaid(graph) {
    const lines = ["flowchart TD"];
    const emittedNodes = new Set();
    for (const symbol of graph.symbols) {
        const id = nodeId(symbol.id);
        if (!emittedNodes.has(id)) {
            lines.push(`  ${id}[\"${symbol.module_name}::${symbol.symbol_name}\"]`);
            emittedNodes.add(id);
        }
    }
    for (const edge of graph.edges) {
        const from = nodeId(edge.from);
        const to = nodeId(edge.to);
        if (!emittedNodes.has(from)) {
            lines.push(`  ${from}[\"${edge.from}\"]`);
            emittedNodes.add(from);
        }
        if (!emittedNodes.has(to)) {
            lines.push(`  ${to}[\"${edge.to}\"]`);
            emittedNodes.add(to);
        }
        lines.push(`  ${from} -->|${edge.dependency_type}| ${to}`);
    }
    return `${lines.join("\n")}\n`;
}
async function exportMermaid(graph, outDir, fileName = "analysis.mmd") {
    await (0, promises_1.mkdir)(outDir, { recursive: true });
    const filePath = node_path_1.default.join(outDir, fileName);
    await (0, promises_1.writeFile)(filePath, toMermaid(graph), "utf-8");
    return filePath;
}
//# sourceMappingURL=mermaidExporter.js.map