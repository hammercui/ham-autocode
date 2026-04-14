/**
 * Agent Dispatcher — 封装 codex/opencode CLI 调用参数。
 * 不管理进程生命周期（由调用方决定同步/异步），只生成正确的 shell 命令。
 */

import type { RoutingTarget } from '../types.js';

export interface DispatchCommand {
  /** 可直接在 shell 中执行的完整命令 */
  command: string;
  /** agent 名称 */
  agent: string;
  /** 使用的模型（如果指定） */
  model?: string;
}

/**
 * 根据 routing target 和 instruction 生成 shell 命令。
 * 调用方可直接用 child_process.exec 或 Bash 工具执行。
 */
export function buildDispatchCommand(
  target: RoutingTarget,
  instruction: string,
  options?: { model?: string; cwd?: string }
): DispatchCommand {
  // 转义 instruction 中的单引号，用于 shell
  const escaped = instruction.replace(/'/g, "'\\''");

  switch (target) {
    case 'codex':
      return {
        command: `codex exec --full-auto '${escaped}'`,
        agent: 'codex',
      };

    case 'opencode': {
      // 使用 opencode 自身配置的默认模型（用户在 opencode 中配置，如 zhipu glm-5.1）
      // 仅当调用方显式指定 model 时才覆盖
      const modelFlag = options?.model ? ` --model "${options.model}"` : '';
      return {
        // --format json: 输出 JSONL 事件流，可用 parseOpenCodeOutput 提取 token 统计
        command: `opencode run --dangerously-skip-permissions --format json${modelFlag} '${escaped}'`,
        agent: 'opencode',
        model: options?.model,
      };
    }

    case 'claude-code':
      // Claude Code 不需要 dispatch — 它自己就是编排者
      return {
        command: `echo 'claude-code target: execute in current session'`,
        agent: 'claude-code',
      };

    case 'claude-app':
      // Claude App 通过另一个账号的对话窗口执行，输出 instruction 供复制
      return {
        command: `echo 'claude-app target: copy instruction to Claude App session'`,
        agent: 'claude-app',
      };

    case 'agent-teams':
      // Agent Teams 由 Claude Code 在当前 session 用 Agent 工具创建
      return {
        command: `echo 'agent-teams target: use Agent tool in current session'`,
        agent: 'agent-teams',
      };

    default:
      throw new Error(`Unsupported dispatch target: ${target}`);
  }
}

/** 检查 agent CLI 是否可用 */
export function checkAgentAvailable(target: RoutingTarget): { available: boolean; error?: string } {
  if (target === 'claude-code' || target === 'claude-app' || target === 'agent-teams') {
    return { available: true }; // 这些不需要外部 CLI
  }

  try {
    const { execSync } = require('child_process');
    if (target === 'codex') {
      execSync('codex --version', { stdio: 'pipe', timeout: 5000 });
      return { available: true };
    }
    if (target === 'opencode') {
      execSync('opencode --version', { stdio: 'pipe', timeout: 5000 });
      return { available: true };
    }
  } catch {
    return { available: false, error: `${target} CLI not found in PATH` };
  }

  return { available: false, error: `Unknown target: ${target}` };
}

/** OpenCode step_finish 事件中的 token 结构 */
interface OpenCodeTokens {
  total: number;
  input: number;
  output: number;
  reasoning: number;
  cache?: { write: number; read: number };
}

/** 从 OpenCode --format json 的 JSONL 输出中提取累计 token 和耗时 */
export function parseOpenCodeOutput(jsonlOutput: string): {
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  durationMs: number;
  cost: number;
  steps: number;
} {
  const lines = jsonlOutput.split('\n').filter(Boolean);
  let tokensIn = 0;
  let tokensOut = 0;
  let cost = 0;
  let steps = 0;
  let firstTimestamp = 0;
  let lastTimestamp = 0;

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      // 记录时间范围
      if (event.timestamp) {
        if (!firstTimestamp) firstTimestamp = event.timestamp;
        lastTimestamp = event.timestamp;
      }
      // 累加 step_finish 中的 token
      if (event.type === 'step_finish' && event.part?.tokens) {
        const t = event.part.tokens as OpenCodeTokens;
        tokensIn += t.input || 0;
        tokensOut += t.output || 0;
        steps++;
      }
      // 累加 cost
      if (event.part?.cost != null) {
        cost += event.part.cost;
      }
    } catch { /* skip malformed */ }
  }

  return {
    tokensIn,
    tokensOut,
    totalTokens: tokensIn + tokensOut,
    durationMs: lastTimestamp - firstTimestamp,
    cost,
    steps,
  };
}
