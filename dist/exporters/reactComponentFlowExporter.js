"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractReactComponentFlow = extractReactComponentFlow;
exports.toMermaidRCF = toMermaidRCF;
exports.extractModuleReactFlows = extractModuleReactFlows;
const parser_1 = require("@babel/parser");
const traverse_1 = __importDefault(require("@babel/traverse"));
const t = __importStar(require("@babel/types"));
/**
 * 生成节点 ID
 */
function makeNodeId(prefix, index) {
    return `${prefix}_${index}`;
}
/**
 * 转义 Mermaid 标签
 */
function escapeLabel(text) {
    let simplified = text;
    if (text.length > 35) {
        simplified = text.substring(0, 32) + "...";
    }
    // Mermaid 中需要转义的特殊字符：: # ( ) [ ] { } < > | " \ ?
    return simplified
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/:/g, "\\:")
        .replace(/#/g, "\\#")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]")
        .replace(/\{/g, "\\{")
        .replace(/\}/g, "\\}")
        .replace(/</g, "\\<")
        .replace(/>/g, "\\>")
        .replace(/\|/g, "\\|")
        .replace(/\?/g, "\\?")
        .replace(/\n/g, " ");
}
/**
 * 转义 Mermaid 文本内容（仅转义引号和换行）
 */
function escapeText(text) {
    return text.replace(/"/g, "'").replace(/\n/g, " ");
}
/**
 * 获取节点的 Mermaid 形状
 */
function getNodeShape(type, label) {
    const escaped = escapeText(label);
    switch (type) {
        case "props":
            return `[${escaped}]`;
        case "destruct":
            return `[${escaped}]`;
        case "condition":
            // 条件判断用 diamond 形状，不需要转义冒号
            return `{${escaped}}`;
        case "branch":
            return `/${escaped}/`;
        case "state":
            return `([${escaped}])`;
        case "effect":
            return `([${escaped}])`;
        case "callback":
            return `([${escaped}])`;
        case "ref":
            return `([${escaped}])`;
        case "memo":
            return `((${escaped}))`;
        case "return":
            return `>[${escaped}]`;
        case "render":
            return `[[${escaped}]]`;
        default:
            return `[${escaped}]`;
    }
}
// 辅助类型：检查是否有 loc 属性
function hasLoc(node) {
    return "loc" in node && node.loc != null;
}
/**
 * 从 Babel AST 提取 React 组件流程图
 */
function extractReactComponentFlow(sourceCode, moduleName, componentName) {
    let ast;
    try {
        ast = (0, parser_1.parse)(sourceCode, {
            sourceType: "unambiguous",
            plugins: ["typescript", "jsx", "classProperties", "decorators-legacy"],
        });
    }
    catch {
        return null;
    }
    const nodes = [];
    const edges = [];
    let nodeIndex = 0;
    let foundComponentName = null;
    let isForwardRef = false;
    let displayName;
    let componentFound = false;
    // 收集 hooks 调用的变量
    const hookAssignments = new Map();
    const addNode = (type, label, code, line, detail) => {
        const id = makeNodeId("n", nodeIndex++);
        const node = { id, type, label, code, line, detail };
        nodes.push(node);
        return node;
    };
    const addEdge = (from, to, label) => {
        edges.push({ from: from.id, to: to.id, label });
    };
    // 访问器模式处理
    const visitors = {};
    // 处理 VariableDeclaration (useState 等赋值)
    visitors.VariableDeclaration = (path) => {
        const node = path.node;
        const declarations = node.declarations;
        for (const decl of declarations) {
            if (t.isVariableDeclarator(decl) && t.isIdentifier(decl.id)) {
                const varName = decl.id.name;
                // 检查是否是 Hook 调用
                if (decl.init && t.isCallExpression(decl.init)) {
                    const callee = decl.init.callee;
                    if (t.isIdentifier(callee)) {
                        const hookName = callee.name;
                        if (hookName === "useState") {
                            hookAssignments.set(varName, { type: "state", name: varName });
                            const detail = decl.init.arguments[0] ? "initial" : "";
                            addNode("state", `useState: ${varName}`, varName, node.loc?.start.line, detail);
                        }
                        else if (hookName === "useEffect") {
                            hookAssignments.set(varName, { type: "effect", name: varName });
                            addNode("effect", `useEffect: ${varName}`, varName, node.loc?.start.line);
                        }
                        else if (hookName === "useCallback") {
                            hookAssignments.set(varName, { type: "callback", name: varName });
                            addNode("callback", `useCallback: ${varName}`, varName, node.loc?.start.line);
                        }
                        else if (hookName === "useRef") {
                            hookAssignments.set(varName, { type: "ref", name: varName });
                            addNode("ref", `useRef: ${varName}`, varName, node.loc?.start.line);
                        }
                        else if (hookName === "useMemo") {
                            hookAssignments.set(varName, { type: "memo", name: varName });
                            addNode("memo", `useMemo: ${varName}`, varName, node.loc?.start.line);
                        }
                    }
                }
            }
        }
    };
    // 处理 React.forwardRef
    visitors.CallExpression = (path) => {
        const node = path.node;
        const callee = node.callee;
        // React.forwardRef((props, ref) => { ... })
        if (t.isMemberExpression(callee) &&
            t.isIdentifier(callee.object) &&
            callee.object.name === "React" &&
            t.isIdentifier(callee.property) &&
            callee.property.name === "forwardRef") {
            isForwardRef = true;
        }
        // forwardRef((props, ref) => { ... })
        if (t.isIdentifier(callee) && callee.name === "forwardRef") {
            isForwardRef = true;
        }
        // React.memo(...)
        if (t.isMemberExpression(callee) &&
            t.isIdentifier(callee.object) &&
            callee.object.name === "React" &&
            t.isIdentifier(callee.property) &&
            callee.property.name === "memo") {
            // memo 处理
        }
        // memo(...)
        if (t.isIdentifier(callee) && callee.name === "memo") {
            // memo 处理
        }
    };
    // 处理函数声明/表达式 - 组件入口
    visitors.FunctionDeclaration = (path) => {
        const node = path.node;
        const name = node.id?.name;
        if (componentName && name !== componentName) {
            return;
        }
        // 检查是否是 React 组件 (首字母大写)
        if (name && /^[A-Z]/.test(name)) {
            foundComponentName = name;
            componentFound = true;
            processComponentBody(path);
            path.stop();
        }
    };
    visitors.FunctionExpression = (path) => {
        const node = path.node;
        const name = node.id?.name;
        // 如果指定了 componentName，检查是否匹配
        if (componentName) {
            // 如果有名称且不匹配，跳过
            if (name && name !== componentName) {
                return;
            }
            // 如果没有名称，检查父节点
            const parent = path.parent;
            if (!parent || !t.isCallExpression(parent)) {
                return;
            }
            const callee = parent.callee;
            const isHoc = (t.isMemberExpression(callee) && t.isIdentifier(callee.object) && callee.object.name === "React" && t.isIdentifier(callee.property) && (callee.property.name === "forwardRef" || callee.property.name === "memo")) ||
                (t.isIdentifier(callee) && (callee.name === "forwardRef" || callee.name === "memo"));
            if (!isHoc) {
                return;
            }
        }
        // 检查父节点是否是 forwardRef 或 memo
        const parent = path.parent;
        if (parent && t.isCallExpression(parent)) {
            const callee = parent.callee;
            if ((t.isMemberExpression(callee) && t.isIdentifier(callee.object) && callee.object.name === "React" && t.isIdentifier(callee.property) && (callee.property.name === "forwardRef" || callee.property.name === "memo")) ||
                (t.isIdentifier(callee) && (callee.name === "forwardRef" || callee.name === "memo"))) {
                foundComponentName = name || "Anonymous";
                isForwardRef = true;
                componentFound = true;
                processComponentBody(path);
                path.stop();
            }
        }
    };
    visitors.ArrowFunctionExpression = (path) => {
        const parent = path.parent;
        // 如果指定了 componentName，检查父节点是否是变量声明
        if (componentName) {
            // 检查是否是变量声明: const ComponentName = () => { ... }
            if (parent &&
                t.isVariableDeclarator(parent) &&
                t.isIdentifier(parent.id) &&
                parent.id.name === componentName) {
                foundComponentName = parent.id.name;
                componentFound = true;
                processComponentBody(path);
                path.stop();
                return;
            }
            // 检查是否是 forwardRef/memo
            if (parent && t.isCallExpression(parent)) {
                const callee = parent.callee;
                const isHoc = (t.isMemberExpression(callee) && t.isIdentifier(callee.object) && callee.object.name === "React" && t.isIdentifier(callee.property) && (callee.property.name === "forwardRef" || callee.property.name === "memo")) ||
                    (t.isIdentifier(callee) && (callee.name === "forwardRef" || callee.name === "memo"));
                if (isHoc) {
                    // forwardRef/memo 的箭头函数组件
                    foundComponentName = componentName;
                    isForwardRef = true;
                    componentFound = true;
                    processComponentBody(path);
                    path.stop();
                }
                return;
            }
            return;
        }
        // 不指定 componentName 时的原有逻辑
        // 检查是否是 React 组件 (作为默认值导出)
        if (parent &&
            t.isVariableDeclarator(parent) &&
            t.isIdentifier(parent.id) &&
            /^[A-Z]/.test(parent.id.name)) {
            foundComponentName = parent.id.name;
            componentFound = true;
            processComponentBody(path);
            path.stop();
        }
        // 检查是否是 forwardRef/memo
        if (parent && t.isCallExpression(parent)) {
            const callee = parent.callee;
            if ((t.isMemberExpression(callee) && t.isIdentifier(callee.object) && callee.object.name === "React" && t.isIdentifier(callee.property) && (callee.property.name === "forwardRef" || callee.property.name === "memo")) ||
                (t.isIdentifier(callee) && (callee.name === "forwardRef" || callee.name === "memo"))) {
                foundComponentName = "Anonymous";
                isForwardRef = true;
                componentFound = true;
                processComponentBody(path);
                path.stop();
            }
        }
    };
    // 处理 displayName 赋值
    visitors.AssignmentExpression = (path) => {
        const node = path.node;
        if (t.isMemberExpression(node.left) &&
            t.isIdentifier(node.left.object) &&
            t.isIdentifier(node.left.property) &&
            node.left.property.name === "displayName" &&
            t.isStringLiteral(node.right)) {
            displayName = node.right.value;
        }
    };
    // 处理类组件
    visitors.ClassDeclaration = (path) => {
        const node = path.node;
        const name = node.id?.name;
        if (componentName && name !== componentName) {
            return;
        }
        // 检查是否是 React 组件 (继承 React.Component 或 React.PureComponent)
        let isReactComponent = false;
        if (node.superClass) {
            if (t.isMemberExpression(node.superClass) &&
                t.isIdentifier(node.superClass.object) &&
                node.superClass.object.name === "React" &&
                t.isIdentifier(node.superClass.property) &&
                (node.superClass.property.name === "Component" || node.superClass.property.name === "PureComponent")) {
                isReactComponent = true;
            }
            else if (t.isIdentifier(node.superClass) && (node.superClass.name === "Component" || node.superClass.name === "PureComponent")) {
                // 直接 import { Component } from 'react'
                isReactComponent = true;
            }
        }
        if (isReactComponent || (name && /^[A-Z]/.test(name))) {
            foundComponentName = name || "Anonymous";
            componentFound = true;
            processClassComponentBody(path);
            path.stop();
        }
    };
    function processComponentBody(path) {
        const node = path.node;
        const params = node.params;
        let propsNode = null;
        let prevNode = null;
        // Props 参数
        if (params.length > 0) {
            const firstParam = params[0];
            if (t.isIdentifier(firstParam)) {
                propsNode = addNode("props", `props: ${firstParam.name}`, firstParam.name, firstParam.loc?.start.line);
                prevNode = propsNode;
            }
            else if (t.isObjectPattern(firstParam)) {
                // 解构 props
                const destructNames = firstParam.properties
                    .filter((p) => t.isObjectProperty(p) && t.isIdentifier(p.key))
                    .map((p) => p.key.name)
                    .join(", ");
                propsNode = addNode("destruct", `props: {${destructNames || "..."}}`, destructNames, firstParam.loc?.start.line);
                prevNode = propsNode;
            }
        }
        // 处理函数体
        const body = path.get("body");
        if (!body)
            return;
        if (body.isBlockStatement()) {
            const blockNode = body.node;
            // 处理 BlockStatement 中的语句
            const statements = blockNode.body;
            for (const stmt of statements) {
                const stmtResult = processStatement(stmt, prevNode);
                if (stmtResult.node && prevNode && stmtResult.node.id !== prevNode.id) {
                    addEdge(prevNode, stmtResult.node);
                }
                if (stmtResult.node) {
                    prevNode = stmtResult.node;
                }
            }
        }
        else {
            // 隐式返回 - JSX
            const bodyNode = body.node;
            const renderNode = addNode("render", "return JSX", "jsx", hasLoc(bodyNode) ? bodyNode.loc?.start.line : undefined);
            if (prevNode) {
                addEdge(prevNode, renderNode);
            }
            prevNode = renderNode;
        }
        // 如果没有 render 节点，添加 return 节点
        const hasRenderNode = nodes.some((n) => n.type === "render");
        if (!hasRenderNode) {
            const returnNode = addNode("return", "return", "return", node.loc?.end.line);
            if (prevNode && prevNode.type !== "return") {
                addEdge(prevNode, returnNode);
            }
        }
    }
    function processStatement(stmt, prevNode) {
        // useState/useEffect/useCallback/useRef/useMemo 已在 visitors.VariableDeclaration 处理
        if (t.isVariableDeclaration(stmt)) {
            const node = stmt;
            // 检查是否已被处理
            const decl = node.declarations[0];
            if (decl && t.isIdentifier(decl.id)) {
                const hookName = decl.id.name;
                const hookInfo = hookAssignments.get(hookName);
                if (hookInfo) {
                    // 已在 VariableDeclaration 中添加
                    const hookNode = nodes.find((n) => n.code === hookName) || null;
                    if (hookNode && prevNode) {
                        addEdge(prevNode, hookNode);
                    }
                    return { node: hookNode, nextNode: hookNode };
                }
            }
        }
        // Return 语句 - 渲染
        if (t.isReturnStatement(stmt)) {
            const node = stmt;
            if (node.argument) {
                // 检查是否是 JSX
                if (t.isJSXElement(node.argument) || t.isJSXFragment(node.argument)) {
                    const renderNode = addNode("render", "return JSX", "jsx", node.loc?.start.line);
                    if (prevNode && prevNode.id !== renderNode.id) {
                        addEdge(prevNode, renderNode);
                    }
                    return { node: renderNode, nextNode: renderNode };
                }
                // 其他 return
                const returnNode = addNode("return", "return", "return", node.loc?.start.line);
                if (prevNode && prevNode.id !== returnNode.id) {
                    addEdge(prevNode, returnNode);
                }
                return { node: returnNode, nextNode: null };
            }
            // 空 return
            const returnNode = addNode("return", "return void", "return", node.loc?.start.line);
            return { node: returnNode, nextNode: null };
        }
        // If 语句 - 条件分支
        if (t.isIfStatement(stmt)) {
            const node = stmt;
            let condLabel = "?";
            if (t.isIdentifier(node.test)) {
                condLabel = node.test.name;
            }
            else if (t.isBinaryExpression(node.test)) {
                condLabel = "condition";
            }
            else if (t.isUnaryExpression(node.test)) {
                condLabel = "condition";
            }
            const condNode = addNode("condition", `if: ${condLabel}`, condLabel, node.loc?.start.line);
            if (prevNode && prevNode.id !== condNode.id) {
                addEdge(prevNode, condNode);
            }
            // then 分支
            if (node.consequent) {
                const thenNode = processStatement(node.consequent, condNode);
                if (thenNode.node) {
                    addEdge(condNode, thenNode.node, "true");
                }
            }
            // else 分支
            if (node.alternate) {
                const elseNode = processStatement(node.alternate, condNode);
                if (elseNode.node) {
                    addEdge(condNode, elseNode.node, "false");
                }
            }
            return { node: condNode, nextNode: condNode };
        }
        // 三元表达式 - 条件渲染
        if (t.isConditionalExpression(stmt)) {
            const node = stmt;
            let condLabel = "?";
            if (t.isIdentifier(node.test)) {
                condLabel = node.test.name;
            }
            const condNode = addNode("condition", `${condLabel} ? :`, condLabel, node.loc?.start.line);
            if (prevNode && prevNode.id !== condNode.id) {
                addEdge(prevNode, condNode);
            }
            // consequent
            if (t.isJSXElement(node.consequent) || t.isJSXFragment(node.consequent)) {
                const trueNode = addNode("branch", "render true", "jsx", node.consequent.loc?.start.line);
                addEdge(condNode, trueNode, "true");
            }
            // alternate
            if (node.alternate) {
                if (t.isJSXElement(node.alternate) || t.isJSXFragment(node.alternate)) {
                    const falseNode = addNode("branch", "render false", "jsx", node.alternate.loc?.start.line);
                    addEdge(condNode, falseNode, "false");
                }
            }
            return { node: condNode, nextNode: condNode };
        }
        // ExpressionStatement
        if (t.isExpressionStatement(stmt)) {
            const node = stmt;
            const expr = node.expression;
            let label = "stmt";
            if (t.isCallExpression(expr)) {
                if (t.isIdentifier(expr.callee)) {
                    label = expr.callee.name + "()";
                }
                else if (t.isMemberExpression(expr.callee)) {
                    label = "method()";
                }
            }
            else if (t.isAssignmentExpression(expr)) {
                label = "=";
            }
            const exprNode = addNode("destruct", label, label, node.loc?.start.line);
            if (prevNode && prevNode.id !== exprNode.id) {
                addEdge(prevNode, exprNode);
            }
            return { node: exprNode, nextNode: exprNode };
        }
        // BlockStatement
        if (t.isBlockStatement(stmt)) {
            const node = stmt;
            let lastNode = prevNode;
            for (const child of node.body) {
                const result = processStatement(child, lastNode);
                if (result.node && lastNode && result.node.id !== lastNode.id) {
                    // 已在内部处理边
                }
                if (result.node) {
                    lastNode = result.node;
                }
            }
            return { node: lastNode, nextNode: lastNode };
        }
        // For/While 循环
        if (t.isForStatement(stmt) || t.isWhileStatement(stmt)) {
            const loopNode = addNode("branch", stmt.type === "ForStatement" ? "for" : "while", "loop", stmt.loc?.start.line);
            if (prevNode && prevNode.id !== loopNode.id) {
                addEdge(prevNode, loopNode);
            }
            return { node: loopNode, nextNode: loopNode };
        }
        return { node: prevNode };
    }
    // 处理类组件体
    function processClassComponentBody(path) {
        const node = path.node;
        // 添加组件节点
        const componentNode = addNode("render", `class ${node.id?.name}`, node.id?.name, node.loc?.start.line);
        let prevNode = componentNode;
        // 处理构造方法
        const ctor = node.body.body.find((m) => t.isClassMethod(m) && m.kind === "constructor");
        if (ctor) {
            const ctorNode = addNode("destruct", "constructor", "constructor", ctor.loc?.start.line);
            addEdge(prevNode, ctorNode);
            prevNode = ctorNode;
        }
        // 处理 state 属性
        const stateProps = node.body.body.filter((m) => t.isClassProperty(m) &&
            t.isIdentifier(m.key) &&
            m.key.name === "state");
        if (stateProps.length > 0) {
            const stateNode = addNode("state", "this.state", "state", stateProps[0].loc?.start.line);
            addEdge(prevNode, stateNode);
            prevNode = stateNode;
        }
        // 处理生命周期方法和 render 方法
        const methods = node.body.body.filter((m) => t.isClassMethod(m));
        for (const method of methods) {
            const methodName = method.key && t.isIdentifier(method.key) ? method.key.name : "anonymous";
            let methodType = "destruct";
            if (methodName === "render") {
                methodType = "render";
            }
            else if (methodName === "componentDidMount") {
                methodType = "effect";
            }
            else if (methodName === "componentDidUpdate") {
                methodType = "effect";
            }
            else if (methodName === "componentWillUnmount") {
                methodType = "effect";
            }
            else if (methodName === "shouldComponentUpdate") {
                methodType = "condition";
            }
            else if (methodName === "getDerivedStateFromProps") {
                methodType = "memo";
            }
            else if (methodName.startsWith("handle") || methodName.startsWith("on")) {
                methodType = "callback";
            }
            const methodNode = addNode(methodType, methodName, methodName, method.loc?.start.line);
            addEdge(prevNode, methodNode);
            prevNode = methodNode;
        }
        // 添加 return 节点
        const returnNode = addNode("return", "return JSX", "return", node.loc?.end.line);
        addEdge(prevNode, returnNode);
    }
    try {
        (0, traverse_1.default)(ast, visitors);
    }
    catch {
        // 忽略遍历错误
    }
    if (!componentFound && !foundComponentName) {
        // 尝试查找任何首字母大写的函数
        (0, traverse_1.default)(ast, {
            FunctionDeclaration(path) {
                const name = path.node.id?.name;
                if (name && /^[A-Z]/.test(name)) {
                    foundComponentName = name;
                    componentFound = true;
                    processComponentBody(path);
                    path.stop();
                }
            },
        });
    }
    if (!foundComponentName) {
        // 作为后备，使用模块名
        const baseName = moduleName.replace(/\.(ts|tsx|js|jsx)$/, "");
        if (/^[A-Z]/.test(baseName)) {
            foundComponentName = baseName;
        }
        else {
            foundComponentName = "Component";
        }
    }
    return {
        componentName: foundComponentName || "Component",
        moduleName,
        isForwardRef,
        displayName,
        nodes,
        edges,
    };
}
/**
 * 将 React 组件流程图转换为 Mermaid 代码
 */
function toMermaidRCF(flow) {
    const lines = ["flowchart TD"];
    // 添加节点
    for (const node of flow.nodes) {
        const shape = getNodeShape(node.type, node.label);
        lines.push(`  ${node.id}${shape}`);
    }
    // 添加边
    for (const edge of flow.edges) {
        if (edge.label) {
            lines.push(`  ${edge.from} -->|${edge.label}| ${edge.to}`);
        }
        else {
            lines.push(`  ${edge.from} --> ${edge.to}`);
        }
    }
    // 添加样式
    lines.push("");
    lines.push("  classDef props fill:#4CAF50,stroke:#2E7D32,color:#fff");
    lines.push("  classDef destruct fill:#8BC34A,stroke:#558B2F,color:#fff");
    lines.push("  classDef condition fill:#FF9800,stroke:#EF6C00,color:#fff");
    lines.push("  classDef branch fill:#FFC107,stroke:#FFA000,color:#000");
    lines.push("  classDef state fill:#2196F3,stroke:#1565C0,color:#fff");
    lines.push("  classDef effect fill:#9C27B0,stroke:#6A1B9A,color:#fff");
    lines.push("  classDef callback fill:#00BCD4,stroke:#00838F,color:#fff");
    lines.push("  classDef ref fill:#795548,stroke:#4E342E,color:#fff");
    lines.push("  classDef memo fill:#FF5722,stroke:#BF360C,color:#fff");
    lines.push("  classDef return fill:#f44336,stroke:#c62828,color:#fff");
    lines.push("  classDef render fill:#673AB7,stroke:#4527A0,color:#fff");
    // 应用样式
    for (const node of flow.nodes) {
        let className = "destruct";
        switch (node.type) {
            case "props":
                className = "props";
                break;
            case "destruct":
                className = "destruct";
                break;
            case "condition":
                className = "condition";
                break;
            case "branch":
                className = "branch";
                break;
            case "state":
                className = "state";
                break;
            case "effect":
                className = "effect";
                break;
            case "callback":
                className = "callback";
                break;
            case "ref":
                className = "ref";
                break;
            case "memo":
                className = "memo";
                break;
            case "return":
                className = "return";
                break;
            case "render":
                className = "render";
                break;
        }
        lines.push(`  class ${node.id} ${className}`);
    }
    return lines.join("\n");
}
/**
 * 提取模块中的所有 React 组件
 */
function extractModuleReactFlows(sourceCode, moduleName) {
    const results = [];
    try {
        const ast = (0, parser_1.parse)(sourceCode, {
            sourceType: "unambiguous",
            plugins: ["typescript", "jsx", "classProperties", "decorators-legacy"],
        });
        const componentNames = [];
        // 收集所有可能的组件名
        (0, traverse_1.default)(ast, {
            FunctionDeclaration(path) {
                const name = path.node.id?.name;
                if (name && /^[A-Z]/.test(name) && !componentNames.includes(name)) {
                    componentNames.push(name);
                }
            },
            VariableDeclarator(path) {
                const node = path.node;
                if (t.isIdentifier(node.id) && /^[A-Z]/.test(node.id.name)) {
                    const init = node.init;
                    if (init) {
                        // ArrowFunctionExpression: const Foo = () => { ... }
                        if (t.isArrowFunctionExpression(init) && !componentNames.includes(node.id.name)) {
                            componentNames.push(node.id.name);
                        }
                        // CallExpression: const Foo = forwardRef(...) 或 React.memo(...)
                        if (t.isCallExpression(init)) {
                            const callee = init.callee;
                            if ((t.isMemberExpression(callee) && t.isIdentifier(callee.object) && callee.object.name === "React" && t.isIdentifier(callee.property) && (callee.property.name === "forwardRef" || callee.property.name === "memo")) ||
                                (t.isIdentifier(callee) && (callee.name === "forwardRef" || callee.name === "memo"))) {
                                if (!componentNames.includes(node.id.name)) {
                                    componentNames.push(node.id.name);
                                }
                            }
                        }
                    }
                }
            },
            ClassDeclaration(path) {
                const name = path.node.id?.name;
                if (!name || !/^[A-Z]/.test(name) || componentNames.includes(name)) {
                    return;
                }
                // 检查是否是 React 组件
                const superClass = path.node.superClass;
                let isReactComponent = false;
                if (superClass) {
                    if (t.isMemberExpression(superClass) &&
                        t.isIdentifier(superClass.object) &&
                        superClass.object.name === "React" &&
                        t.isIdentifier(superClass.property) &&
                        (superClass.property.name === "Component" || superClass.property.name === "PureComponent")) {
                        isReactComponent = true;
                    }
                    else if (t.isIdentifier(superClass) && (superClass.name === "Component" || superClass.name === "PureComponent")) {
                        isReactComponent = true;
                    }
                }
                if (isReactComponent || /^[A-Z]/.test(name)) {
                    componentNames.push(name);
                }
            },
        });
        // 为每个组件提取流程图
        for (const name of componentNames) {
            const flow = extractReactComponentFlow(sourceCode, moduleName, name);
            if (flow && flow.nodes.length > 0) {
                results.push({
                    componentName: name,
                    mermaidCode: toMermaidRCF(flow),
                    nodeCount: flow.nodes.length,
                    edgeCount: flow.edges.length,
                });
            }
        }
    }
    catch {
        // 解析失败
    }
    return results;
}
//# sourceMappingURL=reactComponentFlowExporter.js.map