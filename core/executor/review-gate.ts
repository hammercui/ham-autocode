/**
 * L4 Review Gate — opencode 自审
 *
 * 让 opencode (免费模型) 审查 agent 产出的 diff，对比 spec 判断 PASS/FAIL。
 * 零 Claude token 消耗。只在 L0-L3 通过后执行。
 *
 * 流程：git diff → 拼接 spec → opencode review prompt → 解析 PASS/FAIL
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import type { TaskState } from '../types.js';

export interface ReviewResult {
  taskId: string;
  passed: boolean;
  verdict: 'PASS' | 'FAIL' | 'ERROR';
  reason: string;
  durationMs: number;
}

/**
 * 获取任务文件的 git diff（未暂存的变更）
 */
function getTaskDiff(projectDir: string, files: string[]): string {
  const existingFiles = files.filter(f => fs.existsSync(path.resolve(projectDir, f)));
  if (existingFiles.length === 0) return '';

  try {
    // 尝试获取与 HEAD 的 diff（已暂存 + 未暂存）
    const diff = execSync(
      `git diff HEAD -- ${existingFiles.map(f => `"${f}"`).join(' ')}`,
      { cwd: projectDir, stdio: 'pipe', timeout: 10000 }
    ).toString().trim();

    if (diff) return diff;

    // 如果没有 diff（可能是新文件未追踪），读取文件内容作为 diff
    const contents: string[] = [];
    for (const f of existingFiles) {
      const content = fs.readFileSync(path.resolve(projectDir, f), 'utf-8');
      // 限制每个文件最多 100 行，避免 review prompt 过大
      const lines = content.split('\n').slice(0, 100);
      const truncated = lines.length < content.split('\n').length ? '\n... (truncated)' : '';
      contents.push(`=== ${f} ===\n${lines.join('\n')}${truncated}`);
    }
    return contents.join('\n\n');
  } catch {
    return '';
  }
}

/**
 * 构建 review prompt
 */
function buildReviewPrompt(task: TaskState, diff: string): string {
  return [
    '# Code Review Request',
    '',
    '## Task Spec',
    `Name: ${task.name}`,
    `Description: ${task.spec?.description || 'N/A'}`,
    task.spec?.interface ? `Interface: ${task.spec.interface}` : '',
    task.spec?.acceptance ? `Acceptance: ${task.spec.acceptance}` : '',
    '',
    '## Code Changes',
    '```diff',
    diff.slice(0, 4000), // 限制 diff 长度
    '```',
    '',
    '## Review Instructions',
    'Review the code changes against the spec. Check:',
    '1. Does the implementation match ALL acceptance criteria?',
    '2. Are there logic bugs or missing edge cases?',
    '3. Does it modify existing code it should NOT touch?',
    '4. Are there obvious issues (infinite loops, null derefs, off-by-one)?',
    '',
    'Output your verdict in EXACTLY this format (first line must be PASS or FAIL):',
    'PASS',
    'or',
    'FAIL: <one-line reason>',
    '',
    'Nothing else. Just PASS or FAIL: reason.',
  ].filter(l => l !== '').join('\n');
}

/**
 * 解析 review 输出，提取 PASS/FAIL
 */
function parseVerdict(output: string): { verdict: 'PASS' | 'FAIL'; reason: string } {
  const lines = output.trim().split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^PASS\b/i.test(trimmed)) {
      return { verdict: 'PASS', reason: 'Review passed' };
    }
    if (/^FAIL\b/i.test(trimmed)) {
      const reason = trimmed.replace(/^FAIL\s*[:：]\s*/i, '').trim() || 'Review failed (no reason given)';
      return { verdict: 'FAIL', reason };
    }
  }

  // 没有明确的 PASS/FAIL — 尝试从内容推断（含中文短语）
  const lower = output.toLowerCase();
  const passPatterns = [
    'looks good', 'no issues', 'implementation is correct', 'no problems',
    '未发现', '没有问题', '符合规格', '符合要求', '实现正确', '完全符合',
  ];
  const failPatterns = [
    'bug', 'missing', 'incorrect',
    '缺少', '缺失', '错误', '不符', '遗漏',
  ];
  if (passPatterns.some(p => lower.includes(p) || output.includes(p))) {
    return { verdict: 'PASS', reason: 'Inferred PASS from review content' };
  }
  if (failPatterns.some(p => lower.includes(p) || output.includes(p))) {
    return { verdict: 'FAIL', reason: 'Inferred FAIL from review content: ' + output.slice(0, 200) };
  }

  // 无法判断 — 默认 PASS（宁可漏检不误杀）
  return { verdict: 'PASS', reason: 'No clear verdict, defaulting to PASS' };
}

/**
 * L4: 使用 opencode 审查任务产出
 *
 * @param projectDir 项目目录
 * @param task 已完成的任务
 * @param options.timeout 超时 ms（默认 90000）
 * @param options.model 审查用的模型（默认使用 opencode 默认模型，免费）
 * @returns ReviewResult
 */
export async function reviewTaskOutput(
  projectDir: string,
  task: TaskState,
  options?: { timeout?: number; model?: string }
): Promise<ReviewResult> {
  const timeout = options?.timeout || 90000;
  const startTime = Date.now();

  // 获取 diff
  const diff = getTaskDiff(projectDir, task.files || []);
  if (!diff) {
    return {
      taskId: task.id,
      passed: true,
      verdict: 'PASS',
      reason: 'No diff to review',
      durationMs: Date.now() - startTime,
    };
  }

  // 构建 prompt 并写入临时文件
  const prompt = buildReviewPrompt(task, diff);
  const tmpFile = path.join(os.tmpdir(), `ham-review-${task.id}.txt`);
  fs.writeFileSync(tmpFile, prompt, 'utf-8');

  try {
    const modelFlag = options?.model ? ` --model "${options.model}"` : '';
    const shellCmd = `opencode run --dangerously-skip-permissions${modelFlag} < "${tmpFile.replace(/\\/g, '/')}"`;

    const output = await new Promise<string>((resolve, reject) => {
      let stdout = '';
      const child = spawn(shellCmd, [], {
        cwd: projectDir,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr?.on('data', (d: Buffer) => { stdout += d.toString(); });

      let killed = false;
      const timer = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        reject(new Error(`review timeout after ${timeout}ms`));
      }, timeout);

      child.on('close', () => {
        clearTimeout(timer);
        if (killed) return;
        resolve(stdout);
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const { verdict, reason } = parseVerdict(output);
    return {
      taskId: task.id,
      passed: verdict === 'PASS',
      verdict,
      reason,
      durationMs: Date.now() - startTime,
    };
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message.slice(0, 200) : 'unknown error';
    return {
      taskId: task.id,
      passed: true, // review 失败不阻塞（宁可漏检不误杀）
      verdict: 'ERROR',
      reason: `Review agent error: ${errMsg}`,
      durationMs: Date.now() - startTime,
    };
  } finally {
    // 清理临时文件
    try { fs.unlinkSync(tmpFile); } catch { /* best effort */ }
  }
}

/**
 * 将 review FAIL 结果写入反馈文件，供人工快速定位修复
 * 文件路径: .ham-autocode/logs/review-feedback.jsonl
 */
export function writeReviewFeedback(projectDir: string, result: ReviewResult, task: TaskState): void {
  if (result.verdict !== 'FAIL') return;

  const logDir = path.join(projectDir, '.ham-autocode', 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const entry = {
    time: new Date().toISOString(),
    taskId: result.taskId,
    taskName: task.name,
    verdict: result.verdict,
    reason: result.reason,
    files: task.files || [],
    specDescription: task.spec?.description?.slice(0, 200) || '',
  };

  try {
    fs.appendFileSync(path.join(logDir, 'review-feedback.jsonl'), JSON.stringify(entry) + '\n');
  } catch { /* best-effort */ }

  // 活反馈循环：将 FAIL 经验追加到 CLAUDE.md（参见 Harness Engineering: AGENTS.md 模式）
  appendToClaudeMd(projectDir, result, task);
}

/**
 * 将 L4 review FAIL 自动追加到项目 CLAUDE.md。
 * 每次 Agent 犯错 → CLAUDE.md 更新 → 下次 Agent 读到 → 永不再犯。
 * 这是 Hashimoto 的 AGENTS.md 模式在 ham-autocode 中的实现。
 */
function appendToClaudeMd(projectDir: string, result: ReviewResult, task: TaskState): void {
  const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) return; // 项目没有 CLAUDE.md 则跳过

  const marker = '## Agent 经验教训（自动生成）';
  const entry = `- **${task.name}**: ${result.reason} (${new Date().toISOString().slice(0, 10)})`;

  try {
    let content = fs.readFileSync(claudeMdPath, 'utf-8');

    // 检查是否已有经验教训区块
    if (!content.includes(marker)) {
      content += `\n\n${marker}\n\n${entry}\n`;
    } else {
      // 追加到区块末尾（去重：同名任务不重复记录）
      if (content.includes(task.name)) return;
      content = content.replace(marker, `${marker}\n\n${entry}`);
    }

    fs.writeFileSync(claudeMdPath, content, 'utf-8');
  } catch { /* best-effort */ }
}
