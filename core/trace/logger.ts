import fs from 'fs';
import path from 'path';

export interface TraceEntry {
  time: string;
  command: string;
  result: 'ok' | 'error';
  duration_ms: number;
  error?: string;
  taskId?: string;
  phase?: string;
}

const MAX_SIZE = 1024 * 1024; // 1MB

export function appendTrace(projectDir: string, entry: TraceEntry): void {
  const logDir = path.join(projectDir, '.ham-autocode', 'logs');
  const logFile = path.join(logDir, 'trace.jsonl');

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
  const logFile = path.join(projectDir, '.ham-autocode', 'logs', 'trace.jsonl');
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
