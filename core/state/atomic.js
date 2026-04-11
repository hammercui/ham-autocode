// core/state/atomic.js
'use strict';
const fs = require('fs');
const path = require('path');

function atomicWriteJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

function readJSON(filePath) {
  try {
    return { data: JSON.parse(fs.readFileSync(filePath, 'utf8')), error: null };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { data: null, error };
    }
    return { data: null, error };
  }
}

module.exports = { atomicWriteJSON, readJSON };
