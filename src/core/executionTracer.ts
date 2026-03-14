import async_hooks from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import * as path from "node:path";
import {
  ExecutionGraph,
  ExecutionStats,
  ExecutionTrace,
  TraceEntry,
  TraceOptions,
  TraceResult,
} from "../types";

interface CallFrame {
  symbolId: string;
  symbolName: string;
  depth: number;
  startTime: number;
  params?: unknown[];
}

export class ExecutionTracer extends EventEmitter {
  private enabled = false;
  private asyncHook: async_hooks.AsyncHook | null = null;
  private stack: Map<number, CallFrame[]> = new Map();
  private trace: ExecutionTrace;
  private projectPath: string;
  private options: Required<TraceOptions>;

  constructor(projectPath: string, options: TraceOptions) {
    super();
    this.projectPath = projectPath;
    this.options = {
      entry_point: options.entry_point,
      timeout: options.timeout ?? 30000,
      max_depth: options.max_depth ?? 100,
      capture_params: options.capture_params ?? false,
      capture_return: options.capture_return ?? false,
    };
    this.trace = {
      execution_id: randomUUID(),
      project_path: projectPath,
      started_at: new Date().toISOString(),
      entries: [],
    };
  }

  start(): void {
    if (this.enabled) {
      return;
    }
    this.enabled = true;

    const self = this;
    this.asyncHook = async_hooks.createHook({
      init(asyncId, type, triggerAsyncId, resource) {
        // 初始化异步资源
      },
      before(asyncId) {
        // 异步操作开始前触发
      },
      after(asyncId) {
        // 异步操作完成后触发
      },
      destroy(asyncId) {
        // 异步资源销毁时触发
      },
    });

    this.asyncHook.enable();

    // 设置超时自动停止
    setTimeout(() => {
      if (this.enabled) {
        this.stop();
      }
    }, this.options.timeout);
  }

  stop(): ExecutionGraph {
    if (!this.enabled) {
      throw new Error("Tracer is not running");
    }

    this.enabled = false;

    if (this.asyncHook) {
      this.asyncHook.disable();
      this.asyncHook = null;
    }

    this.trace.ended_at = new Date().toISOString();

    return this.buildExecutionGraph();
  }

  recordEntry(symbolId: string, symbolName: string, params?: unknown[]): void {
    if (!this.enabled) return;

    const depth = this.getCurrentDepth();
    if (depth > this.options.max_depth) {
      return;
    }

    const entry: TraceEntry = {
      symbol_id: symbolId,
      symbol_name: symbolName,
      event: "enter",
      timestamp: Date.now(),
      depth,
    };

    if (this.options.capture_params && params) {
      entry.parameters = params;
    }

    this.trace.entries.push(entry);
    this.emit("entry", entry);
  }

  recordExit(symbolId: string, symbolName: string, returnValue?: unknown, error?: string): void {
    if (!this.enabled) return;

    const depth = this.getCurrentDepth();

    const entry: TraceEntry = {
      symbol_id: symbolId,
      symbol_name: symbolName,
      event: error ? "throw" : "return",
      timestamp: Date.now(),
      depth,
    };

    if (this.options.capture_return) {
      if (error) {
        entry.error = error;
      } else {
        entry.return_value = returnValue;
      }
    }

    this.trace.entries.push(entry);
    this.emit("entry", entry);
  }

  private getCurrentDepth(): number {
    const asyncId = async_hooks.executionAsyncId();
    const frames = this.stack.get(asyncId);
    return frames ? frames.length : 0;
  }

  private buildExecutionGraph(): ExecutionGraph {
    const statsMap = new Map<string, ExecutionStats>();
    const callCountMap = new Map<string, number>();
    const durationMap = new Map<string, number[]>();

    // 统计每个符号的执行情况
    for (const entry of this.trace.entries) {
      const { symbol_id, event } = entry;

      if (!statsMap.has(symbol_id)) {
        statsMap.set(symbol_id, {
          symbol_id,
          call_count: 0,
          total_duration: 0,
          avg_duration: 0,
          min_duration: Infinity,
          max_duration: 0,
        });
      }

      const stats = statsMap.get(symbol_id)!;

      if (event === "enter") {
        stats.call_count++;
        callCountMap.set(symbol_id, (callCountMap.get(symbol_id) ?? 0) + 1);
      } else if (event === "return" || event === "throw") {
        // 计算执行时长需要配对 enter 和 exit
        // 这里简化处理，实际需要用调用栈匹配
      }
    }

    // 计算平均时长
    for (const [symbolId, durations] of durationMap) {
      const stats = statsMap.get(symbolId);
      if (stats && durations.length > 0) {
        stats.total_duration = durations.reduce((a, b) => a + b, 0);
        stats.avg_duration = stats.total_duration / durations.length;
        stats.min_duration = Math.min(...durations);
        stats.max_duration = Math.max(...durations);
      }
    }

    return {
      project_path: this.projectPath,
      execution_id: this.trace.execution_id,
      started_at: this.trace.started_at,
      ended_at: this.trace.ended_at ?? new Date().toISOString(),
      traces: [this.trace],
      stats: [...statsMap.values()],
      edges: [], // TODO: 构建边关系
    };
  }

  getTrace(): ExecutionTrace {
    return this.trace;
  }
}

export async function runWithTrace<T>(
  fn: () => T | Promise<T>,
  projectPath: string,
  options: TraceOptions
): Promise<TraceResult> {
  const tracer = new ExecutionTracer(projectPath, options);

  try {
    tracer.start();

    // 执行目标函数
    const result = await fn();

    // 记录返回值
    tracer.recordExit(
      "root",
      "entry",
      typeof result === "object" ? JSON.stringify(result) : result
    );

    const graph = tracer.stop();
    return {
      success: true,
      graph,
    };
  } catch (error) {
    if (tracer["enabled"]) {
      tracer.recordExit("root", "entry", undefined, String(error));
      tracer.stop();
    }

    return {
      success: false,
      error: String(error),
    };
  }
}
