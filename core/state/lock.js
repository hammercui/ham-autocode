// core/state/lock.js
'use strict';
const fs = require('fs');
const path = require('path');

const LOCK_DIR = '.lock';
const LOCK_TIMEOUT = 5000; // ms

function acquireLock(stateDir) {
  const lockPath = path.join(stateDir, LOCK_DIR);
  const start = Date.now();
  while (Date.now() - start < LOCK_TIMEOUT) {
    try {
      fs.mkdirSync(lockPath, { recursive: false });
      return true;
    } catch (e) {
      if (e.code === 'EEXIST') {
        // Check if stale (> 30s old)
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > 30000) {
            fs.rmdirSync(lockPath);
            continue;
          }
        } catch { /* ignore */ }
        // Wait and retry
        // Busy-wait with small sleep (cross-platform, no SharedArrayBuffer needed)
        const wait = Math.floor(Math.random() * 100) + 50;
        const end = Date.now() + wait;
        while (Date.now() < end) { /* spin */ }
        continue;
      }
      throw e;
    }
  }
  return false;
}

function releaseLock(stateDir) {
  const lockPath = path.join(stateDir, LOCK_DIR);
  try { fs.rmdirSync(lockPath); } catch { /* already released */ }
}

function withLock(stateDir, fn) {
  if (!acquireLock(stateDir)) throw new Error('Failed to acquire state lock');
  try { return fn(); } finally { releaseLock(stateDir); }
}

module.exports = { acquireLock, releaseLock, withLock };
