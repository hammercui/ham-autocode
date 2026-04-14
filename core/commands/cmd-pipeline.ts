/**
 * Command handlers: config, pipeline
 */
import path from 'path';
import { loadConfig } from '../state/config.js';
import { readPipeline, initPipeline, appendLog, setPipelineStatus } from '../state/pipeline.js';
import type { HarnessConfig, PipelineStatus } from '../types.js';

function validateConfigShape(config: HarnessConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const ranges: [string, unknown][] = [
    ['context.advisoryThreshold', config.context?.advisoryThreshold],
    ['context.compressThreshold', config.context?.compressThreshold],
    ['context.criticalThreshold', config.context?.criticalThreshold],
    ['validation.maxAttempts', config.validation?.maxAttempts],
    ['routing.confirmThreshold', config.routing?.confirmThreshold],
    ['routing.codexMinSpecScore', config.routing?.codexMinSpecScore],
    ['routing.codexMinIsolationScore', config.routing?.codexMinIsolationScore],
    ['recovery.highRiskThreshold', config.recovery?.highRiskThreshold],
  ];
  if (config.schemaVersion !== 2) errors.push('schemaVersion must equal 2');
  for (const [label, value] of ranges) {
    if (typeof value !== 'number') { errors.push(`${label} must be a number`); continue; }
    if (value < 0 || value > 100) errors.push(`${label} must be between 0 and 100`);
  }
  if (!Array.isArray(config.validation?.gates)) errors.push('validation.gates must be an array');
  return { valid: errors.length === 0, errors };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleConfig(args: string[], projectDir: string): any {
  const sub = args[1];
  if (sub === 'show') return loadConfig(projectDir);
  if (sub === 'validate') return validateConfigShape(loadConfig(projectDir));
  throw new Error(`Unknown config subcommand: ${sub}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handlePipeline(args: string[], projectDir: string): any {
  const sub = args[1];
  if (sub === 'init') {
    const name = args[2] || path.basename(projectDir);
    return initPipeline(projectDir, name);
  }
  if (sub === 'status') {
    const data = readPipeline(projectDir);
    if (!data) throw new Error('No pipeline found');
    return data;
  }
  if (sub === 'log') {
    const action = args.slice(2).join(' ');
    appendLog(projectDir, action);
    return { ok: true, action };
  }
  if (sub === 'pause') return setPipelineStatus(projectDir, 'paused' as PipelineStatus, { paused_at: new Date().toISOString() });
  if (sub === 'resume') return setPipelineStatus(projectDir, 'running' as PipelineStatus, { resumed_at: new Date().toISOString() });
  if (sub === 'mark-interrupted') {
    try { return setPipelineStatus(projectDir, 'interrupted' as PipelineStatus, { interrupted_at: new Date().toISOString() }); }
    catch { return { ok: false, reason: 'no pipeline or not running' }; }
  }
  throw new Error(`Unknown pipeline subcommand: ${sub}`);
}
