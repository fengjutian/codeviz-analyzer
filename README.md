# See Code - 代码可视化分析器

基于 Electron 的代码分析工具，输入代码项目后自动解析函数方法并生成可视化图谱。

## 功能特性

- **项目扫描**：输入代码项目路径，自动扫描所有源文件
- **符号解析**：解析文件中的函数、方法、类、变量等符号
- **依赖分析**：分析符号之间的调用、继承、依赖关系
- **可视化图谱**：生成可交互的可视化图谱（Mermaid/React 图表）
- **搜索筛选**：提供搜索、筛选、折叠/展开模块的功能
- **多格式导出**：导出分析结果为 JSON 或 Mermaid 图形文件

## 技术栈

- **Electron** - 桌面应用框架
- **Node.js** - 后端分析逻辑
- **Babel / @babel/parser** - JS/TS 语法解析
- **React** - 前端 UI 渲染
- **Mermaid** - 生成可视化拓扑图

## 分析流程

```
用户选择项目路径
      ↓
扫描源文件（文件收集、过滤、进度回调）
      ↓
AST 解析（提取函数/类/方法/变量等符号）
      ↓
依赖分析（call/import/inherit 关系）
      ↓
图谱建模（symbols/modules/edges/metrics）
      ↓
前端渲染（交互式可视化图谱）
      ↓
导出（JSON/Mermaid/SVG）
```

## 核心模块

| 模块 | 功能 |
|------|------|
| `core/scanner` | 项目扫描、路径过滤、并发调度 |
| `core/parser-jsts` | AST 解析、符号表、依赖边构建 |
| `core/graph` | 图谱聚合、去重、层级映射 |
| `core/metrics` | 复杂度、fan-in/fan-out、耦合度计算 |
| `exporters` | JSON/Mermaid 导出器 |

## 输出格式

- **JSON**：包含符号、模块、依赖关系、度量指标
- **Mermaid 图**：可嵌入 Markdown 查看
- **SVG/PNG**：导出的可视化图形

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build
```

## CLI 用法

```bash
codeviz analyze <projectPath> --out <dir> --format json,mermaid
```
