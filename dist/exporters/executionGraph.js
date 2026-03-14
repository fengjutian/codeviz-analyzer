"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSequenceMermaid = toSequenceMermaid;
exports.toHeatmapMermaid = toHeatmapMermaid;
exports.toExecutionJson = toExecutionJson;
exports.exportExecutionGraph = exportExecutionGraph;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
function nodeId(raw) {
    return raw.replace(/[^a-zA-Z0-9_]/g, "_");
}
/**
 * 将执行图转换为 Mermaid 时序图
 */
function toSequenceMermaid(graph) {
    const lines = ["sequenceDiagram"];
    // 收集所有参与者
    const participants = new Set();
    const connections = new Map();
    for (const trace of graph.traces) {
        for (const entry of trace.entries) {
            participants.add(entry.symbol_name);
            if (entry.event === "enter") {
                const key = entry.symbol_name;
                connections.set(key, (connections.get(key) ?? 0) + 1);
            }
        }
    }
    // 添加参与者
    for (const participant of participants) {
        const id = nodeId(participant);
        lines.push(`  participant ${id}["${participant}"]`);
    }
    // 添加调用序列
    let currentDepth = 0;
    let prevSymbol = "";
    for (const trace of graph.traces) {
        for (const entry of trace.entries) {
            const id = nodeId(entry.symbol_name);
            if (entry.event === "enter") {
                if (currentDepth === 0) {
                    lines.push(`  ${id}->>+${id}: ${entry.symbol_name}()`);
                }
                else if (prevSymbol) {
                    lines.push(`  ${nodeId(prevSymbol)}->>+${id}: ${entry.symbol_name}()`);
                }
                currentDepth++;
            }
            else if (entry.event === "return" || entry.event === "throw") {
                if (prevSymbol) {
                    const returnNote = entry.event === "throw" ? "✗" : "";
                    lines.push(`  ${id}-->>-${nodeId(prevSymbol)}: ${returnNote}`);
                }
                currentDepth = Math.max(0, currentDepth - 1);
            }
            prevSymbol = entry.symbol_name;
        }
    }
    return `${lines.join("\n")}\n`;
}
/**
 * 将执行图转换为带热度的流程图
 */
function toHeatmapMermaid(graph) {
    const lines = ["flowchart TD"];
    const nodeCounts = new Map();
    const edges = new Map();
    // 统计节点和边的热度
    for (const trace of graph.traces) {
        let prevEntry = null;
        for (const entry of trace.entries) {
            // 节点热度
            nodeCounts.set(entry.symbol_name, (nodeCounts.get(entry.symbol_name) ?? 0) + 1);
            // 边热度
            if (prevEntry) {
                const edgeKey = `${prevEntry.symbol_name}->${entry.symbol_name}`;
                edges.set(edgeKey, (edges.get(edgeKey) ?? 0) + 1);
            }
            prevEntry = entry;
        }
    }
    // 找到最大热度值用于归一化
    const maxCount = Math.max(...nodeCounts.values(), 1);
    // 添加节点（带热度样式）
    for (const [symbol, count] of nodeCounts) {
        const id = nodeId(symbol);
        const heat = count / maxCount;
        const color = getHeatColor(heat);
        lines.push(`  ${id}["${symbol} (${count})"]:::heat${getHeatLevel(heat)}`);
    }
    // 添加边（带热度标签）
    for (const [edge, count] of edges) {
        const [from, to] = edge.split("->");
        const fromId = nodeId(from);
        const toId = nodeId(to);
        lines.push(`  ${fromId} -.->|${count}x| ${toId}`);
    }
    // 添加样式定义
    lines.push("");
    lines.push("  classDef heat0 fill:#e8f5e9,stroke:#4caf50");
    lines.push("  classDef heat1 fill:#fff3e0,stroke:#ff9800");
    lines.push("  classDef heat2 fill:#ffebee,stroke:#f44336");
    lines.push("  class heat0,heat1,heat2");
    return `${lines.join("\n")}\n`;
}
function getHeatColor(heat) {
    if (heat < 0.3)
        return "#4caf50";
    if (heat < 0.7)
        return "#ff9800";
    return "#f44336";
}
function getHeatLevel(heat) {
    if (heat < 0.3)
        return 0;
    if (heat < 0.7)
        return 1;
    return 2;
}
/**
 * 导出为 JSON 格式
 */
function toExecutionJson(graph) {
    return JSON.stringify(graph, null, 2);
}
/**
 * 导出执行图为文件
 */
async function exportExecutionGraph(graph, outDir, format = "sequence", fileName) {
    await (0, promises_1.mkdir)(outDir, { recursive: true });
    let content;
    let ext;
    switch (format) {
        case "sequence":
            content = toSequenceMermaid(graph);
            ext = "mmd";
            break;
        case "heatmap":
            content = toHeatmapMermaid(graph);
            ext = "mmd";
            break;
        case "json":
            content = toExecutionJson(graph);
            ext = "json";
            break;
    }
    const name = fileName ?? `execution_trace_${graph.execution_id.slice(0, 8)}.${ext}`;
    const filePath = node_path_1.default.join(outDir, name);
    await (0, promises_1.writeFile)(filePath, content, "utf-8");
    return filePath;
}
//# sourceMappingURL=executionGraph.js.map