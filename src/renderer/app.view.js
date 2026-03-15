(function () {
  const e = React.createElement;
  const Semi = window.SemiUI || {};
  const SButton = Semi.Button || "button";
  const STree = Semi.Tree || null;

  function renderAppView(ctx) {
    return e(
      "div",
      { className: `app theme-${ctx.theme}` },
      e(
        "div",
        { className: "toolbar" },
        e(SButton, { theme: "solid", type: "tertiary", onClick: () => ctx.setTheme((prev) => (prev === "light" ? "dark" : "light")) }, ctx.theme === "light" ? "切换暗色" : "切换亮色"),
        e(SButton, { theme: "solid", type: "primary", onClick: ctx.pickProject, disabled: ctx.busy }, "导入项目"),
        e("input", {
          style: { width: 330 },
          value: ctx.projectPath,
          onChange: (ev) => ctx.setProjectPath(ev.target.value),
          placeholder: "项目路径",
        }),
        e("button", { onClick: ctx.runAnalyze, disabled: ctx.busy }, ctx.busy ? "分析中..." : "刷新分析"),
        e("input", {
          style: { width: 300 },
          value: ctx.outDir,
          onChange: (ev) => ctx.setOutDir(ev.target.value),
          placeholder: "导出目录",
        }),
        e("input", {
          style: { width: 260 },
          value: ctx.nodeKeyword,
          onChange: (ev) => ctx.setNodeKeyword(ev.target.value),
          placeholder: "搜索节点（symbol）",
        }),
        e(
          "button",
          {
            disabled: ctx.nodeMatches.length === 0,
            onClick: () => {
              if (ctx.nodeMatches[0]) {
                ctx.selectNode(ctx.nodeMatches[0].id);
              }
            },
          },
          ctx.nodeMatches.length > 0 ? `定位 ${ctx.nodeMatches.length} 个候选` : "无匹配"
        )
      ),
      e(
        "div",
        {
          className: "workspace",
          style: { gridTemplateColumns: `56px ${ctx.leftPaneWidth}px 6px minmax(420px, 1fr)` },
        },
        e(
          "div",
          { className: "activity-bar" },
          ctx.leftMenus.map((item) =>
            e(
              "button",
              {
                key: item.id,
                className: `activity-item ${ctx.leftMenu === item.id ? "active" : ""}`,
                onClick: () => ctx.setLeftMenu(item.id),
                title: item.label,
              },
              e("span", { className: "activity-icon" }, item.icon)
            )
          )
        ),
        e(
          "div",
          { className: "left" },
          ctx.leftMenu === "explorer"
            ? e(
                React.Fragment,
                null,
                e("div", null, "文件树", ctx.graph ? e("span", { className: "badge" }, `${ctx.modules.length}`) : null),
                e("input", {
                  style: { width: "100%", marginTop: 10, marginBottom: 10 },
                  value: ctx.fileKeyword,
                  onChange: (ev) => ctx.setFileKeyword(ev.target.value),
                  placeholder: "搜索模块",
                }),
                STree
                  ? e(STree, {
                      className: "file-tree",
                      treeData: ctx.moduleTreeData,
                      selectedKey: ctx.selectedModule,
                      selectedKeys: ctx.selectedModule ? [ctx.selectedModule] : [],
                      defaultExpandAll: true,
                      onSelect: ctx.onExplorerTreeSelect,
                      emptyContent: "没有匹配模块",
                    })
                  : e(
                      "div",
                      null,
                      ctx.modules.map((m) =>
                        e(
                          "div",
                          {
                            key: m.id,
                            className: `file-item ${ctx.selectedModule === m.module_name ? "active" : ""}`,
                            onClick: () => ctx.openModuleFromExplorer(m.module_name),
                          },
                          e("div", null, m.module_name),
                          e("div", { className: "small" }, ``)
                        )
                      )
                    )
              )
            : null,
          ctx.leftMenu === "search"
            ? e(
                React.Fragment,
                null,
                e("div", null, "节点搜索", ctx.graph ? e("span", { className: "badge" }, `${ctx.nodeMatches.length}`) : null),
                e("input", {
                  style: { width: "100%", marginTop: 10, marginBottom: 10 },
                  value: ctx.nodeKeyword,
                  onChange: (ev) => ctx.setNodeKeyword(ev.target.value),
                  placeholder: "输入 symbol 关键字",
                }),
                e(
                  "div",
                  null,
                  ctx.nodeMatches.length === 0
                    ? e("div", { className: "small" }, "没有匹配结果")
                    : ctx.nodeMatches.map((node) =>
                        e(
                          "div",
                          {
                            key: node.id,
                            className: `file-item ${ctx.selectedNodeId === node.id ? "active" : ""}`,
                            onClick: () => ctx.selectNode(node.id),
                          },
                          e("div", null, node.label),
                          e("div", { className: "small" }, node.id)
                        )
                      )
                )
              )
            : null,
          ctx.leftMenu === "insights"
            ? e(
                React.Fragment,
                null,
                e("div", null, "工作区概览"),
                ctx.graph
                  ? e(
                      "div",
                      { style: { marginTop: 10 } },
                      e("div", { className: "small" }, `modules: ${ctx.graph.modules.length}`),
                      e("div", { className: "small" }, `symbols: ${ctx.graph.symbols.length}`),
                      e("div", { className: "small" }, `edges: ${ctx.graph.edges.length}`),
                      e("div", { className: "small", style: { marginTop: 8, marginBottom: 8 } }, "Top 模块"),
                      ctx.topModules.map((m) =>
                        e(
                          "div",
                          {
                            key: m.id,
                            className: `file-item ${ctx.selectedModule === m.module_name ? "active" : ""}`,
                            onClick: () => {
                              ctx.setSelectedModule(m.module_name);
                              ctx.setLeftMenu("explorer");
                              void ctx.openModuleInEditor(m.module_name, 1, 1);
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
        e("div", { className: "workspace-splitter workspace-splitter-col", onMouseDown: ctx.startResizeLeftCol }),
        e(
          "div",
          {
            className: "right",
            style: { gridTemplateColumns: `${ctx.sourcePaneWidth}px 6px minmax(420px, 1fr)` },
          },
          e(
            "div",
            { className: "panel", style: { gridColumn: 3, gridRow: 1, display: "grid", gridTemplateRows: "auto 1fr", minWidth: 0, minHeight: 0 } },
            e(
              "div",
              { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 } },
              e("strong", null, ""),
              e(
                "div",
                { style: { display: "flex", alignItems: "center", gap: 8 } },
                e(
                  "select",
                  {
                    value: ctx.edgeTypeFilter,
                    onChange: (ev) => ctx.setEdgeTypeFilter(ev.target.value),
                  },
                  e("option", { value: "all" }, "全部边类型"),
                  e("option", { value: "call" }, "call"),
                  e("option", { value: "import" }, "import"),
                  e("option", { value: "inherit" }, "inherit"),
                  e("option", { value: "implement" }, "implement"),
                  e("option", { value: "reference" }, "reference")
                ),
                e("button", { onClick: () => ctx.setViewport({ x: 0, y: 0, scale: 1 }) }, "重置视图")
              )
            ),
            e(
              "div",
              {
                className: "graph-wrap",
                onWheel: ctx.onWheel,
                onMouseDown: ctx.onMouseDown,
                onMouseMove: ctx.onMouseMove,
                onMouseUp: ctx.onMouseUp,
                onMouseLeave: ctx.onMouseUp,
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
                  { transform: `translate(${ctx.viewport.x}, ${ctx.viewport.y}) scale(${ctx.viewport.scale})` },
                  ctx.view.edges.map((edge) => {
                    const p1 = ctx.positions.get(edge.from);
                    const p2 = ctx.positions.get(edge.to);
                    if (!p1 || !p2) return null;
                    const active = !ctx.selectedNodeId || edge.from === ctx.selectedNodeId || edge.to === ctx.selectedNodeId || (ctx.reach.upstream.has(edge.from) && ctx.reach.upstream.has(edge.to)) || (ctx.reach.downstream.has(edge.from) && ctx.reach.downstream.has(edge.to));
                    return e("line", {
                      key: edge.id,
                      x1: p1.x,
                      y1: p1.y,
                      x2: p2.x,
                      y2: p2.y,
                      markerEnd: active ? "url(#arrow-active)" : "url(#arrow-dim)",
                      className: `graph-edge type-${edge.dependency_type} ${active ? "active" : "dim"}`,
                      style: { strokeWidth: ctx.edgeStrokeWidth(edge.dependency_type) },
                    });
                  }),
                  ctx.view.nodes.map((node) => {
                    const p = ctx.positions.get(node.id);
                    if (!p) return null;
                    const selected = node.id === ctx.selectedNodeId;
                    const upstream = ctx.reach.upstream.has(node.id);
                    const downstream = ctx.reach.downstream.has(node.id);
                    const className = selected ? "selected" : upstream ? "upstream" : downstream ? "downstream" : ctx.selectedNodeId ? "dim" : "normal";
                    return e(
                      "g",
                      {
                        key: node.id,
                        className: "graph-node-handle",
                        transform: `translate(${p.x}, ${p.y})`,
                        onMouseDown: (ev) => ctx.onNodeMouseDown(ev, node.id),
                        onClick: () => {
                          if (ctx.dragMovedRef.current) {
                            ctx.dragMovedRef.current = false;
                            return;
                          }
                          ctx.selectNode(node.id);
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
          e("div", { className: "workspace-splitter workspace-splitter-col", style: { gridColumn: 2, gridRow: 1 }, onMouseDown: ctx.startResizeRightCol }),
          e(
            "div",
            { className: "panel source-panel", style: { gridColumn: 1, gridRow: 1, minWidth: 0, minHeight: 0 } },
            e("strong", null, "源码编辑器（Monaco Editor）"),
            ctx.sourceFilePath
              ? e(
                  "div",
                  { className: "source-actions" },
                  e("div", { className: "source-path", title: ctx.sourceFilePath }, ctx.sourceFilePath),
                  e(
                    "div",
                    { className: "source-actions-right" },
                    e("button", { onClick: () => ctx.currentSymbol && ctx.selectNode(ctx.currentSymbol.id), disabled: !ctx.currentSymbol }, "定位符号"),
                    e("button", { onClick: ctx.openInVSCode }, "在 VSCode 打开")
                  )
                )
              : e("div", { className: "small" }, "请选择模块或节点"),
            e("div", { className: "source-editor", ref: ctx.sourceEditorContainerRef }),
            ctx.currentModule
              ? e(
                  "div",
                  null,
                  e("div", { className: "small" }, `module: ${ctx.currentModule.module_name}`),
                  e("div", { className: "small" }, `symbols: ${ctx.currentModule.symbols.length}, edges: ${ctx.currentModuleEdges.length}`),
                  e("div", { className: "small" }, ctx.selectedNodeId ? `selected: ${ctx.selectedNodeId}` : "selected: 无"),
                  e("div", { className: "small" }, ctx.currentSymbol && ctx.currentSymbol.location ? `line: ${ctx.currentSymbol.location.start_line}, column: ${ctx.currentSymbol.location.start_column}` : "line: -"),
                  e("div", { className: "small" }, `编辑器状态: ${ctx.editorStatus}`)
                )
              : e("div", { className: "small", style: { marginTop: 8 } }, "请选择模块")
          )
        )
      ),
      ctx.drawerOpen
        ? e(
            "div",
            { className: "drawer-mask", onClick: () => ctx.setDrawerOpen(false) },
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
                  e("span", { className: "small" }, `缩放 ${(ctx.mermaidViewport.scale * 100).toFixed(0)}%`),
                  e(SButton, { theme: "light", type: "tertiary", onClick: () => ctx.setMermaidViewport((prev) => ({ ...prev, scale: Math.max(0.35, Number((prev.scale * 0.9).toFixed(3)) ) })) }, "缩小"),
                  e(SButton, { theme: "light", type: "tertiary", onClick: () => ctx.setMermaidViewport((prev) => ({ ...prev, scale: Math.min(3.2, Number((prev.scale * 1.1).toFixed(3)) ) })) }, "放大"),
                  e(SButton, { theme: "light", type: "secondary", onClick: () => ctx.setMermaidViewport({ x: 0, y: 0, scale: 1 }) }, "重置"),
                  e(SButton, { theme: "solid", type: "danger", onClick: () => ctx.setDrawerOpen(false) }, "关闭")
                )
              ),
              e(
                "div",
                {
                  ref: ctx.mermaidRenderRef,
                  className: `mermaid-preview ${ctx.mermaidDragging ? "dragging" : ""}`,
                  onWheel: ctx.onMermaidWheel,
                  onMouseDown: ctx.onMermaidMouseDown,
                },
                e("div", {
                  className: "mermaid-canvas",
                  style: { transform: `translate(${ctx.mermaidViewport.x}px, ${ctx.mermaidViewport.y}px) scale(${ctx.mermaidViewport.scale})` },
                  dangerouslySetInnerHTML: { __html: ctx.mermaidSvg || "<div class='small'>渲染中...</div>" },
                })
              )
            )
          )
        : null,
      // 控制流图抽屉
      ctx.cfgDrawerOpen
        ? e(
            "div",
            { className: "drawer-mask drawer-mask-right", onClick: () => ctx.setCfgDrawerOpen(false) },
            e(
              "div",
              {
                className: "drawer drawer-right",
                style: { width: 600 },
                onClick: (ev) => ev.stopPropagation(),
              },
              e(
                "div",
                { className: "drawer-header" },
                e("strong", null, "控制流图 (Control Flow Graph)"),
                e(
                  "div",
                  { className: "drawer-actions" },
                  e("span", { className: "small" }, `缩放 ${(ctx.cfgViewport.scale * 100).toFixed(0)}%`),
                  e(SButton, { theme: "light", type: "tertiary", onClick: () => ctx.setCfgViewport((prev) => ({ ...prev, scale: Math.max(0.35, Number((prev.scale * 0.9).toFixed(3))) })) }, "缩小"),
                  e(SButton, { theme: "light", type: "tertiary", onClick: () => ctx.setCfgViewport((prev) => ({ ...prev, scale: Math.min(3.2, Number((prev.scale * 1.1).toFixed(3))) })) }, "放大"),
                  e(SButton, { theme: "light", type: "secondary", onClick: () => ctx.setCfgViewport({ x: 0, y: 0, scale: 1 }) }, "重置"),
                  e(SButton, { theme: "solid", type: "danger", onClick: () => ctx.setCfgDrawerOpen(false) }, "关闭")
                )
              ),
              // 函数选择器
              ctx.cfgFunctions.length > 0
                ? e("div", { style: { padding: "12px", borderBottom: "1px solid var(--border)" } },
                    e("div", { style: { marginBottom: 8 } }, "选择函数:"),
                    e("select", {
                      style: { width: "100%", padding: "6px" },
                      value: ctx.cfgSelectedFunction,
                      onChange: (ev) => ctx.setCfgSelectedFunction(ev.target.value),
                    },
                      e("option", { value: "" }, `-- 选择函数 (${ctx.cfgFunctions.length} 个)`),
                      ctx.cfgFunctions.map((fn) =>
                        e("option", { key: fn.functionName, value: fn.functionName },
                          `${fn.functionName} (${fn.nodeCount} 节点, ${fn.edgeCount} 边)`
                        )
                      )
                    )
                  )
                : null,
              // 渲染区域
              e(
                "div",
                {
                  ref: ctx.cfgRenderRef,
                  className: `trace-results ${ctx.cfgDragging ? "dragging" : ""}`,
                  style: { overflow: "auto", flex: 1, padding: 12 },
                  onWheel: ctx.onCfgWheel,
                  onMouseDown: ctx.onCfgMouseDown,
                },
                ctx.cfgLoading
                  ? e("div", { className: "small" }, "加载中...")
                  : ctx.cfgError
                    ? e("div", { style: { color: "var(--danger)" } }, ctx.cfgError)
                    : ctx.cfgMermaidSvg
                      ? e("div", {
                          className: "mermaid-canvas",
                          style: { transform: `translate(${ctx.cfgViewport.x}px, ${ctx.cfgViewport.y}px) scale(${ctx.cfgViewport.scale})` },
                          dangerouslySetInnerHTML: { __html: ctx.cfgMermaidSvg }
                        })
                      : e("div", { className: "small" }, "选择一个函数查看其控制流图")
              )
            )
          )
        : null,
      // React 组件流程图抽屉 (右侧)
      ctx.rcfDrawerOpen
        ? e(
            "div",
            { className: "drawer-mask drawer-mask-right", onClick: () => ctx.setRcfDrawerOpen(false) },
            e(
              "div",
              {
                className: "drawer drawer-right",
                style: { width: 600 },
                onClick: (ev) => ev.stopPropagation(),
              },
              e(
                "div",
                { className: "drawer-header" },
                e("strong", null, "React 组件流程图"),
                e(
                  "div",
                  { className: "drawer-actions" },
                  e("span", { className: "small" }, `缩放 ${(ctx.rcfViewport.scale * 100).toFixed(0)}%`),
                  e(SButton, { theme: "light", type: "tertiary", onClick: () => ctx.setRcfViewport((prev) => ({ ...prev, scale: Math.max(0.35, Number((prev.scale * 0.9).toFixed(3))) })) }, "缩小"),
                  e(SButton, { theme: "light", type: "tertiary", onClick: () => ctx.setRcfViewport((prev) => ({ ...prev, scale: Math.min(3.2, Number((prev.scale * 1.1).toFixed(3))) })) }, "放大"),
                  e(SButton, { theme: "light", type: "secondary", onClick: () => ctx.setRcfViewport({ x: 0, y: 0, scale: 1 }) }, "重置"),
                  e(SButton, { theme: "solid", type: "danger", onClick: () => ctx.setRcfDrawerOpen(false) }, "关闭")
                )
              ),
              // 组件选择器
              ctx.rcfComponents.length > 0
                ? e("div", { style: { padding: "12px", borderBottom: "1px solid var(--border)" } },
                    e("div", { style: { marginBottom: 8 } }, "选择组件:"),
                    e("select", {
                      style: { width: "100%", padding: "6px" },
                      value: ctx.rcfSelectedComponent,
                      onChange: (ev) => ctx.setRcfSelectedComponent(ev.target.value),
                    },
                      e("option", { value: "" }, `-- 选择组件 (${ctx.rcfComponents.length} 个)`),
                      ctx.rcfComponents.map((comp) =>
                        e("option", { key: comp.componentName, value: comp.componentName },
                          `${comp.componentName} (${comp.nodeCount} 节点, ${comp.edgeCount} 边)`
                        )
                      )
                    )
                  )
                : null,
              // 渲染区域
              e(
                "div",
                {
                  ref: ctx.rcfRenderRef,
                  className: `trace-results ${ctx.rcfDragging ? "dragging" : ""}`,
                  style: { overflow: "auto", flex: 1, padding: 12 },
                  onWheel: ctx.onRcfWheel,
                  onMouseDown: ctx.onRcfMouseDown,
                },
                ctx.rcfLoading
                  ? e("div", { className: "small" }, "加载中...")
                  : ctx.rcfError
                    ? e("div", { style: { color: "var(--danger)" } }, ctx.rcfError)
                    : ctx.rcfMermaidSvg
                      ? e("div", {
                          className: "mermaid-canvas",
                          style: { transform: `translate(${ctx.rcfViewport.x}px, ${ctx.rcfViewport.y}px) scale(${ctx.rcfViewport.scale})` },
                          dangerouslySetInnerHTML: { __html: ctx.rcfMermaidSvg }
                        })
                      : e("div", { className: "small" }, "选择一个组件查看其流程图")
              )
            )
          )
        : null,
      // 代码理解抽屉 (右侧)
      ctx.understandingDrawerOpen
        ? e(
            "div",
            { className: "drawer-mask drawer-mask-right", onClick: () => ctx.setUnderstandingDrawerOpen(false) },
            e(
              "div",
              {
                className: "drawer drawer-right",
                style: { width: 700 },
                onClick: (ev) => ev.stopPropagation(),
              },
              e(
                "div",
                { className: "drawer-header" },
                e("strong", null, "代码理解分析"),
                e(
                  "div",
                  { className: "drawer-actions" },
                  e(SButton, { theme: "solid", type: "danger", onClick: () => ctx.setUnderstandingDrawerOpen(false) }, "关闭")
                )
              ),
              // 文件摘要
              ctx.understandingLoading
                ? e("div", { style: { padding: 20, textAlign: "center" } }, "分析中...")
                : ctx.understandingError
                  ? e("div", { style: { padding: 20, color: "var(--danger)" } }, ctx.understandingError)
                  : ctx.understandingData
                    ? e(
                        "div",
                        { style: { display: "flex", flexDirection: "column", height: "calc(100% - 60px)" } },
                        // 文件摘要区域
                        e("div", { style: { padding: 12, borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" } },
                          e("div", { style: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 } }, "文件摘要"),
                          e("div", { style: { fontSize: 14, fontWeight: 500 } }, ctx.understandingData.file_summary),
                          e("div", { style: { marginTop: 8, fontSize: 12 } },
                            e("span", { style: { marginRight: 12 } }, "Symbols:" + ((ctx.understandingData.symbols || []).length)),
                            e("span", { style: { marginRight: 12 } }, "Concepts:" + ((ctx.understandingData.key_concepts || []).slice(0, 2).join(", ")))
                          )
                        ),
                        // 符号列表和详情
                        e("div", { style: { display: "flex", flex: 1, overflow: "hidden" } },
                          // 左侧符号列表
                          e("div", { style: { width: 200, borderRight: "1px solid var(--border)", overflow: "auto", padding: 8 } },
                            e("div", { style: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 } }, "符号列表"),
                            ctx.understandingData.symbols.map((sym, idx) =>
                              e("div", {
                                key: sym.symbol_id,
                                style: {
                                  padding: "8px 10px",
                                  marginBottom: 4,
                                  borderRadius: 4,
                                  cursor: "pointer",
                                  background: idx === ctx.selectedSymbolIndex ? "var(--primary-light)" : "transparent",
                                  fontSize: 13,
                                },
                                onClick: () => ctx.setSelectedSymbolIndex(idx),
                              },
                                e("span", { style: { fontWeight: 500 } }, sym.symbol_name),
                                e("span", { style: { fontSize: 11, color: "var(--text-secondary)", marginLeft: 6 } },
                                  sym.symbol_type === "function" ? "🔵" : sym.symbol_type === "method" ? "🟢" : sym.symbol_type === "class" ? "🟡" : "⚪"
                                )
                              )
                            )
                          ),
                          // 右侧详情
                          e("div", { style: { flex: 1, overflow: "auto", padding: 12 } },
                            ctx.understandingData.symbols[ctx.selectedSymbolIndex]
                              ? (() => {
                                  const sym = ctx.understandingData.symbols[ctx.selectedSymbolIndex];
                                  return e("div", null,
                                    // 名称和类型
                                    e("div", { style: { marginBottom: 12 } },
                                      e("h3", { style: { margin: 0, fontSize: 16 } },
                                        sym.symbol_name,
                                        e("span", { style: { fontSize: 12, fontWeight: "normal", color: "var(--text-secondary)", marginLeft: 8 } },
                                          sym.symbol_type
                                        )
                                      )
                                    ),
                                    // 作用
                                    e("div", { style: { marginBottom: 12 } },
                                      e("div", { style: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 } }, "这个代码做什么？"),
                                      e("div", { style: { fontSize: 14 } }, sym.what_it_does)
                                    ),
                                    // 工作原理
                                    e("div", { style: { marginBottom: 12 } },
                                      e("div", { style: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 } }, "工作原理"),
                                      e("div", { style: { fontSize: 14 } }, sym.how_it_works)
                                    ),
                                    // 复杂度
                                    e("div", { style: { marginBottom: 12 } },
                                      e("div", { style: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 } }, "复杂度"),
                                      e("span", {
                                        style: {
                                          display: "inline-block",
                                          padding: "2px 8px",
                                          borderRadius: 4,
                                          fontSize: 12,
                                          background: sym.complexity === "simple" ? "#d4edda" : sym.complexity === "moderate" ? "#fff3cd" : "#f8d7da",
                                          color: sym.complexity === "simple" ? "#155724" : sym.complexity === "moderate" ? "#856404" : "#721c24",
                                        }
                                      }, sym.complexity === "simple" ? "简单" : sym.complexity === "moderate" ? "中等" : "复杂")
                                    ),
                                    // 参数
                                    sym.parameters && sym.parameters.length > 0
                                      ? e("div", { style: { marginBottom: 12 } },
                                          e("div", { style: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 } }, "参数"),
                                          e("ul", { style: { margin: 0, paddingLeft: 20, fontSize: 13 } },
                                            sym.parameters.map((p, i) =>
                                              e("li", { key: i }, e("strong", null, p.name), " - ", p.purpose)
                                            )
                                          )
                                        )
                                      : null,
                                    // 返回值
                                    sym.returns
                                      ? e("div", { style: { marginBottom: 12 } },
                                          e("div", { style: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 } }, "返回值"),
                                          e("div", { style: { fontSize: 13 } }, sym.returns)
                                        )
                                      : null,
                                    // 副作用
                                    sym.side_effects && sym.side_effects.length > 0
                                      ? e("div", { style: { marginBottom: 12 } },
                                          e("div", { style: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 } }, "可能的副作用"),
                                          e("ul", { style: { margin: 0, paddingLeft: 20, fontSize: 13 } },
                                            sym.side_effects.map((se, i) =>
                                              e("li", { key: i, style: { color: "#856404" } }, se)
                                            )
                                          )
                                        )
                                      : null,
                                    // 建议
                                    sym.suggestions && sym.suggestions.length > 0
                                      ? e("div", { style: { marginBottom: 12 } },
                                          e("div", { style: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 } }, "优化建议"),
                                          e("ul", { style: { margin: 0, paddingLeft: 20, fontSize: 13, color: "var(--primary)" } },
                                            sym.suggestions.map((s, i) =>
                                              e("li", { key: i }, s)
                                            )
                                          )
                                        )
                                      : null
                                  );
                                })()
                              : null
                          )
                        ),
                        // 底部关键概念
                        ctx.understandingData.key_concepts.length > 0
                          ? e("div", { style: { padding: 12, borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" } },
                              e("div", { style: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 } }, "关键概念"),
                              e("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } },
                                ctx.understandingData.key_concepts.map((concept, idx) =>
                                  e("span", {
                                    key: idx,
                                    style: { padding: "2px 8px", background: "var(--primary-light)", borderRadius: 4, fontSize: 11 }
                                  }, concept)
                                )
                              )
                            )
                          : null
                      )
                    : e("div", { style: { padding: 20 } }, "暂无数据")
            )
          )
        : null,
      // 3D可视化抽屉 (右侧)
      ctx.visualizer3DOpen
        ? e(
            "div",
            { className: "drawer-mask drawer-mask-right", onClick: ctx.closeVisualizer3D },
            e(
              "div",
              {
                className: "drawer drawer-right drawer-3d", // 添加drawer-3d类
                style: { width: 900 }, // 移除flex样式，使用CSS类
                onClick: (ev) => ev.stopPropagation(),
              },
              e(
                "div",
                { className: "drawer-header", style: { flexShrink: 0 } },
                e("strong", null, "3D代码可视化"),
                e(
                  "div",
                  { className: "drawer-actions" },
                  e(SButton, { theme: "solid", type: "secondary", onClick: ctx.reset3DView }, "重置视图"),
                  e(SButton, { theme: "solid", type: "danger", onClick: ctx.closeVisualizer3D }, "关闭")
                )
              ),
              e("div", { 
                style: { 
                  padding: "12px", 
                  borderBottom: "1px solid var(--border)", 
                  flexShrink: 0,
                  background: "var(--panel-bg)"
                } 
              },
                e("div", { style: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 } }, 
                  "🖱️ 拖拽旋转 | 🎯 滚轮缩放 | ⌨️ WASD/方向键控制 | 📱 触摸支持"
                ),
                e("div", { style: { fontSize: 10, color: "#999999" } }, 
                  "鼠标左键拖拽旋转，滚轮缩放，右键平移 | Q/E键缩放，R键重置 | 单指旋转，双指缩放"
                )
              ),
              e("div", { 
                ref: ctx.visualizer3DContainerRef,
                className: "visualizer-3d-container", // 使用专用CSS类
                style: { 
                  flex: 1, // 占据剩余空间
                  position: "relative",
                  background: "#1a1a1a",
                  overflow: "hidden",
                  minHeight: "0", // 允许收缩
                  width: "100%",
                  height: "100%" // 确保填满可用空间
                } 
              },
                ctx.visualizer3DLoading
                  ? e("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" } }, 
                      e("div", { style: { fontSize: 14, color: "var(--text-secondary)" } }, "正在初始化3D场景...")
                    )
                  : ctx.visualizer3DError
                  ? e("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#ff4444" } }, 
                      e("div", { style: { fontSize: 14 } }, ctx.visualizer3DError)
                    )
                  : null // 正常情况不显示任何内容，让Canvas填充整个区域
              )
            )
          )
        : null,
      // 执行追踪抽屉 (右侧)
      ctx.traceDrawerOpen
        ? e(
            "div",
            { className: "drawer-mask drawer-mask-right", onClick: () => ctx.setTraceDrawerOpen(false) },
            e(
              "div",
              {
                className: "drawer drawer-right",
                style: { width: 500 },
                onClick: (ev) => ev.stopPropagation(),
              },
              e(
                "div",
                { className: "drawer-header" },
                e("strong", null, "执行追踪"),
                e(
                  "div",
                  { className: "drawer-actions" },
                  e(SButton, { theme: "solid", type: "danger", onClick: () => ctx.setTraceDrawerOpen(false) }, "关闭")
                )
              ),
              // 追踪配置
              e("div", { style: { padding: "12px", borderBottom: "1px solid var(--border)" } },
                e("div", { style: { marginBottom: 8 } }, "入口脚本 (相对于项目根目录):"),
                e("input", {
                  style: { width: "100%", marginBottom: 8 },
                  value: ctx.entryScript,
                  onChange: (ev) => ctx.setEntryScript(ev.target.value),
                  placeholder: "例如: src/index.js",
                }),
                e("div", { style: { display: "flex", gap: 8, marginBottom: 8 } },
                  e("div", { style: { flex: 1 } },
                    e("div", { className: "small", style: { marginBottom: 4 } }, "超时 (ms):"),
                    e("input", {
                      style: { width: "100%" },
                      value: ctx.traceTimeout,
                      onChange: (ev) => ctx.setTraceTimeout(ev.target.value),
                      placeholder: "30000",
                    })
                  ),
                  e("div", { style: { flex: 1 } },
                    e("div", { className: "small", style: { marginBottom: 4 } }, "最大深度:"),
                    e("input", {
                      style: { width: "100%" },
                      value: ctx.traceMaxDepth,
                      onChange: (ev) => ctx.setTraceMaxDepth(ev.target.value),
                      placeholder: "100",
                    })
                  )
                ),
                e(SButton, { theme: "solid", type: "primary", onClick: ctx.runTrace, disabled: ctx.tracing || !ctx.entryScript }, ctx.tracing ? "追踪中..." : "开始追踪")
              ),
              // 追踪结果
              e(
                "div",
                { className: "trace-results", style: { overflow: "auto", flex: 1, padding: 12 } },
                ctx.traceResult
                  ? e(
                      "div",
                      null,
                      e("div", { style: { marginBottom: 8 } },
                        e("strong", null, "执行记录 "),
                        e("span", { className: "badge" }, `${ctx.traceResult.graph?.traces[0]?.entries.length || 0}`)
                      ),
                      e(
                        "div",
                        { style: { fontSize: 12 } },
                        ctx.traceResult.graph?.traces[0]?.entries.slice(0, 100).map((entry, idx) =>
                          e(
                            "div",
                            {
                              key: idx,
                              style: {
                                padding: "2px 0",
                                paddingLeft: entry.depth * 16,
                                color: entry.event === "enter" ? "var(--text)" : "var(--text-secondary)",
                              },
                            },
                            entry.event === "enter" ? "▶ " : "◀ ",
                            e("span", { style: { fontWeight: entry.event === "enter" ? 500 : 400 } }, entry.symbol_name),
                            entry.event === "enter" && entry.parameters ? e("span", { style: { color: "var(--text-secondary)", marginLeft: 4 } }, `(${JSON.stringify(entry.parameters).slice(0, 30)}...)`) : null,
                            entry.event === "return" && entry.return_value !== undefined ? e("span", { style: { color: "var(--text-secondary)", marginLeft: 4 } }, `=> ${JSON.stringify(entry.return_value).slice(0, 30)}`) : null
                          )
                        )
                      ),
                      ctx.traceResult.graph?.traces[0]?.entries.length > 100
                        ? e("div", { className: "small", style: { marginTop: 8 } }, `... 还有 ${ctx.traceResult.graph.traces[0].entries.length - 100} 条记录`)
                        : null
                    )
                  : ctx.traceError
                    ? e("div", { style: { color: "var(--danger)" } }, `追踪失败: ${ctx.traceError}`)
                    : e("div", { className: "small" }, "点击「开始追踪」运行代码并捕获执行轨迹")
              )
            )
          )
        : null,
      ctx.graph
        ? e(
            "div",
            { className: "float-button-group" },
            e(
              "button",
              { className: "float-button", title: "Mermaid", onClick: () => ctx.setDrawerOpen(true) },
              "M"
            ),
            e(
              "button",
              { className: "float-button", title: "执行追踪", onClick: () => ctx.setTraceDrawerOpen(true) },
              "追踪"
            ),
            e(
              "button",
              { className: "float-button", title: "控制流图", onClick: ctx.openControlFlowDrawer },
              "控制"
            ),
            e(
              "button",
              { className: "float-button", title: "组件流程", onClick: ctx.openReactFlowDrawer },
              "组件"
            ),
            e(
              "button",
              { className: "float-button", title: "代码理解", onClick: ctx.openUnderstandingDrawer },
              "理解"
            ),
            e(
              "button",
              { className: "float-button", title: "3D可视化", onClick: ctx.openVisualizer3D },
              "3D"
            )
          )
        : null,
      e(
        "div",
        { className: "status" },
        e("div", null, `状态: ${ctx.status}`),
        e("div", null, `耗时: ${ctx.elapsed} ms | 缩放: ${ctx.viewport.scale.toFixed(2)}`)
      )
    );
  }

  window.CodeVizRendererView = {
    renderAppView,
  };
})();
