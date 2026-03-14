import { KnowledgeGraph } from "../types";
export declare function toMermaid(graph: KnowledgeGraph): string;
export declare function exportMermaid(graph: KnowledgeGraph, outDir: string, fileName?: string): Promise<string>;
