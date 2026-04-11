// core/executor/adapter.js
'use strict';

/**
 * Base adapter interface for executor adapters.
 * Each adapter: prepare() → generateInstruction() → parseResult()
 * Core is passive — never invokes agents directly, only prepares instructions.
 */
class BaseAdapter {
  constructor(name) {
    this.name = name;
  }

  /** Prepare execution context for the task */
  prepare(task, context) {
    return {
      adapter: this.name,
      taskId: task.id,
      taskName: task.name,
      files: task.files || [],
      spec: task.spec || {},
      context: context || {},
    };
  }

  /** Generate instruction string for the executor */
  generateInstruction(task, context) {
    throw new Error(`${this.name}.generateInstruction() not implemented`);
  }

  /** Parse executor result into standardized format */
  parseResult(rawResult) {
    return {
      success: !!rawResult?.success,
      output: rawResult?.output || '',
      filesModified: rawResult?.filesModified || [],
      error: rawResult?.error || null,
    };
  }
}

module.exports = { BaseAdapter };
