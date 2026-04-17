/**
 * Command handlers: learn
 * v3.9.1: 精简为 brain + entities + status，删除 analyzer/adapter/patterns/guard/field-test/deps
 */
import { autoLearnStatus } from '../learning/auto-learn.js';
import { readBrain, evolveFromScan, getBrainDetail } from '../learning/project-brain.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleLearn(args: string[], projectDir: string): any {
  const sub = args[1];

  if (sub === 'status') return autoLearnStatus(projectDir);
  if (sub === 'brain') return readBrain(projectDir);
  if (sub === 'detail') {
    const topic = args[2] || 'all';
    return getBrainDetail(projectDir, topic);
  }
  if (sub === 'scan') { evolveFromScan(projectDir); return readBrain(projectDir); }
  throw new Error(`Unknown learn subcommand: ${sub}. Available: status|brain|detail|scan`);
}
