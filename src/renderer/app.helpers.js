(function () {
  const e = React.createElement;

  function uniq(arr) {
    return [...new Set(arr)];
  }

  function buildModuleTreeData(modules) {
    const root = { children: [] };
    const folderMap = new Map();
    const sortedModules = [...modules].sort((a, b) => String(a.module_name).localeCompare(String(b.module_name)));
    const makeFolderNode = (fullPath, name) => ({
      key: `dir:${fullPath}`,
      value: `dir:${fullPath}`,
      label: e("span", { className: "tree-folder-label" }, name),
      children: [],
      isLeaf: false,
    });

    for (const module of sortedModules) {
      const normalized = String(module.module_name || "").replace(/\\/g, "/");
      const segments = normalized.split("/").filter(Boolean);
      if (!segments.length) {
        continue;
      }
      const fileName = segments[segments.length - 1];
      let currentChildren = root.children;
      let prefix = "";
      for (let i = 0; i < segments.length - 1; i += 1) {
        prefix = prefix ? `${prefix}/${segments[i]}` : segments[i];
        const folderKey = `dir:${prefix}`;
        let folderNode = folderMap.get(folderKey);
        if (!folderNode) {
          folderNode = makeFolderNode(prefix, segments[i]);
          folderMap.set(folderKey, folderNode);
          currentChildren.push(folderNode);
        }
        currentChildren = folderNode.children;
      }
      currentChildren.push({
        key: module.module_name,
        value: module.module_name,
        isLeaf: true,
        moduleName: module.module_name,
        label: e(
          "div",
          { className: "tree-file-node" },
          e("div", { className: "tree-file-name", title: module.module_name }, fileName),
          e("div", { className: "small tree-file-meta" }, `symbols: ${module.symbols.length} | instability: ${module.metrics.instability}`)
        ),
      });
    }

    const sortNodes = (nodes) => {
      nodes.sort((a, b) => {
        const aDir = String(a.key).startsWith("dir:");
        const bDir = String(b.key).startsWith("dir:");
        if (aDir !== bDir) {
          return aDir ? -1 : 1;
        }
        return String(a.key).localeCompare(String(b.key));
      });
      for (const node of nodes) {
        if (Array.isArray(node.children) && node.children.length > 0) {
          sortNodes(node.children);
        }
      }
    };
    sortNodes(root.children);
    return root.children;
  }

  function buildView(graph, selectedModule, edgeTypeFilter, selectedNodeId) {
    if (!graph) {
      return { nodes: [], edges: [] };
    }

    const typeFilteredEdges = graph.edges.filter((edge) => edgeTypeFilter === "all" || edge.dependency_type === edgeTypeFilter);
    const maxNodes = 180;

    const moduleSymbols = selectedModule
      ? graph.symbols.filter((s) => s.module_name === selectedModule).map((s) => s.id)
      : graph.symbols.slice(0, 60).map((s) => s.id);

    const seedIds = selectedNodeId ? [selectedNodeId] : moduleSymbols.slice(0, 20);
    const adjacency = new Map();
    for (const edge of typeFilteredEdges) {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
      if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
      adjacency.get(edge.from).push(edge.to);
      adjacency.get(edge.to).push(edge.from);
    }

    const distance = new Map();
    const queue = [];
    for (const seed of seedIds) {
      distance.set(seed, 0);
      queue.push(seed);
    }

    while (queue.length) {
      const cur = queue.shift();
      const curDist = distance.get(cur);
      if (curDist >= 4) continue;
      const next = adjacency.get(cur) || [];
      for (const n of next) {
        if (!distance.has(n)) {
          distance.set(n, curDist + 1);
          queue.push(n);
        }
      }
    }

    const moduleSet = new Set(moduleSymbols);
    const ranked = graph.symbols
      .filter((s) => moduleSet.has(s.id) || distance.has(s.id))
      .sort((a, b) => {
        const da = distance.has(a.id) ? distance.get(a.id) : Number.POSITIVE_INFINITY;
        const db = distance.has(b.id) ? distance.get(b.id) : Number.POSITIVE_INFINITY;
        const ma = moduleSet.has(a.id) ? 0 : 1;
        const mb = moduleSet.has(b.id) ? 0 : 1;
        if (ma !== mb) return ma - mb;
        if (da !== db) return da - db;
        return a.id.localeCompare(b.id);
      });

    const prioritized = selectedNodeId ? [selectedNodeId, ...moduleSymbols, ...ranked.map((s) => s.id)] : [...moduleSymbols, ...ranked.map((s) => s.id)];
    const visibleNodeIds = uniq(prioritized).slice(0, maxNodes);
    const nodeSet = new Set(visibleNodeIds);

    const nodes = graph.symbols.filter((s) => nodeSet.has(s.id)).map((s) => ({
      id: s.id,
      label: `${s.module_name}::${s.symbol_name}`,
      module: s.module_name,
      type: s.symbol_type,
    }));

    const edges = typeFilteredEdges.filter((edge) => nodeSet.has(edge.from) && nodeSet.has(edge.to));

    return { nodes, edges };
  }

  function layout(nodes, edges, width, height) {
    if (nodes.length === 0) {
      return new Map();
    }

    const fallback = () => {
      const map = new Map();
      const cols = Math.max(3, Math.ceil(Math.sqrt(nodes.length * 1.6)));
      const rows = Math.max(2, Math.ceil(nodes.length / cols));
      const cellW = Math.max(160, Math.floor(width / cols));
      const cellH = Math.max(90, Math.floor(height / rows));

      nodes.forEach((node, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const jitterX = (index % 5) * 7;
        const jitterY = (index % 3) * 9;
        map.set(node.id, {
          x: col * cellW + 80 + jitterX,
          y: row * cellH + 55 + jitterY,
        });
      });

      return map;
    };

    if (!window.d3 || typeof window.d3.forceSimulation !== "function") {
      return fallback();
    }

    const d3 = window.d3;
    const simNodes = nodes.map((n, index) => {
      const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
      const radius = 260 + (index % 8) * 14;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
      };
    });

    const nodeIdSet = new Set(simNodes.map((n) => n.id));
    const simEdges = edges
      .filter((edge) => nodeIdSet.has(edge.from) && nodeIdSet.has(edge.to))
      .map((edge) => ({ source: edge.from, target: edge.to }));

    const simulation = d3
      .forceSimulation(simNodes)
      .force("link", d3.forceLink(simEdges).id((d) => d.id).distance(95).strength(0.18))
      .force("charge", d3.forceManyBody().strength(Math.max(-460, -85 - simNodes.length * 1.2)))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(26).iterations(2))
      .alpha(1)
      .stop();

    const iterations = Math.min(360, Math.max(140, simNodes.length * 2));
    for (let i = 0; i < iterations; i += 1) {
      simulation.tick();
    }
    simulation.stop();

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const map = new Map();
    for (const node of simNodes) {
      map.set(node.id, {
        x: clamp(node.x || width / 2, 40, width - 40),
        y: clamp(node.y || height / 2, 35, height - 35),
      });
    }

    return map;
  }

  function collectReachability(edges, selectedNodeId) {
    if (!selectedNodeId) {
      return { upstream: new Set(), downstream: new Set() };
    }

    const inMap = new Map();
    const outMap = new Map();

    for (const edge of edges) {
      if (!outMap.has(edge.from)) outMap.set(edge.from, []);
      if (!inMap.has(edge.to)) inMap.set(edge.to, []);
      outMap.get(edge.from).push(edge.to);
      inMap.get(edge.to).push(edge.from);
    }

    const walk = (start, map) => {
      const visited = new Set();
      const queue = [start];
      while (queue.length) {
        const current = queue.shift();
        const next = map.get(current) || [];
        for (const n of next) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }
      return visited;
    };

    return {
      upstream: walk(selectedNodeId, inMap),
      downstream: walk(selectedNodeId, outMap),
    };
  }

  function edgeStrokeWidth(type) {
    if (type === "inherit" || type === "implement") return 2.6;
    if (type === "call") return 2.2;
    if (type === "import") return 1.9;
    return 1.6;
  }

  function escapeMermaidLabel(text) {
    return String(text || "").replace(/"/g, "'").replace(/\n/g, " ").trim();
  }

  function toMermaidFromView(nodes, edges) {
    if (!nodes.length) {
      return "graph TD\n  Empty[\"暂无可渲染节点\"]";
    }

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const lines = ["graph TD"];
    const used = new Set();
    const aliasMap = new Map(nodes.map((node, idx) => [node.id, `N${idx}`]));

    const pushNode = (id) => {
      if (used.has(id)) return;
      const node = nodeMap.get(id);
      const alias = aliasMap.get(id);
      if (!node || !alias) return;
      lines.push(`  ${alias}[\"${escapeMermaidLabel(node.label)}\"]`);
      used.add(id);
    };

    edges.forEach((edge) => {
      const fromAlias = aliasMap.get(edge.from);
      const toAlias = aliasMap.get(edge.to);
      if (!fromAlias || !toAlias) return;
      pushNode(edge.from);
      pushNode(edge.to);
      lines.push(`  ${fromAlias} -->|${escapeMermaidLabel(edge.dependency_type)}| ${toAlias}`);
    });

    nodes.forEach((node) => pushNode(node.id));
    return lines.join("\n");
  }

  function getEditorLanguage(moduleName) {
    const normalized = String(moduleName || "").toLowerCase();
    if (normalized.endsWith(".ts")) return "typescript";
    if (normalized.endsWith(".tsx")) return "typescript";
    if (normalized.endsWith(".js")) return "javascript";
    if (normalized.endsWith(".jsx")) return "javascript";
    if (normalized.endsWith(".mjs")) return "javascript";
    if (normalized.endsWith(".cjs")) return "javascript";
    if (normalized.endsWith(".json")) return "json";
    if (normalized.endsWith(".py")) return "python";
    if (normalized.endsWith(".css")) return "css";
    if (normalized.endsWith(".html")) return "html";
    if (normalized.endsWith(".md")) return "markdown";
    return "plaintext";
  }

  function suppressEnumerablePrototypeKeys() {
    const changed = [];
    const prototypes = [Object.prototype, Function.prototype, Array.prototype, String.prototype, Number.prototype, Boolean.prototype, RegExp.prototype, Date.prototype];

    for (const proto of prototypes) {
      if (!proto) continue;
      for (const key in proto) {
        if (!Object.prototype.hasOwnProperty.call(proto, key)) {
          continue;
        }
        const desc = Object.getOwnPropertyDescriptor(proto, key);
        if (!desc || !desc.enumerable || !desc.configurable) {
          continue;
        }
        Object.defineProperty(proto, key, { ...desc, enumerable: false });
        changed.push([proto, key, desc]);
      }
    }

    return () => {
      for (const [proto, key, desc] of changed) {
        try {
          Object.defineProperty(proto, key, desc);
        } catch {
        }
      }
    };
  }

  window.CodeVizRendererHelpers = {
    buildModuleTreeData,
    buildView,
    collectReachability,
    edgeStrokeWidth,
    getEditorLanguage,
    layout,
    suppressEnumerablePrototypeKeys,
    toMermaidFromView,
  };
})();
