/**
 * Runner helpers — v4.2 拆分。
 * dag 子命令封装 + model 解析 + agent 输出解析 + 文件检查。
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { loadConfig } from '../../state/config.js';
import { parseOpenCodeOutput } from '../dispatcher.js';
import { parseClaudeSubOutput } from '../claude-sub.js';

/** 获取 DAG 的 next-wave（调用自身 CLI 避免循环依赖） */
export function getNextWave(projectDir: string): { id: string; name: string }[] {
  try {
    const output = execSync(
      `node "${path.join(__dirname, '..', '..', 'index.js')}" dag next-wave`,
      { cwd: projectDir, env: { ...process.env, HAM_PROJECT_DIR: projectDir }, stdio: 'pipe', timeout: 10000 }
    ).toString().trim();
    return JSON.parse(output);
  } catch {
    return [];
  }
}

/** 标记任务完成 */
export function dagComplete(projectDir: string, taskId: string): void {
  try {
    execSync(
      `node "${path.join(__dirname, '..', '..', 'index.js')}" dag complete ${taskId}`,
      { cwd: projectDir, env: { ...process.env, HAM_PROJECT_DIR: projectDir }, stdio: 'pipe', timeout: 10000 }
    );
  } catch { /* best effort */ }
}

/** 跳过 DAG 任务 (P0-#3: 自动 skip 重复失败任务) */
export function dagSkip(projectDir: string, taskId: string): void {
  try {
    execSync(
      `node "${path.join(__dirname, '..', '..', 'index.js')}" dag skip ${taskId}`,
      { cwd: projectDir, env: { ...process.env, HAM_PROJECT_DIR: projectDir }, stdio: 'pipe', timeout: 10000 }
    );
  } catch { /* best effort */ }
}

/** 获取 DAG 状态 */
export function dagStatus(projectDir: string): { done: number; remaining: number; total: number } {
  try {
    const output = execSync(
      `node "${path.join(__dirname, '..', '..', 'index.js')}" dag status`,
      { cwd: projectDir, env: { ...process.env, HAM_PROJECT_DIR: projectDir }, stdio: 'pipe', timeout: 10000 }
    ).toString().trim();
    return JSON.parse(output);
  } catch {
    return { done: 0, remaining: 0, total: 0 };
  }
}

/** 解析 codex 路由目标使用的 GPT 模型标识 */
export function resolveGptModelForAuto(projectDir: string): string {
  try {
    const config = loadConfig(projectDir).routing;
    const provider = config.opencodeGptProviders?.[0] || 'github-copilot';
    const model = config.opencodeGptModel || 'gpt-5.4-mini';
    return `${provider}/${model}`;
  } catch {
    return 'github-copilot/gpt-5.4-mini';
  }
}

/** v4.2: 解析 Claude Code 子 agent 模型名 (cc-sonnet / cc-haiku) */
export function resolveCcSubagentModelForAuto(projectDir: string, target: 'cc-sonnet' | 'cc-haiku'): string {
  try {
    const sub = loadConfig(projectDir).routing.ccSubagent;
    if (target === 'cc-sonnet') return sub?.sonnet || 'claude-sonnet-4-6';
    return sub?.haiku || 'claude-haiku-4-5-20251001';
  } catch {
    return target === 'cc-sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
  }
}

/** v4.2: 按 agent 类型选择正确的 token/耗时解析器 */
export function parseAgentOutput(
  agentName: string,
  stdout: string,
): { tokensIn: number; tokensOut: number; totalTokens: number; cost?: number } {
  if (agentName === 'cc-sonnet' || agentName === 'cc-haiku') {
    const r = parseClaudeSubOutput(stdout);
    return { tokensIn: r.tokensIn, tokensOut: r.tokensOut, totalTokens: r.totalTokens, cost: r.cost };
  }
  const r = parseOpenCodeOutput(stdout);
  return { tokensIn: r.tokensIn, tokensOut: r.tokensOut, totalTokens: r.totalTokens, cost: r.cost };
}

/** 写 bundle 到临时文件 */
export function writeBundleFile(taskId: string, instruction: string): string {
  const tmpFile = path.join(os.tmpdir(), `ham-bundle-${taskId}.txt`);
  fs.writeFileSync(tmpFile, instruction, 'utf-8');
  return tmpFile;
}

/** 检查文件变更（最近 15 分钟内修改的算本次产出） */
export function checkFiles(projectDir: string, files: string[]): { created: number; modified: number } {
  let created = 0;
  let modified = 0;
  for (const f of files) {
    const fullPath = path.resolve(projectDir, f);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      if (Date.now() - stat.mtimeMs < 15 * 60 * 1000) {
        created++;
      } else {
        modified++;
      }
    }
  }
  return { created, modified };
}
