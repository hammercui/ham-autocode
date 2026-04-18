/**
 * v4.2 A/B Routing Log — 记录 R2 随机档 (opencode vs cc-haiku) 的选择与结果。
 * 离线统计：ham-cli routing ab-stats
 */
import fs from 'fs';
import path from 'path';
import { ROUTING_AB_LOG, STATE_ROUTING } from '../paths.js';
import type { RoutingTarget } from '../types.js';

export type AbBucket = Extract<RoutingTarget, 'opencode' | 'cc-haiku'>;

export interface AbLogEntry {
  ts: number;
  taskId: string;
  bucket: AbBucket;
  complexity: number;
  files: number;
  /** 回填字段 — runner 完成后更新 */
  result?: 'ok' | 'fail';
  tokens?: number;
  durationMs?: number;
}

/** 随机选择 opencode 或 cc-haiku，50/50。返回选择并写入日志。 */
export function pickRandomSimple(
  projectDir: string,
  taskId: string,
  complexity: number,
  files: number,
): AbBucket {
  const bucket: AbBucket = Math.random() < 0.5 ? 'opencode' : 'cc-haiku';
  const entry: AbLogEntry = { ts: Date.now(), taskId, bucket, complexity, files };
  appendLog(projectDir, entry);
  return bucket;
}

function appendLog(projectDir: string, entry: AbLogEntry): void {
  try {
    const dir = path.join(projectDir, STATE_ROUTING);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(projectDir, ROUTING_AB_LOG), JSON.stringify(entry) + '\n');
  } catch { /* best-effort logging */ }
}

/** 回填某任务的执行结果（按最后一条同 taskId 的记录） */
export function recordResult(
  projectDir: string,
  taskId: string,
  result: 'ok' | 'fail',
  tokens?: number,
  durationMs?: number,
): void {
  const file = path.join(projectDir, ROUTING_AB_LOG);
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
  // 找最后一条 taskId 匹配且未回填的
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const e: AbLogEntry = JSON.parse(lines[i]);
      if (e.taskId === taskId && !e.result) {
        e.result = result;
        if (tokens !== undefined) e.tokens = tokens;
        if (durationMs !== undefined) e.durationMs = durationMs;
        lines[i] = JSON.stringify(e);
        fs.writeFileSync(file, lines.join('\n') + '\n');
        return;
      }
    } catch { /* skip */ }
  }
}

export interface AbStats {
  bucket: AbBucket;
  n: number;
  okRate: number;
  avgTokens: number;
  avgDurationMs: number;
}

export function abStats(projectDir: string): AbStats[] {
  const file = path.join(projectDir, ROUTING_AB_LOG);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
  const buckets: Record<AbBucket, AbLogEntry[]> = { opencode: [], 'cc-haiku': [] };
  for (const line of lines) {
    try {
      const e: AbLogEntry = JSON.parse(line);
      if (e.bucket in buckets) buckets[e.bucket].push(e);
    } catch { /* skip */ }
  }
  return (Object.keys(buckets) as AbBucket[]).map(b => {
    const arr = buckets[b];
    const withResult = arr.filter(e => e.result);
    const ok = withResult.filter(e => e.result === 'ok').length;
    const tokens = withResult.filter(e => typeof e.tokens === 'number').map(e => e.tokens as number);
    const dur = withResult.filter(e => typeof e.durationMs === 'number').map(e => e.durationMs as number);
    return {
      bucket: b,
      n: arr.length,
      okRate: withResult.length ? ok / withResult.length : 0,
      avgTokens: tokens.length ? tokens.reduce((a, c) => a + c, 0) / tokens.length : 0,
      avgDurationMs: dur.length ? dur.reduce((a, c) => a + c, 0) / dur.length : 0,
    };
  });
}
