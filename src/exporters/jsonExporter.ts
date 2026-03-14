import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { KnowledgeGraph } from "../types";

function sortGraph(graph: KnowledgeGraph): KnowledgeGraph {
  return {
    ...graph,
    modules: [...graph.modules].sort((a, b) => a.module_name.localeCompare(b.module_name)),
    symbols: [...graph.symbols].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...graph.edges].sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics: [...graph.diagnostics].sort((a, b) => (a.file ?? "").localeCompare(b.file ?? "")),
  };
}

export async function exportJson(graph: KnowledgeGraph, outDir: string, fileName = "analysis.json"): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, fileName);
  const stable = sortGraph(graph);
  await writeFile(filePath, `${JSON.stringify(stable, null, 2)}\n`, "utf-8");
  return filePath;
}
