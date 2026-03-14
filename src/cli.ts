#!/usr/bin/env node
import path from "node:path";
import { Command } from "commander";
import { analyzeProject } from "./core/analyzer";
import { exportJson } from "./exporters/jsonExporter";
import { exportMermaid } from "./exporters/mermaidExporter";
import { exportExecutionGraph } from "./exporters/executionGraph";
import { runWithTrace } from "./core/executionTracer";

const program = new Command();

program.name("codeviz").description("代码可视化分析器 CLI").version("1.0.0");

program
  .command("analyze")
  .argument("<projectPath>", "项目路径")
  .option("--out <dir>", "输出目录", "./out")
  .option("--format <formats>", "输出格式（json,mermaid）", "json")
  .option("--ignore <patterns>", "忽略路径关键字，逗号分隔", "")
  .action(async (projectPathArg, options) => {
    const projectPath = path.resolve(process.cwd(), String(projectPathArg));
    const outDir = path.resolve(process.cwd(), String(options.out));
    const formats = String(options.format)
      .split(",")
      .map((f) => f.trim().toLowerCase())
      .filter(Boolean);
    const ignore = String(options.ignore)
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    const graph = await analyzeProject(projectPath, {
      ignore,
      onProgress: (phase: "scan" | "parse" | "graph", payload: unknown) => {
        if (phase === "scan") {
          return;
        }
        console.log(`[${phase}]`, JSON.stringify(payload));
      },
    });

    if (formats.includes("json")) {
      const jsonPath = await exportJson(graph, outDir);
      console.log(`JSON 已导出: ${jsonPath}`);
    }

    if (formats.includes("mermaid")) {
      const mermaidPath = await exportMermaid(graph, outDir);
      console.log(`Mermaid 已导出: ${mermaidPath}`);
    }

    if (!formats.includes("json") && !formats.includes("mermaid")) {
      throw new Error("--format 仅支持 json, mermaid");
    }
  });

program
  .command("trace")
  .description("运行时追踪并生成执行图")
  .argument("<projectPath>", "项目路径")
  .argument("<entryScript>", "入口脚本路径")
  .option("--out <dir>", "输出目录", "./out")
  .option("--format <format>", "输出格式 (sequence, heatmap, json)", "sequence")
  .option("--timeout <ms>", "超时时间 (毫秒)", "30000")
  .option("--max-depth <depth>", "最大追踪深度", "100")
  .action(async (projectPathArg, entryScript, options) => {
    const projectPath = path.resolve(process.cwd(), String(projectPathArg));
    const outDir = path.resolve(process.cwd(), String(options.out));
    const format = String(options.format) as "sequence" | "heatmap" | "json";
    const timeout = Number(options.timeout);
    const maxDepth = Number(options.maxDepth);

    console.log(`正在追踪: ${entryScript}`);
    console.log(`超时: ${timeout}ms, 最大深度: ${maxDepth}`);

    // 动态加载并执行入口脚本
    const scriptPath = path.resolve(projectPath, entryScript);
    const { default: entryModule } = await import(scriptPath);

    const result = await runWithTrace(
      async () => {
        if (typeof entryModule === "function") {
          return entryModule();
        }
        return entryModule;
      },
      projectPath,
      {
        entry_point: entryScript,
        timeout,
        max_depth: maxDepth,
        capture_params: true,
        capture_return: true,
      }
    );

    if (!result.success || !result.graph) {
      console.error("追踪失败:", result.error);
      process.exit(1);
    }

    const outputPath = await exportExecutionGraph(result.graph, outDir, format);
    console.log(`执行图已导出: ${outputPath}`);
    console.log(`执行次数: ${result.graph.traces[0].entries.length} 条记录`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error("执行失败:", error);
  process.exit(1);
});
