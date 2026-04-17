/**
 * Agent 限额状态管理
 * 追踪 codex/opencode 的可用状态，连续失败时自动 cooldown，定时恢复。
 */

import fs from 'fs';
import path from 'path';
import { readJSON, atomicWriteJSON } from '../state/atomic.js';
import { AGENT_STATUS_JSON, STATE_DISPATCH } from '../paths.js';

interface AgentState {
  status: 'available' | 'cooldown';
  consecutiveFailures: number;
  lastFailure: string | null;
  cooldownUntil: string | null;
}

interface AgentStatusStore {
  schemaVersion: number;
  agents: Record<string, AgentState>;
}

/** 连续失败多少次后进入 cooldown */
const FAILURE_THRESHOLD = 2;
/** cooldown 持续时间 (ms) */
const COOLDOWN_DURATION_MS = 30 * 60 * 1000; // 30 min

function statusPath(projectDir: string): string {
  return path.join(projectDir, AGENT_STATUS_JSON);
}

function ensureDir(projectDir: string): void {
  const dir = path.join(projectDir, STATE_DISPATCH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function defaultState(): AgentState {
  return { status: 'available', consecutiveFailures: 0, lastFailure: null, cooldownUntil: null };
}

function loadStore(projectDir: string): AgentStatusStore {
  const { data } = readJSON<AgentStatusStore>(statusPath(projectDir));
  return data || { schemaVersion: 1, agents: {} };
}

function saveStore(projectDir: string, store: AgentStatusStore): void {
  ensureDir(projectDir);
  atomicWriteJSON(statusPath(projectDir), store);
}

/** 检查 agent 是否可用（自动解除过期 cooldown） */
export function isAgentAvailable(projectDir: string, agent: string): boolean {
  const store = loadStore(projectDir);
  const state = store.agents[agent] || defaultState();

  if (state.status === 'available') return true;

  // 检查 cooldown 是否已过期
  if (state.cooldownUntil && new Date(state.cooldownUntil).getTime() <= Date.now()) {
    state.status = 'available';
    state.consecutiveFailures = 0;
    state.cooldownUntil = null;
    store.agents[agent] = state;
    saveStore(projectDir, store);
    return true;
  }

  return false;
}

/** 记录 agent 执行成功 — 重置失败计数 */
export function recordSuccess(projectDir: string, agent: string): void {
  const store = loadStore(projectDir);
  store.agents[agent] = defaultState();
  saveStore(projectDir, store);
}

/** 记录 agent 执行失败 — 连续失败达阈值时进入 cooldown */
export function recordFailure(projectDir: string, agent: string): void {
  const store = loadStore(projectDir);
  const state = store.agents[agent] || defaultState();
  state.consecutiveFailures++;
  state.lastFailure = new Date().toISOString();

  if (state.consecutiveFailures >= FAILURE_THRESHOLD) {
    state.status = 'cooldown';
    state.cooldownUntil = new Date(Date.now() + COOLDOWN_DURATION_MS).toISOString();
  }

  store.agents[agent] = state;
  saveStore(projectDir, store);
}

/** 获取第一个可用的 agent（按优先级） */
export function getAvailableAgent(projectDir: string, preferred: string, fallbacks: string[]): string | null {
  if (isAgentAvailable(projectDir, preferred)) return preferred;
  for (const fb of fallbacks) {
    if (isAgentAvailable(projectDir, fb)) return fb;
  }
  return null;
}

/** 获取所有 agent 状态（用于展示） */
export function getAllStatus(projectDir: string): Record<string, AgentState> {
  const store = loadStore(projectDir);
  return store.agents;
}
