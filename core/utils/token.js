// core/utils/token.js
'use strict';
const fs = require('fs');
const path = require('path');

/** Estimate token count from text (chars / 4, ~20-30% error margin) */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Estimate tokens for a file by path */
function estimateFileTokens(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return estimateTokens(content);
  } catch {
    return 0;
  }
}

/** Build file index with token estimates for a directory */
function buildFileIndex(rootDir, extensions = ['.js', '.ts', '.py', '.md', '.json']) {
  const index = {};
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        walk(full);
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        const rel = path.relative(rootDir, full).replace(/\\/g, '/');
        index[rel] = { tokens: estimateFileTokens(full), size: fs.statSync(full).size };
      }
    }
  }
  walk(rootDir);
  return index;
}

module.exports = { estimateTokens, estimateFileTokens, buildFileIndex };
