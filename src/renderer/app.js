(function () {
  const e = React.createElement;

  function toMermaid(graph, edgeTypeFilter) {
    const lines = ["flowchart TD"];
    const normalize = (id) => id.replace(/[^a-zA-Z0-9_]/g, "_");

    for (const edge of graph.edges) {
      if (edgeTypeFilter !== "all" && edge.dependency_type !== edgeTypeFilter) {
        continue;
      }
      const from = normalize(edge.from);
      const to = normalize(edge.to);
      lines.push(`  ${from}[\"${edge.from}\"] -->|${edge.dependency_type}| ${to}[\"${edge.to}\"]`);
    }
    return lines.join("\n");
  }

  function App() {
    const [projectPath, setProjectPath] = React.useState("");
    const [outDir, setOutDir] = React.useState("");
    const [fileKeyword, setFileKeyword] = React.useState("");
    const [edgeTypeFilter, setEdgeTypeFilter] = React.useState("all");
    const [selectedModule, setSelectedModule] = React.useState("");
    const [graph, setGraph] = React.useState(null);
    const [busy, setBusy] = React.useState(false);
    const [status, setStatus] = React.useState("等待开始");
    const [elapsed, setElapsed] = React.useState(0);

    const startTimeRef = React.useRef(0);
    const mermaidRef = React.useRef(null);

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
      if (!graph || !mermaidRef.current) {
        return;
      }

      const code = toMermaid(graph, edgeTypeFilter);
      mermaidRef.current.innerHTML = `<pre>${code}</pre>`;

      if (window.mermaid) {
        window.mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
        window.mermaid
          .render(`g_${Date.now()}`, code)
          .then((res) => {
            mermaidRef.current.innerHTML = res.svg;
          })
          .catch(() => {
            mermaidRef.current.innerHTML = `<pre>${code}</pre>`;
          });
      }
    }, [graph, edgeTypeFilter]);

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

    const currentModuleEdges = graph
      ? graph.edges.filter((edge) => {
          if (!currentModule) {
            return false;
          }
          const from = graph.symbols.find((s) => s.id === edge.from);
          const to = graph.symbols.find((s) => s.id === edge.to);
          const hit = (from && from.module_name === currentModule.module_name) || (to && to.module_name === currentModule.module_name);
          const typePass = edgeTypeFilter === "all" || edge.dependency_type === edgeTypeFilter;
          return hit && typePass;
        })
      : [];

    return e(
      "div",
      { className: "app" },
      e(
        "div",
        { className: "toolbar" },
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
        e("button", { onClick: () => doExport(["json", "mermaid"]), disabled: !graph }, "全部导出")
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
                  onClick: () => setSelectedModule(m.module_name),
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
              { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 } },
              e("strong", null, "依赖图谱"),
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
              )
            ),
            e("div", { className: "mermaid-wrap", ref: mermaidRef })
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
        e("div", null, `耗时: ${elapsed} ms`)
      )
    );
  }

  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(e(App));
})();
