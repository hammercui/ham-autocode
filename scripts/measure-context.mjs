#!/usr/bin/env node
// 测量一个 task 在每个 target 下的实际 prompt 构成
// 用法: node scripts/measure-context.mjs <projectDir> <taskId>

import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';

const projectDir = process.argv[2] || process.cwd();
const taskId = process.argv[3] || 'task-002';

const distDir = path.resolve('D:/moneyProject/ham-autocode/dist');

const { buildMinimalContext } = await import(pathToFileURL(path.join(distDir, 'executor/context-template.js')).href);
const { readTask } = await import(pathToFileURL(path.join(distDir, 'state/task-graph.js')).href);

const task = readTask(projectDir, taskId);
if (!task) { console.error(`task ${taskId} not found`); process.exit(1); }

console.log(`# Task ${task.id}: ${task.name}`);
console.log(`Files: ${(task.files || []).join(', ') || '(none)'}`);
console.log(`Target (routed): ${task.routing?.target || '(unrouted)'}`);
console.log('');

const targets = ['opencode', 'codexfake', 'cc-haiku', 'cc-sonnet', 'claude-code', 'agent-teams', 'claude-app'];
const report = [];
for (const target of targets) {
  const { instruction, estimatedTokens } = buildMinimalContext(projectDir, task, target);
  // 切块分析
  const sections = {};
  sections.totalChars = instruction.length;
  sections.estimatedTokens = estimatedTokens;
  // 分层 CONTEXT.md 块
  const hierMarker = '## Directory Context (LSP symbols)';
  const hierIdx = instruction.indexOf(hierMarker);
  sections.hierarchical = hierIdx >= 0 ? instruction.length - hierIdx : 0;
  // Dependencies 块
  const depMarker = '## Dependencies (completed)';
  sections.dependencies = instruction.indexOf(depMarker) >= 0
    ? (instruction.slice(instruction.indexOf(depMarker)).indexOf(hierMarker) >= 0
        ? instruction.slice(instruction.indexOf(depMarker), instruction.indexOf(hierMarker)).length
        : (instruction.slice(instruction.indexOf(depMarker)).length - sections.hierarchical))
    : 0;
  // Reading list 块
  const readMarker = '## Read these files';
  sections.readingList = instruction.indexOf(readMarker) >= 0
    ? (instruction.slice(instruction.indexOf(readMarker)).search(/\n## /) + 1 || instruction.length - instruction.indexOf(readMarker))
    : 0;
  // PRE_IMPL / SURGICAL
  const preImpl = instruction.match(/Pre-implementation checklist:[\s\S]*?(?=\n\n|$)/);
  sections.preImplChecklist = preImpl ? preImpl[0].length : 0;
  const surgical = instruction.match(/Rules: surgical changes only\.[\s\S]*?(?=\n\n|$)/);
  sections.surgicalRule = surgical ? surgical[0].length : 0;
  // Budget warning
  sections.budgetWarning = instruction.includes('Context budget warning') ? 1 : 0;

  report.push({ target, ...sections });
}

console.log('| Target | Chars | Est.Tokens | Hierarchical | Deps | Reading | PreImpl | Surgical |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
for (const r of report) {
  console.log(`| ${r.target} | ${r.totalChars} | ${r.estimatedTokens} | ${r.hierarchical} | ${r.dependencies} | ${r.readingList} | ${r.preImplChecklist} | ${r.surgicalRule} |`);
}

// 把最大的一个 prompt 完整输出用于核对
console.log('\n\n--- Full prompt for target=claude-code ---\n');
const cc = buildMinimalContext(projectDir, task, 'claude-code');
console.log(cc.instruction);
console.log(`\n--- END (chars=${cc.instruction.length}, tokens≈${cc.estimatedTokens}) ---`);
