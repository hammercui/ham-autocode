/**
 * Full-Auto Phase Loop — 24h 自治执行循环。
 *
 * 架构: Opus 写 spec → routeTask 路由 → execute auto 波次执行 → phase 推进
 * 三断点修复:
 *   1. spec 自动生成 (claude -p / Opus)
 *   2. phase 间自动推进
 *   3. deferred tasks 自动处理 (claude -p 直接执行)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { runAuto, type AutoRunOptions, type AutoRunResult } from './auto-runner.js';
import { generateSpec } from './spec-generator.js';
import { findPlanFile } from '../dag/parser.js';
import { readAllTasks, writeTask, nextTaskId, deleteTask } from '../state/task-graph.js';
import { appendLog } from '../state/pipeline.js';
import { routeTask } from '../routing/router.js';
import { analyzeCriticalPath } from '../dag/critical-path.js';
import { estimatePERT } from '../dag/estimation.js';
import type { TaskState } from '../types.js';

// ─── Types ──────────────────────────────────────────────────

export interface FullAutoOptions extends AutoRunOptions {
  maxPhases?: number;
}

export interface PhaseResult {
  phase: string;
  tasksPlanned: number;
  autoResult: AutoRunResult | null;
  deferredHandled: number;
  durationMs: number;
}

export interface FullAutoResult {
  phases: PhaseResult[];
  totalTasks: number;
  totalCompleted: number;
  totalFailed: number;
  totalTimeMs: number;
}

interface PlanPhase {
  name: string;
  title: string;
  rawContent: string;
  taskNames: string[];
}

// ─── Phase Parsing ──────────────────────────────────────────

/**
 * 从 PLAN.md 提取 phase 列表。
 * 支持格式: ## Phase 1: Title / ## 阶段 1: Title / ## 1. Title
 */
function parsePlanPhases(projectDir: string): PlanPhase[] {
  const planFile = findPlanFile(projectDir);
  if (!planFile || !fs.existsSync(planFile)) return [];

  const content = fs.readFileSync(planFile, 'utf-8');
  const phases: PlanPhase[] = [];

  // 按 ## 标题分割
  const phaseRegex = /^##\s+(?:Phase\s+|阶段\s*)?(\d+[\.\d]*)[:.：]\s*(.+)/gmi;
  const matches: { index: number; num: string; title: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = phaseRegex.exec(content)) !== null) {
    matches.push({ index: m.index, num: m[1], title: m[2].trim() });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const rawContent = content.slice(start, end);

    // 从 phase 内容中提取任务名称（支持多种格式）
    const taskNames = extractTaskNames(rawContent);

    phases.push({
      name: `phase-${matches[i].num}`,
      title: matches[i].title,
      rawContent,
      taskNames,
    });
  }

  return phases;
}

/** 从 phase 内容中提取任务名称 */
function extractTaskNames(content: string): string[] {
  const names: string[] = [];

  // 格式 1: - [ ] **T1: Name** / - [ ] Name
  const checkboxes = content.matchAll(/^-\s+\[[ x]\]\s+\*?\*?(?:[A-Z]*\d*[:.]\s*)?(.+?)(?:\*\*)?$/gm);
  for (const m of checkboxes) names.push(m[1].replace(/\*\*/g, '').trim());

  // 格式 2: ### Task 1: Name / #### 1. Name
  const headers = content.matchAll(/^#{3,4}\s+(?:Task\s+)?\d+[:.]\s*(.+)/gm);
  for (const m of headers) names.push(m[1].trim());

  // 格式 3: 表格行 | 1.1 | Name | ... |
  const rows = content.matchAll(/^\|\s*\d+(?:\.\d+)*\s*\|\s*(.+?)\s*\|/gm);
  for (const m of rows) {
    const name = m[1].replace(/\*\*/g, '').replace(/`/g, '').trim();
    if (name && !name.startsWith('--') && !/^(编号|名称|任务)$/.test(name)) {
      names.push(name);
    }
  }

  // 格式 4: 纯编号列表 1. Name / 1) Name
  if (names.length === 0) {
    const numbered = content.matchAll(/^\s*\d+[.)]\s+(.+)/gm);
    for (const m of numbered) names.push(m[1].trim());
  }

  return names;
}

// ─── Deferred Task Handler ──────────────────────────────────

/** 用 claude -p 直接执行 deferred task（路由到 claude-code 的复杂任务） */
function handleDeferredTask(projectDir: string, _taskId: string, bundle: string): boolean {
  const prompt = `你是一个资深工程师。请在项目目录 ${projectDir} 中实现以下任务。
直接修改文件，不要询问确认。完成后输出 "DONE" 和修改的文件列表。

${bundle}`;

  try {
    const tmpFile = path.join(projectDir, '.ham-autocode', '.deferred-prompt.tmp');
    fs.writeFileSync(tmpFile, prompt, 'utf-8');

    execSync(`claude -p < "${tmpFile.replace(/\\/g, '/')}"`, {
      cwd: projectDir,
      timeout: 300000, // 5 min for complex tasks
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true as unknown as string,
    });

    try { fs.unlinkSync(tmpFile); } catch { /* best-effort */ }
    return true;
  } catch {
    return false;
  }
}

// ─── Logging ────────────────────────────────────────────────

function log(msg: string): void {
  const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
  console.log(`[full-auto ${time}] ${msg}`);
}

// ─── Main Loop ──────────────────────────────────────────────

/**
 * 24h 自治执行循环。
 * 读 PLAN.md → 逐 phase 生成 spec + 执行 → 处理 deferred → 推进
 */
export async function runFullAuto(
  projectDir: string,
  options: FullAutoOptions,
): Promise<FullAutoResult> {
  const startTime = Date.now();
  const phases = parsePlanPhases(projectDir);
  const results: PhaseResult[] = [];

  if (phases.length === 0) {
    log('No phases found in PLAN.md');
    return { phases: [], totalTasks: 0, totalCompleted: 0, totalFailed: 0, totalTimeMs: 0 };
  }

  log(`Found ${phases.length} phases in PLAN.md`);

  const maxPhases = options.maxPhases || phases.length;

  for (let pi = 0; pi < Math.min(phases.length, maxPhases); pi++) {
    const phase = phases[pi];
    const phaseStart = Date.now();
    log(`\n=== Phase ${pi + 1}/${phases.length}: ${phase.title} ===`);

    // 检查 phase 是否已完成（所有关联 task 已 done）
    const existingTasks = readAllTasks(projectDir);
    const phaseTasks = existingTasks.filter(t => t.phase === phase.name);
    const allDone = phaseTasks.length > 0 && phaseTasks.every(t => t.status === 'done' || t.status === 'skipped');
    if (allDone) {
      log(`Phase "${phase.title}" already complete (${phaseTasks.length} tasks done), skipping`);
      results.push({ phase: phase.name, tasksPlanned: 0, autoResult: null, deferredHandled: 0, durationMs: 0 });
      continue;
    }

    // 清理 phase 内的旧 pending/failed tasks（重新规划）
    for (const t of phaseTasks.filter(t => t.status === 'pending' || t.status === 'failed')) {
      deleteTask(projectDir, t.id);
    }

    // ── Step 1: Opus 生成 specs ──
    const taskNames = phase.taskNames;
    if (taskNames.length === 0) {
      log(`Phase "${phase.title}" has no parseable tasks, skipping`);
      results.push({ phase: phase.name, tasksPlanned: 0, autoResult: null, deferredHandled: 0, durationMs: 0 });
      continue;
    }

    log(`Generating specs for ${taskNames.length} tasks via Opus...`);
    const newTaskIds: string[] = [];

    for (const taskName of taskNames) {
      const spec = generateSpec(projectDir, taskName, phase.rawContent);

      const id = nextTaskId(projectDir);
      const task: TaskState = {
        schemaVersion: 2,
        id,
        name: taskName,
        milestone: 'M001',
        phase: phase.name,
        status: 'pending',
        blockedBy: [],
        files: spec.files,
        spec: {
          description: spec.description,
          interface: spec.interface,
          acceptance: spec.acceptance,
          completeness: spec.description.length > 80 ? 70 : 30,
        },
        scores: { specScore: 0, complexityScore: spec.complexity, isolationScore: 0 },
        routing: { target: 'claude-code', reason: 'full-auto', needsConfirmation: false, confirmed: false },
        recovery: { strategy: 'checkpoint', checkpointRef: null },
        validation: { gates: [], attempts: 0, maxAttempts: 2, results: [] },
        context: { requiredFiles: spec.files, estimatedTokens: 0 },
        execution: { sessionId: null, startedAt: null, completedAt: null, error: null, errorType: null },
      };

      // 路由器评分（基于 Opus 生成的 complexity 和 files）
      try {
        const allTasks = readAllTasks(projectDir);
        const route = routeTask(task, allTasks, projectDir);
        task.scores = route.scores || task.scores;
        task.routing = { target: route.target, reason: `full-auto: ${route.reason}`, needsConfirmation: false, confirmed: false };
      } catch { /* keep defaults */ }

      writeTask(projectDir, task);
      newTaskIds.push(id);
      log(`  ${id}: "${taskName}" → ${task.routing.target} (complexity: ${spec.complexity})`);
    }

    // ── Step 2: PM 分析 ──
    const allTasks = readAllTasks(projectDir);
    try {
      const cpm = analyzeCriticalPath(allTasks);
      if (cpm.criticalPath.length > 0) {
        log(`Critical path: ${cpm.criticalPath.join(' → ')} (duration: ${cpm.criticalPathDuration})`);
      }
      const pert = estimatePERT(allTasks, projectDir);
      const totalExpected = pert.reduce((sum, p) => sum + p.expected, 0);
      log(`PERT estimate: ~${totalExpected} min for this phase`);
    } catch { /* PM analysis is informational, don't block */ }

    appendLog(projectDir, `full-auto: phase ${phase.name} planned ${newTaskIds.length} tasks`);

    // ── Step 3: 执行 ──
    log(`Executing phase "${phase.title}"...`);
    const autoResult = await runAuto(projectDir, options);

    // ── Step 4: 处理 deferred tasks ──
    let deferredHandled = 0;
    if (autoResult.deferredTasks.length > 0) {
      log(`Handling ${autoResult.deferredTasks.length} deferred tasks via claude -p...`);
      for (const deferred of autoResult.deferredTasks) {
        log(`  ${deferred.taskId}: "${deferred.taskName}" (${deferred.routedTarget})...`);
        const success = handleDeferredTask(projectDir, deferred.taskId, deferred.bundle);
        if (success) {
          // 标记完成
          try {
            execSync(`node "${path.join(projectDir, '..')}/ham-autocode/dist/index.js" dag complete ${deferred.taskId}`, {
              cwd: projectDir,
              timeout: 10000,
              stdio: 'pipe',
              shell: true as unknown as string,
            });
            deferredHandled++;
            log(`  ${deferred.taskId}: ✓ completed via claude -p`);
          } catch {
            log(`  ${deferred.taskId}: ✗ dag complete failed`);
          }
        } else {
          log(`  ${deferred.taskId}: ✗ claude -p execution failed`);
        }
      }
    }

    const phaseDuration = Date.now() - phaseStart;
    log(`Phase "${phase.title}" done: ${autoResult.completed + deferredHandled}/${taskNames.length} tasks, ${Math.round(phaseDuration / 1000)}s`);

    results.push({
      phase: phase.name,
      tasksPlanned: taskNames.length,
      autoResult,
      deferredHandled,
      durationMs: phaseDuration,
    });

    appendLog(projectDir, `full-auto: phase ${phase.name} completed (${autoResult.completed + deferredHandled} ok, ${autoResult.failed} failed)`);
  }

  const totalTimeMs = Date.now() - startTime;
  const totals = results.reduce((acc, r) => ({
    tasks: acc.tasks + r.tasksPlanned,
    completed: acc.completed + (r.autoResult?.completed || 0) + r.deferredHandled,
    failed: acc.failed + (r.autoResult?.failed || 0),
  }), { tasks: 0, completed: 0, failed: 0 });

  log(`\n=== Full-Auto Complete ===`);
  log(`${results.length} phases, ${totals.completed}/${totals.tasks} tasks, ${Math.round(totalTimeMs / 1000)}s total`);

  return {
    phases: results,
    totalTasks: totals.tasks,
    totalCompleted: totals.completed,
    totalFailed: totals.failed,
    totalTimeMs,
  };
}
