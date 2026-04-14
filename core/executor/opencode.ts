import { BaseAdapter } from './adapter.js';
import type { ExecutionContext } from './adapter.js';
import type { TaskState } from '../types.js';

/**
 * OpenCode adapter — routes to GLM-5.1 (free) for simple tasks.
 * Used for: file rename, format fix, doc update, config change, simple refactor.
 */
export class OpenCodeAdapter extends BaseAdapter {
  constructor() {
    super('opencode');
  }

  generateInstruction(task: TaskState, _context?: ExecutionContext): string {
    const files = (task.files || []).map(f => `- \`${f}\``).join('\n');
    return [
      `# Task: ${task.name}`,
      `## Spec`,
      task.spec?.description || task.name,
      files ? `## Files to modify\n${files}` : '',
      `## Instructions`,
      `1. Implement according to the spec above`,
      `2. Keep changes minimal and focused`,
      `3. Follow existing code conventions`,
      `4. Do not introduce new dependencies`,
      '',
      `> Execute with: opencode -p "..." --model glm-5.1`,
    ].filter(Boolean).join('\n');
  }
}
