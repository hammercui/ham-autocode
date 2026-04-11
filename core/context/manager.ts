// core/context/manager.ts
import fs from 'fs';
import path from 'path';
import type { TaskState, BudgetStatus, FileIndex } from '../types.js';
import { estimateTokens, estimateFileTokens, buildFileIndex } from '../utils/token.js';
import { atomicWriteJSON, readJSON } from '../state/atomic.js';
import { ContextBudget } from './budget.js';

interface FileContext {
  path: string;
  tokens: number;
  content: string;
}

interface PreparedContext {
  files: FileContext[];
  totalTokens: number;
  budgetStatus: BudgetStatus | null;
  recommendation: string;
}

/**
 * Context manager — prepares selective context for each task execution.
 * Loads only the files a task needs, respects token budget.
 */
export class ContextManager {
  private projectDir: string;
  private budget: ContextBudget;
  private fileIndex: FileIndex | null;
  private indexPath: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.budget = new ContextBudget(projectDir);
    this.fileIndex = null;
    this.indexPath = path.join(projectDir, '.ham-autocode', 'context', 'file-index.json');
  }

  /** Build or refresh the file index for the project.
   *  Gap B2: persists index to .ham-autocode/context/file-index.json */
  indexProject(): FileIndex {
    this.fileIndex = buildFileIndex(this.projectDir);
    // Gap B2: persist the index to disk
    atomicWriteJSON(this.indexPath, this.fileIndex);
    return this.fileIndex;
  }

  /** Prepare context for a specific task — returns selected files with content.
   *  Gap B2: loads cached file index from disk if available. */
  prepareForTask(task: TaskState): PreparedContext {
    // Gap B2: try loading cached index before building a new one
    if (!this.fileIndex) {
      const { data } = readJSON(this.indexPath) as { data: FileIndex | null; error: NodeJS.ErrnoException | null };
      if (data) {
        this.fileIndex = data;
      } else {
        this.indexProject();
      }
    }

    const requiredFiles: string[] = task.context?.requiredFiles || task.files || [];
    const context: PreparedContext = {
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
  estimateTask(task: TaskState): number {
    const requiredFiles: string[] = task.context?.requiredFiles || task.files || [];
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
  budgetStatus(): BudgetStatus {
    return this.budget.status();
  }

  /** Reset budget (new session) */
  resetBudget(): void {
    this.budget.reset();
  }

  private resolveProjectFile(relPath: string): string | null {
    if (typeof relPath !== 'string' || relPath.trim() === '') return null;
    const projectRoot = path.resolve(this.projectDir);
    const absPath = path.resolve(projectRoot, relPath);
    if (absPath !== projectRoot && !absPath.startsWith(projectRoot + path.sep)) {
      throw new Error(`Invalid required file path: ${relPath}`);
    }
    return absPath;
  }
}
