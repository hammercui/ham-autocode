/**
 * Claude App adapter -- project manager for lightweight tasks.
 * Handles: config changes, docs, hotfixes, status conversations.
 * Instruction format: concise prompt suitable for conversational UI.
 */

import { BaseAdapter } from './adapter.js';
import type { ExecutionContext, RawResult, ParsedResult } from './adapter.js';
import type { TaskState } from '../types.js';

interface ClaudeAppResult extends ParsedResult {
  conversationId: string | null;
}

export class ClaudeAppAdapter extends BaseAdapter {
  constructor() {
    super('claude-app');
  }

  generateInstruction(task: TaskState, _context?: ExecutionContext): string {
    const fileList = (task.files || []).map(f => `\`${f}\``).join(', ');

    return [
      `**Task:** ${task.name}`,
      '',
      task.spec?.description || '',
      '',
      fileList ? `**Files:** ${fileList}` : '',
      '',
      task.spec?.acceptance ? `**Done when:** ${task.spec.acceptance}` : '',
    ].filter(Boolean).join('\n');
  }

  parseResult(rawResult?: RawResult | null): ClaudeAppResult {
    const base = super.parseResult(rawResult);
    return {
      ...base,
      conversationId: rawResult?.conversationId as string | null ?? null,
    };
  }
}
