/**
 * Agent Dispatcher — 封装 opencode CLI 调用参数。
 * codex 路由目标实际通过 opencode --model 执行（codex CLI 已弃用）。
 * 不管理进程生命周期（由调用方决定同步/异步），只生成正确的 shell 命令。
 */

import type { RoutingTarget } from '../types.js';
import { loadConfig } from '../state/config.js';

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
  options?: { model?: string; cwd?: string; projectDir?: string }
): DispatchCommand {
  // 转义 instruction 中的单引号，用于 shell
  const escaped = instruction.replace(/'/g, "'\\''");

  switch (target) {
    case 'codexfake': {
      // codexfake 路由目标 → opencode CLI + GPT 模型（替代已弃用的 codex CLI）
      const gptModel = options?.model || resolveGptModel(options?.projectDir);
      return {
        command: `opencode run --dangerously-skip-permissions --format json --model "${gptModel}" '${escaped}'`,
        agent: 'opencode',
        model: gptModel,
      };
    }

    case 'opencode': {
      // 简单任务 — 使用 opencode 默认模型（glm-4.7 等，在 opencode 自身配置）
      // 仅当调用方显式指定 model 时才覆盖
      const modelFlag = options?.model ? ` --model "${options.model}"` : '';
      return {
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

    case 'cc-sonnet':
    case 'cc-haiku': {
      // v4.2: 同账号降档 — 通过 claude -p --model 调用子 agent
      const model = options?.model || resolveCcSubagentModel(target, options?.projectDir);
      return {
        command: `claude -p --model "${model}" --output-format json --dangerously-skip-permissions '${escaped}'`,
        agent: target,
        model,
      };
    }

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

/**
 * 解析 codex 路由目标使用的 GPT 模型标识（provider/model 格式）。
 * 优先读取 harness.json 配置，回退到默认值。
 */
function resolveGptModel(projectDir?: string): string {
  try {
    const config = loadConfig(projectDir || '.').routing;
    const provider = config.opencodeGptProviders?.[0] || 'github-copilot';
    const model = config.opencodeGptModel || 'gpt-5.4-mini';
    return `${provider}/${model}`;
  } catch {
    return 'github-copilot/gpt-5.4-mini';
  }
}

/** v4.2: 解析 claude-code 子 agent 模型名 (claude -p --model) */
function resolveCcSubagentModel(target: 'cc-sonnet' | 'cc-haiku', projectDir?: string): string {
  try {
    const config = loadConfig(projectDir || '.').routing;
    const sub = config.ccSubagent;
    if (target === 'cc-sonnet') return sub?.sonnet || 'claude-sonnet-4-6';
    return sub?.haiku || 'claude-haiku-4-5-20251001';
  } catch {
    return target === 'cc-sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
  }
}

/** 检查 agent CLI 是否可用 */
export function checkAgentAvailable(target: RoutingTarget): { available: boolean; error?: string } {
  if (target === 'claude-code' || target === 'claude-app' || target === 'agent-teams') {
    return { available: true }; // 这些不需要外部 CLI
  }

  const { execSync } = require('child_process');

  // v4.2: cc-sonnet/cc-haiku 通过 claude CLI 执行
  if (target === 'cc-sonnet' || target === 'cc-haiku') {
    try {
      execSync('claude --version', { stdio: 'pipe', timeout: 5000 });
      return { available: true };
    } catch {
      return { available: false, error: 'claude CLI not found in PATH' };
    }
  }

  // codex 和 opencode 路由目标都通过 opencode CLI 执行
  try {
    execSync('opencode --version', { stdio: 'pipe', timeout: 5000 });
    return { available: true };
  } catch {
    return { available: false, error: 'opencode CLI not found in PATH' };
  }
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
