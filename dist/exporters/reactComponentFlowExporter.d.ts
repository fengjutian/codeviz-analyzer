import { ReactComponentFlow } from "../types";
/**
 * 从 Babel AST 提取 React 组件流程图
 */
export declare function extractReactComponentFlow(sourceCode: string, moduleName: string, componentName?: string): ReactComponentFlow | null;
/**
 * 将 React 组件流程图转换为 Mermaid 代码
 */
export declare function toMermaidRCF(flow: ReactComponentFlow): string;
/**
 * 提取模块中的所有 React 组件
 */
export declare function extractModuleReactFlows(sourceCode: string, moduleName: string): Array<{
    componentName: string;
    mermaidCode: string;
    nodeCount: number;
    edgeCount: number;
}>;
