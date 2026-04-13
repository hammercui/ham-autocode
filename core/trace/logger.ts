import fs from 'fs';
import path from 'path';

export interface TraceEntry {
  time: string;
  command: string;
  result: 'ok' | 'error';
  duration_ms: number;
  error?: string;
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
