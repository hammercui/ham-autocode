/**
 * 单任务执行 — v4.2 拆分。
 * 包含 fallback 链、L0.5/L2/L2.5/L3 门禁、L4 review + 重试、timeout 处理。
 */

import { spawn } from 'child_process';
import { buildMinimalContext } from '../context-template.js';
import { appendAgentExec } from '../../trace/logger.js';
import { verifyTaskOutput } from '../quality-gate.js';
import { reviewTaskOutput, writeReviewFeedback } from '../review-gate.js';
import type { ReviewResult } from '../review-gate.js';
import { getAvailableAgent, recordSuccess, recordFailure } from '../agent-status.js';
import { recordResult as recordAbResult } from '../../routing/ab-log.js';
import { snapshot as hashSnapshot, verify as hashVerify } from '../../quality/hashline.js';
import { enforceTodos } from '../../quality/todo-enforcer.js';
import type { TaskState, RoutingTarget } from '../../types.js';
import type { AutoRunOptions, DeferredTask, TaskExecResult } from './types.js';
import { log, markTaskRunning, markTaskDone } from './progress.js';
import {
  dagComplete,
  resolveGptModelForAuto,
  resolveCcSubagentModelForAuto,
  parseAgentOutput,
  writeBundleFile,
  checkFiles,
} from './helpers.js';

/** 检查任务是否需要 defer 给 Claude Code（只有真正需要 Opus 能力的才 defer） */
export function shouldDefer(projectDir: string, task: TaskState, options: AutoRunOptions): DeferredTask | null {
  if (options.agent) return null;

  const target = task.routing?.target || 'codexfake';
  const complexity = task.scores?.complexityScore ?? 50;

  if (target === 'claude-code' || target === 'agent-teams') {
    const minimal = buildMinimalContext(projectDir, task, target);
    return {
      taskId: task.id,
      taskName: task.name,
      reason: target,
      routedTarget: target,
      complexityScore: complexity,
      bundle: minimal.instruction,
    };
  }
  return null;
}

/** 执行单个任务（含 fallback）。
 *  peerFiles: 本 wave 内其他并发任务声明的 files，Hashline 需要把它们当作合法变更。 */
export async function executeTask(
  projectDir: string,
  task: TaskState,
  options: AutoRunOptions,
  peerFiles: string[] = [],
): Promise<TaskExecResult> {
  const timeout = options.timeout || 600000;

  // 确定 agent + fallback 链
  const routedTarget: RoutingTarget = options.agent || task.routing?.target || 'codexfake';
  let fallbackChain: string[];
  if (routedTarget === 'codexfake') fallbackChain = ['codexfake', 'opencode'];
  else if (routedTarget === 'cc-sonnet') fallbackChain = ['cc-sonnet', 'codexfake'];
  else if (routedTarget === 'cc-haiku') fallbackChain = ['cc-haiku', 'opencode'];
  else fallbackChain = ['opencode', 'codexfake'];

  // T5: L4 FAIL 重试标记（限 1 次）
  let hasRetried = false;

  for (let attempt = 0; attempt < fallbackChain.length; attempt++) {
    const agentName = options.agent
      ? options.agent
      : (attempt === 0
        ? (getAvailableAgent(projectDir, fallbackChain[0], fallbackChain.slice(1)) || fallbackChain[0])
        : fallbackChain[attempt]);

    const target = agentName as RoutingTarget;
    const minimal = buildMinimalContext(projectDir, task, target);
    const bundlePath = writeBundleFile(task.id, minimal.instruction);

    log(`${task.id} → ${agentName} ... spawned`);
    const startTime = Date.now();

    // v4.1 L0.5: Hashline — capture pre-exec state to detect collateral damage
    const preSnapshot = hashSnapshot(projectDir, task.files || []);

    // B3: 实时更新 currentTasks — spawn 后立即标记 agent 和 status
    markTaskRunning(task.id, agentName);

    let agentStdout = '';
    let isTimeout = false;

    try {
      const bundlePathUnix = bundlePath.replace(/\\/g, '/');
      const shellCmd = buildShellCmd(agentName, projectDir, bundlePathUnix);

      await new Promise<void>((resolve, reject) => {
        const child = spawn(shellCmd, [], {
          cwd: projectDir,
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        child.stdout?.on('data', (d: Buffer) => { agentStdout += d.toString(); });
        child.stderr?.on('data', (d: Buffer) => { agentStdout += d.toString(); });

        let killed = false;
        const timer = setTimeout(() => {
          killed = true;
          isTimeout = true;
          child.kill('SIGTERM');
          reject(new Error(`timeout after ${timeout}ms`));
        }, timeout);
        child.on('close', (code) => {
          clearTimeout(timer);
          if (killed) return;
          if (code === 0) resolve();
          else reject(new Error(`exit code ${code}`));
        });
        child.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      const durationMs = Date.now() - startTime;
      const { created, modified } = checkFiles(projectDir, task.files || []);
      const tokenStats = parseAgentOutput(agentName, agentStdout);

      // v4.1 L0.5: Hashline — detect collateral damage.
      const allowedFiles = [...(task.files || []), ...peerFiles];
      const hashResult = hashVerify(projectDir, preSnapshot, allowedFiles);
      if (!hashResult.ok) {
        log(`${task.id} ✗ L0.5 Hashline: ${hashResult.reason}`);
        log(`${task.id}   collateral: ${hashResult.collateralDamage.slice(0, 5).join(', ')}`);
        recordFailure(projectDir, agentName);
        appendAgentExec(projectDir, {
          time: new Date().toISOString(),
          taskId: task.id, taskName: task.name, agent: agentName,
          result: 'error', duration_ms: durationMs,
          filesCreated: created, filesModified: modified,
          error: `L0.5 collateral damage: ${hashResult.collateralDamage.slice(0, 3).join(', ')}`,
        });
        return {
          taskId: task.id, taskName: task.name, agent: agentName,
          result: 'error', durationMs, filesCreated: created, filesModified: modified,
          error: `L0.5 Hashline: ${hashResult.collateralDamage.length} collateral file(s)`,
          qualityPassed: false,
        };
      }

      const quality = verifyTaskOutput(projectDir, task);

      // v4.1 L2.5: Todo 强制执行 — 声明的文件必须被实质修改
      const todoResult = enforceTodos(projectDir, task.files || []);
      if (!todoResult.ok) {
        log(`${task.id} ✗ L2.5 Todo: ${todoResult.reason}`);
        recordFailure(projectDir, agentName);
        appendAgentExec(projectDir, {
          time: new Date().toISOString(),
          taskId: task.id, taskName: task.name, agent: agentName,
          result: 'error', duration_ms: durationMs,
          filesCreated: created, filesModified: modified,
          error: `L2.5 Todo incomplete: ${todoResult.reason}`,
        });
        return {
          taskId: task.id, taskName: task.name, agent: agentName,
          result: 'error', durationMs, filesCreated: created, filesModified: modified,
          error: `L2.5 Todo: ${todoResult.missing.length} missing, ${todoResult.empty.length} empty, ${todoResult.trivial.length} trivial`,
          qualityPassed: false,
        };
      }

      if (quality.passed) {
        // L4: opencode 自审（默认启用，--no-review 可跳过）
        let review: ReviewResult | undefined;
        const doReview = options.review !== false;
        if (doReview) {
          log(`${task.id} → L4 review...`);
          review = await reviewTaskOutput(projectDir, task, { timeout: 120000 });
          if (review.verdict === 'FAIL') {
            log(`${task.id} ⚠ L4 review FAIL: ${review.reason}`);
            writeReviewFeedback(projectDir, review, task);

            if (!hasRetried) {
              hasRetried = true;
              log(`${task.id} → L4 retry with review feedback...`);
              const retryResult = await retryWithReviewFeedback(
                projectDir, task, agentName, review.reason, options,
              );
              if (retryResult) {
                const retryQuality = verifyTaskOutput(projectDir, task);
                if (retryQuality.passed) {
                  log(`${task.id} ✓ L4 retry succeeded`);
                  review = { taskId: task.id, passed: true, verdict: 'PASS', reason: 'fixed after retry', durationMs: retryResult.durationMs };
                } else {
                  log(`${task.id} ⚠ L4 retry: quality gate still failed`);
                }
              } else {
                log(`${task.id} ⚠ L4 retry failed, keeping original result`);
              }
            }
          } else if (review.verdict === 'ERROR') {
            log(`${task.id} ⚠ L4 review error: ${review.reason}`);
          } else {
            log(`${task.id} ✓ L4 review PASS (${Math.round(review.durationMs / 1000)}s)`);
          }
        }

        recordSuccess(projectDir, agentName);
        dagComplete(projectDir, task.id);
        appendAgentExec(projectDir, {
          time: new Date().toISOString(),
          taskId: task.id, taskName: task.name, agent: agentName,
          result: 'ok', duration_ms: durationMs,
          filesCreated: created, filesModified: modified,
          tokensIn: tokenStats.tokensIn || undefined,
          tokensOut: tokenStats.tokensOut || undefined,
        });

        const tokenInfo = tokenStats.totalTokens > 0 ? `, ${tokenStats.totalTokens} tokens` : '';
        log(`${task.id} ✓ ${Math.round(durationMs / 1000)}s (${agentName}, ${created} files created${tokenInfo})`);
        markTaskDone(task.id);

        // v4.2: 回填 R2 随机档 A/B 结果
        const rt = task.routing?.target;
        if (rt === 'opencode' || rt === 'cc-haiku') {
          recordAbResult(projectDir, task.id, 'ok', tokenStats.totalTokens || undefined, durationMs);
        }

        return {
          taskId: task.id, taskName: task.name, agent: agentName,
          result: 'ok', durationMs, filesCreated: created, filesModified: modified,
          fallbackUsed: attempt > 0, qualityPassed: true, review,
          totalTokens: tokenStats.totalTokens || undefined,
        };
      }

      // 质量不通过
      log(`${task.id} ⚠ quality gate failed (${agentName}), ${quality.checks.filter(c => !c.passed).map(c => c.message).join(', ')}`);
      recordFailure(projectDir, agentName);
    } catch (e: unknown) {
      const durationMs = Date.now() - startTime;
      const errMsg = e instanceof Error ? e.message.slice(0, 200) : 'unknown error';

      // P1: 区分 timeout vs error — 超时时检查文件是否已创建
      if (isTimeout) {
        const { created } = checkFiles(projectDir, task.files || []);
        if (created > 0) {
          log(`${task.id} ⚠ timeout but ${created} files created — treating as success`);
          const quality = verifyTaskOutput(projectDir, task);
          if (quality.passed) {
            recordSuccess(projectDir, agentName);
            dagComplete(projectDir, task.id);
            appendAgentExec(projectDir, {
              time: new Date().toISOString(),
              taskId: task.id, taskName: task.name, agent: agentName,
              result: 'ok', duration_ms: durationMs,
              filesCreated: created, filesModified: 0,
              tokensIn: parseAgentOutput(agentName, agentStdout).tokensIn || undefined,
              tokensOut: parseAgentOutput(agentName, agentStdout).tokensOut || undefined,
            });
            markTaskDone(task.id);
            return {
              taskId: task.id, taskName: task.name, agent: agentName,
              result: 'ok', durationMs, filesCreated: created, filesModified: 0,
              fallbackUsed: attempt > 0, qualityPassed: true,
            };
          }
        }
        log(`${task.id} ✗ ${agentName} timeout (${Math.round(durationMs / 1000)}s), no valid output`);
      } else {
        log(`${task.id} ✗ ${agentName} error (${Math.round(durationMs / 1000)}s): ${errMsg}`);
      }

      recordFailure(projectDir, agentName);
      appendAgentExec(projectDir, {
        time: new Date().toISOString(),
        taskId: task.id, taskName: task.name, agent: agentName,
        result: 'error', duration_ms: durationMs, error: isTimeout ? `timeout: ${errMsg}` : errMsg,
      });
    }

    // 强制指定 agent 时不 fallback
    if (options.agent) break;
    if (attempt < fallbackChain.length - 1) {
      log(`${task.id} → fallback to ${fallbackChain[attempt + 1]}`);
    }
  }

  log(`${task.id} ✗ skipped (all agents failed)`);
  return {
    taskId: task.id, taskName: task.name, agent: 'none',
    result: 'skip', durationMs: 0, filesCreated: 0, filesModified: 0,
  };
}

/** 构建 agent 子进程 shell 命令（按 agent 类型分流） */
function buildShellCmd(agentName: string, projectDir: string, bundlePathUnix: string): string {
  if (agentName === 'codexfake') {
    const gptModel = resolveGptModelForAuto(projectDir);
    return `opencode run --dangerously-skip-permissions --format json --model "${gptModel}" < "${bundlePathUnix}"`;
  }
  if (agentName === 'cc-sonnet' || agentName === 'cc-haiku') {
    // v4.2: Claude Code 子 agent — claude -p --model 从 stdin 读取 prompt
    // 默认剥离 MCP (节省子 agent 启动 context)；HAM_CC_SUB_KEEP_MCP=1 保留
    const ccModel = resolveCcSubagentModelForAuto(projectDir, agentName);
    const mcpFlags = process.env.HAM_CC_SUB_KEEP_MCP === '1'
      ? ''
      : ` --strict-mcp-config --mcp-config '{"mcpServers":{}}'`;
    return `claude -p --model "${ccModel}" --output-format json --dangerously-skip-permissions${mcpFlags} < "${bundlePathUnix}"`;
  }
  return `opencode run --dangerously-skip-permissions --format json < "${bundlePathUnix}"`;
}

/**
 * T5: L4 review FAIL 后，将 review feedback 注入上下文重新执行一次。
 * 限制: 仅 1 次重试，用同一 agent，超时 5 分钟。
 */
async function retryWithReviewFeedback(
  projectDir: string,
  task: TaskState,
  agentName: string,
  reviewFeedback: string,
  options: AutoRunOptions,
): Promise<{ durationMs: number } | null> {
  const target = agentName as RoutingTarget;
  const minimal = buildMinimalContext(projectDir, task, target);

  const retryInstruction = `${minimal.instruction}

## ⚠ L4 Review 发现以下问题，请修复：
${reviewFeedback}

请根据上述反馈修复代码。只修改有问题的部分，不要重写整个文件。`;

  const bundlePath = writeBundleFile(`${task.id}-retry`, retryInstruction);
  const bundlePathUnix = bundlePath.replace(/\\/g, '/');
  const retryTimeout = Math.min(options.timeout || 600000, 300000);
  const shellCmd = agentName === 'codexfake'
    ? `opencode run --dangerously-skip-permissions --format json --model "${resolveGptModelForAuto(projectDir)}" < "${bundlePathUnix}"`
    : `opencode run --dangerously-skip-permissions --format json < "${bundlePathUnix}"`;

  const startTime = Date.now();
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(shellCmd, [], {
        cwd: projectDir,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`retry timeout after ${retryTimeout}ms`));
      }, retryTimeout);
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`retry exit code ${code}`));
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    return { durationMs: Date.now() - startTime };
  } catch {
    return null;
  }
}
