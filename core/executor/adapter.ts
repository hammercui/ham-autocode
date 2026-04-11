/**
 * Base adapter interface for executor adapters.
 * Each adapter: prepare() -> generateInstruction() -> parseResult()
 * Core is passive -- never invokes agents directly, only prepares instructions.
 */

import type { TaskState, TaskSpec } from '../types.js';

export interface PreparedContext {
  adapter: string;
  taskId: string;
  taskName: string;
  files: string[];
  spec: TaskSpec | Record<string, unknown>;
  context: Record<string, unknown>;
}

export interface ContextFile {
  path: string;
  content: string;
}

export interface ExecutionContext {
  files?: ContextFile[];
  [key: string]: unknown;
}

export interface RawResult {
  success?: boolean;
  output?: string;
  filesModified?: string[];
  error?: string | null;
  [key: string]: unknown;
}

export interface ParsedResult {
  success: boolean;
  output: string;
  filesModified: string[];
  error: string | null;
}

export class BaseAdapter {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  /** Prepare execution context for the task */
  prepare(task: TaskState, context?: Record<string, unknown>): PreparedContext {
    return {
      adapter: this.name,
      taskId: task.id,
      taskName: task.name,
      files: task.files || [],
      spec: task.spec || ({} as Record<string, unknown>),
      context: context || {},
    };
  }

  /** Generate instruction string for the executor */
  generateInstruction(_task: TaskState, _context?: ExecutionContext): string {
    throw new Error(`${this.name}.generateInstruction() not implemented`);
  }

  /** Parse executor result into standardized format */
  parseResult(rawResult?: RawResult | null): ParsedResult {
    return {
      success: !!rawResult?.success,
      output: rawResult?.output || '',
      filesModified: rawResult?.filesModified || [],
      error: rawResult?.error || null,
    };
  }
}
