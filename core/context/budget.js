// core/context/budget.js
'use strict';
const { loadConfig } = require('../state/config');

/**
 * Context budget tracker.
 * Tracks cumulative token estimates and provides threshold warnings.
 */
class ContextBudget {
  constructor(projectDir) {
    this.config = loadConfig(projectDir).context;
    this.consumed = 0;
    this.capacity = 100; // percentage-based (0-100)
  }

  /** Add tokens to consumed count, return current usage percentage */
  consume(tokens) {
    this.consumed += tokens;
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
    return {
      consumed: this.consumed,
      usagePercent: this.usagePercent(),
      level: this.level(),
      thresholds: { ...this.config },
    };
  }

  /** Reset budget (e.g., after context compression or new session) */
  reset() {
    this.consumed = 0;
  }
}

module.exports = { ContextBudget };
