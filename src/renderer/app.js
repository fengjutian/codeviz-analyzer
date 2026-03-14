(function () {
  const e = React.createElement;
  const helpers = window.CodeVizRendererHelpers || {};
  const viewRenderer = window.CodeVizRendererView || {};
  const buildModuleTreeData = helpers.buildModuleTreeData;
  const buildView = helpers.buildView;
  const collectReachability = helpers.collectReachability;
  const edgeStrokeWidth = helpers.edgeStrokeWidth;
  const getEditorLanguage = helpers.getEditorLanguage;
  const layout = helpers.layout;
  const renderAppView = viewRenderer.renderAppView;
  const toMermaidFromView = helpers.toMermaidFromView;


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
    // 执行追踪相关状态
    const [traceDrawerOpen, setTraceDrawerOpen] = React.useState(false);
    const [entryScript, setEntryScript] = React.useState("");
    const [traceTimeout, setTraceTimeout] = React.useState("30000");
    const [traceMaxDepth, setTraceMaxDepth] = React.useState("100");
    const [tracing, setTracing] = React.useState(false);
    const [traceResult, setTraceResult] = React.useState(null);
    const [traceError, setTraceError] = React.useState("");

    // 控制流图相关状态
    const [cfgDrawerOpen, setCfgDrawerOpen] = React.useState(false);
    const [cfgModuleName, setCfgModuleName] = React.useState("");
    const [cfgFunctions, setCfgFunctions] = React.useState([]);
    const [cfgSelectedFunction, setCfgSelectedFunction] = React.useState("");
    const [cfgMermaidCode, setCfgMermaidCode] = React.useState("");
    const [cfgMermaidSvg, setCfgMermaidSvg] = React.useState("");
    const [cfgLoading, setCfgLoading] = React.useState(false);
    const [cfgError, setCfgError] = React.useState("");

    const [sourceModule, setSourceModule] = React.useState("");
    const [sourceFilePath, setSourceFilePath] = React.useState("");
    const [sourceCode, setSourceCode] = React.useState("");
    const [sourceLanguage, setSourceLanguage] = React.useState("plaintext");
    const [sourceCursor, setSourceCursor] = React.useState({ line: 1, column: 1 });
    const [editorStatus, setEditorStatus] = React.useState("编辑器未初始化");
    const [leftPaneWidth, setLeftPaneWidth] = React.useState(200);
    const [sourcePaneWidth, setSourcePaneWidth] = React.useState(620);
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
    const resizeRef = React.useRef({ startX: 0, startLeftWidth: 200, startSourceWidth: 620 });




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
        // 禁用 worker，使用主线程
        "vs/editor/editor.worker": "empty:",
        "vs/json/json.worker": "empty:",
        "vs/css/css.worker": "empty:",
        "vs/html/html.worker": "empty:",
        "vs/typescript/ts.worker": "empty:",
      });

      const createEditor = () => {
        if (disposed || sourceEditorRef.current || !sourceEditorContainerRef.current || !window.monaco) {
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
          // 禁用某些可能导致问题的功能
          folding: false,
          glyphMargin: false,
          links: false,
          contextmenu: true,
        });
        setEditorStatus("编辑器已就绪");
      };

      window.require(
        ["vs/editor/editor.main"],
        () => {
          createEditor();
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

    // 执行追踪
    const runTrace = async () => {
      if (!projectPath || !entryScript || !window.codeviz) {
        setTraceError("请先选择项目并输入入口脚本");
        return;
      }

      setTracing(true);
      setTraceError("");
      setTraceResult(null);

      try {
        const result = await window.codeviz.runExecutionTrace({
          projectPath,
          entryScript,
          timeout: parseInt(traceTimeout, 10) || 30000,
          maxDepth: parseInt(traceMaxDepth, 10) || 100,
        });

        if (result.success) {
          setTraceResult(result);
          setStatus(`追踪完成：${result.graph?.traces[0]?.entries.length || 0} 条记录`);
        } else {
          setTraceError(result.error || "追踪失败");
          setStatus(`追踪失败: ${result.error}`);
        }
      } catch (err) {
        setTraceError(String(err));
        setStatus(`追踪失败: ${String(err)}`);
      } finally {
        setTracing(false);
      }
    };

    // 加载控制流图
    const loadControlFlowGraph = async (moduleName, functionName) => {
      if (!graph || !window.codeviz) {
        setCfgError("请先分析项目");
        return;
      }

      const moduleNode = graph.modules.find((m) => m.module_name === moduleName);
      if (!moduleNode) {
        setCfgError(`找不到模块: ${moduleName}`);
        return;
      }

      setCfgLoading(true);
      setCfgError("");

      try {
        const result = await window.codeviz.extractControlFlow({
          filePath: moduleNode.file_path,
          functionName: functionName || undefined,
        });

        if (result.success) {
          if (result.functions) {
            // 返回了多个函数
            setCfgFunctions(result.functions);
            setCfgSelectedFunction("");
            setCfgMermaidCode("");
            setCfgMermaidSvg("");
          } else if (result.mermaidCode) {
            // 返回了单个函数的控制流图
            setCfgFunctions([]);
            setCfgSelectedFunction(result.functionName);
            setCfgMermaidCode(result.mermaidCode);
          }
        } else {
          setCfgError(result.error || "提取控制流图失败");
        }
      } catch (err) {
        setCfgError(String(err));
      } finally {
        setCfgLoading(false);
      }
    };

    // 渲染控制流图 Mermaid
    React.useEffect(() => {
      if (!cfgMermaidCode || !window.mermaid) return;

      let cancelled = false;
      const render = async () => {
        try {
          window.mermaid.initialize({
            startOnLoad: false,
            securityLevel: "loose",
            theme: theme === "dark" ? "dark" : "default"
          });
          const id = `cfg-mermaid-${Date.now()}`;
          const result = await window.mermaid.render(id, cfgMermaidCode);
          if (!cancelled) {
            setCfgMermaidSvg(result.svg);
          }
        } catch (err) {
          if (!cancelled) {
            setCfgError(`Mermaid 渲染失败: ${String(err)}`);
          }
        }
      };

      void render();
      return () => {
        cancelled = true;
      };
    }, [cfgMermaidCode, theme]);

    // 当选择了函数后自动加载
    React.useEffect(() => {
      if (cfgSelectedFunction && currentModule) {
        loadControlFlowGraph(currentModule.module_name, cfgSelectedFunction);
      }
    }, [cfgSelectedFunction]);

    // 打开控制流图抽屉
    const openControlFlowDrawer = () => {
      if (!currentModule) {
        setCfgError("请先选择一个模块");
        return;
      }
      setCfgModuleName(currentModule.module_name);
      loadControlFlowGraph(currentModule.module_name);
      setCfgDrawerOpen(true);
    };

    const modules = graph
      ? graph.modules.filter((m) => m.module_name.toLowerCase().includes(fileKeyword.toLowerCase()))
      : [];
    const moduleTreeData = React.useMemo(() => buildModuleTreeData(modules), [modules]);
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
      document.body.classList.add("resizing-layout", "resizing-col");
      const onMove = (ev) => {
        const dx = ev.clientX - resizeRef.current.startX;
        if (resizing === "left-col") {
          const maxWidth = Math.max(260, window.innerWidth - 420);
          const next = Math.max(200, Math.min(maxWidth, resizeRef.current.startLeftWidth + dx));
          setLeftPaneWidth(Math.round(next));
          return;
        }
        const maxWidth = Math.max(420, window.innerWidth - leftPaneWidth - 220);
        const next = Math.max(360, Math.min(maxWidth, resizeRef.current.startSourceWidth + dx));
        setSourcePaneWidth(Math.round(next));
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
    }, [resizing, leftPaneWidth]);

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

    const startResizeLeftCol = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      resizeRef.current = {
        ...resizeRef.current,
        startX: ev.clientX,
        startLeftWidth: leftPaneWidth,
      };
      setResizing("left-col");
    };

    const startResizeRightCol = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      resizeRef.current = {
        ...resizeRef.current,
        startX: ev.clientX,
        startSourceWidth: sourcePaneWidth,
      };
      setResizing("right-col");
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

    const openModuleFromExplorer = (moduleName) => {
      if (!moduleName) return;
      setSelectedModule(moduleName);
      setSelectedNodeId("");
      setNodeKeyword("");
      void openModuleInEditor(moduleName, 1, 1);
    };

    const onExplorerTreeSelect = (selected, selectedNode, selectedNodeExtra) => {
      let moduleName = "";
      if (typeof selected === "string") {
        moduleName = selected;
      } else if (Array.isArray(selected) && selected[0]) {
        moduleName = String(selected[0]);
      }
      const candidates = [selectedNodeExtra, selectedNode];
      for (const candidate of candidates) {
        if (!candidate) continue;
        if (candidate.moduleName) {
          moduleName = candidate.moduleName;
          break;
        }
        if (candidate.data && candidate.data.moduleName) {
          moduleName = candidate.data.moduleName;
          break;
        }
        if (!moduleName && candidate.isLeaf && typeof candidate.key === "string") {
          moduleName = candidate.key;
        }
      }
      if (!moduleName || String(moduleName).startsWith("dir:")) {
        return;
      }
      openModuleFromExplorer(moduleName);
    };

    return renderAppView({
      busy,
      currentModule,
      currentModuleEdges,
      currentSymbol,
      dragMovedRef,
      drawerOpen,
      edgeStrokeWidth,
      edgeTypeFilter,
      editorStatus,
      elapsed,
      fileKeyword,
      graph,
      leftMenu,
      leftMenus,
      leftPaneWidth,
      mermaidDragging,
      mermaidRenderRef,
      mermaidSvg,
      mermaidViewport,
      moduleTreeData,
      modules,
      nodeKeyword,
      nodeMatches,
      onExplorerTreeSelect,
      onMermaidMouseDown,
      onMermaidWheel,
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onNodeMouseDown,
      onWheel,
      openInVSCode,
      openModuleFromExplorer,
      openModuleInEditor,
      outDir,
      pickProject,
      positions,
      projectPath,
      reach,
      runAnalyze,
      // 执行追踪相关
      runTrace,
      // 控制流图相关
      openControlFlowDrawer,
      selectNode,
      selectedModule,
      selectedNodeId,
      setDrawerOpen,
      setEdgeTypeFilter,
      setFileKeyword,
      setLeftMenu,
      setMermaidViewport,
      setNodeKeyword,
      setOutDir,
      setProjectPath,
      setSelectedModule,
      setTheme,
      setTraceDrawerOpen,
      // 控制流图相关
      cfgDrawerOpen,
      cfgFunctions,
      cfgSelectedFunction,
      cfgMermaidSvg,
      cfgLoading,
      cfgError,
      setCfgDrawerOpen,
      setCfgSelectedFunction,
      setViewport,
      sourceEditorContainerRef,
      sourceFilePath,
      sourcePaneWidth,
      startResizeLeftCol,
      startResizeRightCol,
      status,
      theme,
      topModules,
      traceDrawerOpen,
      traceError,
      traceMaxDepth,
      traceResult,
      traceTimeout,
      tracing,
      entryScript,
      setEntryScript,
      setTraceTimeout,
      setTraceMaxDepth,
      view,
      viewport,
    });

  }

  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(e(App));
})();
