// core/state/config.js
'use strict';
const path = require('path');
const { readJSON } = require('./atomic');

const DEFAULTS = {
  schemaVersion: 2,
  context: { advisoryThreshold: 30, compressThreshold: 50, criticalThreshold: 70 },
  validation: { mode: 'strict', maxAttempts: 2, gates: ['lint', 'typecheck', 'test'], onFinalFail: 'block' },
  routing: { confirmThreshold: 90, codexMinSpecScore: 80, codexMinIsolationScore: 70, defaultTarget: 'claude-code' },
  recovery: { lowRiskStrategy: 'checkpoint', highRiskThreshold: 70, highRiskStrategy: 'worktree' },
};

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function loadConfig(projectDir) {
  const defaults = JSON.parse(JSON.stringify(DEFAULTS));
  const { data: userConfig, error } = readJSON(path.join(projectDir, '.ham-autocode', 'harness.json'));
  if (error && error.code !== 'ENOENT') throw error;
  return userConfig ? deepMerge(defaults, userConfig) : defaults;
}

module.exports = { loadConfig, DEFAULTS };
