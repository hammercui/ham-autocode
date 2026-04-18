/**
 * runAuto — 主编排循环，v4.2 拆分。
 * wave 循环 → 预检 → 分流 → executeTask 并行 → commit → ETA → 下一波
 */

import { execSync } from 'child_process';
import { readTask, readAllTasks } from '../../state/task-graph.js';
import { buildMinimalContext } from '../context-template.js';
import { preflightCheck, verifyProjectTsc } from '../quality-gate.js';
import { diagnoseFailure, saveDiagnosis } from '../diagnosis.js';
import { recordResult as recordAbResult } from '../../routing/ab-log.js';
import type { TaskState } from '../../types.js';
import type { AutoRunOptions, AutoRunResult, DeferredTask, TaskExecResult, WaveResult } from './types.js';
import { createRunContext, updateProgress, clearActiveCtx, log } from './progress.js';
import { getNextWave, dagStatus, dagSkip } from './helpers.js';
import { executeTask, shouldDefer } from './task-exec.js';
import { commitWave } from './wave-commit.js';
import { buildTreeContext } from '../../context/hierarchical.js';

/** 同一 node 进程内只 rebuild 一次 tree（phase-loop 可能多次调 runAuto） */
let _treeBuiltThisSession = false;

export async function runAuto(projectDir: string, options: AutoRunOptions): Promise<AutoRunResult> {
  const startTime = Date.now();
  const waves: WaveResult[] = [];
  let totalCompleted = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  const status = dagStatus(projectDir);
  log(`Starting auto-execution...`);
  log(`DAG: ${status.remaining} remaining, ${status.done} done, ${status.total} total`);
  const ctx = createRunContext(projectDir, status.remaining);

  // v4.2: 自动 rebuild hierarchical context tree（~1-2s，保证 tree 新鲜）
  // - 同 node 进程内只 rebuild 一次（phase-loop 可能多次调 runAuto）
  // - HAM_SKIP_CONTEXT_REBUILD=1 跳过（CI / 用户刚手动 build 过）
  if (!_treeBuiltThisSession && process.env.HAM_SKIP_CONTEXT_REBUILD !== '1' && status.remaining > 0) {
    try {
      const tRebuild = Date.now();
      const stats = await buildTreeContext(projectDir, { log: () => { /* silent in runAuto */ } });
      log(`Context tree rebuilt: ${stats.dirs} dirs, ${stats.symbols} symbols in ${Date.now() - tRebuild}ms`);
      _treeBuiltThisSession = true;
    } catch (e) {
      log(`⚠ context tree rebuild failed: ${(e as Error).message.slice(0, 100)} — continuing without hierarchical context`);
      _treeBuiltThisSession = true;  // 失败也标记，避免重复失败
    }
  }

  const allDeferredTasks: DeferredTask[] = [];

  if (status.remaining === 0) {
    log('All tasks already done!');
    clearActiveCtx();
    return { totalTasks: 0, completed: 0, failed: 0, skipped: 0, deferred: 0, totalTimeMs: 0, waves: [], deferredTasks: [] };
  }

  // DAG 预检
  const allTasks = readAllTasks(projectDir);
  const pendingTasks = allTasks.filter(t => t.status !== 'done');
  const preflight = preflightCheck(projectDir, pendingTasks);
  if (preflight.warnings.length > 0) {
    for (const w of preflight.warnings) {
      log(`⚠ ${w.taskId}: ${w.issues.join(', ')}`);
    }
  }
  log(`Pre-flight: ${preflight.ready.length} ready, ${preflight.warnings.length} warnings`);

  if (options.dryRun) {
    log('Dry run — showing plan only:');
    const wave = getNextWave(projectDir);
    if (wave.length > 0) log(`Wave 1: ${wave.map(t => t.id).join(', ')}`);
    clearActiveCtx();
    return { totalTasks: status.remaining, completed: 0, failed: 0, skipped: 0, deferred: 0, totalTimeMs: 0, waves: [], deferredTasks: [] };
  }

  // 主循环（max 20 waves 防止无限循环）
  const MAX_WAVES = 20;
  let consecutiveSkipWaves = 0;
  let waveNum = 0;
  const taskFailHistory = new Map<string, { count: number; lastError: string }>();

  while (waveNum < MAX_WAVES) {
    let wave = getNextWave(projectDir);
    if (wave.length === 0) break;

    // P0-#3: 过滤掉已连续失败 2 次且错误相同的任务 → 自动 skip
    const autoSkipped: string[] = [];
    wave = wave.filter(w => {
      const hist = taskFailHistory.get(w.id);
      if (hist && hist.count >= 2) { autoSkipped.push(w.id); return false; }
      return true;
    });
    for (const id of autoSkipped) {
      const hist = taskFailHistory.get(id)!;
      dagSkip(projectDir, id);
      const task = readTask(projectDir, id);
      if (task) {
        const diagnosis = diagnoseFailure(task, hist.count, hist.lastError);
        saveDiagnosis(projectDir, diagnosis);
        log(`${id} → auto-skipped (${hist.count}x, diagnosis: ${diagnosis.category}) ${diagnosis.suggestedAction.slice(0, 60)}`);
      } else {
        log(`${id} → auto-skipped (failed ${hist.count}x: ${hist.lastError.slice(0, 80)})`);
      }
      totalSkipped++;
    }
    if (wave.length === 0) break;

    waveNum++;
    updateProgress(ctx, {
      currentWave: waveNum,
      currentTasks: wave.map(w => ({ taskId: w.id, agent: 'pending', status: 'queued', startedAt: '' })),
    });
    log(`\n=== Wave ${waveNum}: ${wave.length} tasks [${wave.map(t => t.id).join(', ')}] ===`);

    // Wave 级别 agent-teams 判断
    if (!options.agent && wave.length >= 3) {
      const waveTasks = wave.map(w => readTask(projectDir, w.id)).filter((t): t is TaskState => t !== null);
      const allClaudeCode = waveTasks.every(t => (t.routing?.target || 'codexfake') === 'claude-code');
      const allHighIsolation = waveTasks.every(t => (t.scores?.isolationScore ?? 0) >= 70);
      if (allClaudeCode && allHighIsolation) {
        for (const task of waveTasks) {
          const minimal = buildMinimalContext(projectDir, task, 'agent-teams');
          allDeferredTasks.push({
            taskId: task.id,
            taskName: task.name,
            reason: 'agent-teams',
            routedTarget: 'agent-teams',
            complexityScore: task.scores?.complexityScore ?? 50,
            bundle: minimal.instruction,
          });
        }
        log(`Wave ${waveNum}: ${wave.length} tasks → agent-teams (all claude-code + isolation ≥ 70)`);
        waves.push({ wave: waveNum, tasks: [] });
        break;
      }
    }

    // 分流: 可自动执行的 vs 需要 defer 给 Claude Code 的
    const autoTasks: { id: string; name: string }[] = [];
    for (const w of wave) {
      const task = readTask(projectDir, w.id);
      if (!task) continue;
      const deferred = shouldDefer(projectDir, task, options);
      if (deferred) {
        allDeferredTasks.push(deferred);
        log(`${w.id} → deferred to ${deferred.routedTarget} (complexity: ${deferred.complexityScore})`);
      } else {
        autoTasks.push(w);
      }
    }

    if (autoTasks.length === 0) {
      log(`Wave ${waveNum}: all ${wave.length} tasks deferred`);
      waves.push({ wave: waveNum, tasks: [] });
      if (allDeferredTasks.length > 0) break;
      continue;
    }

    // 并行执行可自动化的任务
    const concurrency = options.concurrency || autoTasks.length;
    const results: TaskExecResult[] = [];

    for (let i = 0; i < autoTasks.length; i += concurrency) {
      const batch = autoTasks.slice(i, i + concurrency);
      const peerTasks = batch.map(b => readTask(projectDir, b.id)).filter((t): t is TaskState => !!t);
      const promises = batch.map(async (w) => {
        const task = readTask(projectDir, w.id);
        if (!task) {
          return { taskId: w.id, taskName: w.name, agent: 'none', result: 'skip' as const, durationMs: 0, filesCreated: 0, filesModified: 0 };
        }
        const peerFiles = peerTasks.filter(t => t.id !== task.id).flatMap(t => t.files || []);
        const res = await executeTask(projectDir, task, options, peerFiles);
        // v4.2: 失败回填 A/B log（成功路径已在 executeTask 内记录）
        const rt = task.routing?.target;
        if ((rt === 'opencode' || rt === 'cc-haiku') && res.result !== 'ok') {
          recordAbResult(projectDir, task.id, 'fail', res.totalTokens, res.durationMs);
        }
        return res;
      });
      const batchResults = await Promise.allSettled(promises);
      for (const r of batchResults) {
        if (r.status === 'fulfilled') results.push(r.value);
      }
    }

    // 统计
    const ok = results.filter(r => r.result === 'ok').length;
    const failed = results.filter(r => r.result === 'error').length;
    const skipped = results.filter(r => r.result === 'skip').length;
    totalCompleted += ok;
    totalFailed += failed;
    totalSkipped += skipped;

    // P0-#3: 记录 skip 任务到 failHistory
    for (const r of results.filter(r => r.result === 'skip')) {
      const hist = taskFailHistory.get(r.taskId) || { count: 0, lastError: '' };
      hist.count++;
      hist.lastError = r.error || 'all agents failed';
      taskFailHistory.set(r.taskId, hist);
    }

    // I5: ETA 计算
    const allOkResults = waves.flatMap(w => w.tasks).filter(t => t.result === 'ok');
    const totalTaskMs = allOkResults.reduce((sum, t) => sum + t.durationMs, 0);
    const avgMs = allOkResults.length > 0 ? totalTaskMs / allOkResults.length : 0;
    const remainingCount = Math.max(0, status.remaining - totalCompleted - totalFailed - totalSkipped - allDeferredTasks.length);
    const etaSec = allOkResults.length > 0 ? Math.round(remainingCount * avgMs / 1000) : 0;
    const etaStr = etaSec > 0
      ? (etaSec >= 60 ? `~${Math.round(etaSec / 60)} min remaining` : `~${etaSec}s remaining`)
      : (remainingCount === 0 ? 'done' : 'calculating...');

    updateProgress(ctx, {
      completed: totalCompleted, failed: totalFailed, skipped: totalSkipped,
      deferred: allDeferredTasks.length,
      remaining: remainingCount,
      currentTasks: [],
      avgTaskDurationSec: Math.round(avgMs / 1000),
      etaSeconds: etaSec,
      eta: etaStr,
    });

    // L3: 项目级 tsc 检查（警告模式 — 不阻塞 commit）
    const tscResult = verifyProjectTsc(projectDir);
    if (!tscResult.passed) {
      log(`⚠ L3 tsc warning (${tscResult.errors.length} errors): ${tscResult.errors.slice(0, 3).join(' | ')}`);
    }

    // Git commit
    const commitHash = commitWave(projectDir, waveNum, results);
    if (commitHash) log(`Git: committed ${commitHash}`);

    log(`Wave ${waveNum}: ${ok}/${results.length} ok${failed ? `, ${failed} failed` : ''}${skipped ? `, ${skipped} skipped` : ''}`);
    waves.push({ wave: waveNum, tasks: results, commitHash: commitHash || undefined });

    // I4: 波次有失败时等待 30s 再继续
    if (failed > 0 || skipped > 0) {
      log(`Wave had failures — waiting 30s before next wave...`);
      await new Promise(r => setTimeout(r, 30000));
    }

    // 全部 skip → 连续 2 次退出
    if (ok === 0 && results.length > 0) {
      consecutiveSkipWaves++;
      if (consecutiveSkipWaves >= 2) {
        log('All agents unavailable for 2 consecutive waves. Stopping.');
        break;
      }
    } else {
      consecutiveSkipWaves = 0;
    }
  }

  // 最终汇总
  const totalTimeMs = Date.now() - startTime;
  const totalTasks = totalCompleted + totalFailed + totalSkipped;

  const agentStats: Record<string, { count: number; totalMs: number }> = {};
  for (const w of waves) {
    for (const t of w.tasks) {
      if (t.result === 'ok') {
        if (!agentStats[t.agent]) agentStats[t.agent] = { count: 0, totalMs: 0 };
        agentStats[t.agent].count++;
        agentStats[t.agent].totalMs += t.durationMs;
      }
    }
  }
  const agentSummary = Object.entries(agentStats)
    .map(([a, s]) => `${a}: ${s.count} tasks (avg ${Math.round(s.totalMs / s.count / 1000)}s)`)
    .join(' | ');

  updateProgress(ctx, { status: totalFailed > 0 ? 'failed' : 'completed', remaining: 0, currentTasks: [] });
  clearActiveCtx();
  log(`\n=== Complete ===`);
  log(`Total: ${totalTasks} tasks, ${totalCompleted} ok, ${totalFailed} failed, ${totalSkipped} skipped`);
  log(`Time: ${Math.round(totalTimeMs / 1000)}s | ${agentSummary}`);
  log(`Commits: ${waves.filter(w => w.commitHash).length}`);

  if (options.push) {
    try {
      execSync('git push', { cwd: projectDir, stdio: 'pipe', timeout: 30000 });
      log('Git: pushed to remote');
    } catch {
      log('Git: push failed');
    }
  }

  if (allDeferredTasks.length > 0) {
    log(`\n=== Deferred to Claude Code: ${allDeferredTasks.length} tasks ===`);
    for (const d of allDeferredTasks) {
      log(`${d.taskId} (${d.taskName}) → ${d.routedTarget}, complexity: ${d.complexityScore}`);
    }
    log('Use Agent Teams or direct implementation in Claude Code session.');
  }

  return {
    totalTasks, completed: totalCompleted, failed: totalFailed, skipped: totalSkipped,
    deferred: allDeferredTasks.length, totalTimeMs, waves, deferredTasks: allDeferredTasks,
  };
}
