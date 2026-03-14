import { readFile } from "node:fs/promises";
import path from "node:path";
import { aggregateGraph } from "./graph";
import { PluginManager } from "./pluginManager";
import { scanProjectFiles } from "./scanner";
import { AnalyzeOptions, AnalyzerDiagnostic, KnowledgeGraph } from "../types";
import { jsTsPlugin } from "../plugins/jsTsPlugin";
import { placeholderPlugin } from "../plugins/placeholderPlugin";

const DEFAULT_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py"];

export async function analyzeProject(projectPath: string, options: AnalyzeOptions = {}): Promise<KnowledgeGraph> {
  const ignore = options.ignore ?? [];
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;

  options.onProgress?.("scan", { projectPath });
  const scanned = await scanProjectFiles(projectPath, {
    ignore,
    extensions,
    onProgress: (progress) => options.onProgress?.("scan", progress),
  });

  const pluginManager = new PluginManager();
  pluginManager.registerMany([jsTsPlugin, placeholderPlugin, ...(options.plugins ?? [])]);

  const diagnostics: AnalyzerDiagnostic[] = [...scanned.errors];
  const symbols = [] as KnowledgeGraph["symbols"];
  const edges = [] as KnowledgeGraph["edges"];

  let parsedCount = 0;
  for (const filePath of scanned.files) {
    const relativeModule = path.relative(projectPath, filePath).replace(/\\/g, "/");
    const plugin = pluginManager.resolve(filePath);

    if (!plugin) {
      diagnostics.push({
        level: "warning",
        file: relativeModule,
        message: "未找到匹配解析器，已跳过。",
      });
      continue;
    }

    try {
      const sourceCode = await readFile(filePath, "utf-8");
      const parsed = plugin.parse({
        filePath,
        moduleName: relativeModule,
        sourceCode,
      });

      parsedCount += 1;
      options.onProgress?.("parse", {
        parsed_files: parsedCount,
        total_files: scanned.files.length,
        file: relativeModule,
      });

      symbols.push(...parsed.symbols);
      edges.push(...parsed.edges);
      for (const diagnostic of parsed.diagnostics) {
        diagnostics.push({ ...diagnostic, file: diagnostic.file ?? relativeModule });
      }
    } catch (error) {
      diagnostics.push({
        level: "error",
        file: relativeModule,
        message: `文件解析失败: ${String(error)}`,
      });
    }
  }

  options.onProgress?.("graph", {
    symbols: symbols.length,
    edges: edges.length,
  });

  return aggregateGraph({
    projectPath,
    symbols,
    edges,
    diagnostics,
    ignore,
    extensions,
  });
}
