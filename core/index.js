#!/usr/bin/env node
'use strict';

const path = require('path');

const modules = {
  config: () => require('./state/config'),
  pipeline: () => require('./state/pipeline'),
  taskGraph: () => require('./state/task-graph'),
  scheduler: () => require('./dag/scheduler'),
  parser: () => require('./dag/parser'),
  budget: () => require('./context/budget'),
  manager: () => require('./context/manager'),
  router: () => require('./routing/router'),
  detector: () => require('./validation/detector'),
  gates: () => require('./validation/gates'),
  checkpoint: () => require('./recovery/checkpoint'),
  worktree: () => require('./recovery/worktree'),
  token: () => require('./utils/token'),
};

function usage() {
  return `ham-autocode core engine v2.0

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
  context budget
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
  token estimate <file>
  token index [dir]
  help`;
}

function setTaskState(projectDir, taskId, status, extra) {
  return modules.taskGraph().updateTaskStatus(projectDir, taskId, status, extra);
}

function validateConfigShape(config) {
  const errors = [];
  const ranges = [
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

function dispatch(args, projectDir) {
  if (!args.length) return usage();

  const cmd = args[0];
  const sub = args[1];

  switch (cmd) {
    case 'config': {
      const configModule = modules.config();
      if (sub === 'show') {
        return configModule.loadConfig(projectDir);
      }
      if (sub === 'validate') {
        const config = configModule.loadConfig(projectDir);
        return validateConfigShape(config);
      }
      throw new Error(`Unknown config subcommand: ${sub}`);
    }

    case 'pipeline': {
      const pipeline = modules.pipeline();
      if (sub === 'init') {
        const name = args[2] || path.basename(projectDir);
        return pipeline.initPipeline(projectDir, name);
      }
      if (sub === 'status') {
        const data = pipeline.readPipeline(projectDir);
        if (!data) throw new Error('No pipeline found');
        return data;
      }
      if (sub === 'log') {
        const action = args.slice(2).join(' ');
        pipeline.appendLog(projectDir, action);
        return { ok: true, action };
      }
      if (sub === 'pause') {
        return pipeline.setPipelineStatus(projectDir, 'paused', { paused_at: new Date().toISOString() });
      }
      if (sub === 'resume') {
        return pipeline.setPipelineStatus(projectDir, 'running', { resumed_at: new Date().toISOString() });
      }
      if (sub === 'mark-interrupted') {
        try {
          return pipeline.setPipelineStatus(projectDir, 'interrupted', { interrupted_at: new Date().toISOString() });
        } catch {
          return { ok: false, reason: 'no pipeline or not running' };
        }
      }
      throw new Error(`Unknown pipeline subcommand: ${sub}`);
    }

    case 'dag': {
      const tg = modules.taskGraph();
      const scheduler = modules.scheduler();

      if (sub === 'init') {
        const result = modules.parser().initTasksFromPlan(projectDir, args[2], args[3], args[4]);
        return { planFile: result.planFile, count: result.count, tasks: result.tasks.map(t => t.id) };
      }
      if (sub === 'next-wave') {
        const tasks = tg.readAllTasks(projectDir);
        return scheduler.nextWave(tasks).map(t => ({ id: t.id, name: t.name }));
      }
      if (sub === 'complete') {
        return setTaskState(projectDir, args[2], 'done', { execution: { completedAt: new Date().toISOString() } });
      }
      if (sub === 'fail') {
        const taskId = args[2];
        const errorType = args[3];
        if (!taskId || !errorType) throw new Error('Usage: dag fail <task-id> <error-type>');
        return setTaskState(projectDir, taskId, 'failed', {
          execution: {
            completedAt: new Date().toISOString(),
            errorType,
            error: errorType,
          },
        });
      }
      if (sub === 'retry') {
        const task = tg.readTask(projectDir, args[2]);
        if (!task) throw new Error(`Task ${args[2]} not found`);
        task.status = 'pending';
        task.execution = { ...(task.execution || {}), error: null, errorType: null, completedAt: null };
        task.validation = { ...(task.validation || {}), attempts: 0, results: [] };
        tg.writeTask(projectDir, task);
        return task;
      }
      if (sub === 'skip') {
        return setTaskState(projectDir, args[2], 'skipped');
      }
      if (sub === 'unblock') {
        const task = tg.readTask(projectDir, args[2]);
        if (!task) throw new Error(`Task ${args[2]} not found`);
        task.status = 'pending';
        task.blockedBy = [];
        tg.writeTask(projectDir, task);
        return task;
      }
      if (sub === 'status') {
        return scheduler.dagStats(tg.readAllTasks(projectDir));
      }
      throw new Error(`Unknown dag subcommand: ${sub}`);
    }

    case 'context': {
      const { ContextBudget } = modules.budget();
      if (sub === 'budget') {
        return new ContextBudget(projectDir).status();
      }
      if (sub === 'prepare') {
        const taskId = args[2];
        if (!taskId) throw new Error('Usage: context prepare <task-id>');
        const task = modules.taskGraph().readTask(projectDir, taskId);
        if (!task) throw new Error(`Task ${taskId} not found`);
        const { ContextManager } = modules.manager();
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
      const router = modules.router();
      const tg = modules.taskGraph();

      if (sub === 'batch') {
        return router.routeAllTasks(tg.readAllTasks(projectDir), projectDir)
          .map(task => ({ id: task.id, routing: task.routing }));
      }
      if (sub === 'confirm') {
        const taskId = args[2];
        if (!taskId) throw new Error('Usage: route confirm <task-id>');
        const task = tg.readTask(projectDir, taskId);
        if (!task) throw new Error(`Task ${taskId} not found`);
        task.routing = { ...(task.routing || {}), confirmed: true, needsConfirmation: false };
        tg.writeTask(projectDir, task);
        return task.routing;
      }

      const taskId = sub;
      if (!taskId) throw new Error('Usage: route <task-id>');
      const task = tg.readTask(projectDir, taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      return modules.router().routeTask(task, tg.readAllTasks(projectDir), projectDir);
    }

    case 'validate': {
      const gates = modules.gates();
      if (sub === 'detect') {
        return modules.detector().detectGates(projectDir);
      }

      const taskId = sub;
      if (!taskId) throw new Error('Usage: validate <task-id>');
      const tg = modules.taskGraph();
      const task = tg.readTask(projectDir, taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      const result = gates.validateTask(task, projectDir);
      task.validation = {
        ...(task.validation || {}),
        attempts: result.attempts,
        maxAttempts: result.maxAttempts,
        results: result.results,
        gates: result.gates,
      };
      tg.writeTask(projectDir, task);
      return result;
    }

    case 'recover': {
      if (!sub) throw new Error('Usage: recover <subcommand> <task-id>. Subcommands: checkpoint, rollback, worktree-create, worktree-merge, worktree-remove');
      const tg = modules.taskGraph();
      const checkpoint = modules.checkpoint();
      const worktree = modules.worktree();
      const taskId = args[2];
      if (!taskId) throw new Error(`Usage: recover ${sub} <task-id>`);
      const task = tg.readTask(projectDir, taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);

      if (sub === 'checkpoint') {
        const result = checkpoint.createCheckpoint(taskId, projectDir);
        if (result.ok) {
          task.recovery = { ...(task.recovery || {}), strategy: 'checkpoint', checkpointRef: result.ref };
          tg.writeTask(projectDir, task);
        }
        return result;
      }
      if (sub === 'rollback') {
        const ref = task.recovery?.checkpointRef;
        if (!ref) throw new Error(`Task ${taskId} has no checkpoint`);
        return checkpoint.rollbackToCheckpoint(ref, projectDir, task.files || []);
      }
      if (sub === 'worktree-create') {
        const result = worktree.createWorktree(taskId, projectDir);
        if (result.ok) {
          task.recovery = { ...(task.recovery || {}), strategy: 'worktree', worktreePath: result.path, branch: result.branch };
          tg.writeTask(projectDir, task);
        }
        return result;
      }
      if (sub === 'worktree-merge') {
        return worktree.mergeWorktree(taskId, projectDir);
      }
      if (sub === 'worktree-remove') {
        return worktree.removeWorktree(taskId, projectDir);
      }
      throw new Error(`Unknown recover subcommand: ${sub}`);
    }

    case 'token': {
      if (sub === 'estimate') {
        const file = args[2];
        if (!file) throw new Error('Usage: token estimate <file>');
        return { file, tokens: modules.token().estimateFileTokens(file) };
      }
      if (sub === 'index') {
        return modules.token().buildFileIndex(args[2] || projectDir);
      }
      throw new Error(`Unknown token subcommand: ${sub}`);
    }

    case 'help':
      return usage();

    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
}

function formatOutput(result) {
  return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}

function main(argv = process.argv.slice(2), env = process.env) {
  const projectDir = env.HAM_PROJECT_DIR || process.cwd();
  try {
    const result = dispatch(argv, projectDir);
    if (typeof result !== 'undefined') {
      console.log(formatOutput(result));
    }
    return 0;
  } catch (e) {
    console.error(`Error: ${e.message}`);
    return 1;
  }
}

module.exports = { usage, dispatch, main };

if (require.main === module) {
  process.exit(main());
}
