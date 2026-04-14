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

/** 默认 opencode 模型（智谱 AI Coding Plan 免费） */
const DEFAULT_OPENCODE_MODEL = 'alibaba-coding-plan-cn/glm-5';

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
      const model = options?.model || DEFAULT_OPENCODE_MODEL;
      return {
        command: `opencode run --dangerously-skip-permissions --model "${model}" '${escaped}'`,
        agent: 'opencode',
        model,
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
