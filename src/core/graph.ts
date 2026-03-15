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
  ArchitectureLayer,
  ArchitecturePattern,
  ArchitectureFitness,
  ArchitectureViolation,
  LayerType,
  LayerViolation,
  PackageAnalysis,
  ImpactAnalysisResult,
  DependencyRiskAssessment,
  KeyPathAnalysis,
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
      dependents: [],
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

  const dependencyAnalysis = analyzeDependencies(modules, edges);

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
    dependency_analysis: dependencyAnalysis,
  };
}

function analyzeDependencies(modules: ModuleNode[], edges: Edge[]) {
  const circularDeps = detectCircularDependencies(modules);
  
  const dependencyDepthMap = calculateDependencyDepth(modules);
  
  const moduleSymbols = new Map<string, Set<string>>();
  const symbolReferences = new Map<string, string[]>();
  
  for (const edge of edges) {
    if (edge.dependency_type === "call" || edge.dependency_type === "reference") {
      const refs = symbolReferences.get(edge.to) ?? [];
      refs.push(edge.from);
      symbolReferences.set(edge.to, refs);
    }
  }
  
  const unusedExports: { symbol_id: string; symbol_name: string; module_name: string; export_type: "default" | "named" }[] = [];
  for (const [symbolId, refs] of symbolReferences) {
    if (refs.length === 0) {
      const parts = symbolId.split("::");
      if (parts.length >= 2) {
        unusedExports.push({
          symbol_id: symbolId,
          symbol_name: parts[parts.length - 1],
          module_name: parts[0],
          export_type: "named",
        });
      }
    }
  }
  
  const coreModules: string[] = [];
  const leafModules: string[] = [];
  
  for (const module of modules) {
    const deps = module.dependencies ?? [];
    const dependents = module.dependents ?? [];
    
    if (dependents.length > deps.length && dependents.length > 2) {
      coreModules.push(module.module_name);
    }
    
    if (deps.length === 0 && module.symbols.length > 0) {
      leafModules.push(module.module_name);
    }
  }
  
  for (const edge of edges) {
    const fromModule = edge.from.split("::")[0];
    const toModule = edge.to.split("::")[0];
    
    if (fromModule !== toModule) {
      const isCyclic = circularDeps.some(cd => 
        cd.modules.includes(fromModule) && cd.modules.includes(toModule)
      );
      if (isCyclic) {
        edge.is_cyclic = true;
      }
    }
  }
  
  return {
    circular_dependencies: circularDeps.map((cd: any) => ({
      modules: cd.modules,
      path: cd.modules,
      type: cd.type,
    })),
    dependency_depth: dependencyDepthMap,
    unused_exports: unusedExports.slice(0, 20),
    core_modules: coreModules.slice(0, 10),
    leaf_modules: leafModules.slice(0, 10),
  };
}

function calculateDependencyDepth(modules: ModuleNode[]): Map<string, number> {
  const depthMap = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();
  
  for (const module of modules) {
    adjacency.set(module.module_name, new Set(module.dependencies ?? []));
  }
  
  const calculateDepth = (moduleName: string, visited: Set<string>): number => {
    if (visited.has(moduleName)) {
      return 0;
    }
    visited.add(moduleName);
    
    const deps = adjacency.get(moduleName) ?? new Set();
    if (deps.size === 0) {
      return 0;
    }
    
    let maxDepth = 0;
    for (const dep of deps) {
      const depth = calculateDepth(dep, new Set(visited));
      maxDepth = Math.max(maxDepth, depth + 1);
    }
    
    return maxDepth;
  };
  
  for (const module of modules) {
    const depth = calculateDepth(module.module_name, new Set());
    depthMap.set(module.module_name, depth);
  }
  
  return depthMap;
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
        const sortedModules = scc.sort((a, b) => a.localeCompare(b));
        circularDeps.push({
          modules: sortedModules,
          path: sortedModules,
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

const ALL_LAYER_DEPS: Record<LayerType, LayerType[]> = {
  ui: ["presentation", "application", "service", "business", "domain", "infrastructure", "data", "shared", "entry"],
  presentation: ["application", "service", "business", "domain", "infrastructure", "data", "shared", "entry"],
  application: ["service", "business", "domain", "infrastructure", "data", "shared", "entry"],
  service: ["business", "domain", "infrastructure", "data", "shared"],
  business: ["domain", "infrastructure", "data", "shared"],
  domain: ["infrastructure", "data", "shared"],
  infrastructure: ["data"],
  data: [],
  shared: [],
  entry: ["presentation", "application", "service", "business", "domain", "infrastructure", "data", "shared"],
};

const LAYER_PATTERNS: Record<ArchitecturePattern, { layers: LayerType[] }> = {
  layered: {
    layers: ["ui", "application", "business", "infrastructure", "data"],
  },
  hexagonal: {
    layers: ["entry", "application", "domain", "infrastructure"],
  },
  onion: {
    layers: ["ui", "application", "domain", "infrastructure"],
  },
  clean: {
    layers: ["ui", "application", "domain", "infrastructure"],
  },
  modular: {
    layers: ["ui", "service", "data", "shared"],
  },
  monolithic: {
    layers: ["ui", "application", "business", "infrastructure", "data", "shared"],
  },
};

const LAYER_DISPLAY_NAMES: Record<LayerType, string> = {
  ui: "用户界面层 (UI)",
  presentation: "表现层 (Presentation)",
  application: "应用层 (Application)",
  service: "服务层 (Service)",
  business: "业务逻辑层 (Business)",
  domain: "领域层 (Domain)",
  infrastructure: "基础设施层 (Infrastructure)",
  data: "数据层 (Data)",
  shared: "共享层 (Shared/Utils)",
  entry: "入口层 (Entry)",
};

const LAYER_KEYWORDS: Record<LayerType, string[]> = {
  ui: ["ui", "view", "page", "screen", "component", "widget", "presenter"],
  presentation: ["presentation", "render", "display", "viewmodel"],
  application: ["application", "app", "service", "usecase", "usecase", "facade"],
  service: ["service", "manager", "helper", "handler", "processor"],
  business: ["business", "domain", "model", "entity", "aggregate", "valueobject"],
  domain: ["domain", "entity", "aggregate", "valueobject", "domainevent"],
  infrastructure: ["infrastructure", "persistence", "repository", "dao", "adapter", "gateway"],
  data: ["data", "database", "db", "datasource", "orm", "migration"],
  shared: ["shared", "util", "common", "constant", "config", "lib", "helper", "tool", "utils"],
  entry: ["entry", "main", "bootstrap", "index", "app", "server"],
};

function detectModuleLayer(moduleName: string): LayerType {
  const lowerName = moduleName.toLowerCase();
  const segments = moduleName.toLowerCase().split(/[/\\._-]/);

  for (const [layer, keywords] of Object.entries(LAYER_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerName.includes(keyword) || segments.some(s => s.includes(keyword))) {
        return layer as LayerType;
      }
    }
  }

  if (segments.some(s => s === "src" || s === "lib" || s === "packages")) {
    return "shared";
  }

  return "business";
}

export function detectArchitectureLayers(modules: ModuleNode[]): ArchitectureLayer[] {
  const moduleLayers = new Map<string, LayerType>();
  for (const module of modules) {
    moduleLayers.set(module.module_name, detectModuleLayer(module.module_name));
  }

  const layerModules = new Map<LayerType, Set<string>>();
  for (const [moduleName, layer] of moduleLayers) {
    if (!layerModules.has(layer)) {
      layerModules.set(layer, new Set());
    }
    layerModules.get(layer)!.add(moduleName);
  }

  const moduleDeps = new Map<string, Set<LayerType>>();
  for (const module of modules) {
    const fromLayer = moduleLayers.get(module.module_name)!;
    for (const dep of module.dependencies) {
      const toLayer = moduleLayers.get(dep);
      if (toLayer && toLayer !== fromLayer) {
        if (!moduleDeps.has(fromLayer)) {
          moduleDeps.set(fromLayer, new Set());
        }
        moduleDeps.get(fromLayer)!.add(toLayer);
      }
    }
  }

  const layerViolations = new Map<string, LayerViolation[]>();

  const layers: ArchitectureLayer[] = [];
  const allLayerTypes = Array.from(layerModules.keys());

  for (const layerType of allLayerTypes) {
    const modulesInLayer = Array.from(layerModules.get(layerType) || []);
    const actualDeps = Array.from(moduleDeps.get(layerType) || []);
    
    const violations: LayerViolation[] = [];

    layers.push({
      name: layerType,
      display_name: LAYER_DISPLAY_NAMES[layerType] || layerType,
      modules: modulesInLayer,
      description: getLayerDescription(layerType),
      dependencies_allowed: [],
      dependencies_actual: actualDeps,
      violations,
    });
  }

  return layers.sort((a, b) => a.name.localeCompare(b.name));
}

function getLayerDescription(layer: LayerType): string {
  const descriptions: Record<LayerType, string> = {
    ui: "处理用户界面和交互的模块",
    presentation: "负责数据展示和视图控制的模块",
    application: "协调用例和业务流程的模块",
    service: "提供业务服务和工具的模块",
    business: "包含核心业务逻辑和实体",
    domain: "领域模型和领域事件",
    infrastructure: "提供技术基础设施支持",
    data: "数据持久化和访问",
    shared: "共享工具、常量和通用代码",
    entry: "应用入口和启动模块",
  };
  return descriptions[layer] || "";
}

export function analyzePackages(graph: KnowledgeGraph): PackageAnalysis[] {
  const packageMap = new Map<string, PackageAnalysis>();
  const moduleToPackage = new Map<string, string>();

  for (const module of graph.modules) {
    const segments = module.module_name.split(/[/\\._-]/);
    const packageName = segments[0] || module.module_name;
    
    if (!packageMap.has(packageName)) {
      packageMap.set(packageName, {
        name: packageName,
        path: packageName,
        modules: [],
        external_dependencies: [],
        internal_dependencies: [],
        dependents: [],
        metrics: {
          module_count: 0,
          symbol_count: 0,
          avg_coupling: 0,
          stability_score: 0,
        },
      });
    }

    const pkg = packageMap.get(packageName)!;
    pkg.modules.push(module.module_name);
    moduleToPackage.set(module.module_name, packageName);
  }

  const depSet = new Set<string>();
  const internalDepSet = new Set<string>();

  for (const module of graph.modules) {
    const pkg = packageMap.get(moduleToPackage.get(module.module_name)!);
    if (!pkg) continue;

    for (const dep of module.dependencies) {
      const depPkg = moduleToPackage.get(dep);
      if (depPkg && depPkg !== pkg.name) {
        if (!pkg.internal_dependencies.includes(depPkg)) {
          pkg.internal_dependencies.push(depPkg);
        }
        internalDepSet.add(`${pkg.name}->${depPkg}`);
      } else if (!depPkg) {
        if (!pkg.external_dependencies.includes(dep)) {
          pkg.external_dependencies.push(dep);
        }
      }
    }

    for (const edge of graph.edges) {
      if (edge.from.startsWith(module.module_name)) {
        const toPkg = moduleToPackage.get(edge.to);
        if (toPkg && toPkg !== pkg.name) {
          depSet.add(`${pkg.name}->${toPkg}`);
        }
      }
    }
  }

  for (const [pkgName, pkg] of packageMap) {
    for (const otherPkg of packageMap.values()) {
      if (otherPkg.internal_dependencies.includes(pkgName)) {
        if (!pkg.dependents.includes(otherPkg.name)) {
          pkg.dependents.push(otherPkg.name);
        }
      }
    }
  }

  const packages: PackageAnalysis[] = [];
  for (const [, pkg] of packageMap) {
    const moduleCount = pkg.modules.length;
    let symbolCount = 0;
    for (const modName of pkg.modules) {
      const mod = graph.modules.find(m => m.module_name === modName);
      if (mod) {
        symbolCount += mod.symbols.length;
      }
    }

    const totalDeps = pkg.internal_dependencies.length + pkg.external_dependencies.length;
    const avgCoupling = moduleCount > 0 ? totalDeps / moduleCount : 0;

    let stabilitySum = 0;
    let stableCount = 0;
    for (const modName of pkg.modules) {
      const mod = graph.modules.find(m => m.module_name === modName);
      if (mod) {
        stabilitySum += 1 - (mod.metrics.instability || 0);
        stableCount++;
      }
    }
    const stabilityScore = stableCount > 0 ? stabilitySum / stableCount : 0;

    pkg.metrics = {
      module_count: moduleCount,
      symbol_count: symbolCount,
      avg_coupling: Number(avgCoupling.toFixed(2)),
      stability_score: Number(stabilityScore.toFixed(2)),
    };

    pkg.internal_dependencies.sort((a, b) => a.localeCompare(b));
    pkg.external_dependencies.sort((a, b) => a.localeCompare(b));
    pkg.dependents.sort((a, b) => a.localeCompare(b));
    pkg.modules.sort((a, b) => a.localeCompare(b));

    packages.push(pkg);
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

export function evaluateArchitectureFitness(
  modules: ModuleNode[],
  layers: ArchitectureLayer[]
): ArchitectureFitness | null {
  if (layers.length === 0) return null;

  const violations: ArchitectureViolation[] = [];
  const concerns: string[] = [];
  const recommendations: string[] = [];

  let bestPattern: ArchitecturePattern = "modular";
  let bestScore = 0;

  const layerTypes = new Set(layers.map(l => l.name));
  
  for (const [pattern, config] of Object.entries(LAYER_PATTERNS)) {
    const patternLayers = config.layers.filter(l => layerTypes.has(l));
    const score = (patternLayers.length / config.layers.length) * 100;
    
    if (score > bestScore) {
      bestScore = score;
      bestPattern = pattern as ArchitecturePattern;
    }
  }

  const layerIndex = new Map<LayerType, number>();
  const orderedLayers: LayerType[] = ["ui", "presentation", "entry", "application", "service", "business", "domain", "infrastructure", "data", "shared"];
  orderedLayers.forEach((layer, idx) => layerIndex.set(layer, idx));

  const layerDeps = new Map<string, Set<string>>();
  for (const layer of layers) {
    layerDeps.set(layer.name, new Set(layer.dependencies_actual));
  }

  const dependencyViolations: ArchitectureViolation[] = [];
  
  for (const [fromLayer, deps] of layerDeps) {
    const fromIdx = layerIndex.get(fromLayer as LayerType) ?? 5;
    for (const toLayer of deps) {
      const toIdx = layerIndex.get(toLayer as LayerType) ?? 5;
      if (fromIdx < toIdx) {
        dependencyViolations.push({
          type: "dependency_direction",
          severity: "warning",
          message: `层间依赖违规: ${fromLayer} -> ${toLayer}`,
          modules: [],
        });
      }
    }
  }

  violations.push(...dependencyViolations);

  const cycleViolations: ArchitectureViolation[] = [];
  const visited = new Set<LayerType>();
  const recursionStack = new Set<LayerType>();

  function hasCycle(layer: LayerType, path: LayerType[]): LayerType[] | null {
    if (recursionStack.has(layer)) {
      return path.slice(path.indexOf(layer));
    }
    if (visited.has(layer)) return null;

    visited.add(layer);
    recursionStack.add(layer);

    const deps = layerDeps.get(layer) || new Set();
    for (const dep of deps) {
      const cycle = hasCycle(dep as LayerType, [...path, layer]);
      if (cycle) return cycle;
    }

    recursionStack.delete(layer);
    return null;
  }

  for (const layer of layers) {
    visited.clear();
    recursionStack.clear();
    const cycle = hasCycle(layer.name, []);
    if (cycle) {
      cycleViolations.push({
        type: "cycle",
        severity: "error",
        message: `层间循环依赖: ${cycle.join(" -> ")} -> ${cycle[0]}`,
        modules: cycle,
      });
    }
  }

  violations.push(...cycleViolations);

  if (dependencyViolations.length > 0) {
    concerns.push(`发现 ${dependencyViolations.length} 个层间依赖违规`);
    recommendations.push("重构依赖方向，确保外层依赖内层");
  }

  if (cycleViolations.length > 0) {
    concerns.push(`发现 ${cycleViolations.length} 个层间循环依赖`);
    recommendations.push("消除层间循环依赖，使用依赖注入解耦");
  }

  const unstableModules = modules.filter(m => (m.metrics.instability || 0) > 0.7);
  if (unstableModules.length > 0) {
    concerns.push(`${unstableModules.length} 个模块不稳定`);
    recommendations.push("将不稳定模块的接口抽象出来，减少对不稳定模块的直接依赖");
  }

  const highCoupling = modules.filter(m => (m.metrics.efferent_coupling || 0) > 10);
  if (highCoupling.length > 0) {
    concerns.push(`${highCoupling.length} 个模块耦合度过高`);
    recommendations.push("考虑拆分高耦合模块，降低出向耦合");
  }

  let fitnessScore = 100;
  fitnessScore -= dependencyViolations.length * 10;
  fitnessScore -= cycleViolations.length * 20;
  fitnessScore -= Math.min(unstableModules.length * 5, 25);
  fitnessScore -= Math.min(highCoupling.length * 3, 15);
  fitnessScore = Math.max(0, Math.min(100, fitnessScore));

  return {
    pattern: bestPattern,
    score: fitnessScore,
    concerns,
    violations,
    recommendations,
  };
}

export function analyzeArchitecture(graph: KnowledgeGraph): {
  layers: ArchitectureLayer[];
  packages: PackageAnalysis[];
  fitness: ArchitectureFitness | null;
} {
  const layers = detectArchitectureLayers(graph.modules);
  const packages = analyzePackages(graph);
  const fitness = evaluateArchitectureFitness(graph.modules, layers);

  return { layers, packages, fitness };
}

export function analyzeModuleImpact(
  graph: KnowledgeGraph,
  targetModule: string
): ImpactAnalysisResult {
  const moduleMap = new Map<string, ModuleNode>();
  for (const mod of graph.modules) {
    moduleMap.set(mod.module_name, mod);
  }

  const downstream = new Set<string>();
  const downstreamSymbols = new Set<string>();
  const upstream = new Set<string>();
  const upstreamSymbols = new Set<string>();

  function findDownstream(moduleName: string, visited: Set<string>): void {
    if (visited.has(moduleName)) return;
    visited.add(moduleName);

    const mod = moduleMap.get(moduleName);
    if (!mod) return;

    for (const dep of mod.dependencies) {
      downstream.add(dep);
      findDownstream(dep, visited);
    }
  }

  function findUpstream(moduleName: string, visited: Set<string>): void {
    if (visited.has(moduleName)) return;
    visited.add(moduleName);

    for (const mod of graph.modules) {
      if (mod.dependencies.includes(moduleName)) {
        upstream.add(mod.module_name);
        findUpstream(mod.module_name, visited);
      }
    }
  }

  findDownstream(targetModule, new Set());
  findUpstream(targetModule, new Set());

  for (const modName of downstream) {
    const mod = moduleMap.get(modName);
    if (mod) {
      for (const sym of mod.symbols) {
        downstreamSymbols.add(sym);
      }
    }
  }

  for (const modName of upstream) {
    const mod = moduleMap.get(modName);
    if (mod) {
      for (const sym of mod.symbols) {
        upstreamSymbols.add(sym);
      }
    }
  }

  const totalAffected = downstream.size + upstream.size;
  let riskLevel: "low" | "medium" | "high" | "critical";
  if (totalAffected <= 3) riskLevel = "low";
  else if (totalAffected <= 10) riskLevel = "medium";
  else if (totalAffected <= 20) riskLevel = "high";
  else riskLevel = "critical";

  const estimatedImpact = Math.min(100, Math.round(
    (downstream.size * 0.4 + upstream.size * 0.6) * 
    (1 + (graph.modules.find(m => m.module_name === targetModule)?.metrics.instability || 0))
  ));

  return {
    target_module: targetModule,
    downstream_modules: Array.from(downstream).sort((a, b) => a.localeCompare(b)),
    downstream_symbols: Array.from(downstreamSymbols).sort((a, b) => a.localeCompare(b)),
    upstream_modules: Array.from(upstream).sort((a, b) => a.localeCompare(b)),
    upstream_symbols: Array.from(upstreamSymbols).sort((a, b) => a.localeCompare(b)),
    transitive_downstream: downstream.size,
    transitive_upstream: upstream.size,
    risk_level: riskLevel,
    estimated_change_impact: estimatedImpact,
  };
}

export function assessDependencyRisk(graph: KnowledgeGraph): DependencyRiskAssessment[] {
  const assessments: DependencyRiskAssessment[] = [];

  const moduleInstability = new Map<string, number>();
  for (const mod of graph.modules) {
    moduleInstability.set(mod.module_name, mod.metrics.instability || 0);
  }

  for (const mod of graph.modules) {
    let unstableDeps = 0;
    let transitiveCoupling = 0;
    const depSet = new Set<string>();

    function countTransitiveDeps(name: string, depth: number): void {
      if (depth > 3 || depSet.has(name)) return;
      depSet.add(name);

      const targetMod = graph.modules.find(m => m.module_name === name);
      if (!targetMod) return;

      for (const dep of targetMod.dependencies) {
        transitiveCoupling++;
        countTransitiveDeps(dep, depth + 1);
      }
    }

    for (const dep of mod.dependencies) {
      const inst = moduleInstability.get(dep) || 0;
      if (inst > 0.6) unstableDeps++;
      countTransitiveDeps(dep, 0);
    }

    const fanIn = mod.metrics.afferent_coupling || 0;
    const fanOut = mod.metrics.efferent_coupling || 0;
    const hubScore = fanIn > 0 ? fanOut / fanIn : 0;

    const riskScore = Math.min(100, Math.round(
      unstableDeps * 15 +
      Math.min(transitiveCoupling * 2, 30) +
      Math.min(hubScore * 20, 25) +
      (1 - (mod.metrics.instability || 0)) * 30
    ));

    let riskLevel: "low" | "medium" | "high" | "critical";
    if (riskScore <= 25) riskLevel = "low";
    else if (riskScore <= 50) riskLevel = "medium";
    else if (riskScore <= 75) riskLevel = "high";
    else riskLevel = "critical";

    const recommendations: string[] = [];
    if (unstableDeps > 0) {
      recommendations.push(`该模块依赖了 ${unstableDeps} 个不稳定模块，考虑抽象接口`);
    }
    if (transitiveCoupling > 10) {
      recommendations.push(`传递依赖较多 (${transitiveCoupling})，建议简化依赖层级`);
    }
    if (hubScore > 0.5) {
      recommendations.push(`该模块是中心枢纽模块，修改影响面大，需谨慎修改`);
    }

    assessments.push({
      module_name: mod.module_name,
      risk_score: riskScore,
      risk_factors: {
        unstable_dependencies: unstableDeps,
        transitive_coupling: transitiveCoupling,
        hub_dependency: Math.round(hubScore * 100) / 100,
        change_frequency_estimate: Math.round((1 - (mod.metrics.instability || 0)) * 100) / 100,
      },
      risk_level: riskLevel,
      recommendations,
    });
  }

  return assessments.sort((a, b) => b.risk_score - a.risk_score);
}

export function analyzeKeyPaths(graph: KnowledgeGraph): KeyPathAnalysis {
  const criticalPaths: DependencyPath[] = [];
  const bridgeModules = new Set<string>();
  const hubModules = new Set<string>();
  const bottleneckModules = new Set<string>();

  const moduleDeps = new Map<string, Set<string>>();
  for (const mod of graph.modules) {
    moduleDeps.set(mod.module_name, new Set(mod.dependencies));
  }

  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  
  for (const mod of graph.modules) {
    inDegree.set(mod.module_name, mod.metrics.afferent_coupling || 0);
    outDegree.set(mod.module_name, mod.metrics.efferent_coupling || 0);
  }

  const visited = new Set<string>();
  const currentPath: string[] = [];

  function findLongestPath(start: string, depth: number): void {
    if (depth > 10 || visited.has(start)) return;
    
    visited.add(start);
    currentPath.push(start);

    const deps = moduleDeps.get(start) || new Set();
    if (deps.size === 0) {
      if (currentPath.length >= 3) {
        criticalPaths.push({
          from: currentPath[0],
          to: currentPath[currentPath.length - 1],
          path: [...currentPath],
          length: currentPath.length - 1,
        });
      }
    } else {
      for (const dep of deps) {
        findLongestPath(dep, depth + 1);
      }
    }

    currentPath.pop();
    visited.delete(start);
  }

  for (const mod of graph.modules) {
    visited.clear();
    currentPath.length = 0;
    findLongestPath(mod.module_name, 0);
  }

  for (const mod of graph.modules) {
    const fanIn = inDegree.get(mod.module_name) || 0;
    const fanOut = outDegree.get(mod.module_name) || 0;

    if (fanIn > 3 && fanOut > 3) {
      bridgeModules.add(mod.module_name);
    }

    if (fanIn > 10 || fanOut > 10) {
      hubModules.add(mod.module_name);
    }

    if (fanIn > 5 && (mod.metrics.instability || 0) > 0.7) {
      bottleneckModules.add(mod.module_name);
    }
  }

  criticalPaths.sort((a, b) => b.length - a.length);

  return {
    critical_paths: criticalPaths.slice(0, 10),
    bridge_modules: Array.from(bridgeModules).sort((a, b) => a.localeCompare(b)),
    hub_modules: Array.from(hubModules).sort((a, b) => a.localeCompare(b)),
    bottleneck_modules: Array.from(bottleneckModules).sort((a, b) => a.localeCompare(b)),
  };
}
