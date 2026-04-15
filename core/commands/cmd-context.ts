/**
 * Command handlers: context
 * v3.9.1: 精简为 summary 只保留实际使用的功能
 */
import { summarizeFile } from '../context/summary-cache.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleContext(args: string[], projectDir: string): any {
  const sub = args[1];

  if (sub === 'summary') {
    if (!args[2]) throw new Error('Usage: context summary <file>');
    return summarizeFile(projectDir, args[2]);
  }
  throw new Error(`Unknown context subcommand: ${sub}. Available: summary`);
}
