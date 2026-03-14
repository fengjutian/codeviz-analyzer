"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.placeholderPlugin = void 0;
exports.placeholderPlugin = {
    language_id: "placeholder-python",
    file_patterns: ["*.py"],
    parse: ({ moduleName, sourceCode }) => {
        const lines = sourceCode.split(/\r?\n/);
        const symbols = [];
        const moduleAnchorId = `${moduleName}::(module)`;
        symbols.push({
            id: moduleAnchorId,
            symbol_name: "(module)",
            symbol_type: "variable",
            module_name: moduleName,
            dependencies: [],
            metrics: {
                cyclomatic_complexity: 1,
                fan_in: 0,
                fan_out: 0,
                loc: lines.length,
            },
        });
        for (const line of lines) {
            const fn = line.match(/^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
            if (fn) {
                symbols.push({
                    id: `${moduleName}::${fn[1]}`,
                    symbol_name: fn[1],
                    symbol_type: "function",
                    module_name: moduleName,
                    dependencies: [],
                    metrics: { cyclomatic_complexity: 1, fan_in: 0, fan_out: 0, loc: 1 },
                });
            }
            const clz = line.match(/^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)/);
            if (clz) {
                symbols.push({
                    id: `${moduleName}::${clz[1]}`,
                    symbol_name: clz[1],
                    symbol_type: "class",
                    module_name: moduleName,
                    dependencies: [],
                    metrics: { cyclomatic_complexity: 1, fan_in: 0, fan_out: 0, loc: 1 },
                });
            }
        }
        return {
            symbols,
            edges: [],
            diagnostics: [
                {
                    level: "info",
                    message: "占位插件仅进行最小符号提取，未提供完整依赖分析。",
                },
            ],
        };
    },
};
//# sourceMappingURL=placeholderPlugin.js.map