#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const commander_1 = require("commander");
const analyzer_1 = require("./core/analyzer");
const jsonExporter_1 = require("./exporters/jsonExporter");
const mermaidExporter_1 = require("./exporters/mermaidExporter");
const program = new commander_1.Command();
program.name("codeviz").description("代码可视化分析器 CLI").version("1.0.0");
program
    .command("analyze")
    .argument("<projectPath>", "项目路径")
    .option("--out <dir>", "输出目录", "./out")
    .option("--format <formats>", "输出格式（json,mermaid）", "json")
    .option("--ignore <patterns>", "忽略路径关键字，逗号分隔", "")
    .action(async (projectPathArg, options) => {
    const projectPath = node_path_1.default.resolve(process.cwd(), String(projectPathArg));
    const outDir = node_path_1.default.resolve(process.cwd(), String(options.out));
    const formats = String(options.format)
        .split(",")
        .map((f) => f.trim().toLowerCase())
        .filter(Boolean);
    const ignore = String(options.ignore)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    const graph = await (0, analyzer_1.analyzeProject)(projectPath, {
        ignore,
        onProgress: (phase, payload) => {
            if (phase === "scan") {
                return;
            }
            console.log(`[${phase}]`, JSON.stringify(payload));
        },
    });
    if (formats.includes("json")) {
        const jsonPath = await (0, jsonExporter_1.exportJson)(graph, outDir);
        console.log(`JSON 已导出: ${jsonPath}`);
    }
    if (formats.includes("mermaid")) {
        const mermaidPath = await (0, mermaidExporter_1.exportMermaid)(graph, outDir);
        console.log(`Mermaid 已导出: ${mermaidPath}`);
    }
    if (!formats.includes("json") && !formats.includes("mermaid")) {
        throw new Error("--format 仅支持 json, mermaid");
    }
});
program.parseAsync(process.argv).catch((error) => {
    console.error("执行失败:", error);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map