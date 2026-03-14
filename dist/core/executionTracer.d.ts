import { EventEmitter } from "node:events";
import { ExecutionGraph, ExecutionTrace, TraceOptions, TraceResult } from "../types";
export declare class ExecutionTracer extends EventEmitter {
    private enabled;
    private asyncHook;
    private stack;
    private trace;
    private projectPath;
    private options;
    constructor(projectPath: string, options: TraceOptions);
    start(): void;
    stop(): ExecutionGraph;
    recordEntry(symbolId: string, symbolName: string, params?: unknown[]): void;
    recordExit(symbolId: string, symbolName: string, returnValue?: unknown, error?: string): void;
    private getCurrentDepth;
    private buildExecutionGraph;
    getTrace(): ExecutionTrace;
}
export declare function runWithTrace<T>(fn: () => T | Promise<T>, projectPath: string, options: TraceOptions): Promise<TraceResult>;
