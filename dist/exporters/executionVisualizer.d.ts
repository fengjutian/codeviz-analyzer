import { ComplexityReport, ExecutionDepth, ExecutionGraph, ExecutionTimeline } from "../types";
export declare function buildExecutionTimeline(graph: ExecutionGraph): ExecutionTimeline;
export declare function buildDepthTree(graph: ExecutionGraph): ExecutionDepth | undefined;
export declare function toTimelineMermaid(timeline: ExecutionTimeline): string;
export declare function toDepthTreeMermaid(depth: ExecutionDepth, depthLevel?: number): string;
export declare function calculateCyclomaticComplexity(sourceCode: string, filePath: string): ComplexityReport;
export declare function toComplexityMermaid(report: ComplexityReport): string;
export declare function enrichExecutionGraph(graph: ExecutionGraph): ExecutionGraph;
