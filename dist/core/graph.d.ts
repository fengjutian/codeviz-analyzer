import { CircularDependency, DependencyImportance, DependencyPath, Edge, GraphAnalysisResult, HotspotSymbol, InheritanceDepth, KnowledgeGraph, ModuleNode, ModuleStability, SymbolNode, ArchitectureLayer, ArchitectureFitness, PackageAnalysis, ImpactAnalysisResult, DependencyRiskAssessment, KeyPathAnalysis } from "../types";
export declare function aggregateGraph(input: {
    projectPath: string;
    symbols: SymbolNode[];
    edges: Edge[];
    diagnostics: KnowledgeGraph["diagnostics"];
    ignore: string[];
    extensions: string[];
}): KnowledgeGraph;
/**
 * 检测模块间的循环依赖
 */
export declare function detectCircularDependencies(modules: ModuleNode[]): CircularDependency[];
/**
 * 计算两个模块之间的依赖路径
 */
export declare function findDependencyPaths(modules: ModuleNode[], fromModule: string, toModule: string, maxDepth?: number): DependencyPath[];
/**
 * 计算符号的继承深度
 */
export declare function calculateInheritanceDepths(symbols: SymbolNode[], edges: Edge[]): InheritanceDepth[];
/**
 * 分析代码热点符号（高耦合、高复杂度）
 */
export declare function analyzeHotspotSymbols(symbols: SymbolNode[]): HotspotSymbol[];
/**
 * 分析模块稳定性
 */
export declare function analyzeModuleStabilities(modules: ModuleNode[]): ModuleStability[];
/**
 * 分析依赖重要性（基于中心性）
 */
export declare function analyzeDependencyImportances(symbols: SymbolNode[]): DependencyImportance[];
/**
 * 计算可维护性指数
 */
export declare function calculateMaintainabilityIndex(modules: ModuleNode[], symbols: SymbolNode[]): number;
/**
 * 综合知识图谱分析
 */
export declare function analyzeKnowledgeGraph(graph: KnowledgeGraph): GraphAnalysisResult;
export declare function detectArchitectureLayers(modules: ModuleNode[]): ArchitectureLayer[];
export declare function analyzePackages(graph: KnowledgeGraph): PackageAnalysis[];
export declare function evaluateArchitectureFitness(modules: ModuleNode[], layers: ArchitectureLayer[]): ArchitectureFitness | null;
export declare function analyzeArchitecture(graph: KnowledgeGraph): {
    layers: ArchitectureLayer[];
    packages: PackageAnalysis[];
    fitness: ArchitectureFitness | null;
};
export declare function analyzeModuleImpact(graph: KnowledgeGraph, targetModule: string): ImpactAnalysisResult;
export declare function assessDependencyRisk(graph: KnowledgeGraph): DependencyRiskAssessment[];
export declare function analyzeKeyPaths(graph: KnowledgeGraph): KeyPathAnalysis;
