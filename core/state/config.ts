// core/state/config.ts
import path from 'path';
import { readJSON } from './atomic.js';
import type { HarnessConfig } from '../types.js';
import { HARNESS_JSON } from '../paths.js';

export const DEFAULTS: HarnessConfig = {
  schemaVersion: 2,
  context: { advisoryThreshold: 30, compressThreshold: 50, criticalThreshold: 70 },
  validation: { mode: 'strict', maxAttempts: 2, gates: ['lint', 'typecheck', 'test'], onFinalFail: 'block' },
  routing: {
    confirmThreshold: 90, codexMinSpecScore: 80, codexMinIsolationScore: 70, defaultTarget: 'claude-code',
    opencodeGptModel: 'gpt-5.4-mini',
    opencodeGptProviders: ['github-copilot', 'openai'],
    ccSubagent: {
      sonnet: 'claude-sonnet-4-6',
      haiku: 'claude-haiku-4-5-20251001',
    },
  },
  recovery: { lowRiskStrategy: 'checkpoint', highRiskThreshold: 70, highRiskStrategy: 'worktree' },
};

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(
        (target[key] || {}) as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function loadConfig(projectDir: string): HarnessConfig {
  const defaults = JSON.parse(JSON.stringify(DEFAULTS)) as Record<string, unknown>;
  const { data: userConfig, error } = readJSON<Record<string, unknown>>(
    path.join(projectDir, HARNESS_JSON),
  );
  if (error && error.code !== 'ENOENT') throw error;
  return (userConfig
    ? deepMerge(defaults, userConfig)
    : defaults) as unknown as HarnessConfig;
}
