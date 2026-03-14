import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { KnowledgeGraph } from "../types";

function nodeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, "_");
}

export function toMermaid(graph: KnowledgeGraph): string {
  const lines: string[] = ["flowchart TD"];
  const emittedNodes = new Set<string>();

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

export async function exportMermaid(graph: KnowledgeGraph, outDir: string, fileName = "analysis.mmd"): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, fileName);
  await writeFile(filePath, toMermaid(graph), "utf-8");
  return filePath;
}
