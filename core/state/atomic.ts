// core/state/atomic.ts
import fs from 'fs';
import path from 'path';
import type { ReadJSONResult } from '../types.js';

export function atomicWriteJSON(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

export function readJSON<T = unknown>(filePath: string): ReadJSONResult<T> {
  try {
    return { data: JSON.parse(fs.readFileSync(filePath, 'utf8')) as T, error: null };
  } catch (error) {
    return { data: null, error: error as NodeJS.ErrnoException };
  }
}
