#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const commander_1 = require("commander");
const analyzer_1 = require("./core/analyzer");
const jsonExporter_1 = require("./exporters/jsonExporter");
const mermaidExporter_1 = require("./exporters/mermaidExporter");
const executionGraph_1 = require("./exporters/executionGraph");
const executionTracer_1 = require("./core/executionTracer");
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
    const projectPath = node_path_1.default.resolve(process.cwd(), String(projectPathArg));
    const outDir = node_path_1.default.resolve(process.cwd(), String(options.out));
    const format = String(options.format);
    const timeout = Number(options.timeout);
    const maxDepth = Number(options.maxDepth);
    console.log(`正在追踪: ${entryScript}`);
    console.log(`超时: ${timeout}ms, 最大深度: ${maxDepth}`);
    // 动态加载并执行入口脚本
    const scriptPath = node_path_1.default.resolve(projectPath, entryScript);
    const { default: entryModule } = await Promise.resolve(`${scriptPath}`).then(s => __importStar(require(s)));
    const result = await (0, executionTracer_1.runWithTrace)(async () => {
        if (typeof entryModule === "function") {
            return entryModule();
        }
        return entryModule;
    }, projectPath, {
        entry_point: entryScript,
        timeout,
        max_depth: maxDepth,
        capture_params: true,
        capture_return: true,
    });
    if (!result.success || !result.graph) {
        console.error("追踪失败:", result.error);
        process.exit(1);
    }
    const outputPath = await (0, executionGraph_1.exportExecutionGraph)(result.graph, outDir, format);
    console.log(`执行图已导出: ${outputPath}`);
    console.log(`执行次数: ${result.graph.traces[0].entries.length} 条记录`);
});
program.parseAsync(process.argv).catch((error) => {
    console.error("执行失败:", error);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map