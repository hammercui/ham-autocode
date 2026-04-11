#!/usr/bin/env node
// core/index.js — CLI dispatcher for ham-autocode harness engine
'use strict';

const path = require('path');

// Module imports (lazy-loaded to keep CLI fast)
const modules = {
  config: () => require('./state/config'),
  pipeline: () => require('./state/pipeline'),
  taskGraph: () => require('./state/task-graph'),
  graph: () => require('./dag/graph'),
  scheduler: () => require('./dag/scheduler'),
  parser: () => require('./dag/parser'),
  budget: () => require('./context/budget'),
  manager: () => require('./context/manager'),
  scorer: () => require('./routing/scorer'),
  router: () => require('./routing/router'),
  detector: () => require('./validation/detector'),
  gates: () => require('./validation/gates'),
  checkpoint: () => require('./recovery/checkpoint'),
  worktree: () => require('./recovery/worktree'),
  token: () => require('./utils/token'),
  git: () => require('./utils/git'),
};

function usage() {
  return `ham-autocode core engine v2.0

Usage: node core/index.js <command> [subcommand] [options]

Commands:
  config show                   Show resolved configuration
  pipeline init <name>          Initialize pipeline for project
  pipeline status               Show pipeline status
  pipeline log <action>         Append to pipeline log
  dag status                    Show DAG task statistics
  dag next                      Get next executable wave
  dag parse <plan-file>         Parse plan file into tasks
  context budget                Show context budget status
  context estimate <task-id>    Estimate tokens for a task
  route <task-id>               Route a task to executor
  route all                     Route all pending tasks
  validate <project-dir>        Run validation gates
  validate detect               Detect available gates
  checkpoint create <task-id>   Create recovery checkpoint
  checkpoint list               List all checkpoints
  checkpoint rollback <ref>     Rollback to checkpoint
  checkpoint cleanup [task-id]  Clean up checkpoint tags
  worktree create <task-id>     Create isolated worktree
  worktree merge <task-id>      Merge worktree back
  worktree remove <task-id>     Remove worktree
  task read <task-id>           Read a specific task
  task list                     List all tasks
  task update <task-id> <status> Update task status
  token estimate <file>         Estimate tokens for a file
  token index [dir]             Build file token index
  help                          Show this help message`;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(usage());
    process.exit(0);
  }

  const projectDir = process.env.HAM_PROJECT_DIR || process.cwd();
  const cmd = args[0];
  const sub = args[1];

  try {
    switch (cmd) {
      case 'config': {
        if (sub === 'show') {
          const config = modules.config().loadConfig(projectDir);
          console.log(JSON.stringify(config, null, 2));
        } else {
          console.error(`Unknown config subcommand: ${sub}`);
          process.exit(1);
        }
        break;
      }

      case 'pipeline': {
        const { readPipeline, initPipeline, appendLog } = modules.pipeline();
        if (sub === 'init') {
          const name = args[2] || path.basename(projectDir);
          const data = initPipeline(projectDir, name);
          console.log(JSON.stringify(data, null, 2));
        } else if (sub === 'status') {
          const data = readPipeline(projectDir);
          if (!data) { console.log('No pipeline found'); process.exit(1); }
          console.log(JSON.stringify(data, null, 2));
        } else if (sub === 'log') {
          const action = args.slice(2).join(' ');
          appendLog(projectDir, action);
          console.log('Logged:', action);
        } else {
          console.error(`Unknown pipeline subcommand: ${sub}`);
          process.exit(1);
        }
        break;
      }

      case 'dag': {
        const { readAllTasks } = modules.taskGraph();
        const tasks = readAllTasks(projectDir);

        if (sub === 'status') {
          const stats = modules.scheduler().dagStats(tasks);
          console.log(JSON.stringify(stats, null, 2));
        } else if (sub === 'next') {
          const wave = modules.scheduler().nextWave(tasks);
          console.log(JSON.stringify(wave.map(t => ({ id: t.id, name: t.name })), null, 2));
        } else if (sub === 'parse') {
          const planFile = args[2];
          if (!planFile) { console.error('Usage: dag parse <plan-file>'); process.exit(1); }
          const fs = require('fs');
          const content = fs.readFileSync(planFile, 'utf8');
          const parsed = modules.parser().parsePlanToTasks(content, args[3], args[4]);
          console.log(JSON.stringify(parsed, null, 2));
        } else {
          console.error(`Unknown dag subcommand: ${sub}`);
          process.exit(1);
        }
        break;
      }

      case 'context': {
        if (sub === 'budget') {
          const { ContextBudget } = modules.budget();
          const budget = new ContextBudget(projectDir);
          console.log(JSON.stringify(budget.status(), null, 2));
        } else if (sub === 'estimate') {
          const taskId = args[2];
          if (!taskId) { console.error('Usage: context estimate <task-id>'); process.exit(1); }
          const task = modules.taskGraph().readTask(projectDir, taskId);
          if (!task) { console.error(`Task ${taskId} not found`); process.exit(1); }
          const { ContextManager } = modules.manager();
          const mgr = new ContextManager(projectDir);
          const tokens = mgr.estimateTask(task);
          console.log(JSON.stringify({ taskId, estimatedTokens: tokens }));
        } else {
          console.error(`Unknown context subcommand: ${sub}`);
          process.exit(1);
        }
        break;
      }

      case 'route': {
        const { routeTask, routeAllTasks } = modules.router();
        const { readAllTasks, readTask } = modules.taskGraph();

        if (sub === 'all') {
          const tasks = readAllTasks(projectDir);
          const routed = routeAllTasks(tasks, projectDir);
          console.log(JSON.stringify(routed.map(t => ({ id: t.id, target: t.routing.target, reason: t.routing.reason })), null, 2));
        } else {
          const taskId = sub;
          if (!taskId) { console.error('Usage: route <task-id>'); process.exit(1); }
          const task = readTask(projectDir, taskId);
          if (!task) { console.error(`Task ${taskId} not found`); process.exit(1); }
          const allTasks = readAllTasks(projectDir);
          const routing = routeTask(task, allTasks, projectDir);
          console.log(JSON.stringify(routing, null, 2));
        }
        break;
      }

      case 'validate': {
        if (sub === 'detect') {
          const gates = modules.detector().detectGates(projectDir);
          console.log(JSON.stringify(gates, null, 2));
        } else {
          const dir = sub || projectDir;
          const { runValidation } = modules.gates();
          const result = runValidation(dir, args.slice(2).length > 0 ? args.slice(2) : null);
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }

      case 'checkpoint': {
        const cp = modules.checkpoint();
        if (sub === 'create') {
          const taskId = args[2];
          if (!taskId) { console.error('Usage: checkpoint create <task-id>'); process.exit(1); }
          console.log(JSON.stringify(cp.createCheckpoint(taskId, projectDir)));
        } else if (sub === 'list') {
          console.log(JSON.stringify(cp.listCheckpoints(projectDir)));
        } else if (sub === 'rollback') {
          const ref = args[2];
          if (!ref) { console.error('Usage: checkpoint rollback <ref>'); process.exit(1); }
          console.log(JSON.stringify(cp.rollbackToCheckpoint(ref, projectDir)));
        } else if (sub === 'cleanup') {
          const taskId = args[2];
          const result = taskId ? cp.cleanupCheckpoints(taskId, projectDir) : cp.cleanupAllCheckpoints(projectDir);
          console.log(JSON.stringify(result));
        } else {
          console.error(`Unknown checkpoint subcommand: ${sub}`);
          process.exit(1);
        }
        break;
      }

      case 'worktree': {
        const wt = modules.worktree();
        if (sub === 'create') {
          const taskId = args[2];
          if (!taskId) { console.error('Usage: worktree create <task-id>'); process.exit(1); }
          console.log(JSON.stringify(wt.createWorktree(taskId, projectDir)));
        } else if (sub === 'merge') {
          const taskId = args[2];
          if (!taskId) { console.error('Usage: worktree merge <task-id>'); process.exit(1); }
          console.log(JSON.stringify(wt.mergeWorktree(taskId, projectDir)));
        } else if (sub === 'remove') {
          const taskId = args[2];
          if (!taskId) { console.error('Usage: worktree remove <task-id>'); process.exit(1); }
          console.log(JSON.stringify(wt.removeWorktree(taskId, projectDir)));
        } else {
          console.error(`Unknown worktree subcommand: ${sub}`);
          process.exit(1);
        }
        break;
      }

      case 'task': {
        const tg = modules.taskGraph();
        if (sub === 'read') {
          const taskId = args[2];
          if (!taskId) { console.error('Usage: task read <task-id>'); process.exit(1); }
          const task = tg.readTask(projectDir, taskId);
          if (!task) { console.error(`Task ${taskId} not found`); process.exit(1); }
          console.log(JSON.stringify(task, null, 2));
        } else if (sub === 'list') {
          const tasks = tg.readAllTasks(projectDir);
          console.log(JSON.stringify(tasks.map(t => ({ id: t.id, name: t.name, status: t.status, target: t.routing?.target })), null, 2));
        } else if (sub === 'update') {
          const taskId = args[2];
          const status = args[3];
          if (!taskId || !status) { console.error('Usage: task update <task-id> <status>'); process.exit(1); }
          const updated = tg.updateTaskStatus(projectDir, taskId, status);
          console.log(JSON.stringify(updated, null, 2));
        } else {
          console.error(`Unknown task subcommand: ${sub}`);
          process.exit(1);
        }
        break;
      }

      case 'help': {
        console.log(usage());
        break;
      }

      case 'token': {
        if (sub === 'estimate') {
          const file = args[2];
          if (!file) { console.error('Usage: token estimate <file>'); process.exit(1); }
          const tokens = modules.token().estimateFileTokens(file);
          console.log(JSON.stringify({ file, tokens }));
        } else if (sub === 'index') {
          const dir = args[2] || projectDir;
          const index = modules.token().buildFileIndex(dir);
          console.log(JSON.stringify(index, null, 2));
        } else {
          console.error(`Unknown token subcommand: ${sub}`);
          process.exit(1);
        }
        break;
      }

      default:
        console.error(`Unknown command: ${cmd}`);
        console.log(usage());
        process.exit(1);
    }
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

main();
