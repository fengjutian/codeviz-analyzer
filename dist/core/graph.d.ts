import { Edge, KnowledgeGraph, SymbolNode } from "../types";
export declare function aggregateGraph(input: {
    projectPath: string;
    symbols: SymbolNode[];
    edges: Edge[];
    diagnostics: KnowledgeGraph["diagnostics"];
    ignore: string[];
    extensions: string[];
}): KnowledgeGraph;
