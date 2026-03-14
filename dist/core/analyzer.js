"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeProject = analyzeProject;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const graph_1 = require("./graph");
const pluginManager_1 = require("./pluginManager");
const scanner_1 = require("./scanner");
const jsTsPlugin_1 = require("../plugins/jsTsPlugin");
const placeholderPlugin_1 = require("../plugins/placeholderPlugin");
async function analyzeProject(projectPath, options = {}) {
    const ignore = options.ignore ?? [];
    const extensions = options.extensions?.map((ext) => ext.toLowerCase()).filter(Boolean);
    options.onProgress?.("scan", { projectPath });
    const scanned = await (0, scanner_1.scanProjectFiles)(projectPath, {
        ignore,
        extensions,
        onProgress: (progress) => options.onProgress?.("scan", progress),
    });
    const pluginManager = new pluginManager_1.PluginManager();
    pluginManager.registerMany([jsTsPlugin_1.jsTsPlugin, placeholderPlugin_1.placeholderPlugin, ...(options.plugins ?? [])]);
    const diagnostics = [...scanned.errors];
    const symbols = [];
    const edges = [];
    let parsedCount = 0;
    for (const filePath of scanned.files) {
        const relativeModule = node_path_1.default.relative(projectPath, filePath).replace(/\\/g, "/");
        const plugin = pluginManager.resolve(filePath);
        if (!plugin) {
            const symbolId = `${relativeModule}::(file)`;
            symbols.push({
                id: symbolId,
                symbol_name: "(file)",
                symbol_type: "variable",
                module_name: relativeModule,
                dependencies: [],
                metrics: {
                    cyclomatic_complexity: 1,
                    fan_in: 0,
                    fan_out: 0,
                    loc: 0,
                },
            });
            parsedCount += 1;
            options.onProgress?.("parse", {
                parsed_files: parsedCount,
                total_files: scanned.files.length,
                file: relativeModule,
            });
            continue;
        }
        try {
            const sourceCode = await (0, promises_1.readFile)(filePath, "utf-8");
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
        }
        catch (error) {
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
    return (0, graph_1.aggregateGraph)({
        projectPath,
        symbols,
        edges,
        diagnostics,
        ignore,
        extensions: extensions ?? [],
    });
}
//# sourceMappingURL=analyzer.js.map