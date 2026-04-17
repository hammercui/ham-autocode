/**
 * Spec Generator — 调用 claude -p (Opus) 为任务生成详细 spec。
 *
 * 设计原则：Opus 写 spec（关键智力投入），opencode/codexfake 做执行（体力劳动）。
 * "当规格正确时，实现自然可靠。" — Boris Tane
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { SPEC_PROMPT_TMP, REVIEW_FEEDBACK_JSONL } from '../paths.js';
import { lintSpec, buildLintFeedback } from '../spec/spec-lint.js';

export interface GeneratedSpec {
  description: string;
  interface: string;
  acceptance: string;
  files: string[];
  complexity: number;
}

const FALLBACK_SPEC = (taskName: string): GeneratedSpec => ({
  description: taskName,
  interface: '',
  acceptance: '',
  files: [],
  complexity: 50,
});

/**
 * 用 claude -p (Opus) 为单个任务生成详细 spec。
 * 失败时降级为 fallback spec（不阻塞流程）。
 */
function callClaudeP(projectDir: string, prompt: string): string {
  const tmpFile = path.join(projectDir, SPEC_PROMPT_TMP);
  const tmpDir = path.dirname(tmpFile);
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(tmpFile, prompt, 'utf-8');
  const output = execSync(`claude -p < "${tmpFile.replace(/\\/g, '/')}"`, {
    cwd: projectDir,
    timeout: 180000,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true as unknown as string,
  }).toString().trim();
  try { fs.unlinkSync(tmpFile); } catch { /* best-effort */ }
  return output;
}

export function generateSpec(
  projectDir: string,
  taskName: string,
  phaseContext: string,
): GeneratedSpec {
  const prompt = buildSpecPrompt(projectDir, taskName, phaseContext);

  try {
    // 第一轮生成
    const output1 = callClaudeP(projectDir, prompt);
    const spec1 = parseSpecOutput(output1, taskName);

    // v4.1: lint 检查，违反规则回炉一次
    const lint1 = lintSpec(spec1);
    if (lint1.ok) return spec1;

    const retryPrompt = `${prompt}\n\n${buildLintFeedback(lint1)}`;
    const output2 = callClaudeP(projectDir, retryPrompt);
    const spec2 = parseSpecOutput(output2, taskName);

    // 二次失败也接受（记录到 stderr 供后续 review-feedback 分析），不阻塞流程
    const lint2 = lintSpec(spec2);
    if (!lint2.ok) {
      console.error(`[spec-gen] lint still failing after retry for "${taskName}": ${lint2.violations.map(v => v.rule).join(', ')}`);
    }
    return spec2;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message.slice(0, 100) : 'unknown';
    console.error(`[spec-gen] claude -p failed for "${taskName}": ${msg}, using fallback`);
    return FALLBACK_SPEC(taskName);
  }
}

/** 构造给 Opus 的 spec 生成 prompt */
function buildSpecPrompt(projectDir: string, taskName: string, phaseContext: string): string {
  // v4.1: 文件树默认不注入 — 90% 任务不需要，只有涉及架构/目录的才注入
  let projectFiles = '';
  const needsFileTree = /架构|目录|整体|结构|overview|structure|directory/i.test(taskName);
  if (needsFileTree) {
    try {
      const tree = buildFileTree(projectDir, 2); // v4.1: 深度 2 (原 3)
      projectFiles = `\n项目结构:\n${tree}\n`;
    } catch { /* ignore */ }
  }

  // v4.1: 失败教训收紧 5 → 2
  const failLessons = loadRecentFailLessons(projectDir, 2);
  const failSection = failLessons.length > 0
    ? `\n避免：${failLessons.join('; ')}\n`
    : '';

  // v4.1: CLAUDE.md 经验保留但收紧上限
  const claudeMdLessons = loadClaudeMdLessons(projectDir);
  const claudeMdSection = claudeMdLessons
    ? `\n项目约定：${claudeMdLessons.slice(0, 200)}\n`
    : '';

  // v4.1 核心改动：写作宪法（强约束简洁）
  return `为任务生成 spec，输出 JSON。

任务：${taskName}
上下文：${phaseContext}
目录：${projectDir}${projectFiles}${failSection}${claudeMdSection}
写作约束（违反会被 lint reject）：
- description: 一句话 ≤40 字，只说"做什么"，禁止解释"为什么/怎么做"
- interface: 只写 TS 签名，禁止任何注释
- acceptance: 恰好 3 条，用分号分隔，每条 ≤20 字，祈使句
- files: 必填数组，至少 1 项

输出格式：
{"description":"...","interface":"...","acceptance":"A;B;C","files":["..."],"complexity":N,"testFile":"...","testCases":["..."]}

其中 testFile/testCases 仅当 complexity>=50 时必填。只输出 JSON，无其他。`;
}

/** 解析 claude -p 输出为 GeneratedSpec */
function parseSpecOutput(output: string, taskName: string): GeneratedSpec {
  try {
    // 尝试直接解析 JSON
    let json = output;
    // 去掉可能的 markdown 代码块包裹
    const codeBlockMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) json = codeBlockMatch[1];

    const parsed = JSON.parse(json.trim());
    return {
      description: parsed.description || taskName,
      interface: parsed.interface || '',
      acceptance: parsed.acceptance || '',
      files: Array.isArray(parsed.files) ? parsed.files : [],
      complexity: typeof parsed.complexity === 'number' ? Math.max(1, Math.min(100, parsed.complexity)) : 50,
    };
  } catch {
    // JSON 解析失败，尝试从文本中提取有用信息
    return {
      description: output.slice(0, 500) || taskName,
      interface: '',
      acceptance: '',
      files: [],
      complexity: 50,
    };
  }
}

/** 构建文件树字符串（限深度 + 限行数），排除 node_modules/dist/.git 等 */
function buildFileTree(dir: string, maxDepth: number, prefix = '', depth = 0): string {
  if (depth >= maxDepth) return '';
  const IGNORE = new Set(['node_modules', 'dist', 'dist-electron', '.git', '.ham-autocode', '.planning', '__pycache__', 'coverage', '.next']);
  const MAX_LINES = 100;

  const lines: string[] = [];

  function walk(d: string, pre: string, dep: number): void {
    if (dep >= maxDepth || lines.length >= MAX_LINES) return;
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true })
        .filter(e => !IGNORE.has(e.name) && !e.name.startsWith('.'))
        .sort((a, b) => {
          // 目录优先
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

      for (let i = 0; i < entries.length && lines.length < MAX_LINES; i++) {
        const e = entries[i];
        const isLast = i === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPre = isLast ? '    ' : '│   ';
        lines.push(`${pre}${connector}${e.name}${e.isDirectory() ? '/' : ''}`);
        if (e.isDirectory()) {
          walk(path.join(d, e.name), pre + childPre, dep + 1);
        }
      }
    } catch { /* permission denied etc. */ }
  }

  walk(dir, prefix, depth);
  if (lines.length >= MAX_LINES) lines.push('... (truncated)');
  return lines.join('\n');
}

/**
 * T1: 读取 review-feedback.jsonl 最近 N 条 FAIL 记录，提取教训摘要。
 * Skill-First: 利用 review-gate 已产出的数据闭环回 spec 生成。
 */
function loadRecentFailLessons(projectDir: string, maxCount: number): string[] {
  const feedbackPath = path.join(projectDir, REVIEW_FEEDBACK_JSONL);
  if (!fs.existsSync(feedbackPath)) return [];

  try {
    const lines = fs.readFileSync(feedbackPath, 'utf-8').trim().split('\n').filter(Boolean);
    const fails: string[] = [];
    // 从尾部往前读，只取 FAIL
    for (let i = lines.length - 1; i >= 0 && fails.length < maxCount; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.verdict === 'FAIL' && entry.summary) {
          fails.push(`[${entry.taskId || 'unknown'}] ${entry.summary}`);
        }
      } catch { /* skip malformed line */ }
    }
    return fails;
  } catch { return []; }
}

/**
 * T3: 读取目标项目 CLAUDE.md 的"经验教训"段落。
 * 闭环: review-gate FAIL → 追加 CLAUDE.md → spec-generator 读取 → agent 规避。
 */
function loadClaudeMdLessons(projectDir: string): string {
  const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) return '';

  try {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    // 提取 "经验教训" / "Lessons" / "已知问题" 段落
    const patterns = [
      /## (?:经验教训|Lessons Learned|已知问题|Known Issues|L4 Review Findings)[\s\S]*?(?=\n## |\n# |$)/gi,
    ];
    const sections: string[] = [];
    for (const pat of patterns) {
      const matches = content.match(pat);
      if (matches) sections.push(...matches);
    }
    if (sections.length === 0) return '';
    // 截取最多 500 字符，避免 prompt 膨胀
    const combined = sections.join('\n').trim();
    return combined.length > 500 ? combined.slice(0, 500) + '...' : combined;
  } catch { return ''; }
}
