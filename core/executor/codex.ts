/**
 * Codexfake adapter — opencode + GPT model for tasks with clear requirements.
 * Generates explicit task specifications: file paths, interfaces, expected behavior.
 * Replaces the deprecated codex CLI — dispatched via opencode --model.
 */

import { BaseAdapter } from './adapter.js';
import type { ExecutionContext, RawResult, ParsedResult } from './adapter.js';
import type { TaskState } from '../types.js';

interface CodexResult extends ParsedResult {
  sandboxId: string | null;
}

export class CodexAdapter extends BaseAdapter {
  constructor() {
    super('codexfake');
  }

  generateInstruction(task: TaskState, _context?: ExecutionContext): string {
    const fileList = (task.files || []).map(f => `- \`${f}\``).join('\n');

    return [
      `# Task: ${task.name}`,
      '',
      `## Description`,
      task.spec?.description || 'No description provided.',
      '',
      task.spec?.interface ? `## Interface Contract\n\`\`\`\n${task.spec.interface}\n\`\`\`\n` : '',
      `## Files to create/modify`,
      fileList,
      '',
      task.spec?.acceptance ? `## Expected Behavior\n${task.spec.acceptance}\n` : '',
      `## Constraints`,
      `- Implement ONLY what is specified above`,
      `- Do not modify files outside the listed scope`,
      `- Include inline comments for non-obvious logic`,
      `- Ensure all exports match the interface contract`,
    ].filter(Boolean).join('\n');
  }

  parseResult(rawResult?: RawResult | null): CodexResult {
    const base = super.parseResult(rawResult);
    return {
      ...base,
      sandboxId: rawResult?.sandboxId as string | null ?? null,
    };
  }
}
