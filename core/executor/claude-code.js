// core/executor/claude-code.js
'use strict';
const { BaseAdapter } = require('./adapter');

/**
 * Claude Code adapter — lead engineer.
 * Handles complex tasks: architecture, multi-file coordination, TDD.
 * Instruction format: full prompt with context, spec, and acceptance criteria.
 */
class ClaudeCodeAdapter extends BaseAdapter {
  constructor() {
    super('claude-code');
  }

  generateInstruction(task, context) {
    const fileList = (task.files || []).map(f => `- \`${f}\``).join('\n');
    const contextFiles = (context?.files || [])
      .map(f => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
      .join('\n\n');

    return [
      `# Task: ${task.name}`,
      '',
      `## Spec`,
      task.spec?.description || 'No description provided.',
      '',
      task.spec?.interface ? `## Interface\n${task.spec.interface}\n` : '',
      task.spec?.acceptance ? `## Acceptance Criteria\n${task.spec.acceptance}\n` : '',
      `## Files to modify`,
      fileList,
      '',
      contextFiles ? `## Context\n${contextFiles}` : '',
      '',
      `## Instructions`,
      `1. Implement according to the spec above`,
      `2. Follow TDD: write tests first, then implement`,
      `3. Run all relevant tests before marking complete`,
      `4. Report completion and validation status, but do not commit changes automatically`,
    ].filter(Boolean).join('\n');
  }

  parseResult(rawResult) {
    const base = super.parseResult(rawResult);
    // Claude Code returns structured output
    return {
      ...base,
      sessionId: rawResult?.sessionId || null,
      commitHash: rawResult?.commitHash || null,
    };
  }
}

module.exports = { ClaudeCodeAdapter };
