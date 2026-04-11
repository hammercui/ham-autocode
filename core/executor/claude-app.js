// core/executor/claude-app.js
'use strict';
const { BaseAdapter } = require('./adapter');

/**
 * Claude App adapter — project manager for lightweight tasks.
 * Handles: config changes, docs, hotfixes, status conversations.
 * Instruction format: concise prompt suitable for conversational UI.
 */
class ClaudeAppAdapter extends BaseAdapter {
  constructor() {
    super('claude-app');
  }

  generateInstruction(task, context) {
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

  parseResult(rawResult) {
    const base = super.parseResult(rawResult);
    return {
      ...base,
      conversationId: rawResult?.conversationId || null,
    };
  }
}

module.exports = { ClaudeAppAdapter };
