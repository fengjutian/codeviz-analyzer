"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregateGraph = aggregateGraph;
const node_path_1 = __importDefault(require("node:path"));
function uniq(arr) {
    return [...new Set(arr)];
}
function safeRatio(a, b) {
    if (b === 0) {
        return 0;
    }
    return Number((a / b).toFixed(4));
}
function aggregateGraph(input) {
    const symbolMap = new Map();
    for (const symbol of input.symbols) {
        if (!symbolMap.has(symbol.id)) {
            symbolMap.set(symbol.id, symbol);
        }
    }
    const edgeMap = new Map();
    for (const edge of input.edges) {
        const id = `${edge.from}=>${edge.to}#${edge.dependency_type}`;
        if (!edgeMap.has(id)) {
            edgeMap.set(id, { ...edge, id });
        }
    }
    const symbols = [...symbolMap.values()].sort((a, b) => a.id.localeCompare(b.id));
    const edges = [...edgeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
    const fanInMap = new Map();
    const fanOutMap = new Map();
    for (const edge of edges) {
        fanOutMap.set(edge.from, (fanOutMap.get(edge.from) ?? 0) + 1);
        fanInMap.set(edge.to, (fanInMap.get(edge.to) ?? 0) + 1);
    }
    for (const symbol of symbols) {
        symbol.metrics.fan_in = fanInMap.get(symbol.id) ?? 0;
        symbol.metrics.fan_out = fanOutMap.get(symbol.id) ?? 0;
        symbol.dependencies = uniq(symbol.dependencies).sort((a, b) => a.localeCompare(b));
    }
    const moduleMap = new Map();
    for (const symbol of symbols) {
        const module = moduleMap.get(symbol.module_name) ?? {
            id: symbol.module_name,
            module_name: symbol.module_name,
            file_path: node_path_1.default.resolve(input.projectPath, symbol.module_name),
            symbols: [],
            dependencies: [],
            metrics: {
                afferent_coupling: 0,
                efferent_coupling: 0,
                instability: 0,
                cohesion_proxy: 0,
            },
        };
        module.symbols.push(symbol.id);
        moduleMap.set(symbol.module_name, module);
    }
    const moduleIncoming = new Map();
    const moduleOutgoing = new Map();
    const moduleInnerEdges = new Map();
    for (const edge of edges) {
        const fromModule = symbolMap.get(edge.from)?.module_name;
        const toModule = symbolMap.get(edge.to)?.module_name;
        if (!fromModule) {
            continue;
        }
        if (toModule) {
            if (fromModule === toModule) {
                moduleInnerEdges.set(fromModule, (moduleInnerEdges.get(fromModule) ?? 0) + 1);
            }
            else {
                if (!moduleOutgoing.has(fromModule)) {
                    moduleOutgoing.set(fromModule, new Set());
                }
                moduleOutgoing.get(fromModule)?.add(toModule);
                if (!moduleIncoming.has(toModule)) {
                    moduleIncoming.set(toModule, new Set());
                }
                moduleIncoming.get(toModule)?.add(fromModule);
            }
        }
    }
    const modules = [...moduleMap.values()]
        .map((module) => {
        const incoming = moduleIncoming.get(module.module_name) ?? new Set();
        const outgoing = moduleOutgoing.get(module.module_name) ?? new Set();
        const symbolCount = module.symbols.length;
        const theoretical = symbolCount <= 1 ? 1 : (symbolCount * (symbolCount - 1)) / 2;
        const internal = moduleInnerEdges.get(module.module_name) ?? 0;
        const cohesion = safeRatio(internal, theoretical);
        const efferent = outgoing.size;
        const afferent = incoming.size;
        module.dependencies = uniq([
            ...[...outgoing],
            ...[...incoming],
        ]).sort((a, b) => a.localeCompare(b));
        module.metrics = {
            afferent_coupling: afferent,
            efferent_coupling: efferent,
            instability: safeRatio(efferent, afferent + efferent),
            cohesion_proxy: cohesion,
        };
        module.symbols.sort((a, b) => a.localeCompare(b));
        return module;
    })
        .sort((a, b) => a.module_name.localeCompare(b.module_name));
    const metrics = {
        total_modules: modules.length,
        total_symbols: symbols.length,
        total_edges: edges.length,
        uncertain_edges: edges.filter((e) => Boolean(e.uncertain)).length,
    };
    return {
        project: {
            name: node_path_1.default.basename(input.projectPath),
            path: node_path_1.default.resolve(input.projectPath),
        },
        modules,
        symbols,
        edges,
        metrics,
        meta: {
            version: "1.0.0",
            analyzed_at: new Date().toISOString(),
            config: {
                project_path: node_path_1.default.resolve(input.projectPath),
                ignore: input.ignore,
                extensions: input.extensions,
            },
            deviations: [],
        },
        diagnostics: input.diagnostics,
    };
}
//# sourceMappingURL=graph.js.map