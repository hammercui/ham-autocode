// core/dag/merge.ts — Diff-merge PLAN.md changes with live DAG state
import type { TaskState } from '../types.js';
import { readAllTasks, writeTask, nextTaskId } from '../state/task-graph.js';
import { parsePlanToTasks, findPlanFile } from './parser.js';
import fs from 'fs';

export interface MergeResult {
  kept: { liveId: string; name: string }[];
  updated: { liveId: string; name: string; changes: string[] }[];
  added: { id: string; name: string }[];
  removedCandidates: { id: string; name: string }[];
  conflicts: { liveId: string; name: string; reason: string }[];
}

/** Dice coefficient on character bigrams — simple zero-dep string similarity. */
function dice(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, ' ').trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;

  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let overlap = 0;
  for (const b of ba) { if (bb.has(b)) overlap++; }
  return (2 * overlap) / (ba.size + bb.size);
}

/** Compute file overlap ratio between two file lists. */
function fileOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const common = b.filter(f => setA.has(f)).length;
  const union = new Set([...a, ...b]).size;
  return union > 0 ? common / union : 0;
}

/**
 * Re-parse PLAN.md and diff-merge with live task state.
 * Preserves done/skipped tasks, updates pending/failed, adds new, flags removals.
 */
export function mergeWithPlan(projectDir: string, planFilePath?: string): MergeResult {
  const planFile = planFilePath || findPlanFile(projectDir);
  if (!planFile) throw new Error('No plan file found. Provide path or place PLAN.md/WBS.md in standard locations.');
  if (!fs.existsSync(planFile)) throw new Error(`Plan file not found: ${planFile}`);

  const content = fs.readFileSync(planFile, 'utf8');
  const freshTasks = parsePlanToTasks(content);
  const liveTasks = readAllTasks(projectDir);

  if (freshTasks.length === 0) throw new Error('No tasks parsed from plan file');

  // Step 1: Build matching — fresh → live
  const DICE_THRESHOLD = 0.7;
  const FILE_OVERLAP_THRESHOLD = 0.5;

  const freshToLive = new Map<string, string>(); // freshId → liveId
  const liveMatched = new Set<string>();

  // Pass 1: exact name match
  for (const fresh of freshTasks) {
    for (const live of liveTasks) {
      if (liveMatched.has(live.id)) continue;
      if (dice(fresh.name, live.name) >= 0.95) {
        freshToLive.set(fresh.id, live.id);
        liveMatched.add(live.id);
        break;
      }
    }
  }

  // Pass 2: fuzzy name match for unmatched
  for (const fresh of freshTasks) {
    if (freshToLive.has(fresh.id)) continue;
    let bestScore = 0;
    let bestLive: TaskState | null = null;
    for (const live of liveTasks) {
      if (liveMatched.has(live.id)) continue;
      const nameScore = dice(fresh.name, live.name);
      const fileScore = fileOverlap(fresh.files, live.files);
      const combined = nameScore * 0.7 + fileScore * 0.3;
      if (combined > bestScore && combined >= DICE_THRESHOLD) {
        bestScore = combined;
        bestLive = live;
      }
      // Also try pure file overlap as backup
      if (nameScore < DICE_THRESHOLD && fileScore >= FILE_OVERLAP_THRESHOLD && fileScore > bestScore) {
        bestScore = fileScore;
        bestLive = live;
      }
    }
    if (bestLive) {
      freshToLive.set(fresh.id, bestLive.id);
      liveMatched.add(bestLive.id);
    }
  }

  // Step 2: Classify and apply
  const result: MergeResult = { kept: [], updated: [], added: [], removedCandidates: [], conflicts: [] };

  // Build fresh→live ID mapping for dependency remapping
  const idMap = new Map<string, string>(); // freshId → actual liveId (or new ID)
  for (const [freshId, liveId] of freshToLive) idMap.set(freshId, liveId);

  // Process matched tasks
  for (const fresh of freshTasks) {
    const liveId = freshToLive.get(fresh.id);
    if (!liveId) continue; // handled as "added" below

    const live = liveTasks.find(t => t.id === liveId)!;

    // Done/skipped: never touch
    if (live.status === 'done' || live.status === 'skipped') {
      result.kept.push({ liveId, name: live.name });
      continue;
    }

    // In-progress: conflict — don't modify running task
    if (live.status === 'in_progress') {
      result.conflicts.push({ liveId, name: live.name, reason: 'Task is in progress' });
      continue;
    }

    // Pending/failed/blocked: update spec, files, blockedBy from fresh
    const changes: string[] = [];
    if (fresh.spec.description && fresh.spec.description !== live.spec.description) {
      live.spec.description = fresh.spec.description;
      changes.push('spec.description');
    }
    if (fresh.spec.interface && fresh.spec.interface !== live.spec.interface) {
      live.spec.interface = fresh.spec.interface;
      changes.push('spec.interface');
    }
    if (fresh.spec.acceptance && fresh.spec.acceptance !== live.spec.acceptance) {
      live.spec.acceptance = fresh.spec.acceptance;
      changes.push('spec.acceptance');
    }
    if (fresh.files.length > 0 && JSON.stringify(fresh.files) !== JSON.stringify(live.files)) {
      live.files = fresh.files;
      live.context.requiredFiles = fresh.files;
      changes.push('files');
    }

    if (changes.length > 0) {
      writeTask(projectDir, live);
      result.updated.push({ liveId, name: live.name, changes });
    } else {
      result.kept.push({ liveId, name: live.name });
    }
  }

  // Process new tasks (fresh tasks with no live match)
  for (const fresh of freshTasks) {
    if (freshToLive.has(fresh.id)) continue;

    const newId = nextTaskId(projectDir);
    idMap.set(fresh.id, newId);

    // Remap blockedBy through idMap
    const remappedDeps = fresh.blockedBy
      .map(depId => idMap.get(depId) || depId)
      .filter(depId => {
        // Only keep deps that exist in live state
        const exists = liveTasks.some(t => t.id === depId) || result.added.some(a => a.id === depId);
        return exists;
      });

    const newTask: TaskState = {
      ...fresh,
      id: newId,
      blockedBy: remappedDeps,
      context: { ...fresh.context, requiredFiles: fresh.files },
    };

    writeTask(projectDir, newTask);
    result.added.push({ id: newId, name: fresh.name });
  }

  // Process removal candidates (live tasks with no fresh match)
  for (const live of liveTasks) {
    if (liveMatched.has(live.id)) continue;
    // Only flag pending/failed/blocked as removal candidates
    if (live.status === 'done' || live.status === 'skipped') continue;
    result.removedCandidates.push({ id: live.id, name: live.name });
  }

  return result;
}
