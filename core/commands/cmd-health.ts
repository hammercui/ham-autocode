/**
 * Command handlers: health, research
 */
import { runHealthCheck, quickHealthCheck } from '../health/checker.js';
import { detectDrift } from '../health/drift-detector.js';
import { analyzeUncommitted } from '../health/uncommitted-analyzer.js';
import { detectESMCJS } from '../health/esm-cjs-detector.js';
import { readAnalysis, initAnalysis, generateReport } from '../research/competitor.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleHealth(args: string[], projectDir: string): any {
  const sub = args[1];
  if (sub === 'check') return runHealthCheck(projectDir);
  if (sub === 'quick') return quickHealthCheck(projectDir);
  if (sub === 'drift') return detectDrift(projectDir);
  if (sub === 'uncommitted') return analyzeUncommitted(projectDir);
  if (sub === 'esm-cjs') return detectESMCJS(projectDir);
  throw new Error('Unknown health subcommand. Use: check, quick, drift, uncommitted, esm-cjs');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleResearch(args: string[], projectDir: string): any {
  const sub = args[1];
  if (sub === 'init') {
    const project = args[2], domain = args[3];
    if (!project || !domain) throw new Error('Usage: research init <project> <domain>');
    return initAnalysis(projectDir, project, domain);
  }
  if (sub === 'report') return generateReport(projectDir);
  if (sub === 'status') return readAnalysis(projectDir) || { status: 'No competitive analysis found. Run: research init <project> <domain>' };
  throw new Error(`Unknown research subcommand: ${sub}`);
}
