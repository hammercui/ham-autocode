#!/usr/bin/env node

/**
 * ham-autocode CLI dispatcher — thin entry point.
 * Command logic lives in core/commands/cmd-*.ts (read only what you need).
 */

import { appendTrace } from './trace/logger.js';
import { handleConfig, handlePipeline } from './commands/cmd-pipeline.js';
import { handleDag } from './commands/cmd-dag.js';
import { handleContext } from './commands/cmd-context.js';
import { handleRoute, handleTeams, handleQuota } from './commands/cmd-route.js';
import { handleExecute, handleValidate, handleRecover } from './commands/cmd-execute.js';
import { handleLearn } from './commands/cmd-learn.js';
import { handleHealth, handleResearch } from './commands/cmd-health.js';
import { handleTraceCmd, handleSession, handleCommit, handleRules, handleSpec, handleToken } from './commands/cmd-misc.js';

function usage(): string {
  return `ham-autocode v3.3

Commands:
  config show|validate          pipeline init|status|log|pause|resume
  dag init|status|complete|fail|next-wave|visualize|gantt|evm
  context prepare|budget|summary|search    route <id>|batch|confirm
  validate detect|<id>          recover checkpoint|rollback|worktree-*
  execute prepare               learn analyze|suggest|brain|entities|field-test
  health check|quick|drift|uncommitted|esm-cjs   quota status|mark-*
  session report|context        research init|report|status
  commit auto|rollback|message  teams assign|should-use
  rules list|check              spec detect|enrich|score|sync
  token estimate|index          help`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (args: string[], projectDir: string) => any;

const handlers: Record<string, Handler> = {
  config: handleConfig,
  pipeline: handlePipeline,
  dag: handleDag,
  context: handleContext,
  route: handleRoute,
  validate: handleValidate,
  recover: handleRecover,
  execute: handleExecute,
  trace: handleTraceCmd,
  session: handleSession,
  commit: handleCommit,
  teams: handleTeams,
  rules: handleRules,
  spec: handleSpec,
  learn: handleLearn,
  research: handleResearch,
  health: handleHealth,
  quota: handleQuota,
  token: handleToken,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dispatch(args: string[], projectDir: string): any {
  if (!args.length) return usage();
  const cmd = args[0];
  if (cmd === 'help') return usage();
  const handler = handlers[cmd];
  if (!handler) throw new Error(`Unknown command: ${cmd}. Run "help" for available commands.`);
  return handler(args, projectDir);
}

function formatOutput(result: unknown): string {
  return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}

export function main(argv: string[] = process.argv.slice(2), env: Record<string, string | undefined> = process.env): number {
  const projectDir = env.HAM_PROJECT_DIR || process.cwd();
  const startTime = Date.now();
  const command = argv.join(' ');
  try {
    const result = dispatch(argv, projectDir);
    if (typeof result !== 'undefined') console.log(formatOutput(result));
    appendTrace(projectDir, { time: new Date().toISOString(), command, result: 'ok', duration_ms: Date.now() - startTime });
    return 0;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Error: ${msg}`);
    appendTrace(projectDir, { time: new Date().toISOString(), command, result: 'error', duration_ms: Date.now() - startTime, error: msg });
    return 1;
  }
}

export { usage, dispatch };

const isMain = process.argv[1] && (
  process.argv[1].endsWith('index.js') ||
  process.argv[1].endsWith('index.ts')
);
if (isMain) process.exit(main());
