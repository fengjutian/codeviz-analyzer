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
        e(SButton, { theme: "solid", type: "secondary", onClick: () => ctx.setDrawerOpen(true), disabled: !ctx.graph }, "打开 Mermaid 抽屉"),
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
                          e("div", { className: "small" }, `symbols: ${m.symbols.length} | instability: ${m.metrics.instability}`)
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
              e("strong", null, "依赖图谱"),
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
