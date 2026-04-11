// core/context/manager.js
'use strict';
const fs = require('fs');
const path = require('path');
const { estimateTokens, estimateFileTokens, buildFileIndex } = require('../utils/token');
const { ContextBudget } = require('./budget');

/**
 * Context manager — prepares selective context for each task execution.
 * Loads only the files a task needs, respects token budget.
 */
class ContextManager {
  constructor(projectDir) {
    this.projectDir = projectDir;
    this.budget = new ContextBudget(projectDir);
    this.fileIndex = null;
  }

  /** Build or refresh the file index for the project */
  indexProject() {
    this.fileIndex = buildFileIndex(this.projectDir);
    return this.fileIndex;
  }

  /** Prepare context for a specific task — returns selected files with content */
  prepareForTask(task) {
    if (!this.fileIndex) this.indexProject();

    const requiredFiles = task.context?.requiredFiles || task.files || [];
    const context = {
      files: [],
      totalTokens: 0,
      budgetStatus: null,
      recommendation: 'normal',
    };

    for (const relPath of requiredFiles) {
      const absPath = this.resolveProjectFile(relPath);
      if (!absPath) continue;
      if (!fs.existsSync(absPath)) continue;

      const tokens = estimateFileTokens(absPath);
      context.files.push({
        path: relPath,
        tokens,
        content: fs.readFileSync(absPath, 'utf8'),
      });
      context.totalTokens += tokens;
    }

    // Update budget
    this.budget.consume(context.totalTokens);
    context.budgetStatus = this.budget.status();
    context.recommendation = context.budgetStatus.recommendation;

    return context;
  }

  /** Estimate tokens for a task without consuming budget */
  estimateTask(task) {
    const requiredFiles = task.context?.requiredFiles || task.files || [];
    let total = 0;
    for (const relPath of requiredFiles) {
      const absPath = this.resolveProjectFile(relPath);
      if (!absPath) continue;
      total += estimateFileTokens(absPath);
    }
    // Add spec tokens
    if (task.spec?.description) {
      total += estimateTokens(task.spec.description);
    }
    return total;
  }

  /** Get current budget status */
  budgetStatus() {
    return this.budget.status();
  }

  /** Reset budget (new session) */
  resetBudget() {
    this.budget.reset();
  }

  resolveProjectFile(relPath) {
    if (typeof relPath !== 'string' || relPath.trim() === '') return null;
    const projectRoot = path.resolve(this.projectDir);
    const absPath = path.resolve(projectRoot, relPath);
    if (absPath !== projectRoot && !absPath.startsWith(projectRoot + path.sep)) {
      throw new Error(`Invalid required file path: ${relPath}`);
    }
    return absPath;
  }
}

module.exports = { ContextManager };
