(function () {
  const e = React.createElement;

  function uniq(arr) {
    return [...new Set(arr)];
  }

  function buildView(graph, selectedModule, edgeTypeFilter) {
    if (!graph) {
      return { nodes: [], edges: [] };
    }

    const typeFilteredEdges = graph.edges.filter((edge) => edgeTypeFilter === "all" || edge.dependency_type === edgeTypeFilter);

    const moduleSymbols = selectedModule
      ? graph.symbols.filter((s) => s.module_name === selectedModule).map((s) => s.id)
      : graph.symbols.slice(0, 60).map((s) => s.id);

    const neighborSet = new Set(moduleSymbols);
    for (const edge of typeFilteredEdges) {
      if (neighborSet.has(edge.from)) {
        neighborSet.add(edge.to);
      }
      if (neighborSet.has(edge.to)) {
        neighborSet.add(edge.from);
      }
    }

    const visibleNodeIds = [...neighborSet].slice(0, 180);
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

  function layout(nodes, width, height) {
    if (nodes.length === 0) {
      return new Map();
    }

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
    const dragRef = React.useRef({ x: 0, y: 0, vx: 0, vy: 0 });

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

    const view = React.useMemo(() => buildView(graph, selectedModule, edgeTypeFilter), [graph, selectedModule, edgeTypeFilter]);
    const positions = React.useMemo(() => layout(view.nodes, 2200, 1400), [view.nodes]);
    const reach = React.useMemo(() => collectReachability(view.edges, selectedNodeId), [view.edges, selectedNodeId]);
    const nodeMatches = React.useMemo(() => {
      const kw = nodeKeyword.trim().toLowerCase();
      if (!kw) return [];
      return view.nodes.filter((n) => n.label.toLowerCase().includes(kw)).slice(0, 20);
    }, [view.nodes, nodeKeyword]);


    const currentModuleEdges = graph
      ? graph.edges.filter((edge) => {
          if (!currentModule) return false;
          const from = graph.symbols.find((s) => s.id === edge.from);
          const to = graph.symbols.find((s) => s.id === edge.to);
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
      setDragging(true);
      dragRef.current = { x: ev.clientX, y: ev.clientY, vx: viewport.x, vy: viewport.y };
    };

    const onMouseMove = (ev) => {
      if (!dragging) return;
      const dx = ev.clientX - dragRef.current.x;
      const dy = ev.clientY - dragRef.current.y;
      setViewport((prev) => ({ ...prev, x: dragRef.current.vx + dx, y: dragRef.current.vy + dy }));
    };

    const onMouseUp = () => setDragging(false);

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
                      className: `graph-edge ${active ? "active" : "dim"}`,
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
                      { key: node.id, transform: `translate(${p.x}, ${p.y})`, onClick: () => selectNode(node.id), style: { cursor: "pointer" } },

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
