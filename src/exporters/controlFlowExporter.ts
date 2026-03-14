import { parse } from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

/**
 * 控制流图节点类型
 */
export type CFGNodeType =
  | "entry"     // 函数入口
  | "exit"      // 函数出口
  | "statement" // 普通语句
  | "branch"    // 条件分支
  | "merge"     // 分支汇合
  | "loop"      // 循环入口
  | "loop_exit" // 循环退出
  | "throw"     // 异常抛出
  | "catch";    // 异常捕获

/**
 * 控制流图节点
 */
export interface CFGNode {
  id: string;
  type: CFGNodeType;
  label: string;
  code?: string;
  line?: number;
}

/**
 * 控制流图边
 */
export interface CFGEdge {
  from: string;
  to: string;
  label?: string;  // 例如 "true", "false"
}

/**
 * 控制流图
 */
export interface ControlFlowGraph {
  functionName: string;
  moduleName: string;
  nodes: CFGNode[];
  edges: CFGEdge[];
}

/**
 * 生成节点 ID
 */
function makeNodeId(prefix: string, index: number): string {
  return `${prefix}_${index}`;
}

/**
 * 转义 Mermaid 标签
 */
function escapeLabel(text: string): string {
  return text.replace(/"/g, "'").replace(/\n/g, " ");
}

/**
 * 获取节点的 Mermaid 形状
 */
function getNodeShape(type: CFGNodeType, label: string): string {
  const escaped = escapeLabel(label);
  switch (type) {
    case "entry":
      return `[["${escaped}"]]`;
    case "exit":
      return `[["${escaped}"]]`;
    case "branch":
      return `{${escaped}}`;
    case "loop":
      return `{"${escaped}"}`;
    case "loop_exit":
      return `[["${escaped}"]]`;
    case "throw":
      return `[/"${escaped}"/]`;
    case "catch":
      return `\\"${escaped}"\\`;
    default:
      return `["${escaped}"]`;
  }
}

/**
 * 从 Babel AST 提取控制流图
 */
export function extractControlFlow(
  sourceCode: string,
  moduleName: string,
  functionName?: string
): ControlFlowGraph | null {
  let ast: t.File;

  try {
    ast = parse(sourceCode, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx", "classProperties"],
    });
  } catch {
    return null;
  }

  const nodes: CFGNode[] = [];
  const edges: CFGEdge[] = [];
  let nodeIndex = 0;
  let functionFound = false;
  let entryNode: CFGNode | null = null;
  let exitNode: CFGNode | null = null;

  // 用于跟踪分支和循环的跳转
  const branchExits: { node: CFGNode; kind: "if" | "switch" }[] = [];
  const loopStack: { entry: CFGNode; body: CFGNode[] }[] = [];

  const addNode = (type: CFGNodeType, label: string, code?: string, line?: number): CFGNode => {
    const id = makeNodeId("n", nodeIndex++);
    const node: CFGNode = { id, type, label, code, line };
    nodes.push(node);
    return node;
  };

  const addEdge = (from: CFGNode, to: CFGNode, label?: string): void => {
    edges.push({ from: from.id, to: to.id, label });
  };

  traverse(ast, {
    FunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (functionName && name !== functionName) {
        return;
      }

      functionFound = true;
      entryNode = addNode("entry", `Start: ${name}`, name);

      // 处理函数体
      const body = path.get("body");
      let prevNode: CFGNode | null = entryNode;
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
      let prevNode: CFGNode | null = entryNode;
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
      let prevNode: CFGNode | null = entryNode;

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
      } else {
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
function processStatement(
  stmt: t.Statement,
  _path: NodePath,
  prevNode: CFGNode | null
): { node: CFGNode | null; nextNode?: CFGNode | null } {
  const addNode = (type: CFGNodeType, label: string, code?: string, line?: number): CFGNode => {
    const id = makeNodeId("n", (processStatement as any).nodeIndex++);
    const node: CFGNode = { id, type, label, code, line };
    (processStatement as any).nodes.push(node);
    return node;
  };

  // 处理基本语句
  if (t.isExpressionStatement(stmt)) {
    const expr = stmt.expression;
    let label: string = String(expr.type);
    if (t.isCallExpression(expr) && t.isIdentifier(expr.callee)) {
      label = `${String(expr.callee.name)}(...)`;
    } else if (t.isAssignmentExpression(expr)) {
      label = `${String(expr.left.type)} = ...`;
    }
    const node = addNode("statement", label, label, stmt.loc?.start.line);
    return { node, nextNode: node };
  }

  // 处理 Return 语句
  if (t.isReturnStatement(stmt)) {
    const label = stmt.argument
      ? `return ${stmt.argument.type}`
      : "return";
    const node = addNode("statement", label, label, stmt.loc?.start.line);
    return { node, nextNode: null }; // 返回 null 表示这是终止节点
  }

  // 处理 VariableDeclaration
  if (t.isVariableDeclaration(stmt)) {
    const declarations = stmt.declarations
      .map((d) => d.id && t.isIdentifier(d.id) ? String(d.id.name) : String(d.id.type))
      .join(", ");
    const node = addNode("statement", `let ${declarations}`, declarations, stmt.loc?.start.line);
    return { node, nextNode: node };
  }

  // 处理 If 语句
  if (t.isIfStatement(stmt)) {
    const test = stmt.test;
    let conditionLabel: string = String(test.type);
    if (t.isBinaryExpression(test)) {
      conditionLabel = `${String(test.left.type)} ${String(test.operator)} ${String(test.right.type)}`;
    } else if (t.isIdentifier(test)) {
      conditionLabel = String(test.name);
    }

    const branchNode = addNode("branch", `if (${conditionLabel})`, conditionLabel, stmt.loc?.start.line);

    // then 分支
    if (stmt.consequent) {
      const thenResult = processStatement(stmt.consequent, _path as any, branchNode);
    }

    // else 分支
    if (stmt.alternate) {
      const elseResult = processStatement(stmt.alternate, _path as any, branchNode);
    }

    return { node: branchNode, nextNode: branchNode };
  }

  // 处理 For 循环
  if (t.isForStatement(stmt)) {
    let initVal = "";
    if (stmt.init) {
      if (t.isVariableDeclaration(stmt.init) && stmt.init.declarations[0]?.id) {
        const declId = stmt.init.declarations[0].id;
        initVal = t.isIdentifier(declId) ? String(declId.name) : String(declId.type);
      } else {
        initVal = String(stmt.init.type);
      }
    }
    const test = stmt.test ? String(stmt.test.type) : "";
    const update = stmt.update ? String(stmt.update.type) : "";
    const loopLabel = `for (${initVal}; ${test}; ${update})`;

    const loopNode = addNode("loop", loopLabel, loopLabel, stmt.loc?.start.line);

    if (stmt.body) {
      processStatement(stmt.body, _path as any, loopNode);
    }

    return { node: loopNode, nextNode: loopNode };
  }

  // 处理 While 循环
  if (t.isWhileStatement(stmt)) {
    const test = stmt.test;
    let conditionLabel: string = String(test.type);
    if (t.isBinaryExpression(test)) {
      conditionLabel = `${String(test.left.type)} ${String(test.operator)} ${String(test.right.type)}`;
    }

    const loopNode = addNode("loop", `while (${conditionLabel})`, conditionLabel, stmt.loc?.start.line);

    if (stmt.body) {
      processStatement(stmt.body, _path as any, loopNode);
    }

    return { node: loopNode, nextNode: loopNode };
  }

  // 处理 Switch 语句
  if (t.isSwitchStatement(stmt)) {
    const discriminant = stmt.discriminant.type;
    const switchNode = addNode("branch", `switch (${discriminant})`, discriminant, stmt.loc?.start.line);

    return { node: switchNode, nextNode: switchNode };
  }

  // 处理 Try-Catch
  if (t.isTryStatement(stmt)) {
    const tryNode = addNode("statement", "try", "try", stmt.loc?.start.line);

    if (stmt.handler && t.isCatchClause(stmt.handler)) {
      const param = stmt.handler.param && t.isIdentifier(stmt.handler.param) 
        ? String(stmt.handler.param.name) 
        : "error";
      const catchNode = addNode("catch", `catch (${param})`, param, stmt.handler.loc?.start.line);
    }

    return { node: tryNode, nextNode: tryNode };
  }

  // 处理 Throw
  if (t.isThrowStatement(stmt)) {
    const argType = stmt.argument?.type || "error";
    const node = addNode("throw", `throw ${argType}`, argType, stmt.loc?.start.line);
    return { node, nextNode: null };
  }

  // 处理 Break
  if (t.isBreakStatement(stmt)) {
    const node = addNode("loop_exit", "break", "break", stmt.loc?.start.line);
    return { node, nextNode: null };
  }

  // 处理 Continue
  if (t.isContinueStatement(stmt)) {
    const node = addNode("loop_exit", "continue", "continue", stmt.loc?.start.line);
    return { node, nextNode: null };
  }

  // 处理 BlockStatement (复合语句)
  if (t.isBlockStatement(stmt)) {
    let lastNode = prevNode;
    for (const child of stmt.body) {
      const result = processStatement(child, _path as any, lastNode);
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
(processStatement as any).nodeIndex = 0;
(processStatement as any).nodes = [] as CFGNode[];

/**
 * 将控制流图转换为 Mermaid 流程图代码
 */
export function toMermaidCFG(graph: ControlFlowGraph): string {
  const lines: string[] = ["flowchart TD"];

  // 添加节点
  for (const node of graph.nodes) {
    const shape = getNodeShape(node.type, node.label);
    lines.push(`  ${node.id}${shape}`);
  }

  // 添加边
  for (const edge of graph.edges) {
    if (edge.label) {
      lines.push(`  ${edge.from} -->|${edge.label}| ${edge.to}`);
    } else {
      lines.push(`  ${edge.from} --> ${edge.to}`);
    }
  }

  // 添加样式
  lines.push("");
  lines.push("  classDef entry fill:#e3f2fd,stroke:#1976d2,stroke-width:2px");
  lines.push("  classDef exit fill:#fce4ec,stroke:#c2185b,stroke-width:2px");
  lines.push("  classDef branch fill:#fff3e0,stroke:#ff9800,stroke-width:2px");
  lines.push("  classDef loop fill:#e8f5e9,stroke:#4caf50,stroke-width:2px");
  lines.push("  classDef statement fill:#f5f5f5,stroke:#9e9e9e");
  lines.push("  classDef throw fill:#ffebee,stroke:#f44336");
  lines.push("  classDef catch fill:#f3e5f5,stroke:#7b1fa2");

  // 应用样式
  for (const node of graph.nodes) {
    let className = "statement";
    switch (node.type) {
      case "entry": className = "entry"; break;
      case "exit": className = "exit"; break;
      case "branch": className = "branch"; break;
      case "loop":
      case "loop_exit": className = "loop"; break;
      case "throw": className = "throw"; break;
      case "catch": className = "catch"; break;
    }
    lines.push(`  class ${node.id} ${className}`);
  }

  return lines.join("\n");
}

/**
 * 为整个模块生成控制流图（包含所有函数）
 */
export function extractModuleControlFlow(
  sourceCode: string,
  moduleName: string
): ControlFlowGraph[] {
  const graphs: ControlFlowGraph[] = [];

  try {
    const ast = parse(sourceCode, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx", "classProperties"],
    });

    const functionNames: string[] = [];

    traverse(ast, {
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
  } catch {
    // 解析失败，返回空数组
  }

  return graphs;
}
