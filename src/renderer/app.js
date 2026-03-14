(function () {
  const e = React.createElement;
  const Semi = window.SemiUI || {};
  const SButton = Semi.Button || "button";
  const STag = Semi.Tag || "span";

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
    const [leftMenu, setLeftMenu] = React.useState("explorer");
    const [drawerOpen, setDrawerOpen] = React.useState(false);
    const [mermaidSvg, setMermaidSvg] = React.useState("");
    const [mermaidViewport, setMermaidViewport] = React.useState({ x: 0, y: 0, scale: 1 });
    const [mermaidDragging, setMermaidDragging] = React.useState(false);
    const [sourceModule, setSourceModule] = React.useState("");
    const [sourceFilePath, setSourceFilePath] = React.useState("");
    const [sourceCode, setSourceCode] = React.useState("");
    const [sourceLanguage, setSourceLanguage] = React.useState("plaintext");
    const [sourceCursor, setSourceCursor] = React.useState({ line: 1, column: 1 });
    const [editorStatus, setEditorStatus] = React.useState("编辑器未初始化");
    const [leftPaneWidth, setLeftPaneWidth] = React.useState(320);
    const [bottomPaneHeight, setBottomPaneHeight] = React.useState(340);
    const [resizing, setResizing] = React.useState(null);

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
    const mermaidRenderRef = React.useRef(null);
    const mermaidDragRef = React.useRef({ x: 0, y: 0, vx: 0, vy: 0 });
    const sourceEditorRef = React.useRef(null);
    const sourceEditorContainerRef = React.useRef(null);
    const resizeRef = React.useRef({ startX: 0, startY: 0, startLeftWidth: 320, startBottomHeight: 340 });



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

    React.useEffect(() => {
      if (!sourceEditorContainerRef.current) {
        return undefined;
      }
      if (!window.require) {
        setEditorStatus("Monaco 加载器不可用");
        return undefined;
      }
      let disposed = false;
      window.require.config({
        paths: {
          vs: "../../node_modules/monaco-editor/min/vs",
        },
      });
      window.require(
        ["vs/editor/editor.main"],
        () => {
          if (disposed || sourceEditorRef.current || !sourceEditorContainerRef.current) {
            return;
          }
          sourceEditorRef.current = window.monaco.editor.create(sourceEditorContainerRef.current, {
            value: "",
            language: "plaintext",
            automaticLayout: true,
            minimap: { enabled: true },
            fontSize: 13,
            roundedSelection: false,
            tabSize: 2,
            readOnly: true,
            scrollBeyondLastLine: false,
            theme: theme === "dark" ? "vs-dark" : "vs",
          });
          setEditorStatus("编辑器已就绪");
        },
        (err) => {
          if (!disposed) {
            setEditorStatus(`Monaco 加载失败: ${String(err)}`);
          }
        }
      );


      return () => {
        disposed = true;
        if (sourceEditorRef.current) {
          sourceEditorRef.current.dispose();
          sourceEditorRef.current = null;
        }
      };
    }, []);

    React.useEffect(() => {
      if (sourceEditorRef.current && window.monaco) {
        window.monaco.editor.setTheme(theme === "dark" ? "vs-dark" : "vs");
      }
    }, [theme]);

    const openModuleInEditor = async (moduleName, line = 1, column = 1) => {
      if (!graph || !window.codeviz) {
        return;
      }
      const moduleNode = graph.modules.find((m) => m.module_name === moduleName);
      if (!moduleNode) {
        return;
      }
      try {
        const content = await window.codeviz.readSourceFile(moduleNode.file_path);
        setSourceModule(moduleNode.module_name);
        setSourceFilePath(moduleNode.file_path);
        setSourceCode(content);
        setSourceLanguage(getEditorLanguage(moduleNode.module_name));
        setSourceCursor({ line: Math.max(1, Number(line || 1)), column: Math.max(1, Number(column || 1)) });
        setEditorStatus("源码已加载");
      } catch (err) {
        setEditorStatus(`源码读取失败: ${String(err)}`);
      }
    };

    const openInVSCode = async () => {
      if (!sourceFilePath || !window.codeviz) {
        return;
      }
      try {
        const result = await window.codeviz.openSourceLocation({
          filePath: sourceFilePath,
          line: sourceCursor.line,
          column: sourceCursor.column,
        });
        if (result && result.mode === "vscode") {
          setStatus("已发送到 VSCode 打开");
          return;
        }
        setStatus("已使用系统默认程序打开文件");
      } catch (err) {
        setStatus(`打开源码失败: ${String(err)}`);
      }
    };

    React.useEffect(() => {
      if (!sourceEditorRef.current || !window.monaco) {
        return;
      }
      const editor = sourceEditorRef.current;
      const model = editor.getModel();
      if (model && model.getLanguageId() !== sourceLanguage) {
        window.monaco.editor.setModelLanguage(model, sourceLanguage);
      }
      if (editor.getValue() !== sourceCode) {
        editor.setValue(sourceCode || "");
      }
      const lineNumber = Math.max(1, Number(sourceCursor.line || 1));
      const column = Math.max(1, Number(sourceCursor.column || 1));
      editor.setPosition({ lineNumber, column });
      editor.revealLineInCenter(lineNumber);
      editor.focus();
    }, [sourceCode, sourceLanguage, sourceCursor]);

    React.useEffect(() => {
      if (!graph || !selectedModule) {
        return;
      }
      if (sourceModule !== selectedModule) {
        void openModuleInEditor(selectedModule, 1, 1);
      }
    }, [graph, selectedModule]);




    const runAnalyze = async (targetProjectPath = projectPath) => {
      if (!targetProjectPath) {
        setStatus("请先选择项目目录");
        return;
      }

      const prevSelectedModule = selectedModule;
      const prevSelectedNodeId = selectedNodeId;
      const sameProject = targetProjectPath === projectPath;
      setBusy(true);
      startTimeRef.current = Date.now();
      try {
        const result = await window.codeviz.analyzeProject(targetProjectPath);
        setGraph(result);
        const nextSelectedModule = result.modules.some((m) => m.module_name === prevSelectedModule)
          ? prevSelectedModule
          : result.modules[0]
            ? result.modules[0].module_name
            : "";
        setSelectedModule(nextSelectedModule);
        setSelectedNodeId(result.symbols.some((s) => s.id === prevSelectedNodeId) ? prevSelectedNodeId : "");
        if (!sameProject) {
          setManualPositions({});
          setViewport({ x: 0, y: 0, scale: 1 });
        }
        setElapsed(Date.now() - startTimeRef.current);
        setStatus(`分析完成：modules=${result.modules.length}, symbols=${result.symbols.length}, edges=${result.edges.length}`);
      } catch (err) {
        setStatus(`分析失败: ${String(err)}`);
      } finally {
        setBusy(false);
      }
    };

    const pickProject = async () => {
      const selected = await window.codeviz.openProjectDialog();
      if (selected) {
        setProjectPath(selected);
        setOutDir(`${selected}\\out`);
        await runAnalyze(selected);
      }
    };



    const modules = graph
      ? graph.modules.filter((m) => m.module_name.toLowerCase().includes(fileKeyword.toLowerCase()))
      : [];
    const leftMenus = [
      { id: "explorer", icon: "📁", label: "资源管理器" },
      { id: "search", icon: "🔎", label: "搜索" },
      { id: "insights", icon: "📊", label: "概览" },
    ];

    const currentModule = graph ? graph.modules.find((m) => m.module_name === selectedModule) : null;
    const topModules = graph
      ? [...graph.modules].sort((a, b) => b.symbols.length - a.symbols.length).slice(0, 5)
      : [];
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

    const mermaidSource = React.useMemo(() => {
      const maxNodes = 120;
      const maxEdges = 240;
      const nodes = view.nodes.slice(0, maxNodes);
      const nodeSet = new Set(nodes.map((n) => n.id));
      const edges = view.edges.filter((edge) => nodeSet.has(edge.from) && nodeSet.has(edge.to)).slice(0, maxEdges);
      return toMermaidFromView(nodes, edges);
    }, [view.nodes, view.edges]);

    React.useEffect(() => {
      if (!drawerOpen) return;
      if (!window.mermaid || typeof window.mermaid.render !== "function") {
        setStatus("Mermaid 未加载，无法渲染");
        return;
      }

      let cancelled = false;
      const render = async () => {
        try {
          window.mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: theme === "dark" ? "dark" : "default" });
          const id = `mermaid-${Date.now()}`;
          const result = await window.mermaid.render(id, mermaidSource);
          if (!cancelled) {
            setMermaidSvg(result.svg);
          }
        } catch (err) {
          if (!cancelled) {
            setMermaidSvg("");
            setStatus(`Mermaid 渲染失败: ${String(err)}`);
          }
        }
      };

      void render();
      return () => {
        cancelled = true;
      };
    }, [drawerOpen, mermaidSource, theme]);

    React.useEffect(() => {
      if (!drawerOpen) {
        setMermaidDragging(false);
        return;
      }
      setMermaidViewport({ x: 0, y: 0, scale: 1 });
    }, [drawerOpen]);

    React.useEffect(() => {
      if (!mermaidDragging) return;
      const onMove = (ev) => {
        const dx = ev.clientX - mermaidDragRef.current.x;
        const dy = ev.clientY - mermaidDragRef.current.y;
        setMermaidViewport((prev) => ({ ...prev, x: mermaidDragRef.current.vx + dx, y: mermaidDragRef.current.vy + dy }));
      };
      const onUp = () => setMermaidDragging(false);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
    }, [mermaidDragging]);

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

    React.useEffect(() => {
      if (!resizing) {
        document.body.classList.remove("resizing-layout", "resizing-col", "resizing-row");
        return;
      }
      document.body.classList.add("resizing-layout", resizing === "col" ? "resizing-col" : "resizing-row");
      const onMove = (ev) => {
        if (resizing === "col") {
          const dx = ev.clientX - resizeRef.current.startX;
          const maxWidth = Math.max(260, window.innerWidth - 420);
          const next = Math.max(220, Math.min(maxWidth, resizeRef.current.startLeftWidth + dx));
          setLeftPaneWidth(Math.round(next));
          return;
        }
        const dy = ev.clientY - resizeRef.current.startY;
        const maxHeight = Math.max(220, window.innerHeight - 240);
        const next = Math.max(220, Math.min(maxHeight, resizeRef.current.startBottomHeight - dy));
        setBottomPaneHeight(Math.round(next));
      };
      const onUp = () => {
        setResizing(null);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
    }, [resizing]);

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
    const currentSymbol = selectedNodeId ? symbolById.get(selectedNodeId) : null;

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

    const startResizeCol = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      resizeRef.current = {
        ...resizeRef.current,
        startX: ev.clientX,
        startLeftWidth: leftPaneWidth,
      };
      setResizing("col");
    };

    const startResizeRow = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      resizeRef.current = {
        ...resizeRef.current,
        startY: ev.clientY,
        startBottomHeight: bottomPaneHeight,
      };
      setResizing("row");
    };

    const onMermaidWheel = (ev) => {

      ev.preventDefault();
      const rect = mermaidRenderRef.current ? mermaidRenderRef.current.getBoundingClientRect() : null;
      setMermaidViewport((prev) => {
        const nextScale = Math.max(0.35, Math.min(3.2, Number((prev.scale * (ev.deltaY > 0 ? 0.9 : 1.1)).toFixed(3))));
        if (!rect) {
          return { ...prev, scale: nextScale };
        }
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        const worldX = (px - prev.x) / prev.scale;
        const worldY = (py - prev.y) / prev.scale;
        return {
          scale: nextScale,
          x: px - worldX * nextScale,
          y: py - worldY * nextScale,
        };
      });
    };

    const onMermaidMouseDown = (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      setMermaidDragging(true);
      mermaidDragRef.current = {
        x: ev.clientX,
        y: ev.clientY,
        vx: mermaidViewport.x,
        vy: mermaidViewport.y,
      };
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
      const symbol = symbolById.get(nodeId);
      if (symbol) {
        const line = symbol.location ? symbol.location.start_line : 1;
        const column = symbol.location ? symbol.location.start_column : 1;
        void openModuleInEditor(symbol.module_name, line, column);
      }
    };

    return e(

      "div",
      { className: `app theme-${theme}` },
      e(
        "div",
        { className: "toolbar" },
        e(SButton, { theme: "solid", type: "tertiary", onClick: () => setTheme((prev) => (prev === "light" ? "dark" : "light")) }, theme === "light" ? "切换暗色" : "切换亮色"),
        e(SButton, { theme: "solid", type: "primary", onClick: pickProject, disabled: busy }, "导入项目"),

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
        e(SButton, { theme: "solid", type: "secondary", onClick: () => setDrawerOpen(true), disabled: !graph }, "打开 Mermaid 抽屉"),


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
        {
          className: "workspace",
          style: { gridTemplateColumns: `56px ${leftPaneWidth}px 6px minmax(420px, 1fr)` },
        },

        e(
          "div",
          { className: "activity-bar" },
          leftMenus.map((item) =>
            e(
              "button",
              {
                key: item.id,
                className: `activity-item ${leftMenu === item.id ? "active" : ""}`,
                onClick: () => setLeftMenu(item.id),
                title: item.label,
              },
              e("span", { className: "activity-icon" }, item.icon)
            )
          )
        ),
        e(
          "div",
          { className: "left" },
          leftMenu === "explorer"
            ? e(
                React.Fragment,
                null,
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
                          void openModuleInEditor(m.module_name, 1, 1);
                        },
                      },
                      e("div", null, m.module_name),
                      e("div", { className: "small" }, `symbols: ${m.symbols.length} | instability: ${m.metrics.instability}`)
                    )
                  )
                )
              )
            : null,
          leftMenu === "search"
            ? e(
                React.Fragment,
                null,
                e("div", null, "节点搜索", graph ? e("span", { className: "badge" }, `${nodeMatches.length}`) : null),
                e("input", {
                  style: { width: "100%", marginTop: 10, marginBottom: 10 },
                  value: nodeKeyword,
                  onChange: (ev) => setNodeKeyword(ev.target.value),
                  placeholder: "输入 symbol 关键字",
                }),
                e(
                  "div",
                  null,
                  nodeMatches.length === 0
                    ? e("div", { className: "small" }, "没有匹配结果")
                    : nodeMatches.map((node) =>
                        e(
                          "div",
                          {
                            key: node.id,
                            className: `file-item ${selectedNodeId === node.id ? "active" : ""}`,
                            onClick: () => selectNode(node.id),
                          },
                          e("div", null, node.label),
                          e("div", { className: "small" }, node.id)
                        )
                      )
                )
              )
            : null,
          leftMenu === "insights"
            ? e(
                React.Fragment,
                null,
                e("div", null, "工作区概览"),
                graph
                  ? e(
                      "div",
                      { style: { marginTop: 10 } },
                      e("div", { className: "small" }, `modules: ${graph.modules.length}`),
                      e("div", { className: "small" }, `symbols: ${graph.symbols.length}`),
                      e("div", { className: "small" }, `edges: ${graph.edges.length}`),
                      e("div", { className: "small", style: { marginTop: 8, marginBottom: 8 } }, "Top 模块"),
                      topModules.map((m) =>
                        e(
                          "div",
                          {
                            key: m.id,
                            className: `file-item ${selectedModule === m.module_name ? "active" : ""}`,
                            onClick: () => {
                              setSelectedModule(m.module_name);
                              setLeftMenu("explorer");
                              void openModuleInEditor(m.module_name, 1, 1);
                            },
                          },
                          e("div", null, m.module_name),
                          e("div", { className: "small" }, `symbols: ${m.symbols.length}`)
                        )
                      )
                    )
                  : e("div", { className: "small", style: { marginTop: 8 } }, "请先导入并分析项目")
              )
            : null
        ),
        e("div", { className: "workspace-splitter workspace-splitter-col", onMouseDown: startResizeCol }),
        e(
          "div",
          {
            className: "right",
            style: { gridTemplateRows: `minmax(220px, 1fr) 6px ${bottomPaneHeight}px` },
          },

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
          e("div", { className: "workspace-splitter workspace-splitter-row", onMouseDown: startResizeRow }),
          e(
            "div",
            { className: "panel source-panel" },

            e("strong", null, "源码编辑器（Monaco Editor）"),
            sourceFilePath
              ? e(
                  "div",
                  { className: "source-actions" },
                  e("div", { className: "source-path", title: sourceFilePath }, sourceFilePath),
                  e(
                    "div",
                    { className: "source-actions-right" },
                    e("button", { onClick: () => currentSymbol && selectNode(currentSymbol.id), disabled: !currentSymbol }, "定位符号"),
                    e("button", { onClick: openInVSCode }, "在 VSCode 打开")
                  )
                )
              : e("div", { className: "small" }, "请选择模块或节点"),
            e("div", { className: "source-editor", ref: sourceEditorContainerRef }),
            currentModule
              ? e(
                  "div",
                  null,
                  e("div", { className: "small" }, `module: ${currentModule.module_name}`),
                  e("div", { className: "small" }, `symbols: ${currentModule.symbols.length}, edges: ${currentModuleEdges.length}`),
                  e("div", { className: "small" }, selectedNodeId ? `selected: ${selectedNodeId}` : "selected: 无"),
                  e("div", { className: "small" }, currentSymbol && currentSymbol.location ? `line: ${currentSymbol.location.start_line}, column: ${currentSymbol.location.start_column}` : "line: -"),
                  e("div", { className: "small" }, `编辑器状态: ${editorStatus}`)
                )
              : e("div", { className: "small", style: { marginTop: 8 } }, "请选择模块")
          )
        )
      ),
      drawerOpen
        ? e(
            "div",
            { className: "drawer-mask", onClick: () => setDrawerOpen(false) },
            e(
              "div",
              {
                className: "drawer",
                onClick: (ev) => ev.stopPropagation(),
              },
              e(
                "div",
                { className: "drawer-header" },
                e("strong", null, "Mermaid 预览"),
                e(
                  "div",
                  { className: "drawer-actions" },
                  e("span", { className: "small" }, `缩放 ${(mermaidViewport.scale * 100).toFixed(0)}%`),
                  e(SButton, { theme: "light", type: "tertiary", onClick: () => setMermaidViewport((prev) => ({ ...prev, scale: Math.max(0.35, Number((prev.scale * 0.9).toFixed(3)) ) })) }, "缩小"),
                  e(SButton, { theme: "light", type: "tertiary", onClick: () => setMermaidViewport((prev) => ({ ...prev, scale: Math.min(3.2, Number((prev.scale * 1.1).toFixed(3)) ) })) }, "放大"),
                  e(SButton, { theme: "light", type: "secondary", onClick: () => setMermaidViewport({ x: 0, y: 0, scale: 1 }) }, "重置"),
                  e(SButton, { theme: "solid", type: "danger", onClick: () => setDrawerOpen(false) }, "关闭")

                )
              ),
              e(
                "div",
                {
                  ref: mermaidRenderRef,
                  className: `mermaid-preview ${mermaidDragging ? "dragging" : ""}`,
                  onWheel: onMermaidWheel,
                  onMouseDown: onMermaidMouseDown,
                },
                e("div", {
                  className: "mermaid-canvas",
                  style: { transform: `translate(${mermaidViewport.x}px, ${mermaidViewport.y}px) scale(${mermaidViewport.scale})` },
                  dangerouslySetInnerHTML: { __html: mermaidSvg || "<div class='small'>渲染中...</div>" },
                })
              )

            )
          )
        : null,
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
