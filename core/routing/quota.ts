/**
 * Agent Quota Manager.
 * Tracks routing target availability and enables graceful degradation.
 *
 * Design:
 * - File-based status tracking (zero API calls)
 * - Auto-mark unavailable on consecutive failures
 * - Auto-recover after cooldown period
 * - Configurable fallback chain: codex → opencode → claude-code
 *
 * Usage:
 * - Router checks quota before routing
 * - dag fail with agent_error auto-marks quota issue
 * - CLI allows manual mark/clear
 */

import fs from 'fs';
import path from 'path';
import { atomicWriteJSON, readJSON } from '../state/atomic.js';
import type { RoutingTarget } from '../types.js';

// ─── Types ──────────────────────────────────────────────────────

export interface QuotaStatus {
  target: RoutingTarget;
  available: boolean;
  consecutiveFailures: number;
  lastFailure: string | null;
  unavailableSince: string | null;
  reason: string | null;
}

export interface QuotaState {
  schemaVersion: number;
  targets: Record<string, QuotaStatus>;
  updatedAt: string;
}

export interface FallbackChain {
  from: RoutingTarget;
  to: RoutingTarget;
}

// ─── Constants ──────────────────────────────────────────────────

/** After N consecutive agent_error failures, mark target as unavailable */
const FAILURE_THRESHOLD = 2;

/** Auto-recover after this many milliseconds (default: 30 minutes) */
const COOLDOWN_MS = 30 * 60 * 1000;

/** Default fallback chain
 * codex(opencode+gpt) → opencode(default model) → claude-code
 */
const DEFAULT_FALLBACKS: FallbackChain[] = [
  { from: 'codexfake', to: 'opencode' },  // codexfake(opencode+gpt) 失败 → opencode(default model)
  { from: 'opencode', to: 'claude-code' },
  { from: 'claude-app', to: 'claude-code' },
  { from: 'agent-teams', to: 'claude-code' },
];

// ─── Paths ──────────────────────────────────────────────────────

function quotaPath(projectDir: string): string {
  return path.join(projectDir, '.ham-autocode', 'routing', 'quota.json');
}

// ─── Core Functions ─────────────────────────────────────────────

function loadQuota(projectDir: string): QuotaState {
  const { data } = readJSON<QuotaState>(quotaPath(projectDir));
  return data || {
    schemaVersion: 1,
    targets: {},
    updatedAt: new Date().toISOString(),
  };
}

function saveQuota(projectDir: string, state: QuotaState): void {
  const dir = path.dirname(quotaPath(projectDir));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  state.updatedAt = new Date().toISOString();
  atomicWriteJSON(quotaPath(projectDir), state);
}

function getTargetStatus(state: QuotaState, target: RoutingTarget): QuotaStatus {
  return state.targets[target] || {
    target,
    available: true,
    consecutiveFailures: 0,
    lastFailure: null,
    unavailableSince: null,
    reason: null,
  };
}

/**
 * Check if a routing target is available.
 * Includes auto-recovery after cooldown.
 */
export function isAvailable(projectDir: string, target: RoutingTarget): boolean {
  const state = loadQuota(projectDir);
  const status = getTargetStatus(state, target);

  if (status.available) return true;

  // Auto-recover after cooldown
  if (status.unavailableSince) {
    const elapsed = Date.now() - new Date(status.unavailableSince).getTime();
    if (elapsed >= COOLDOWN_MS) {
      // Reset and mark available
      status.available = true;
      status.consecutiveFailures = 0;
      status.unavailableSince = null;
      status.reason = null;
      state.targets[target] = status;
      saveQuota(projectDir, state);
      return true;
    }
  }

  return false;
}

/**
 * Record a failure for a routing target.
 * After FAILURE_THRESHOLD consecutive failures, mark as unavailable.
 */
export function recordFailure(projectDir: string, target: RoutingTarget, reason?: string): QuotaStatus {
  const state = loadQuota(projectDir);
  const status = getTargetStatus(state, target);

  status.consecutiveFailures++;
  status.lastFailure = new Date().toISOString();

  if (status.consecutiveFailures >= FAILURE_THRESHOLD) {
    status.available = false;
    status.unavailableSince = status.unavailableSince || new Date().toISOString();
    status.reason = reason || `${FAILURE_THRESHOLD} consecutive failures`;
  }

  state.targets[target] = status;
  saveQuota(projectDir, state);
  return status;
}

/**
 * Record a success — resets failure counter.
 */
export function recordSuccess(projectDir: string, target: RoutingTarget): void {
  const state = loadQuota(projectDir);
  const status = getTargetStatus(state, target);

  if (status.consecutiveFailures > 0 || !status.available) {
    status.consecutiveFailures = 0;
    status.available = true;
    status.unavailableSince = null;
    status.reason = null;
    state.targets[target] = status;
    saveQuota(projectDir, state);
  }
}

/**
 * Manually mark a target as unavailable.
 * Use when user knows quota is exhausted.
 */
export function markUnavailable(projectDir: string, target: RoutingTarget, reason: string): QuotaStatus {
  const state = loadQuota(projectDir);
  const status = getTargetStatus(state, target);

  status.available = false;
  status.unavailableSince = new Date().toISOString();
  status.reason = reason;

  state.targets[target] = status;
  saveQuota(projectDir, state);
  return status;
}

/**
 * Manually mark a target as available (clear quota issue).
 */
export function markAvailable(projectDir: string, target: RoutingTarget): QuotaStatus {
  const state = loadQuota(projectDir);
  const status = getTargetStatus(state, target);

  status.available = true;
  status.consecutiveFailures = 0;
  status.unavailableSince = null;
  status.reason = null;

  state.targets[target] = status;
  saveQuota(projectDir, state);
  return status;
}

/**
 * Get fallback target when primary is unavailable.
 * Returns null if no fallback exists.
 */
export function getFallback(
  projectDir: string,
  target: RoutingTarget,
  customFallbacks?: FallbackChain[]
): RoutingTarget | null {
  const fallbacks = customFallbacks || DEFAULT_FALLBACKS;

  const chain = fallbacks.find(f => f.from === target);
  if (!chain) return null;

  // Check if fallback is also available
  if (isAvailable(projectDir, chain.to)) {
    return chain.to;
  }

  // Recursive fallback (e.g., codex → opencode → claude-code)
  return getFallback(projectDir, chain.to, fallbacks);
}

/**
 * Resolve the actual routing target, applying fallbacks if needed.
 * Returns { target, fallbackApplied, originalTarget, reason }.
 */
export function resolveTarget(
  projectDir: string,
  target: RoutingTarget
): { target: RoutingTarget; fallbackApplied: boolean; originalTarget: RoutingTarget; reason: string } {
  if (isAvailable(projectDir, target)) {
    return { target, fallbackApplied: false, originalTarget: target, reason: 'available' };
  }

  const state = loadQuota(projectDir);
  const status = getTargetStatus(state, target);

  const fallback = getFallback(projectDir, target);
  if (fallback) {
    return {
      target: fallback,
      fallbackApplied: true,
      originalTarget: target,
      reason: `${target} unavailable (${status.reason}), falling back to ${fallback}`,
    };
  }

  // No fallback available, use claude-code as ultimate fallback
  return {
    target: 'claude-code',
    fallbackApplied: true,
    originalTarget: target,
    reason: `${target} unavailable, no fallback chain, using claude-code`,
  };
}

/**
 * Get full quota status for display.
 */
export function quotaStatus(projectDir: string): QuotaState {
  return loadQuota(projectDir);
}
