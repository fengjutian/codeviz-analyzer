/**
 * 控制流图节点类型
 */
export type CFGNodeType = "entry" | "exit" | "statement" | "branch" | "merge" | "loop" | "loop_exit" | "throw" | "catch";
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
    label?: string;
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
 * 从 Babel AST 提取控制流图
 */
export declare function extractControlFlow(sourceCode: string, moduleName: string, functionName?: string): ControlFlowGraph | null;
/**
 * 将控制流图转换为 Mermaid 流程图代码
 */
export declare function toMermaidCFG(graph: ControlFlowGraph): string;
/**
 * 为整个模块生成控制流图（包含所有函数）
 */
export declare function extractModuleControlFlow(sourceCode: string, moduleName: string): ControlFlowGraph[];
