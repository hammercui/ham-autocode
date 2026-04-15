/**
 * Spec Generator — 调用 claude -p (Opus) 为任务生成详细 spec。
 *
 * 设计原则：Opus 写 spec（关键智力投入），opencode/codexfake 做执行（体力劳动）。
 * "当规格正确时，实现自然可靠。" — Boris Tane
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

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
export function generateSpec(
  projectDir: string,
  taskName: string,
  phaseContext: string,
): GeneratedSpec {
  const prompt = buildSpecPrompt(projectDir, taskName, phaseContext);

  try {
    // 写入临时文件避免 shell 转义问题
    const tmpFile = path.join(projectDir, '.ham-autocode', '.spec-prompt.tmp');
    const tmpDir = path.dirname(tmpFile);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(tmpFile, prompt, 'utf-8');

    const output = execSync(`claude -p < "${tmpFile.replace(/\\/g, '/')}"`, {
      cwd: projectDir,
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true as unknown as string,
    }).toString().trim();

    // 清理临时文件
    try { fs.unlinkSync(tmpFile); } catch { /* best-effort */ }

    return parseSpecOutput(output, taskName);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message.slice(0, 100) : 'unknown';
    console.error(`[spec-gen] claude -p failed for "${taskName}": ${msg}, using fallback`);
    return FALLBACK_SPEC(taskName);
  }
}

/** 构造给 Opus 的 spec 生成 prompt */
function buildSpecPrompt(projectDir: string, taskName: string, phaseContext: string): string {
  // 收集项目基本信息
  let projectFiles = '';
  try {
    const srcDir = fs.readdirSync(projectDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules' && d.name !== 'dist')
      .map(d => d.name);
    projectFiles = `项目目录: ${srcDir.join(', ')}`;
  } catch { /* ignore */ }

  return `你是一个 spec 工程师。为以下任务生成详细的实现规格。

## 任务名称
${taskName}

## Phase 上下文
${phaseContext}

## 项目信息
${projectFiles}
工作目录: ${projectDir}

## 输出要求
输出严格的 JSON 格式（不要 markdown 代码块包裹），包含以下字段:
{
  "description": "详细的实现描述（至少 100 字）：做什么、为什么、怎么做、边界条件",
  "interface": "需要 export 的函数/接口签名（TypeScript 格式）",
  "acceptance": "验收标准（至少 3 条，用分号分隔）",
  "files": ["需要创建或修改的文件路径（相对项目根目录）"],
  "complexity": 数字(1-100，基于文件数量、逻辑复杂度、依赖关系综合评估)
}

只输出 JSON，不要其他内容。`;
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
