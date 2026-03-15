import { parse } from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import {
  CyclomaticComplexity,
  ComplexityReport,
  ExecutionDepth,
  ExecutionGraph,
  ExecutionTimeline,
  ExecutionTimelineEntry,
} from "../types";

export function buildExecutionTimeline(graph: ExecutionGraph): ExecutionTimeline {
  const entries: ExecutionTimelineEntry[] = [];
  const startTime = graph.traces[0]?.started_at 
    ? new Date(graph.traces[0].started_at).getTime() 
    : Date.now();
  
  let maxDepth = 0;

  for (const trace of graph.traces) {
    for (const entry of trace.entries) {
      const timestamp = entry.timestamp;
      
      entries.push({
        id: `${entry.symbol_id}-${timestamp}`,
        symbol_id: entry.symbol_id,
        symbol_name: entry.symbol_name,
        event: entry.event,
        depth: entry.depth,
        start_time: timestamp - startTime,
        end_time: 0,
        duration: 0,
        parameters: entry.parameters,
        return_value: entry.return_value,
        error: entry.error,
      });

      maxDepth = Math.max(maxDepth, entry.depth);
    }
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.event === "enter") {
      for (let j = i + 1; j < entries.length; j++) {
        const match = entries[j];
        if (match.symbol_id === entry.symbol_id && 
            (match.event === "return" || match.event === "throw")) {
          entry.end_time = match.start_time;
          entry.duration = entry.end_time - entry.start_time;
          break;
        }
      }
    }
  }

  const totalDuration = entries.length > 0 
    ? Math.max(...entries.map(e => e.end_time), 0) 
    : 0;

  return {
    execution_id: graph.execution_id,
    total_duration: totalDuration,
    entries: entries.sort((a, b) => a.start_time - b.start_time),
    max_depth: maxDepth,
  };
}

export function buildDepthTree(graph: ExecutionGraph): ExecutionDepth | undefined {
  const depthMap = new Map<string, ExecutionDepth>();
  const stack: ExecutionDepth[] = [];

  for (const trace of graph.traces) {
    for (const entry of trace.entries) {
      if (entry.event === "enter") {
        const node: ExecutionDepth = {
          symbol_id: entry.symbol_id,
          symbol_name: entry.symbol_name,
          max_depth: entry.depth,
          call_count: 1,
          total_duration: 0,
          children: [],
        };

        depthMap.set(entry.symbol_id, node);

        if (stack.length > 0) {
          const parent = stack[stack.length - 1];
          parent.children.push(node);
          parent.call_count++;
        }

        stack.push(node);
      } else if (entry.event === "return" || entry.event === "throw") {
        if (stack.length > 0) {
          const node = stack.pop();
          if (node) {
            const duration = entry.timestamp - (
              trace.entries.find(e => 
                e.symbol_id === node.symbol_id && e.event === "enter"
              )?.timestamp ?? entry.timestamp
            );
            node.total_duration = duration;
          }
        }
      }
    }
  }

  const roots = Array.from(depthMap.values()).filter(d => {
    return !graph.edges.some(e => e.to === d.symbol_id);
  });

  if (roots.length === 0) return undefined;
  return roots[0];
}

export function toTimelineMermaid(timeline: ExecutionTimeline): string {
  const lines: string[] = ["timeline"];
  
  const timeScale = timeline.total_duration > 0 ? timeline.total_duration / 100 : 1;
  
  lines.push(`  title Execution Timeline (${timeline.total_duration}ms, max depth: ${timeline.max_depth})`);
  
  let currentDepth = 0;
  const depthLabels: string[] = [];
  
  for (const entry of timeline.entries) {
    if (entry.event === "enter") {
      while (depthLabels.length < entry.depth + 1) {
        depthLabels.push(`Level ${depthLabels.length}`);
      }
      
      const indent = "    ".repeat(entry.depth);
      const duration = entry.duration > 0 ? ` (${entry.duration}ms)` : "";
      const params = entry.parameters && entry.parameters.length > 0 
        ? `: ${JSON.stringify(entry.parameters).slice(0, 30)}` 
        : "";
      
      lines.push(`  ${depthLabels[entry.depth]} : ${entry.symbol_name}${params}${duration}`);
      
      currentDepth = entry.depth;
    }
  }

  return lines.join("\n");
}

export function toDepthTreeMermaid(depth: ExecutionDepth, depthLevel: number = 0): string {
  const lines: string[] = ["flowchart TB"];
  
  const addNode = (node: ExecutionDepth, parentId?: string): void => {
    const id = node.symbol_id.replace(/[^a-zA-Z0-9]/g, "_");
    const duration = node.total_duration > 0 
      ? `\n(${node.total_duration}ms)` 
      : "";
    const calls = node.call_count > 1 
      ? `\n[x${node.call_count}]` 
      : "";
    
    lines.push(`  ${id}["${node.symbol_name}${duration}${calls}"]`);
    
    if (parentId) {
      lines.push(`  ${parentId} --> ${id}`);
    }
    
    for (const child of node.children) {
      addNode(child, id);
    }
  };
  
  addNode(depth);
  
  lines.push("");
  lines.push("  style depth0 fill:#e3f2fd,stroke:#1976d2");
  lines.push("  style depth1 fill:#e8f5e9,stroke:#388e3c");
  lines.push("  style depth2 fill:#fff3e0,stroke:#f57c00");
  lines.push("  style depth3 fill:#fce4ec,stroke:#c2185b");
  
  const applyStyles = (node: ExecutionDepth, level: number): void => {
    const id = node.symbol_id.replace(/[^a-zA-Z0-9]/g, "_");
    lines.push(`  class ${id} depth${Math.min(level, 3)}`);
    for (const child of node.children) {
      applyStyles(child, level + 1);
    }
  };
  
  applyStyles(depth, 0);
  
  return lines.join("\n");
}

export function calculateCyclomaticComplexity(
  sourceCode: string,
  filePath: string
): ComplexityReport {
  const symbols: CyclomaticComplexity[] = [];
  
  let ast: t.File;
  try {
    ast = parse(sourceCode, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx", "classProperties"],
    });
  } catch {
    return {
      file_path: filePath,
      symbols: [],
      avg_complexity: 0,
      max_complexity: 0,
      high_complexity_count: 0,
    };
  }

  const functionStack: {
    name: string;
    complexity: number;
    decisionPoints: number;
    loc: number;
    maxNesting: number;
    currentNesting: number;
  }[] = [];

  const processedNodes = new Set<unknown>();

  traverse(ast, {
    FunctionDeclaration(path) {
      if (processedNodes.has(path.node)) return;
      processedNodes.add(path.node);
      
      const name = path.node.id?.name || "anonymous";
      functionStack.push({
        name,
        complexity: 1,
        decisionPoints: 0,
        loc: 0,
        maxNesting: 0,
        currentNesting: 0,
      });
      
      path.traverse({
        BlockStatement(innerPath) {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            if (innerPath.parent && (
              innerPath.parent.type === "IfStatement" ||
              innerPath.parent.type === "ForStatement" ||
              innerPath.parent.type === "WhileStatement" ||
              innerPath.parent.type === "FunctionDeclaration" ||
              innerPath.parent.type === "ClassMethod"
            )) {
              fn.currentNesting++;
              fn.maxNesting = Math.max(fn.maxNesting, fn.currentNesting);
            }
          }
        },
        IfStatement() {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
        ConditionalExpression() {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
        SwitchCase(innerPath: NodePath<t.SwitchCase>) {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.decisionPoints++;
          }
        },
        ForStatement() {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
        ForInStatement() {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
        ForOfStatement() {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
        WhileStatement() {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
        DoWhileStatement() {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
        CatchClause() {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
        LogicalExpression(innerPath: NodePath<t.LogicalExpression>) {
          if (functionStack.length > 0 && 
              (innerPath.node.operator === "&&" || innerPath.node.operator === "||")) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
      });
      
      if (functionStack.length > 0) {
        const fn = functionStack.pop()!;
        symbols.push({
          symbol_id: `${filePath}::${fn.name}`,
          symbol_name: fn.name,
          complexity: fn.complexity,
          decision_points: fn.decisionPoints,
          lines_of_code: fn.loc,
          nesting_depth: fn.maxNesting,
        });
      }
      
      path.skip();
    },
    ClassMethod(path) {
      if (processedNodes.has(path.node)) return;
      processedNodes.add(path.node);
      
      if (!t.isIdentifier(path.node.key)) return;
      
      const name = path.node.key.name;
      functionStack.push({
        name,
        complexity: 1,
        decisionPoints: 0,
        loc: 0,
        maxNesting: 0,
        currentNesting: 0,
      });
      
      path.traverse({
        BlockStatement(innerPath: NodePath<t.BlockStatement>) {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            if (innerPath.parent && (
              innerPath.parent.type === "IfStatement" ||
              innerPath.parent.type === "ForStatement" ||
              innerPath.parent.type === "WhileStatement" ||
              innerPath.parent.type === "FunctionDeclaration" ||
              innerPath.parent.type === "ClassMethod"
            )) {
              fn.currentNesting++;
              fn.maxNesting = Math.max(fn.maxNesting, fn.currentNesting);
            }
          }
        },
        IfStatement() {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
        ConditionalExpression() {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
        SwitchCase(innerPath: NodePath<t.SwitchCase>) {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.decisionPoints++;
          }
        },
        ForStatement() {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
        ForInStatement() {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
        ForOfStatement() {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
        WhileStatement() {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
        DoWhileStatement() {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
        CatchClause() {
          if (functionStack.length > 0) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
        LogicalExpression(innerPath: NodePath<t.LogicalExpression>) {
          if (functionStack.length > 0 && 
              (innerPath.node.operator === "&&" || innerPath.node.operator === "||")) {
            const fn = functionStack[functionStack.length - 1];
            fn.complexity++;
            fn.decisionPoints++;
          }
        },
      });
      
      if (functionStack.length > 0) {
        const fn = functionStack.pop()!;
        symbols.push({
          symbol_id: `${filePath}::${fn.name}`,
          symbol_name: fn.name,
          complexity: fn.complexity,
          decision_points: fn.decisionPoints,
          lines_of_code: fn.loc,
          nesting_depth: fn.maxNesting,
        });
      }
      
      path.skip();
    },
  });

  const complexities = symbols.map(s => s.complexity);
  const avgComplexity = complexities.length > 0 
    ? complexities.reduce((a, b) => a + b, 0) / complexities.length 
    : 0;
  const maxComplexity = complexities.length > 0 
    ? Math.max(...complexities) 
    : 0;
  const highComplexityCount = symbols.filter(s => s.complexity > 10).length;

  return {
    file_path: filePath,
    symbols,
    avg_complexity: Math.round(avgComplexity * 100) / 100,
    max_complexity: maxComplexity,
    high_complexity_count: highComplexityCount,
  };
}

export function toComplexityMermaid(report: ComplexityReport): string {
  const lines: string[] = ["flowchart LR"];
  
  lines.push("  subgraph Complexity Analysis");
  lines.push("    direction TB");
  
  for (const symbol of report.symbols.sort((a, b) => b.complexity - a.complexity).slice(0, 20)) {
    const id = symbol.symbol_name.replace(/[^a-zA-Z0-9]/g, "_");
    let shape = "";
    
    if (symbol.complexity > 10) {
      shape = `("${symbol.symbol_name}\\nCC: ${symbol.complexity}")`;
    } else if (symbol.complexity > 5) {
      shape = `["${symbol.symbol_name}\\nCC: ${symbol.complexity}"]`;
    } else {
      shape = `"${symbol.symbol_name}\\nCC: ${symbol.complexity}"`;
    }
    
    lines.push(`    ${id}${shape}`);
  }
  
  lines.push("  end");
  
  lines.push("");
  lines.push("  classDef high fill:#ffcdd2,stroke:#c62828,stroke-width:2px");
  lines.push("  classDef medium fill:#fff9c4,stroke:#f9a825,stroke-width:1px");
  lines.push("  classDef low fill:#c8e6c9,stroke:#2e7d32");
  
  for (const symbol of report.symbols) {
    const id = symbol.symbol_name.replace(/[^a-zA-Z0-9]/g, "_");
    let className = "low";
    if (symbol.complexity > 10) className = "high";
    else if (symbol.complexity > 5) className = "medium";
    lines.push(`  class ${id} ${className}`);
  }

  lines.push("");
  lines.push(`  note("Avg: ${report.avg_complexity}, Max: ${report.max_complexity}, High: ${report.high_complexity_count}")`);

  return lines.join("\n");
}

export function enrichExecutionGraph(graph: ExecutionGraph): ExecutionGraph {
  const timeline = buildExecutionTimeline(graph);
  const depthTree = buildDepthTree(graph);
  
  return {
    ...graph,
    timeline,
    depth_tree: depthTree,
  };
}
