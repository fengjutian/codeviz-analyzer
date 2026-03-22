# See Code - 代码可视化分析器

一个功能强大的代码分析工具，能够自动解析项目结构、分析依赖关系，并生成交互式可视化图谱，帮助开发者更好地理解和维护代码库。

## 功能特性

### 核心功能
- **智能项目扫描**：自动扫描项目目录，支持自定义文件过滤和忽略规则
- **符号解析**：深度解析JavaScript/TypeScript代码，提取函数、类、方法、变量等符号
- **依赖分析**：分析符号之间的调用、继承、实现等依赖关系
- **可视化图谱**：生成可交互的依赖关系图，支持2D和3D视图
- **搜索筛选**：提供强大的搜索和筛选功能，快速定位关键代码
- **多格式导出**：支持导出为JSON、Mermaid、SVG等多种格式

### 高级功能
- **代码复杂度分析**：计算圈复杂度、认知复杂度等指标
- **架构分析**：识别项目架构模式，评估架构健康度
- **执行追踪**：追踪代码执行流程，分析性能瓶颈
- **React组件分析**：专门针对React组件的分析和可视化
- **热图分析**：基于代码复杂度和调用频率的热图展示

## 技术栈

- **前端**：React、D3.js、Three.js、Mermaid、Monaco Editor
- **后端**：Node.js、Babel Parser、TypeScript
- **桌面应用**：Electron
- **UI库**：@douyinfe/semi-ui

## 快速开始

### 环境要求
- Node.js 18.0+
- npm 9.0+

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
# 构建项目
npm run build

# 启动Electron应用
npm run app
```

### 命令行使用
```bash
# 分析项目并导出结果
codeviz analyze <projectPath> --out <outputDir> --format json,mermaid

# 示例
codeviz analyze ./src --out ./analysis --format json,mermaid
```

## 使用指南

### 图形界面操作
1. **选择项目**：点击"选择项目"按钮，浏览并选择要分析的代码目录
2. **开始分析**：点击"开始分析"按钮，系统将自动扫描和分析项目
3. **查看结果**：分析完成后，在左侧面板查看项目结构，右侧面板查看可视化图谱
4. **交互操作**：
   - 拖拽：移动整个图谱
   - 缩放：使用鼠标滚轮或触控板
   - 点击节点：展开/折叠模块，查看详细信息
   - 搜索框：输入关键词搜索符号
   - 筛选器：按类型、复杂度等筛选符号
5. **导出结果**：点击"导出"按钮，选择导出格式

### 命令行参数

| 参数 | 描述 | 示例 |
|------|------|------|
| `<projectPath>` | 要分析的项目路径 | `./src` |
| `--out, -o` | 输出目录 | `./analysis` |
| `--format, -f` | 导出格式（逗号分隔） | `json,mermaid` |
| `--ignore, -i` | 忽略的文件/目录 | `node_modules,dist` |
| `--extensions, -e` | 要分析的文件扩展名 | `js,ts,jsx,tsx` |
| `--help, -h` | 显示帮助信息 | |

## 核心模块

| 模块 | 功能 | 文件位置 |
|------|------|----------|
| **Scanner** | 项目扫描、文件过滤、并发调度 | `src/core/scanner.ts` |
| **Analyzer** | 协调整个分析过程 | `src/core/analyzer.ts` |
| **Graph** | 图谱构建、聚合、去重 | `src/core/graph.ts` |
| **Plugin Manager** | 插件管理，支持多语言解析 | `src/core/pluginManager.ts` |
| **JS/TS Plugin** | JavaScript/TypeScript代码解析 | `src/plugins/jsTsPlugin.ts` |
| **Exporters** | 结果导出（JSON、Mermaid等） | `src/exporters/` |
| **Execution Tracer** | 代码执行追踪和分析 | `src/core/executionTracer.ts` |

## 输出格式

### JSON格式
包含完整的分析结果，包括：
- 项目信息
- 模块列表
- 符号列表
- 依赖关系
- 度量指标
- 诊断信息

### Mermaid格式
生成可嵌入Markdown的图表，展示：
- 模块依赖关系
- 符号调用关系
- 继承层次结构

### SVG/PNG格式
导出可视化图谱为图片，便于在文档中使用。

## 项目结构

```
├── src/              # 源代码
│   ├── core/         # 核心分析模块
│   ├── plugins/      # 语言解析插件
│   ├── exporters/    # 结果导出模块
│   ├── electron/     # Electron主进程
│   └── renderer/     # 前端渲染代码
├── dist/             # 构建输出
├── out/              # 分析结果输出
├── package.json      # 项目配置
└── tsconfig.json     # TypeScript配置
```

## 常见问题

### 分析速度慢
- 尝试减少分析范围，只分析核心代码目录
- 排除大型依赖目录，如`node_modules`
- 对于大型项目，考虑使用命令行模式并设置合理的超时时间

### 分析结果不准确
- 确保项目使用的是支持的语言（JavaScript/TypeScript）
- 检查项目是否有语法错误
- 尝试更新到最新版本的分析工具

### 可视化图谱显示异常
- 对于大型项目，可能需要调整图谱布局参数
- 尝试切换到2D视图以获得更好的性能
- 检查浏览器/应用是否有内存限制

## 贡献指南

欢迎贡献代码、报告问题或提出建议！

### 开发流程
1. Fork本项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 打开Pull Request

### 代码规范
- 使用TypeScript编写代码
- 遵循ESLint和Prettier规范
- 为新功能添加测试
- 保持代码风格一致

## 许可证

本项目采用MIT许可证。详见[LICENSE](LICENSE)文件。

## 联系方式

- 项目地址：[https://github.com/yourusername/see-code](https://github.com/yourusername/see-code)
- 问题反馈：[https://github.com/yourusername/see-code/issues](https://github.com/yourusername/see-code/issues)

---

**See Code** - 让代码可视化，让理解更简单！