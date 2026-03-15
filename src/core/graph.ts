import path from "node:path";
import {
  CircularDependency,
  DependencyImportance,
  DependencyPath,
  Edge,
  GraphAnalysisResult,
  HotspotSymbol,
  InheritanceDepth,
  KnowledgeGraph,
  MetricMap,
  ModuleNode,
  ModuleStability,
  SymbolNode,
} from "../types";

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function safeRatio(a: number, b: number): number {
  if (b === 0) {
    return 0;
  }
  return Number((a / b).toFixed(4));
}

export function aggregateGraph(input: {
  projectPath: string;
  symbols: SymbolNode[];
  edges: Edge[];
  diagnostics: KnowledgeGraph["diagnostics"];
  ignore: string[];
  extensions: string[];
}): KnowledgeGraph {
  const symbolMap = new Map<string, SymbolNode>();
  for (const symbol of input.symbols) {
    if (!symbolMap.has(symbol.id)) {
      symbolMap.set(symbol.id, symbol);
    }
  }

  const edgeMap = new Map<string, Edge>();
  for (const edge of input.edges) {
    const id = `${edge.from}=>${edge.to}#${edge.dependency_type}`;
    if (!edgeMap.has(id)) {
      edgeMap.set(id, { ...edge, id });
    }
  }

  const symbols = [...symbolMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...edgeMap.values()].sort((a, b) => a.id.localeCompare(b.id));

  const fanInMap = new Map<string, number>();
  const fanOutMap = new Map<string, number>();
  for (const edge of edges) {
    fanOutMap.set(edge.from, (fanOutMap.get(edge.from) ?? 0) + 1);
    fanInMap.set(edge.to, (fanInMap.get(edge.to) ?? 0) + 1);
  }

  for (const symbol of symbols) {
    symbol.metrics.fan_in = fanInMap.get(symbol.id) ?? 0;
    symbol.metrics.fan_out = fanOutMap.get(symbol.id) ?? 0;
    symbol.dependencies = uniq(symbol.dependencies).sort((a, b) => a.localeCompare(b));
  }

  const moduleMap = new Map<string, ModuleNode>();
  for (const symbol of symbols) {
    const module = moduleMap.get(symbol.module_name) ?? {
      id: symbol.module_name,
      module_name: symbol.module_name,
      file_path: path.resolve(input.projectPath, symbol.module_name),
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

  const moduleIncoming = new Map<string, Set<string>>();
  const moduleOutgoing = new Map<string, Set<string>>();
  const moduleInnerEdges = new Map<string, number>();

  for (const edge of edges) {
    const fromModule = symbolMap.get(edge.from)?.module_name;
    const toModule = symbolMap.get(edge.to)?.module_name;

    if (!fromModule) {
      continue;
    }

    if (toModule) {
      if (fromModule === toModule) {
        moduleInnerEdges.set(fromModule, (moduleInnerEdges.get(fromModule) ?? 0) + 1);
      } else {
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

  const metrics: MetricMap = {
    total_modules: modules.length,
    total_symbols: symbols.length,
    total_edges: edges.length,
    uncertain_edges: edges.filter((e) => Boolean(e.uncertain)).length,
  };

  return {
    project: {
      name: path.basename(input.projectPath),
      path: path.resolve(input.projectPath),
    },
    modules,
    symbols,
    edges,
    metrics,
    meta: {
      version: "1.0.0",
      analyzed_at: new Date().toISOString(),
      config: {
        project_path: path.resolve(input.projectPath),
        ignore: input.ignore,
        extensions: input.extensions,
      },
      deviations: [],
    },
    diagnostics: input.diagnostics,
  };
}

// ============== 知识图谱分析函数 ==============

/**
 * 检测模块间的循环依赖
 */
export function detectCircularDependencies(modules: ModuleNode[]): CircularDependency[] {
  const circularDeps: CircularDependency[] = [];
  const moduleNames = modules.map((m) => m.module_name);
  const adjacency = new Map<string, Set<string>>();

  for (const module of modules) {
    adjacency.set(module.module_name, new Set(module.dependencies));
  }

  // 使用 Tarjan 算法检测强连通分量
  const visited = new Set<string>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const indexMap = new Map<string, number>();
  const lowLink = new Map<string, number>();
  let index = 0;

  function strongConnect(node: string): void {
    indexMap.set(node, index);
    lowLink.set(node, index);
    index++;
    visited.add(node);
    onStack.add(node);
    stack.push(node);

    const neighbors = adjacency.get(node) ?? new Set();
    for (const neighbor of neighbors) {
      if (!indexMap.has(neighbor)) {
        strongConnect(neighbor);
        lowLink.set(node, Math.min(lowLink.get(node) ?? index, lowLink.get(neighbor) ?? index));
      } else if (onStack.has(neighbor)) {
        lowLink.set(node, Math.min(lowLink.get(node) ?? index, indexMap.get(neighbor) ?? index));
      }
    }

    if (lowLink.get(node) === indexMap.get(node)) {
      const scc: string[] = [];
      let stackNode: string | undefined;
      do {
        stackNode = stack.pop();
        if (stackNode) {
          scc.push(stackNode);
          onStack.delete(stackNode);
        }
      } while (stackNode !== node && stackNode !== undefined);

      if (scc.length > 1) {
        const depType: "direct" | "indirect" = scc.length === 2 && adjacency.get(scc[0])?.has(scc[1]) && adjacency.get(scc[1])?.has(scc[0]) ? "direct" : "indirect";
        circularDeps.push({
          modules: scc.sort((a, b) => a.localeCompare(b)),
          type: depType,
        });
      }
    }
  }

  for (const moduleName of moduleNames) {
    if (!visited.has(moduleName)) {
      strongConnect(moduleName);
    }
  }

  return circularDeps;
}

/**
 * 计算两个模块之间的依赖路径
 */
export function findDependencyPaths(
  modules: ModuleNode[],
  fromModule: string,
  toModule: string,
  maxDepth: number = 5
): DependencyPath[] {
  const adjacency = new Map<string, Set<string>>();
  for (const module of modules) {
    adjacency.set(module.module_name, new Set(module.dependencies));
  }

  const paths: DependencyPath[] = [];
  const visited = new Set<string>();

  function dfs(current: string, target: string, path: string[], depth: number): void {
    if (depth > maxDepth) return;
    if (visited.has(current)) return;

    visited.add(current);
    const newPath = [...path, current];

    if (current === target) {
      paths.push({
        from: fromModule,
        to: toModule,
        path: newPath,
        length: newPath.length - 1,
      });
      visited.delete(current);
      return;
    }

    const neighbors = adjacency.get(current) ?? new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, target, newPath, depth + 1);
      }
    }

    visited.delete(current);
  }

  dfs(fromModule, toModule, [], 0);
  return paths.sort((a, b) => a.length - b.length).slice(0, 10);
}

/**
 * 计算符号的继承深度
 */
export function calculateInheritanceDepths(symbols: SymbolNode[], edges: Edge[]): InheritanceDepth[] {
  const inheritanceEdges = edges.filter((e) => e.dependency_type === "inherit");
  const parentMap = new Map<string, string>();

  for (const edge of inheritanceEdges) {
    parentMap.set(edge.from, edge.to);
  }

  const depths: InheritanceDepth[] = [];

  for (const symbol of symbols) {
    const ancestors: string[] = [];
    let current = symbol.id;
    let depth = 0;
    const visited = new Set<string>();

    while (parentMap.has(current) && !visited.has(current)) {
      visited.add(current);
      const parent = parentMap.get(current);
      if (parent) {
        ancestors.push(parent);
        current = parent;
        depth++;
      }
    }

    if (depth > 0) {
      depths.push({
        symbol_id: symbol.id,
        depth,
        ancestors,
      });
    }
  }

  return depths.sort((a, b) => b.depth - a.depth);
}

/**
 * 分析代码热点符号（高耦合、高复杂度）
 */
export function analyzeHotspotSymbols(symbols: SymbolNode[]): HotspotSymbol[] {
  const maxFanIn = Math.max(...symbols.map((s) => s.metrics.fan_in ?? 0), 1);
  const maxFanOut = Math.max(...symbols.map((s) => s.metrics.fan_out ?? 0), 1);
  const maxLoc = Math.max(...symbols.map((s) => s.metrics.loc ?? 0), 1);

  const scored = symbols.map((symbol) => {
    const fanIn = symbol.metrics.fan_in ?? 0;
    const fanOut = symbol.metrics.fan_out ?? 0;
    const loc = symbol.metrics.loc ?? 0;

    // 归一化评分
    const normFanIn = fanIn / maxFanIn;
    const normFanOut = fanOut / maxFanOut;
    const normLoc = loc / maxLoc;

    // 综合得分：fan-in权重更高（被多处引用更重要）
    const score = normFanIn * 0.4 + normFanOut * 0.3 + normLoc * 0.3;

    return {
      symbol_id: symbol.id,
      score: Number(score.toFixed(4)),
      rank: 0,
      factors: {
        fan_in: fanIn,
        fan_out: fanOut,
        loc,
      },
    };
  });

  // 按得分排序并分配排名
  scored.sort((a, b) => b.score - a.score);
  scored.forEach((item, idx) => {
    item.rank = idx + 1;
  });

  return scored.slice(0, 20);
}

/**
 * 分析模块稳定性
 */
export function analyzeModuleStabilities(modules: ModuleNode[]): ModuleStability[] {
  return modules.map((module) => {
    const instability = module.metrics.instability ?? 0;
    const cohesion = module.metrics.cohesion_proxy ?? 0;

    let stability: "stable" | "unstable" | "mixed";
    let stabilityScore: number;
    let reason: string;

    if (instability < 0.3) {
      stability = "stable";
      stabilityScore = Number((1 - instability).toFixed(4));
      reason = "低传出耦合，稳定模块";
    } else if (instability > 0.7) {
      stability = "unstable";
      stabilityScore = Number(instability.toFixed(4));
      reason = "高传出耦合，不稳定模块";
    } else {
      stability = "mixed";
      stabilityScore = Number((0.5 + (0.5 - Math.abs(0.5 - instability))).toFixed(4));
      reason = "中等耦合，混合稳定性";
    }

    // 结合内聚度调整
    if (cohesion < 0.3 && stability === "stable") {
      stability = "mixed";
      stabilityScore = Number((stabilityScore * 0.7).toFixed(4));
      reason += "，但内聚度较低";
    }

    return {
      module_name: module.module_name,
      stability,
      stability_score: stabilityScore,
      reason,
    };
  });
}

/**
 * 分析依赖重要性（基于中心性）
 */
export function analyzeDependencyImportances(symbols: SymbolNode[]): DependencyImportance[] {
  const maxDependencies = Math.max(
    ...symbols.map((s) => (s.dependencies?.length ?? 0) + (s.metrics.fan_in ?? 0) + (s.metrics.fan_out ?? 0)),
    1
  );

  return symbols.map((symbol) => {
    const depsCount = (symbol.dependencies?.length ?? 0) + (symbol.metrics.fan_in ?? 0) + (symbol.metrics.fan_out ?? 0);
    const centrality = Number((depsCount / maxDependencies).toFixed(4));

    let importance: "critical" | "high" | "medium" | "low";
    if (centrality >= 0.8) {
      importance = "critical";
    } else if (centrality >= 0.5) {
      importance = "high";
    } else if (centrality >= 0.2) {
      importance = "medium";
    } else {
      importance = "low";
    }

    return {
      symbol_id: symbol.id,
      importance,
      centrality,
      dependencies_count: depsCount,
    };
  }).sort((a, b) => b.centrality - a.centrality);
}

/**
 * 计算可维护性指数
 */
export function calculateMaintainabilityIndex(modules: ModuleNode[], symbols: SymbolNode[]): number {
  if (modules.length === 0) return 0;

  // 平均圈复杂度
  const avgComplexity = symbols.reduce((sum, s) => sum + (s.metrics.cyclomatic_complexity ?? 1), 0) / Math.max(symbols.length, 1);

  // 平均代码行数
  const avgLoc = symbols.reduce((sum, s) => sum + (s.metrics.loc ?? 0), 0) / Math.max(symbols.length, 1);

  // 平均模块大小
  const avgModuleSize = symbols.length / Math.max(modules.length, 1);

  // 计算可维护性指数 (0-100)
  // 复杂度、行数、模块大小越小，可维护性越高
  const complexityFactor = Math.max(0, 171 - avgComplexity * 5.2);
  const locFactor = Math.max(0, avgLoc > 0 ? (171 - avgLoc * 0.23) : 171);
  const sizeFactor = Math.max(0, 1.4 * (27 - avgModuleSize * 0.25));

  const index = (complexityFactor * 0.7 + locFactor * 0.3) * 0.1 + sizeFactor;
  return Math.max(0, Math.min(100, Number(index.toFixed(2))));
}

/**
 * 综合知识图谱分析
 */
export function analyzeKnowledgeGraph(graph: KnowledgeGraph): GraphAnalysisResult {
  const circularDeps = detectCircularDependencies(graph.modules);
  const inheritanceDepths = calculateInheritanceDepths(graph.symbols, graph.edges);
  const hotspotSymbols = analyzeHotspotSymbols(graph.symbols);
  const moduleStabilities = analyzeModuleStabilities(graph.modules);
  const dependencyImportances = analyzeDependencyImportances(graph.symbols);
  const maintainabilityIndex = calculateMaintainabilityIndex(graph.modules, graph.symbols);

  // 计算依赖深度
  const depths = new Map<string, number>();
  for (const module of graph.modules) {
    const visited = new Set<string>();
    let maxDepth = 0;

    function getDepth(name: string, depth: number): void {
      if (visited.has(name)) return;
      visited.add(name);
      maxDepth = Math.max(maxDepth, depth);

      const deps = module.dependencies ?? [];
      for (const dep of deps) {
        getDepth(dep, depth + 1);
      }
    }

    getDepth(module.module_name, 0);
    depths.set(module.module_name, maxDepth);
  }

  const depthValues = [...depths.values()];
  const avgDependencyDepth = depthValues.length > 0
    ? Number((depthValues.reduce((a, b) => a + b, 0) / depthValues.length).toFixed(2))
    : 0;
  const maxDependencyDepth = Math.max(...depthValues, 0);

  // 计算项目整体稳定性得分
  const stableModules = moduleStabilities.filter((m) => m.stability === "stable").length;
  const stabilityScore = Number(((stableModules / Math.max(moduleStabilities.length, 1)) * 100).toFixed(2));

  return {
    circular_dependencies: circularDeps,
    dependency_paths: [],
    inheritance_depths: inheritanceDepths,
    hotspot_symbols: hotspotSymbols,
    module_stabilities: moduleStabilities,
    dependency_importances: dependencyImportances,
    metrics: {
      ...graph.metrics,
      avg_dependency_depth: avgDependencyDepth,
      max_dependency_depth: maxDependencyDepth,
      circular_dependency_count: circularDeps.length,
      stability_score: stabilityScore,
      maintainability_index: maintainabilityIndex,
    },
  };
}
