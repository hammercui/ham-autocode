// core/context/budget.js
'use strict';
const path = require('path');
const { loadConfig } = require('../state/config');
const { atomicWriteJSON, readJSON } = require('../state/atomic');

/**
 * Context budget tracker.
 * Tracks cumulative token estimates and provides threshold warnings.
 */
class ContextBudget {
  constructor(projectDir) {
    this.projectDir = projectDir;
    this.config = loadConfig(projectDir).context;
    this.statePath = path.join(projectDir, '.ham-autocode', 'context', 'budget.json');
    this.consumed = this.loadState();
    this.capacity = 100; // percentage-based (0-100)
  }

  /** Add tokens to consumed count, return current usage percentage */
  consume(tokens) {
    this.consumed += tokens;
    this.persist();
    return this.usagePercent();
  }

  /** Current usage as percentage (0-100) */
  usagePercent() {
    // Map consumed tokens to approximate context window usage
    // 200k context window ~ 200000 tokens
    const CONTEXT_WINDOW = 200000;
    return Math.min(100, Math.round(this.consumed / CONTEXT_WINDOW * 100));
  }

  /** Get current threshold level: 'ok' | 'advisory' | 'compress' | 'critical' */
  level() {
    const pct = this.usagePercent();
    if (pct >= this.config.criticalThreshold) return 'critical';
    if (pct >= this.config.compressThreshold) return 'compress';
    if (pct >= this.config.advisoryThreshold) return 'advisory';
    return 'ok';
  }

  /** Get budget status summary */
  status() {
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
  reset() {
    this.consumed = 0;
    this.persist();
  }

  loadState() {
    const { data, error } = readJSON(this.statePath);
    if (error && error.code !== 'ENOENT') throw error;
    return data?.consumed || 0;
  }

  persist() {
    atomicWriteJSON(this.statePath, {
      schemaVersion: 2,
      consumed: this.consumed,
      updatedAt: new Date().toISOString(),
    });
  }
}

module.exports = { ContextBudget };
