// core/context/budget.ts
import path from 'path';
import type { BudgetStatus, BudgetLevel, ContextConfig } from '../types.js';
import { loadConfig } from '../state/config.js';
import { atomicWriteJSON, readJSON } from '../state/atomic.js';

interface BudgetState {
  schemaVersion: number;
  consumed: number;
  updatedAt: string;
}

/**
 * Context budget tracker.
 * Tracks cumulative token estimates and provides threshold warnings.
 */
export class ContextBudget {
  private readonly config: ContextConfig;
  private readonly statePath: string;
  private consumed: number;

  constructor(projectDir: string) {
    this.config = loadConfig(projectDir).context;
    this.statePath = path.join(projectDir, '.ham-autocode', 'context', 'budget.json');
    this.consumed = this.loadState();
  }

  /** Add tokens to consumed count, return current usage percentage */
  consume(tokens: number): number {
    this.consumed += tokens;
    this.persist();
    return this.usagePercent();
  }

  /** Current usage as percentage (0-100) */
  usagePercent(): number {
    // Map consumed tokens to approximate context window usage
    // 200k context window ~ 200000 tokens
    const CONTEXT_WINDOW = 200000;
    return Math.min(100, Math.round(this.consumed / CONTEXT_WINDOW * 100));
  }

  /** Get current threshold level: 'ok' | 'advisory' | 'compress' | 'critical' */
  level(): BudgetLevel {
    const pct = this.usagePercent();
    if (pct >= this.config.criticalThreshold) return 'critical';
    if (pct >= this.config.compressThreshold) return 'compress';
    if (pct >= this.config.advisoryThreshold) return 'advisory';
    return 'ok';
  }

  /** Get budget status summary */
  status(): BudgetStatus {
    const level = this.level();
    return {
      consumed: this.consumed,
      usagePercent: this.usagePercent(),
      level,
      recommendation: level === 'ok' ? 'normal' : level,
      thresholds: { ...this.config },
    };
  }

  /** Reset budget (e.g., after context compression or new session) */
  reset(): void {
    this.consumed = 0;
    this.persist();
  }

  private loadState(): number {
    const { data, error } = readJSON(this.statePath) as { data: BudgetState | null; error: NodeJS.ErrnoException | null };
    if (error && error.code !== 'ENOENT') throw error;
    return data?.consumed || 0;
  }

  private persist(): void {
    atomicWriteJSON(this.statePath, {
      schemaVersion: 2,
      consumed: this.consumed,
      updatedAt: new Date().toISOString(),
    });
  }
}
