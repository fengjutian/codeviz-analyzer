import { ExecutionGraph } from "../types";
/**
 * 将执行图转换为 Mermaid 时序图
 */
export declare function toSequenceMermaid(graph: ExecutionGraph): string;
/**
 * 将执行图转换为带热度的流程图
 */
export declare function toHeatmapMermaid(graph: ExecutionGraph): string;
/**
 * 导出为 JSON 格式
 */
export declare function toExecutionJson(graph: ExecutionGraph): string;
/**
 * 导出执行图为文件
 */
export declare function exportExecutionGraph(graph: ExecutionGraph, outDir: string, format?: "sequence" | "heatmap" | "json", fileName?: string): Promise<string>;
