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
exports.extractControlFlow = extractControlFlow;
exports.toMermaidCFG = toMermaidCFG;
exports.extractModuleControlFlow = extractModuleControlFlow;
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
    // 简化标签，移除过长的描述
    let simplified = text;
    if (text.length > 30) {
        simplified = text.substring(0, 27) + "...";
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
 * 获取节点的 Mermaid 形状 - 使用更简洁的圆角矩形
 */
function getNodeShape(type, label) {
    const escaped = escapeLabel(label);
    switch (type) {
        case "entry":
            return `([${escaped}])`;
        case "exit":
            return `([${escaped}])`;
        case "branch":
            return `{${escaped}}`;
        case "loop":
            return `(${escaped})`;
        case "loop_exit":
            return `>[${escaped}]`;
        case "throw":
            return `/${escaped}/`;
        case "catch":
            return `\\${escaped}\\`;
        default:
            return `[${escaped}]`;
    }
}
/**
 * 从 Babel AST 提取控制流图
 */
function extractControlFlow(sourceCode, moduleName, functionName) {
    let ast;
    try {
        ast = (0, parser_1.parse)(sourceCode, {
            sourceType: "unambiguous",
            plugins: ["typescript", "jsx", "classProperties"],
        });
    }
    catch {
        return null;
    }
    const nodes = [];
    const edges = [];
    let nodeIndex = 0;
    let functionFound = false;
    let entryNode = null;
    let exitNode = null;
    // 用于跟踪分支和循环的跳转
    const branchExits = [];
    const loopStack = [];
    const addNode = (type, label, code, line) => {
        const id = makeNodeId("n", nodeIndex++);
        const node = { id, type, label, code, line };
        nodes.push(node);
        return node;
    };
    const addEdge = (from, to, label) => {
        edges.push({ from: from.id, to: to.id, label });
    };
    (0, traverse_1.default)(ast, {
        FunctionDeclaration(path) {
            const name = path.node.id?.name;
            if (functionName && name !== functionName) {
                return;
            }
            functionFound = true;
            entryNode = addNode("entry", `Start: ${name}`, name);
            // 处理函数体
            const body = path.get("body");
            let prevNode = entryNode;
            if (body.isBlockStatement()) {
                const statements = body.node.body;
                for (const stmt of statements) {
                    const result = processStatement(stmt, path, prevNode);
                    if (result.node) {
                        if (prevNode && prevNode.id !== result.node.id) {
                            addEdge(prevNode, result.node);
                        }
                        prevNode = result.node;
                    }
                }
            }
            // 函数出口
            exitNode = addNode("exit", `End: ${name}`, name);
            if (prevNode && prevNode.id !== exitNode.id) {
                addEdge(prevNode, exitNode);
            }
            path.stop();
        },
        FunctionExpression(path) {
            const name = path.node.id?.name || "anonymous";
            if (functionName && name !== functionName) {
                return;
            }
            functionFound = true;
            entryNode = addNode("entry", `Start: ${name}`, name);
            const body = path.get("body");
            let prevNode = entryNode;
            if (body.isBlockStatement()) {
                const statements = body.node.body;
                for (const stmt of statements) {
                    const result = processStatement(stmt, path, prevNode);
                    if (result.node) {
                        if (prevNode && prevNode.id !== result.node.id) {
                            addEdge(prevNode, result.node);
                        }
                        prevNode = result.node;
                    }
                }
            }
            exitNode = addNode("exit", `End: ${name}`, name);
            if (prevNode && prevNode.id !== exitNode.id) {
                addEdge(prevNode, exitNode);
            }
            path.stop();
        },
        ArrowFunctionExpression(path) {
            if (functionName) {
                return;
            }
            functionFound = true;
            entryNode = addNode("entry", "Start: arrow", "arrow");
            const body = path.get("body");
            let prevNode = entryNode;
            if (body.isBlockStatement()) {
                const statements = body.node.body;
                for (const stmt of statements) {
                    const result = processStatement(stmt, path, prevNode);
                    if (result.node) {
                        if (prevNode && prevNode.id !== result.node.id) {
                            addEdge(prevNode, result.node);
                        }
                        prevNode = result.node;
                    }
                }
            }
            else {
                // 隐式返回
                const exprNode = addNode("statement", `return ${body.node.type}`, body.node.type, body.node.loc?.start.line);
                if (prevNode) {
                    addEdge(prevNode, exprNode);
                }
                prevNode = exprNode;
            }
            exitNode = addNode("exit", "End: arrow", "arrow");
            if (prevNode && prevNode.id !== exitNode.id) {
                addEdge(prevNode, exitNode);
            }
            path.stop();
        },
    });
    if (!functionFound || !entryNode || !exitNode) {
        return null;
    }
    return {
        functionName: functionName || "anonymous",
        moduleName,
        nodes,
        edges,
    };
}
/**
 * 处理语句，生成控制流节点
 */
function processStatement(stmt, _path, prevNode) {
    const addNode = (type, label, code, line) => {
        const id = makeNodeId("n", processStatement.nodeIndex++);
        const node = { id, type, label, code, line };
        processStatement.nodes.push(node);
        return node;
    };
    // 处理基本语句
    if (t.isExpressionStatement(stmt)) {
        const expr = stmt.expression;
        let label = "stmt";
        if (t.isCallExpression(expr)) {
            if (t.isIdentifier(expr.callee)) {
                label = expr.callee.name + "()";
            }
            else if (t.isMemberExpression(expr.callee)) {
                label = "method()";
            }
            else {
                label = "call";
            }
        }
        else if (t.isAssignmentExpression(expr)) {
            label = "=";
        }
        else if (t.isUpdateExpression(expr)) {
            label = "++/--";
        }
        else if (t.isUnaryExpression(expr)) {
            label = "unary";
        }
        const node = addNode("statement", label, label, stmt.loc?.start.line);
        return { node, nextNode: node };
    }
    // 处理 Return 语句
    if (t.isReturnStatement(stmt)) {
        const label = stmt.argument ? "return" : "return void";
        const node = addNode("statement", label, label, stmt.loc?.start.line);
        return { node, nextNode: null }; // 返回 null 表示这是终止节点
    }
    // 处理 VariableDeclaration
    if (t.isVariableDeclaration(stmt)) {
        const declarations = stmt.declarations
            .map((d) => d.id && t.isIdentifier(d.id) ? String(d.id.name) : "var")
            .slice(0, 2) // 最多显示2个变量
            .join(", ");
        const suffix = stmt.declarations.length > 2 ? "..." : "";
        const node = addNode("statement", `${declarations}${suffix}`, declarations, stmt.loc?.start.line);
        return { node, nextNode: node };
    }
    // 处理 If 语句
    if (t.isIfStatement(stmt)) {
        const test = stmt.test;
        let conditionLabel = "?";
        if (t.isBinaryExpression(test)) {
            conditionLabel = "cond";
        }
        else if (t.isIdentifier(test)) {
            conditionLabel = test.name.length > 8 ? test.name.substring(0, 8) : test.name;
        }
        else if (t.isUnaryExpression(test)) {
            conditionLabel = "cond";
        }
        const branchNode = addNode("branch", `if`, conditionLabel, stmt.loc?.start.line);
        // then 分支
        if (stmt.consequent) {
            const thenResult = processStatement(stmt.consequent, _path, branchNode);
        }
        // else 分支
        if (stmt.alternate) {
            const elseResult = processStatement(stmt.alternate, _path, branchNode);
        }
        return { node: branchNode, nextNode: branchNode };
    }
    // 处理 For 循环
    if (t.isForStatement(stmt)) {
        let initVal = "";
        if (stmt.init) {
            if (t.isVariableDeclaration(stmt.init) && stmt.init.declarations[0]?.id) {
                const declId = stmt.init.declarations[0].id;
                initVal = t.isIdentifier(declId) ? String(declId.name) : "i";
            }
            else {
                initVal = "i";
            }
        }
        const loopNode = addNode("loop", "for", initVal, stmt.loc?.start.line);
        if (stmt.body) {
            processStatement(stmt.body, _path, loopNode);
        }
        return { node: loopNode, nextNode: loopNode };
    }
    // 处理 While 循环
    if (t.isWhileStatement(stmt)) {
        const loopNode = addNode("loop", "while", "loop", stmt.loc?.start.line);
        if (stmt.body) {
            processStatement(stmt.body, _path, loopNode);
        }
        return { node: loopNode, nextNode: loopNode };
    }
    // 处理 Switch 语句
    if (t.isSwitchStatement(stmt)) {
        const switchNode = addNode("branch", "switch", "switch", stmt.loc?.start.line);
        return { node: switchNode, nextNode: switchNode };
    }
    // 处理 Try-Catch
    if (t.isTryStatement(stmt)) {
        const tryNode = addNode("statement", "try", "try", stmt.loc?.start.line);
        if (stmt.handler && t.isCatchClause(stmt.handler)) {
            const catchNode = addNode("catch", "catch", "err", stmt.handler.loc?.start.line);
        }
        return { node: tryNode, nextNode: tryNode };
    }
    // 处理 Throw
    if (t.isThrowStatement(stmt)) {
        const node = addNode("throw", "throw", "err", stmt.loc?.start.line);
        return { node, nextNode: null };
    }
    // 处理 Break
    if (t.isBreakStatement(stmt)) {
        const node = addNode("loop_exit", "break", "break", stmt.loc?.start.line);
        return { node, nextNode: null };
    }
    // 处理 Continue
    if (t.isContinueStatement(stmt)) {
        const node = addNode("loop_exit", "continue", "cont", stmt.loc?.start.line);
        return { node, nextNode: null };
    }
    // 处理 BlockStatement (复合语句)
    if (t.isBlockStatement(stmt)) {
        let lastNode = prevNode;
        for (const child of stmt.body) {
            const result = processStatement(child, _path, lastNode);
            if (result.node && lastNode && result.node.id !== lastNode.id) {
                // 添加边
            }
            if (result.node) {
                lastNode = result.node;
            }
        }
        return { node: lastNode, nextNode: lastNode };
    }
    return { node: null };
}
// 初始化节点索引
processStatement.nodeIndex = 0;
processStatement.nodes = [];
/**
 * 将控制流图转换为 Mermaid 流程图代码（简洁版）
 */
function toMermaidCFG(graph) {
    const lines = ["flowchart TD"];
    // 添加节点（简化版）
    for (const node of graph.nodes) {
        const shape = getNodeShape(node.type, node.label);
        lines.push(`  ${node.id}${shape}`);
    }
    // 添加边
    for (const edge of graph.edges) {
        if (edge.label) {
            lines.push(`  ${edge.from} -->|${edge.label}| ${edge.to}`);
        }
        else {
            lines.push(`  ${edge.from} --> ${edge.to}`);
        }
    }
    // 添加简洁样式
    lines.push("");
    lines.push("  classDef entry fill:#4CAF50,stroke:#2E7D32,color:#fff");
    lines.push("  classDef exit fill:#f44336,stroke:#c62828,color:#fff");
    lines.push("  classDef branch fill:#FF9800,stroke:#EF6C00,color:#fff");
    lines.push("  classDef loop fill:#2196F3,stroke:#1565C0,color:#fff");
    lines.push("  classDef statement fill:#ECEFF1,stroke:#546E7A");
    lines.push("  classDef throw fill:#f44336,stroke:#c62828,color:#fff");
    lines.push("  classDef catch fill:#9C27B0,stroke:#6A1B9A,color:#fff");
    // 应用样式
    for (const node of graph.nodes) {
        let className = "statement";
        switch (node.type) {
            case "entry":
                className = "entry";
                break;
            case "exit":
                className = "exit";
                break;
            case "branch":
                className = "branch";
                break;
            case "loop":
            case "loop_exit":
                className = "loop";
                break;
            case "throw":
                className = "throw";
                break;
            case "catch":
                className = "catch";
                break;
        }
        lines.push(`  class ${node.id} ${className}`);
    }
    return lines.join("\n");
}
/**
 * 为整个模块生成控制流图（包含所有函数）
 */
function extractModuleControlFlow(sourceCode, moduleName) {
    const graphs = [];
    try {
        const ast = (0, parser_1.parse)(sourceCode, {
            sourceType: "unambiguous",
            plugins: ["typescript", "jsx", "classProperties"],
        });
        const functionNames = [];
        (0, traverse_1.default)(ast, {
            FunctionDeclaration(path) {
                const name = path.node.id?.name;
                if (name && !functionNames.includes(name)) {
                    functionNames.push(name);
                }
            },
            ClassMethod(path) {
                if (t.isIdentifier(path.node.key)) {
                    const name = path.node.key.name;
                    if (!functionNames.includes(name)) {
                        functionNames.push(name);
                    }
                }
            },
        });
        for (const funcName of functionNames) {
            const graph = extractControlFlow(sourceCode, moduleName, funcName);
            if (graph) {
                graphs.push(graph);
            }
        }
    }
    catch {
        // 解析失败，返回空数组
    }
    return graphs;
}
//# sourceMappingURL=controlFlowExporter.js.map