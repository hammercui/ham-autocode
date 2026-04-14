// core/context/incremental.ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { atomicWriteJSON, readJSON } from '../state/atomic.js';

interface FileSnapshot {
  hash: string;
  loadedAt: string;
  tokens: number;
}

export interface ContextSnapshot {
  schemaVersion: number;
  updatedAt: string;
  files: Record<string, FileSnapshot>;
}

export interface IncrementalResult {
  newFiles: string[];
  changedFiles: string[];
  unchanged: string[];
  tokensSaved: number;
}

function snapshotPath(projectDir: string): string {
  return path.join(projectDir, '.ham-autocode', 'context', 'snapshot.json');
}

function computeHash(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('md5').update(content).digest('hex').slice(0, 12);
  } catch {
    return '';
  }
}

export function loadSnapshot(projectDir: string): ContextSnapshot {
  const { data } = readJSON<ContextSnapshot>(snapshotPath(projectDir));
  return data || { schemaVersion: 1, updatedAt: '', files: {} };
}

export function saveSnapshot(projectDir: string, snapshot: ContextSnapshot): void {
  snapshot.updatedAt = new Date().toISOString();
  const dir = path.dirname(snapshotPath(projectDir));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  atomicWriteJSON(snapshotPath(projectDir), snapshot);
}

/**
 * Compare current file list against last snapshot, find incremental changes.
 * Only new + changed files need loading; unchanged can be skipped.
 */
export function prepareIncremental(projectDir: string, requiredFiles: string[]): IncrementalResult {
  const snapshot = loadSnapshot(projectDir);
  const newFiles: string[] = [];
  const changedFiles: string[] = [];
  const unchanged: string[] = [];
  let tokensSaved = 0;

  for (const file of requiredFiles) {
    const fullPath = path.resolve(projectDir, file);
    const currentHash = computeHash(fullPath);
    const prev = snapshot.files[file];

    if (!prev) {
      newFiles.push(file);
    } else if (prev.hash !== currentHash) {
      changedFiles.push(file);
    } else {
      unchanged.push(file);
      tokensSaved += prev.tokens;
    }
  }

  // Update snapshot with current hashes
  const newSnapshot: ContextSnapshot = { ...snapshot, files: { ...snapshot.files } };
  for (const file of [...newFiles, ...changedFiles]) {
    const fullPath = path.resolve(projectDir, file);
    const hash = computeHash(fullPath);
    try {
      const tokens = Math.ceil(fs.readFileSync(fullPath, 'utf8').length / 4);
      newSnapshot.files[file] = { hash, loadedAt: new Date().toISOString(), tokens };
    } catch {
      /* skip unreadable files */
    }
  }
  saveSnapshot(projectDir, newSnapshot);

  return { newFiles, changedFiles, unchanged, tokensSaved };
}
