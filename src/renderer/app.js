(function () {
  const e = React.createElement;

  function uniq(arr) {
    return [...new Set(arr)];
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

  function App() {
    const [projectPath, setProjectPath] = React.useState("");
    const [outDir, setOutDir] = React.useState("");
    const [fileKeyword, setFileKeyword] = React.useState("");
    const [edgeTypeFilter, setEdgeTypeFilter] = React.useState("all");
    const [selectedModule, setSelectedModule] = React.useState("");
    const [selectedNodeId, setSelectedNodeId] = React.useState("");
    const [nodeKeyword, setNodeKeyword] = React.useState("");
    const [graph, setGraph] = React.useState(null);
    const [theme, setTheme] = React.useState("light");

    const [busy, setBusy] = React.useState(false);
    const [status, setStatus] = React.useState("等待开始");
    const [elapsed, setElapsed] = React.useState(0);

    const [viewport, setViewport] = React.useState({ x: 0, y: 0, scale: 1 });
    const [dragging, setDragging] = React.useState(false);
    const [nodeDrag, setNodeDrag] = React.useState(null);
    const [manualPositions, setManualPositions] = React.useState({});
    const dragRef = React.useRef({ x: 0, y: 0, vx: 0, vy: 0 });
    const dragMovedRef = React.useRef(false);

    const startTimeRef = React.useRef(0);

    React.useEffect(() => {
      if (!window.codeviz) {
        setStatus("预加载 API 不可用");
        return;
      }
      const unsubscribe = window.codeviz.onAnalysisProgress(({ phase, payload }) => {
        setStatus(`${phase}: ${JSON.stringify(payload)}`);
      });
      return unsubscribe;
    }, []);




    const pickProject = async () => {
      const selected = await window.codeviz.openProjectDialog();
      if (selected) {
        setProjectPath(selected);
        setOutDir(`${selected}\\out`);
      }
    };

    const runAnalyze = async () => {
      if (!projectPath) {
        setStatus("请先选择项目目录");
        return;
      }

      setBusy(true);
      startTimeRef.current = Date.now();
      try {
        const result = await window.codeviz.analyzeProject(projectPath);
        setGraph(result);
        setSelectedModule(result.modules[0] ? result.modules[0].module_name : "");
        setSelectedNodeId("");
        setManualPositions({});
        setViewport({ x: 0, y: 0, scale: 1 });
        setElapsed(Date.now() - startTimeRef.current);
        setStatus(`分析完成：modules=${result.modules.length}, symbols=${result.symbols.length}, edges=${result.edges.length}`);
      } catch (err) {
        setStatus(`分析失败: ${String(err)}`);
      } finally {
        setBusy(false);
      }
    };

    const doExport = async (formats) => {
      if (!outDir) {
        setStatus("请填写输出目录");
        return;
      }
      try {
        const outputs = await window.codeviz.exportGraph(outDir, formats);
        setStatus(`导出成功: ${outputs.join(", ")}`);
      } catch (err) {
        setStatus(`导出失败: ${String(err)}`);
      }
    };

    const modules = graph
      ? graph.modules.filter((m) => m.module_name.toLowerCase().includes(fileKeyword.toLowerCase()))
      : [];

    const currentModule = graph ? graph.modules.find((m) => m.module_name === selectedModule) : null;
    const symbolById = React.useMemo(() => {
      if (!graph) return new Map();
      return new Map(graph.symbols.map((s) => [s.id, s]));
    }, [graph]);

    const view = React.useMemo(() => buildView(graph, selectedModule, edgeTypeFilter, selectedNodeId), [graph, selectedModule, edgeTypeFilter, selectedNodeId]);
    const basePositions = React.useMemo(() => layout(view.nodes, view.edges, 2200, 1400), [view.nodes, view.edges]);
    const positions = React.useMemo(() => {
      const map = new Map(basePositions);
      for (const [id, pos] of Object.entries(manualPositions)) {
        if (map.has(id)) {
          map.set(id, pos);
        }
      }
      return map;
    }, [basePositions, manualPositions]);
    const reach = React.useMemo(() => collectReachability(view.edges, selectedNodeId), [view.edges, selectedNodeId]);
    const nodeMatches = React.useMemo(() => {
      const kw = nodeKeyword.trim().toLowerCase();
      if (!kw) return [];
      return view.nodes.filter((n) => n.label.toLowerCase().includes(kw)).slice(0, 20);
    }, [view.nodes, nodeKeyword]);

    React.useEffect(() => {
      const visible = new Set(view.nodes.map((n) => n.id));
      setManualPositions((prev) => {
        let changed = false;
        const next = {};
        for (const [id, pos] of Object.entries(prev)) {
          if (visible.has(id)) {
            next[id] = pos;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, [view.nodes]);

    const currentModuleEdges = graph
      ? graph.edges.filter((edge) => {
          if (!currentModule) return false;
          const from = symbolById.get(edge.from);
          const to = symbolById.get(edge.to);
          const hit = (from && from.module_name === currentModule.module_name) || (to && to.module_name === currentModule.module_name);
          const typePass = edgeTypeFilter === "all" || edge.dependency_type === edgeTypeFilter;
          return hit && typePass;
        })
      : [];

    const onWheel = (ev) => {
      ev.preventDefault();
      const delta = ev.deltaY > 0 ? -0.08 : 0.08;
      setViewport((prev) => {
        const nextScale = Math.min(2.4, Math.max(0.45, prev.scale + delta));
        return { ...prev, scale: Number(nextScale.toFixed(3)) };
      });
    };

    const onMouseDown = (ev) => {
      if (nodeDrag) return;
      setDragging(true);
      dragRef.current = { x: ev.clientX, y: ev.clientY, vx: viewport.x, vy: viewport.y };
    };

    const onNodeMouseDown = (ev, nodeId) => {
      ev.stopPropagation();
      const p = positions.get(nodeId);
      if (!p) return;
      dragMovedRef.current = false;
      setNodeDrag({ id: nodeId, x: ev.clientX, y: ev.clientY, ox: p.x, oy: p.y });
    };

    const onMouseMove = (ev) => {
      if (nodeDrag) {
        const dx = (ev.clientX - nodeDrag.x) / viewport.scale;
        const dy = (ev.clientY - nodeDrag.y) / viewport.scale;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          dragMovedRef.current = true;
        }
        const nx = Math.max(40, Math.min(2160, nodeDrag.ox + dx));
        const ny = Math.max(35, Math.min(1365, nodeDrag.oy + dy));
        setManualPositions((prev) => ({ ...prev, [nodeDrag.id]: { x: nx, y: ny } }));
        return;
      }
      if (!dragging) return;
      const dx = ev.clientX - dragRef.current.x;
      const dy = ev.clientY - dragRef.current.y;
      setViewport((prev) => ({ ...prev, x: dragRef.current.vx + dx, y: dragRef.current.vy + dy }));
    };

    const onMouseUp = () => {
      setDragging(false);
      setNodeDrag(null);
    };


    const centerNode = (nodeId) => {
      const p = positions.get(nodeId);
      if (!p) return;
      setViewport((prev) => ({
        ...prev,
        x: 1100 - p.x * prev.scale,
        y: 700 - p.y * prev.scale,
      }));
    };

    const selectNode = (nodeId) => {
      setSelectedNodeId(nodeId);
      centerNode(nodeId);
    };

    return e(

      "div",
      { className: `app theme-${theme}` },
      e(
        "div",
        { className: "toolbar" },
        e("button", { onClick: () => setTheme((prev) => (prev === "light" ? "dark" : "light")) }, theme === "light" ? "切换暗色" : "切换亮色"),
        e("button", { onClick: pickProject, disabled: busy }, "导入项目"),
        e("input", {
          style: { width: 330 },
          value: projectPath,
          onChange: (ev) => setProjectPath(ev.target.value),
          placeholder: "项目路径",
        }),
        e("button", { onClick: runAnalyze, disabled: busy }, busy ? "分析中..." : "刷新分析"),
        e("input", {
          style: { width: 300 },
          value: outDir,
          onChange: (ev) => setOutDir(ev.target.value),
          placeholder: "导出目录",
        }),
        e("button", { onClick: () => doExport(["json"]), disabled: !graph }, "导出 JSON"),
        e("button", { onClick: () => doExport(["mermaid"]), disabled: !graph }, "导出 Mermaid"),
        e("button", { onClick: () => doExport(["json", "mermaid"]), disabled: !graph }, "全部导出"),
        e("input", {
          style: { width: 260 },
          value: nodeKeyword,
          onChange: (ev) => setNodeKeyword(ev.target.value),
          placeholder: "搜索节点（symbol）",
        }),
        e(
          "button",
          {
            disabled: nodeMatches.length === 0,
            onClick: () => {
              if (nodeMatches[0]) {
                selectNode(nodeMatches[0].id);
              }
            },
          },
          nodeMatches.length > 0 ? `定位 ${nodeMatches.length} 个候选` : "无匹配"
        )

      ),
      e(
        "div",
        { className: "workspace" },
        e(
          "div",
          { className: "left" },
          e("div", null, "文件树", graph ? e("span", { className: "badge" }, `${modules.length}`) : null),
          e("input", {
            style: { width: "100%", marginTop: 10, marginBottom: 10 },
            value: fileKeyword,
            onChange: (ev) => setFileKeyword(ev.target.value),
            placeholder: "搜索模块",
          }),
          e(
            "div",
            null,
            modules.map((m) =>
              e(
                "div",
                {
                  key: m.id,
                  className: `file-item ${selectedModule === m.module_name ? "active" : ""}`,
                  onClick: () => {
                    setSelectedModule(m.module_name);
                    setSelectedNodeId("");
                    setNodeKeyword("");
                  },

                },
                e("div", null, m.module_name),
                e("div", { className: "small" }, `symbols: ${m.symbols.length} | instability: ${m.metrics.instability}`)
              )
            )
          )
        ),
        e(
          "div",
          { className: "right" },
          e(
            "div",
            { className: "panel" },
            e(
              "div",
              { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 } },
              e("strong", null, "依赖图谱（可拖拽/滚轮缩放/点击节点高亮上下游）"),
              e(
                "div",
                { style: { display: "flex", alignItems: "center", gap: 8 } },
                e(
                  "select",
                  {
                    value: edgeTypeFilter,
                    onChange: (ev) => setEdgeTypeFilter(ev.target.value),
                  },
                  e("option", { value: "all" }, "全部边类型"),
                  e("option", { value: "call" }, "call"),
                  e("option", { value: "import" }, "import"),
                  e("option", { value: "inherit" }, "inherit"),
                  e("option", { value: "implement" }, "implement"),
                  e("option", { value: "reference" }, "reference")
                ),
                e("button", { onClick: () => setViewport({ x: 0, y: 0, scale: 1 }) }, "重置视图")
              )
            ),
            e(
              "div",
              {
                className: "graph-wrap",
                onWheel,
                onMouseDown,
                onMouseMove,
                onMouseUp,
                onMouseLeave: onMouseUp,
              },
              e(
                "svg",
                { className: "graph-svg", viewBox: "0 0 2200 1400" },
                e(
                  "defs",
                  null,
                  e("marker", { id: "arrow-active", viewBox: "0 -5 10 10", refX: 18, refY: 0, markerWidth: 7, markerHeight: 7, orient: "auto" }, e("path", { d: "M0,-5L10,0L0,5", fill: "var(--edge-active)" })),
                  e("marker", { id: "arrow-dim", viewBox: "0 -5 10 10", refX: 18, refY: 0, markerWidth: 7, markerHeight: 7, orient: "auto" }, e("path", { d: "M0,-5L10,0L0,5", fill: "var(--edge-dim)" }))
                ),
                e(
                  "g",
                  { transform: `translate(${viewport.x}, ${viewport.y}) scale(${viewport.scale})` },
                  view.edges.map((edge) => {
                    const p1 = positions.get(edge.from);
                    const p2 = positions.get(edge.to);
                    if (!p1 || !p2) return null;
                    const active = !selectedNodeId || edge.from === selectedNodeId || edge.to === selectedNodeId || (reach.upstream.has(edge.from) && reach.upstream.has(edge.to)) || (reach.downstream.has(edge.from) && reach.downstream.has(edge.to));
                    return e("line", {
                      key: edge.id,
                      x1: p1.x,
                      y1: p1.y,
                      x2: p2.x,
                      y2: p2.y,
                      markerEnd: active ? "url(#arrow-active)" : "url(#arrow-dim)",
                      className: `graph-edge type-${edge.dependency_type} ${active ? "active" : "dim"}`,
                      style: { strokeWidth: edgeStrokeWidth(edge.dependency_type) },
                    });
                  }),
                  view.nodes.map((node) => {
                    const p = positions.get(node.id);
                    if (!p) return null;
                    const selected = node.id === selectedNodeId;
                    const upstream = reach.upstream.has(node.id);
                    const downstream = reach.downstream.has(node.id);
                    const className = selected ? "selected" : upstream ? "upstream" : downstream ? "downstream" : selectedNodeId ? "dim" : "normal";
                    return e(
                      "g",
                      {
                        key: node.id,
                        className: "graph-node-handle",
                        transform: `translate(${p.x}, ${p.y})`,
                        onMouseDown: (ev) => onNodeMouseDown(ev, node.id),
                        onClick: () => {
                          if (dragMovedRef.current) {
                            dragMovedRef.current = false;
                            return;
                          }
                          selectNode(node.id);
                        },
                      },

                      e("circle", { r: 20, className: `graph-node ${className}` }),
                      e("text", { x: 28, y: 4, className: "graph-text" }, node.label)
                    );
                  })
                )
              )
            )
          ),
          e(
            "div",
            { className: "panel" },
            e("strong", null, "当前模块详情"),
            currentModule
              ? e(
                  "div",
                  null,
                  e("div", { className: "small", style: { marginTop: 8 } }, `module: ${currentModule.module_name}`),
                  e("div", { className: "small" }, `symbols: ${currentModule.symbols.length}, edges: ${currentModuleEdges.length}`),
                  e("div", { className: "small" }, selectedNodeId ? `selected: ${selectedNodeId}` : "selected: 无"),
                  e(
                    "pre",
                    null,
                    currentModuleEdges
                      .slice(0, 40)
                      .map((edge) => `${edge.dependency_type}: ${edge.from} -> ${edge.to}`)
                      .join("\n") || "无"
                  )
                )
              : e("div", { className: "small", style: { marginTop: 8 } }, "请选择模块")
          )
        )
      ),
      e(
        "div",
        { className: "status" },
        e("div", null, `状态: ${status}`),
        e("div", null, `耗时: ${elapsed} ms | 缩放: ${viewport.scale.toFixed(2)}`)
      )
    );
  }

  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(e(App));
})();
