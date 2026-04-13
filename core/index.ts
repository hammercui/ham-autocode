#!/usr/bin/env node

import path from 'path';
import { loadConfig } from './state/config.js';
import { readPipeline, initPipeline, appendLog, setPipelineStatus, updatePipelineFields } from './state/pipeline.js';
import { readTask, writeTask, readAllTasks, updateTaskStatus } from './state/task-graph.js';
import { nextWave, dagStats } from './dag/scheduler.js';
import { initTasksFromPlan } from './dag/parser.js';
import { ContextBudget } from './context/budget.js';
import { ContextManager } from './context/manager.js';
import { routeTask, routeAllTasks, shouldUseAgentTeams } from './routing/router.js';
import { detectGates } from './validation/detector.js';
import { validateTask } from './validation/gates.js';
import { createCheckpoint, rollbackToCheckpoint as doRollback } from './recovery/checkpoint.js';
import { createWorktree, mergeWorktree, removeWorktree } from './recovery/worktree.js';
import { estimateFileTokens, buildFileIndex } from './utils/token.js';
import { ClaudeCodeAdapter } from './executor/claude-code.js';
import { CodexAdapter } from './executor/codex.js';
import { ClaudeAppAdapter } from './executor/claude-app.js';
import { AgentTeamsAdapter } from './executor/agent-teams.js';
import { appendTrace, queryTrace } from './trace/logger.js';
import { visualizeDAG } from './dag/visualize.js';
import { generateSessionReport } from './trace/report.js';
import { autoCommitTask, rollbackAutoCommit, generateCommitMessage } from './commit/auto-commit.js';
import { listRules, checkRules, checkRulesSummary } from './rules/engine.js';
import './rules/core-rules.js';
import { detectOpenSpec } from './spec/reader.js';
import { enrichAndSaveTask, enrichAllTasks, calculateSpecScore } from './spec/enricher.js';
import { syncSpec } from './spec/sync.js';
import { analyzeHistory } from './learning/analyzer.js';
import { suggestAdaptations, applyAdaptations, readLearningHistory, appendToHistory, resetLearning } from './learning/adapter.js';
import { learnPatterns, getPatternHints } from './learning/patterns.js';
import { onTaskComplete, autoLearnStatus } from './learning/auto-learn.js';
import { getBrainContext, readBrain, evolveFromScan } from './learning/project-brain.js';
import type { HarnessConfig, TaskStatus, PipelineStatus, ErrorType, RoutingTarget } from './types.js';

function usage(): string {
  return `ham-autocode core engine v3.0

Usage: node core/index.js <command> [subcommand] [options]

Commands:
  config show
  config validate
  pipeline init <name>
  pipeline status
  pipeline log <action>
  pipeline pause
  pipeline resume
  pipeline mark-interrupted
  dag init [plan-file] [milestone] [phase]
  dag next-wave
  dag complete <task-id>
  dag fail <task-id> <error-type>
  dag retry <task-id>
  dag skip <task-id>
  dag unblock <task-id>
  dag status
  context prepare <task-id>
  context budget [consume <amount>]
  route <task-id>
  route batch
  route confirm <task-id>
  validate detect
  validate <task-id>
  recover checkpoint <task-id>
  recover rollback <task-id>
  recover worktree-create <task-id>
  recover worktree-merge <task-id>
  recover worktree-remove <task-id>
  execute prepare <task-id>
  trace query [--task <id>] [--result ok|error] [--limit N]
  dag visualize
  session report
  commit auto <task-id>
  commit rollback
  commit message <task-id>
  teams assign
  teams should-use
  rules list
  rules check [task-id]
  spec detect
  spec enrich <task-id>
  spec enrich-all
  spec score <task-id>
  spec sync <task-id>
  learn analyze
  learn suggest
  learn apply
  learn patterns
  learn history
  learn reset
  token estimate <file>
  token index [dir]
  help`;
}

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
    if (typeof value !== 'number') {
      errors.push(`${label} must be a number`);
      continue;
    }
    if (value < 0 || value > 100) errors.push(`${label} must be between 0 and 100`);
  }

  if (!Array.isArray(config.validation?.gates)) {
    errors.push('validation.gates must be an array');
  }

  return { valid: errors.length === 0, errors };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dispatch(args: string[], projectDir: string): any {
  if (!args.length) return usage();

  const cmd = args[0];
  const sub = args[1];

  switch (cmd) {
    case 'config': {
      if (sub === 'show') {
        return loadConfig(projectDir);
      }
      if (sub === 'validate') {
        return validateConfigShape(loadConfig(projectDir));
      }
      throw new Error(`Unknown config subcommand: ${sub}`);
    }

    case 'pipeline': {
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
      if (sub === 'pause') {
        return setPipelineStatus(projectDir, 'paused' as PipelineStatus, { paused_at: new Date().toISOString() });
      }
      if (sub === 'resume') {
        return setPipelineStatus(projectDir, 'running' as PipelineStatus, { resumed_at: new Date().toISOString() });
      }
      if (sub === 'mark-interrupted') {
        try {
          return setPipelineStatus(projectDir, 'interrupted' as PipelineStatus, { interrupted_at: new Date().toISOString() });
        } catch {
          return { ok: false, reason: 'no pipeline or not running' };
        }
      }
      throw new Error(`Unknown pipeline subcommand: ${sub}`);
    }

    case 'dag': {
      if (sub === 'init') {
        const result = initTasksFromPlan(projectDir, args[2], args[3], args[4]);
        appendLog(projectDir, `dag init: ${result.count} tasks from ${result.planFile}`);
        return { planFile: result.planFile, count: result.count, tasks: result.tasks.map(t => t.id) };
      }
      if (sub === 'next-wave') {
        const tasks = readAllTasks(projectDir);
        return nextWave(tasks).map(t => ({ id: t.id, name: t.name }));
      }
      if (sub === 'complete') {
        const result = updateTaskStatus(projectDir, args[2], 'done' as TaskStatus, { execution: { completedAt: new Date().toISOString() } });
        appendLog(projectDir, `task ${args[2]} completed`);
        try { updatePipelineFields(projectDir, { current_task: null }); } catch { /* ignore */ }
        // v3.0 CE: auto-learn from every completion
        onTaskComplete(projectDir, args[2], true);
        return result;
      }
      if (sub === 'fail') {
        const taskId = args[2];
        const errorType = args[3];
        if (!taskId || !errorType) throw new Error('Usage: dag fail <task-id> <error-type>');
        const result = updateTaskStatus(projectDir, taskId, 'failed' as TaskStatus, {
          execution: {
            completedAt: new Date().toISOString(),
            errorType: errorType as ErrorType,
            error: errorType,
          },
        });
        appendLog(projectDir, `task ${taskId} failed: ${errorType}`);
        try { updatePipelineFields(projectDir, { current_task: null }); } catch { /* ignore */ }
        // v3.0 CE: auto-learn from every failure
        onTaskComplete(projectDir, taskId, false);
        return result;
      }
      if (sub === 'retry') {
        const task = readTask(projectDir, args[2]);
        if (!task) throw new Error(`Task ${args[2]} not found`);
        task.status = 'pending';
        task.execution = { ...(task.execution || {}), error: null, errorType: null, completedAt: null };
        task.validation = { ...(task.validation || {}), attempts: 0, results: [] };
        writeTask(projectDir, task);
        return task;
      }
      if (sub === 'skip') {
        const result = updateTaskStatus(projectDir, args[2], 'skipped' as TaskStatus);
        appendLog(projectDir, `task ${args[2]} skipped`);
        return result;
      }
      if (sub === 'unblock') {
        const task = readTask(projectDir, args[2]);
        if (!task) throw new Error(`Task ${args[2]} not found`);
        task.status = 'pending';
        task.blockedBy = [];
        writeTask(projectDir, task);
        return task;
      }
      if (sub === 'status') {
        return dagStats(readAllTasks(projectDir));
      }
      if (sub === 'visualize') {
        return visualizeDAG(readAllTasks(projectDir));
      }
      throw new Error(`Unknown dag subcommand: ${sub}`);
    }

    case 'context': {
      if (sub === 'budget') {
        const subSub = args[2];
        if (subSub === 'consume') {
          const amount = parseInt(args[3], 10);
          if (isNaN(amount) || amount < 0) throw new Error('Usage: context budget consume <amount>');
          const budget = new ContextBudget(projectDir);
          budget.consume(amount);
          return budget.status();
        }
        return new ContextBudget(projectDir).status();
      }
      if (sub === 'prepare') {
        const taskId = args[2];
        if (!taskId) throw new Error('Usage: context prepare <task-id>');
        const task = readTask(projectDir, taskId);
        if (!task) throw new Error(`Task ${taskId} not found`);
        const mgr = new ContextManager(projectDir);
        const prepared = mgr.prepareForTask(task);
        const budgetStatus = mgr.budgetStatus();
        return {
          taskId,
          requiredFiles: task.context?.requiredFiles || task.files || [],
          estimatedTokens: mgr.estimateTask(task),
          budgetRemaining: Math.max(0, 100 - budgetStatus.usagePercent),
          recommendation: prepared.recommendation,
        };
      }
      throw new Error(`Unknown context subcommand: ${sub}`);
    }

    case 'route': {
      if (sub === 'batch') {
        return routeAllTasks(readAllTasks(projectDir), projectDir)
          .map(task => ({ id: task.id, routing: task.routing }));
      }
      if (sub === 'confirm') {
        const taskId = args[2];
        if (!taskId) throw new Error('Usage: route confirm <task-id>');
        const task = readTask(projectDir, taskId);
        if (!task) throw new Error(`Task ${taskId} not found`);
        task.routing = { ...(task.routing || {} as any), confirmed: true, needsConfirmation: false };
        writeTask(projectDir, task);
        return task.routing;
      }

      const taskId = sub;
      if (!taskId) throw new Error('Usage: route <task-id>');
      const task = readTask(projectDir, taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      return routeTask(task, readAllTasks(projectDir), projectDir);
    }

    case 'validate': {
      if (sub === 'detect') {
        return detectGates(projectDir);
      }

      const taskId = sub;
      if (!taskId) throw new Error('Usage: validate <task-id>');
      const task = readTask(projectDir, taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      const result = validateTask(task, projectDir, doRollback);
      task.validation = {
        ...(task.validation || {}),
        attempts: result.attempts,
        maxAttempts: result.maxAttempts,
        results: result.results,
        gates: result.gates,
      };
      writeTask(projectDir, task);
      return result;
    }

    case 'recover': {
      if (!sub) throw new Error('Usage: recover <subcommand> <task-id>. Subcommands: checkpoint, rollback, worktree-create, worktree-merge, worktree-remove');
      const taskId = args[2];
      if (!taskId) throw new Error(`Usage: recover ${sub} <task-id>`);
      const task = readTask(projectDir, taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);

      if (sub === 'checkpoint') {
        const result = createCheckpoint(taskId, projectDir);
        if (result.ok) {
          task.recovery = { ...(task.recovery || {}), strategy: 'checkpoint', checkpointRef: result.ref };
          writeTask(projectDir, task);
        }
        return result;
      }
      if (sub === 'rollback') {
        const ref = task.recovery?.checkpointRef;
        if (!ref) throw new Error(`Task ${taskId} has no checkpoint`);
        return doRollback(ref, projectDir, task.files || []);
      }
      if (sub === 'worktree-create') {
        const result = createWorktree(taskId, projectDir);
        if (result.ok) {
          task.recovery = { ...(task.recovery || {}), strategy: 'worktree', worktreePath: result.path, branch: result.branch };
          writeTask(projectDir, task);
        }
        return result;
      }
      if (sub === 'worktree-merge') {
        return mergeWorktree(taskId, projectDir);
      }
      if (sub === 'worktree-remove') {
        return removeWorktree(taskId, projectDir);
      }
      throw new Error(`Unknown recover subcommand: ${sub}`);
    }

    case 'execute': {
      if (sub === 'prepare') {
        const taskId = args[2];
        if (!taskId) throw new Error('Usage: execute prepare <task-id>');
        const task = readTask(projectDir, taskId);
        if (!task) throw new Error(`Task ${taskId} not found`);
        const target: RoutingTarget = task.routing?.target || 'claude-code';
        const adapters: Record<RoutingTarget, { generateInstruction(t: typeof task): string }> = {
          'claude-code': new ClaudeCodeAdapter(),
          'codex': new CodexAdapter(),
          'claude-app': new ClaudeAppAdapter(),
          'agent-teams': new AgentTeamsAdapter(),
        };
        const adapter = adapters[target];
        if (!adapter) throw new Error(`Unknown routing target: ${target}`);
        const instruction = adapter.generateInstruction(task);
        // v3.0: inject project brain context into execution instruction
        const brainContext = getBrainContext(projectDir, task.name);
        const enrichedInstruction = brainContext
          ? instruction + '\n\n' + brainContext
          : instruction;
        return { taskId, target, instruction: enrichedInstruction };
      }
      throw new Error(`Unknown execute subcommand: ${sub}`);
    }

    case 'trace': {
      if (sub === 'query') {
        const filterArgs: { taskId?: string; result?: string; limit?: number } = {};
        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--task' && args[i + 1]) { filterArgs.taskId = args[++i]; }
          else if (args[i] === '--result' && args[i + 1]) { filterArgs.result = args[++i]; }
          else if (args[i] === '--limit' && args[i + 1]) { filterArgs.limit = parseInt(args[++i], 10); }
        }
        return queryTrace(projectDir, filterArgs);
      }
      throw new Error(`Unknown trace subcommand: ${sub}`);
    }

    case 'session': {
      if (sub === 'report') {
        return generateSessionReport(projectDir);
      }
      throw new Error(`Unknown session subcommand: ${sub}`);
    }

    case 'commit': {
      if (sub === 'auto') {
        const taskId = args[2];
        if (!taskId) throw new Error('Usage: commit auto <task-id>');
        const task = readTask(projectDir, taskId);
        if (!task) throw new Error(`Task ${taskId} not found`);
        return autoCommitTask(task, projectDir);
      }
      if (sub === 'rollback') {
        return rollbackAutoCommit(projectDir);
      }
      if (sub === 'message') {
        const taskId = args[2];
        if (!taskId) throw new Error('Usage: commit message <task-id>');
        const task = readTask(projectDir, taskId);
        if (!task) throw new Error(`Task ${taskId} not found`);
        return { message: generateCommitMessage(task) };
      }
      throw new Error(`Unknown commit subcommand: ${sub}`);
    }

    case 'teams': {
      if (sub === 'assign') {
        const tasks = readAllTasks(projectDir);
        const wave = nextWave(tasks);
        return AgentTeamsAdapter.assignTeammates(wave);
      }
      if (sub === 'should-use') {
        const tasks = readAllTasks(projectDir);
        const wave = nextWave(tasks);
        const config = loadConfig(projectDir);
        return { shouldUse: shouldUseAgentTeams(wave, config), waveSize: wave.length };
      }
      throw new Error('Unknown teams subcommand. Use: assign, should-use');
    }

    case 'rules': {
      if (sub === 'list') {
        return listRules();
      }
      if (sub === 'check') {
        const taskId = args[2];
        const task = taskId ? readTask(projectDir, taskId) : undefined;
        const tasks = readAllTasks(projectDir);
        const config = loadConfig(projectDir);
        const ctx = { projectDir, task: task || undefined, tasks, config, files: task?.files || [] };
        const results = checkRules(ctx);
        const summary = checkRulesSummary(results);
        return { results, summary };
      }
      throw new Error(`Unknown rules subcommand: ${sub}. Use: list, check [task-id]`);
    }

    case 'spec': {
      if (sub === 'detect') {
        return detectOpenSpec(projectDir);
      }
      if (sub === 'enrich') {
        const taskId = args[2];
        if (!taskId) throw new Error('Usage: spec enrich <task-id>');
        return enrichAndSaveTask(projectDir, taskId);
      }
      if (sub === 'enrich-all') {
        return enrichAllTasks(projectDir);
      }
      if (sub === 'score') {
        const taskId = args[2];
        if (!taskId) throw new Error('Usage: spec score <task-id>');
        const task = readTask(projectDir, taskId);
        if (!task) throw new Error(`Task ${taskId} not found`);
        return { taskId, specScore: calculateSpecScore(task.spec), spec: task.spec };
      }
      if (sub === 'sync') {
        const taskId = args[2];
        if (!taskId) throw new Error('Usage: spec sync <task-id>');
        const task = readTask(projectDir, taskId);
        if (!task) throw new Error(`Task ${taskId} not found`);
        return syncSpec(projectDir, taskId, task);
      }
      throw new Error(`Unknown spec subcommand: ${sub}. Use: detect, enrich, enrich-all, score, sync`);
    }

    case 'learn': {
      if (sub === 'analyze') {
        const insights = analyzeHistory(projectDir);
        appendToHistory(projectDir, insights);
        return insights;
      }
      if (sub === 'suggest') {
        return suggestAdaptations(projectDir);
      }
      if (sub === 'apply') {
        return applyAdaptations(projectDir);
      }
      if (sub === 'patterns') {
        return learnPatterns(projectDir);
      }
      if (sub === 'history') {
        return readLearningHistory(projectDir);
      }
      if (sub === 'reset') {
        return resetLearning(projectDir);
      }
      if (sub === 'status') {
        return autoLearnStatus(projectDir);
      }
      if (sub === 'brain') {
        return readBrain(projectDir);
      }
      if (sub === 'scan') {
        evolveFromScan(projectDir);
        return readBrain(projectDir);
      }
      if (sub === 'hints') {
        const taskName = args.slice(2).join(' ');
        if (!taskName) throw new Error('Usage: learn hints <task-name>');
        return getPatternHints(projectDir, taskName);
      }
      throw new Error(`Unknown learn subcommand: ${sub}. Use: analyze, suggest, apply, patterns, history, reset, hints`);
    }

    case 'token': {
      if (sub === 'estimate') {
        const file = args[2];
        if (!file) throw new Error('Usage: token estimate <file>');
        return { file, tokens: estimateFileTokens(file) };
      }
      if (sub === 'index') {
        return buildFileIndex(args[2] || projectDir);
      }
      throw new Error(`Unknown token subcommand: ${sub}`);
    }

    case 'help':
      return usage();

    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
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
    if (typeof result !== 'undefined') {
      console.log(formatOutput(result));
    }
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

// Run as CLI
const isMain = process.argv[1] && (
  process.argv[1].endsWith('index.js') ||
  process.argv[1].endsWith('index.ts')
);
if (isMain) {
  process.exit(main());
}
