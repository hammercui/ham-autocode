/**
 * Command handlers: learn
 */
import path from 'path';
import { readTask } from '../state/task-graph.js';
import { analyzeHistory } from '../learning/analyzer.js';
import { suggestAdaptations, applyAdaptations, readLearningHistory, appendToHistory, resetLearning } from '../learning/adapter.js';
import { learnPatterns, getPatternHints } from '../learning/patterns.js';
import { autoLearnStatus } from '../learning/auto-learn.js';
import { readBrain, evolveFromScan } from '../learning/project-brain.js';
import { indexProjectEntities } from '../learning/code-entities.js';
import { buildDependencyGraph, fileDependencies, impactAnalysis } from '../learning/dependency-graph.js';
import { checkGuard } from '../learning/memory-guard.js';
import { recordFinding, resolveFinding, fieldTestSummary } from '../learning/field-test.js';
import type { FieldTestCategory } from '../learning/field-test.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleLearn(args: string[], projectDir: string): any {
  const sub = args[1];

  if (sub === 'analyze') {
    const insights = analyzeHistory(projectDir);
    appendToHistory(projectDir, insights);
    return insights;
  }
  if (sub === 'suggest') return suggestAdaptations(projectDir);
  if (sub === 'apply') return applyAdaptations(projectDir);
  if (sub === 'patterns') return learnPatterns(projectDir);
  if (sub === 'history') return readLearningHistory(projectDir);
  if (sub === 'reset') return resetLearning(projectDir);
  if (sub === 'status') return autoLearnStatus(projectDir);
  if (sub === 'brain') return readBrain(projectDir);
  if (sub === 'scan') { evolveFromScan(projectDir); return readBrain(projectDir); }
  if (sub === 'hints') {
    const taskName = args.slice(2).join(' ');
    if (!taskName) throw new Error('Usage: learn hints <task-name>');
    return getPatternHints(projectDir, taskName);
  }
  if (sub === 'entities') return indexProjectEntities(projectDir);
  if (sub === 'deps') {
    const file = args[2];
    return file ? fileDependencies(projectDir, file) : buildDependencyGraph(projectDir);
  }
  if (sub === 'impact') {
    const files = args.slice(2);
    if (files.length === 0) throw new Error('Usage: learn impact <file1> [file2] ...');
    return impactAnalysis(projectDir, files);
  }
  if (sub === 'guard') {
    const taskId = args[2];
    const files = taskId ? (readTask(projectDir, taskId)?.files || []) : [];
    return checkGuard(projectDir, files);
  }
  if (sub === 'field-test') {
    const action = args[2];
    if (action === 'record') {
      const category = args[3] as FieldTestCategory;
      const severity = args[4] as 'P0' | 'P1' | 'P2';
      const description = args.slice(5).join(' ');
      if (!category || !severity || !description) throw new Error('Usage: learn field-test record <category> <severity> <description>');
      return recordFinding(projectDir, {
        project: path.basename(projectDir), phase: 'manual',
        category, severity, description, context: 'Manually recorded via CLI',
      });
    }
    if (action === 'resolve') {
      const id = args[3];
      const resolution = args.slice(4).join(' ');
      if (!id || !resolution) throw new Error('Usage: learn field-test resolve <id> <resolution>');
      const result = resolveFinding(projectDir, id, resolution);
      if (!result) throw new Error(`Finding ${id} not found`);
      return result;
    }
    return fieldTestSummary(projectDir);
  }
  throw new Error(`Unknown learn subcommand: ${sub}`);
}
