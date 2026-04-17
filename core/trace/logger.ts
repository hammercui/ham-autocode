import fs from 'fs';
import path from 'path';
import { STATE_LOGS, TRACE_JSONL } from '../paths.js';

export interface TraceEntry {
  time: string;
  command: string;
  result: 'ok' | 'error';
  duration_ms: number;
  error?: string;
  taskId?: string;
  phase?: string;
}

/** Agent 执行记录 — 追踪 codexfake/opencode 等外部 agent 的任务执行 */
export interface AgentExecEntry {
  time: string;
  taskId: string;
  taskName: string;
  agent: string;        // 'codexfake' | 'opencode' | 'claude-code' | 'agent-teams'
  model?: string;       // agent 使用的模型（如果已知）
  result: 'ok' | 'error';
  duration_ms: number;
  tokensIn?: number;    // 输入 token（如果可获取）
  tokensOut?: number;   // 输出 token（如果可获取）
  filesCreated?: number;
  filesModified?: number;
  error?: string;
}

const MAX_SIZE = 1024 * 1024; // 1MB

export function appendTrace(projectDir: string, entry: TraceEntry): void {
  const logDir = path.join(projectDir, STATE_LOGS);
  const logFile = path.join(projectDir, TRACE_JSONL);

  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    // Rotate if > 1MB
    if (fs.existsSync(logFile)) {
      const stat = fs.statSync(logFile);
      if (stat.size > MAX_SIZE) {
        const date = new Date().toISOString().split('T')[0];
        fs.renameSync(logFile, path.join(logDir, `trace-${date}.jsonl`));
      }
    }

    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch { /* trace is best-effort, never fail */ }
}

export function queryTrace(
  projectDir: string,
  filter?: { taskId?: string; result?: string; limit?: number },
): TraceEntry[] {
  const logFile = path.join(projectDir, TRACE_JSONL);
  const limit = filter?.limit ?? 50;

  if (!fs.existsSync(logFile)) return [];

  const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
  let entries: TraceEntry[] = [];

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as TraceEntry);
    } catch { /* skip malformed lines */ }
  }

  if (filter?.taskId) {
    entries = entries.filter(e => e.taskId === filter.taskId);
  }
  if (filter?.result) {
    entries = entries.filter(e => e.result === filter.result);
  }

  return entries.slice(-limit);
}

// ==================== Agent Execution Log ====================

const AGENT_LOG_FILE = 'agent-exec.jsonl';

/** 记录一次 agent 执行 */
export function appendAgentExec(projectDir: string, entry: AgentExecEntry): void {
  const logDir = path.join(projectDir, STATE_LOGS);
  const logFile = path.join(logDir, AGENT_LOG_FILE);

  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    if (fs.existsSync(logFile)) {
      const stat = fs.statSync(logFile);
      if (stat.size > MAX_SIZE) {
        const date = new Date().toISOString().split('T')[0];
        fs.renameSync(logFile, path.join(logDir, `agent-exec-${date}.jsonl`));
      }
    }

    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch { /* best-effort */ }
}

/** 查询 agent 执行记录 */
export function queryAgentExec(
  projectDir: string,
  filter?: { agent?: string; taskId?: string; limit?: number },
): AgentExecEntry[] {
  const logFile = path.join(projectDir, STATE_LOGS, AGENT_LOG_FILE);
  const limit = filter?.limit ?? 100;

  if (!fs.existsSync(logFile)) return [];

  const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
  let entries: AgentExecEntry[] = [];

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as AgentExecEntry);
    } catch { /* skip */ }
  }

  if (filter?.agent) entries = entries.filter(e => e.agent === filter.agent);
  if (filter?.taskId) entries = entries.filter(e => e.taskId === filter.taskId);

  return entries.slice(-limit);
}

/** 清除 agent-exec.jsonl 历史数据 */
export function resetAgentExecLog(projectDir: string): { cleared: boolean } {
  const logFile = path.join(projectDir, STATE_LOGS, AGENT_LOG_FILE);
  try {
    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile);
      return { cleared: true };
    }
  } catch { /* best-effort */ }
  return { cleared: false };
}

/** 解析 --since 参数为毫秒时间戳（如 "1h", "24h", "7d"） */
function parseSince(since: string): number {
  const m = since.match(/^(\d+)(s|m|h|d)$/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const ms = unit === 's' ? n * 1000
    : unit === 'm' ? n * 60000
    : unit === 'h' ? n * 3600000
    : n * 86400000;
  return Date.now() - ms;
}

/** 生成 agent 执行统计摘要 */
export function agentExecStats(projectDir: string, options?: { since?: string }): {
  total: number;
  filtered: boolean;
  byAgent: Record<string, { count: number; okCount: number; avgDurationSec: number; totalTokensIn: number; totalTokensOut: number }>;
  recentErrors: AgentExecEntry[];
} {
  let entries = queryAgentExec(projectDir, { limit: 999999 });

  // B2/I3: --since 时间窗口过滤
  const filtered = !!options?.since;
  if (options?.since) {
    const cutoff = parseSince(options.since);
    if (cutoff > 0) {
      entries = entries.filter(e => new Date(e.time).getTime() >= cutoff);
    }
  }
  const byAgent: Record<string, { count: number; okCount: number; totalDuration: number; totalTokensIn: number; totalTokensOut: number }> = {};

  for (const e of entries) {
    if (!byAgent[e.agent]) {
      byAgent[e.agent] = { count: 0, okCount: 0, totalDuration: 0, totalTokensIn: 0, totalTokensOut: 0 };
    }
    const a = byAgent[e.agent];
    a.count++;
    if (e.result === 'ok') a.okCount++;
    a.totalDuration += e.duration_ms;
    if (e.tokensIn) a.totalTokensIn += e.tokensIn;
    if (e.tokensOut) a.totalTokensOut += e.tokensOut;
  }

  const formatted: Record<string, { count: number; okCount: number; avgDurationSec: number; totalTokensIn: number; totalTokensOut: number }> = {};
  for (const [agent, data] of Object.entries(byAgent)) {
    formatted[agent] = {
      count: data.count,
      okCount: data.okCount,
      avgDurationSec: Math.round(data.totalDuration / data.count / 1000 * 10) / 10,
      totalTokensIn: data.totalTokensIn,
      totalTokensOut: data.totalTokensOut,
    };
  }

  const recentErrors = entries.filter(e => e.result === 'error').slice(-5);

  return { total: entries.length, filtered, byAgent: formatted, recentErrors };
}
