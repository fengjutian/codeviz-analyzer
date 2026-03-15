export type SymbolType = "function" | "class" | "method" | "variable" | "interface" | "type_alias";
export type DependencyType = "call" | "import" | "inherit" | "implement" | "reference";
export interface MetricMap {
    [key: string]: number;
}
export interface SymbolNode {
    id: string;
    symbol_name: string;
    symbol_type: SymbolType;
    module_name: string;
    dependencies: string[];
    metrics: MetricMap;
    loc?: number;
    location?: SourceLocation;
}
export interface SourceLocation {
    start_line: number;
    start_column: number;
    end_line: number;
    end_column: number;
}
export interface Edge {
    id: string;
    from: string;
    to: string;
    dependency_type: DependencyType;
    uncertain?: boolean;
}
export interface ModuleNode {
    id: string;
    module_name: string;
    file_path: string;
    symbols: string[];
    dependencies: string[];
    metrics: MetricMap;
}
export interface AnalyzerDiagnostic {
    level: "info" | "warning" | "error";
    file?: string;
    message: string;
}
export interface AnalyzerMeta {
    version: string;
    analyzed_at: string;
    config: {
        project_path: string;
        ignore: string[];
        extensions: string[];
    };
    deviations: string[];
}
export interface KnowledgeGraph {
    project: {
        name: string;
        path: string;
    };
    modules: ModuleNode[];
    symbols: SymbolNode[];
    edges: Edge[];
    metrics: MetricMap;
    meta: AnalyzerMeta;
    diagnostics: AnalyzerDiagnostic[];
}
export interface ScanProgress {
    scanned_dirs: number;
    scanned_files: number;
    matched_files: number;
}
export interface ScanResult {
    files: string[];
    errors: AnalyzerDiagnostic[];
}
export interface ScanOptions {
    ignore?: string[];
    extensions?: string[];
    onProgress?: (progress: ScanProgress) => void;
}
export interface ParseFileContext {
    filePath: string;
    moduleName: string;
    sourceCode: string;
}
export interface ParseResult {
    symbols: SymbolNode[];
    edges: Edge[];
    diagnostics: AnalyzerDiagnostic[];
}
export interface ParserPlugin {
    language_id: string;
    file_patterns: string[];
    parse: (ctx: ParseFileContext) => ParseResult;
}
export interface AnalyzerAnalyzeOptions {
    ignore?: string[];
    extensions?: string[];
    onProgress?: (phase: "scan" | "parse" | "graph", payload: unknown) => void;
    plugins?: ParserPlugin[];
}
export type AnalyzeOptions = AnalyzerAnalyzeOptions;
export type TraceEventType = "enter" | "exit" | "throw" | "return";
export interface TraceEntry {
    symbol_id: string;
    symbol_name: string;
    event: TraceEventType;
    timestamp: number;
    depth: number;
    parameters?: unknown[];
    return_value?: unknown;
    error?: string;
}
export interface ExecutionTrace {
    execution_id: string;
    project_path: string;
    started_at: string;
    ended_at?: string;
    entries: TraceEntry[];
}
export interface ExecutionStats {
    symbol_id: string;
    call_count: number;
    total_duration: number;
    avg_duration: number;
    min_duration: number;
    max_duration: number;
}
export interface ExecutionEdge {
    from: string;
    to: string;
    call_count: number;
    total_duration: number;
    path: string[];
}
export interface ExecutionGraph {
    project_path: string;
    execution_id: string;
    started_at: string;
    ended_at: string;
    traces: ExecutionTrace[];
    stats: ExecutionStats[];
    edges: ExecutionEdge[];
}
export interface TraceOptions {
    entry_point: string;
    timeout?: number;
    max_depth?: number;
    capture_params?: boolean;
    capture_return?: boolean;
}
export interface TraceResult {
    success: boolean;
    graph?: ExecutionGraph;
    error?: string;
}
export type RCFNodeType = "props" | "destruct" | "condition" | "branch" | "state" | "effect" | "callback" | "ref" | "memo" | "return" | "render";
export interface RCFNode {
    id: string;
    type: RCFNodeType;
    label: string;
    code?: string;
    line?: number;
    detail?: string;
}
export interface RCFEdge {
    from: string;
    to: string;
    label?: string;
}
export interface ReactComponentFlow {
    componentName: string;
    moduleName: string;
    isForwardRef: boolean;
    displayName?: string;
    nodes: RCFNode[];
    edges: RCFEdge[];
}
export type ArchitecturePattern = "layered" | "hexagonal" | "onion" | "clean" | "modular" | "monolithic";
export type LayerType = "ui" | "presentation" | "application" | "service" | "business" | "domain" | "infrastructure" | "data" | "shared" | "entry";
export interface ArchitectureLayer {
    name: LayerType;
    display_name: string;
    modules: string[];
    description: string;
    dependencies_allowed: LayerType[];
    dependencies_actual: LayerType[];
    violations: LayerViolation[];
}
export interface LayerViolation {
    from_module: string;
    to_module: string;
    from_layer: LayerType;
    to_layer: LayerType;
    severity: "error" | "warning";
}
export interface PackageAnalysis {
    name: string;
    path: string;
    modules: string[];
    external_dependencies: string[];
    internal_dependencies: string[];
    dependents: string[];
    metrics: {
        module_count: number;
        symbol_count: number;
        avg_coupling: number;
        stability_score: number;
    };
}
export interface ArchitectureFitness {
    pattern: ArchitecturePattern;
    score: number;
    concerns: string[];
    violations: ArchitectureViolation[];
    recommendations: string[];
}
export interface ArchitectureViolation {
    type: "dependency_direction" | "cycle" | "instability" | "coupling";
    severity: "error" | "warning" | "info";
    message: string;
    modules: string[];
}
export interface ArchitectureAnalysisResult {
    detected_pattern: ArchitecturePattern | null;
    layers: ArchitectureLayer[];
    packages: PackageAnalysis[];
    fitness: ArchitectureFitness | null;
    cross_boundary_dependencies: LayerViolation[];
    overall_score: number;
}
export interface ImpactAnalysisResult {
    target_module: string;
    downstream_modules: string[];
    downstream_symbols: string[];
    upstream_modules: string[];
    upstream_symbols: string[];
    transitive_downstream: number;
    transitive_upstream: number;
    risk_level: "low" | "medium" | "high" | "critical";
    estimated_change_impact: number;
}
export interface DependencyRiskAssessment {
    module_name: string;
    risk_score: number;
    risk_factors: {
        unstable_dependencies: number;
        transitive_coupling: number;
        hub_dependency: number;
        change_frequency_estimate: number;
    };
    risk_level: "low" | "medium" | "high" | "critical";
    recommendations: string[];
}
export interface KeyPathAnalysis {
    critical_paths: DependencyPath[];
    bridge_modules: string[];
    hub_modules: string[];
    bottleneck_modules: string[];
}
export interface CircularDependency {
    modules: string[];
    type: "direct" | "indirect";
}
export interface DependencyPath {
    from: string;
    to: string;
    path: string[];
    length: number;
}
export interface InheritanceDepth {
    symbol_id: string;
    depth: number;
    ancestors: string[];
}
export interface HotspotSymbol {
    symbol_id: string;
    score: number;
    rank: number;
    factors: {
        fan_in: number;
        fan_out: number;
        loc: number;
        call_count?: number;
    };
}
export interface ModuleStability {
    module_name: string;
    stability: "stable" | "unstable" | "mixed";
    stability_score: number;
    reason: string;
}
export interface DependencyImportance {
    symbol_id: string;
    importance: "critical" | "high" | "medium" | "low";
    centrality: number;
    dependencies_count: number;
}
export interface GraphAnalysisResult {
    circular_dependencies: CircularDependency[];
    dependency_paths: DependencyPath[];
    inheritance_depths: InheritanceDepth[];
    hotspot_symbols: HotspotSymbol[];
    module_stabilities: ModuleStability[];
    dependency_importances: DependencyImportance[];
    metrics: MetricMap & {
        avg_dependency_depth: number;
        max_dependency_depth: number;
        circular_dependency_count: number;
        stability_score: number;
        maintainability_index: number;
    };
}
