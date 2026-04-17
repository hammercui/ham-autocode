/**
 * v4.1 migration: legacy layout → .ham-autocode/state/ + docs/.
 *
 * Moves:
 *   .ham-autocode/tasks/         → .ham-autocode/state/tasks/
 *   .ham-autocode/logs/          → .ham-autocode/state/logs/
 *   .ham-autocode/learning/      → .ham-autocode/state/learning/
 *   .ham-autocode/dispatch/      → .ham-autocode/state/dispatch/
 *   .ham-autocode/context/       → .ham-autocode/state/context/
 *   .ham-autocode/research/      → .ham-autocode/state/research/
 *   .ham-autocode/worktrees/     → .ham-autocode/state/worktrees/
 *   .ham-autocode/progress.json  → .ham-autocode/state/progress.json
 *   .ham-autocode/pipeline.json  → .ham-autocode/state/pipeline.json
 *   .ham-autocode/harness.json   → .ham-autocode/state/harness.json
 *   .planning/                   → .ham-autocode/docs/plans/
 *
 * Idempotent: running twice is safe.
 */
import fs from 'fs';
import path from 'path';
import { ROOT, STATE } from '../paths.js';

interface MigrationPlan {
  src: string;
  dest: string;
  kind: 'dir' | 'file';
}

function buildPlan(projectDir: string): MigrationPlan[] {
  const plans: MigrationPlan[] = [];
  const legacyRoot = path.join(projectDir, ROOT);
  const newState = path.join(projectDir, STATE);

  const stateDirs = ['tasks', 'logs', 'learning', 'dispatch', 'context', 'research', 'worktrees', 'routing'];
  for (const d of stateDirs) {
    plans.push({
      src: path.join(legacyRoot, d),
      dest: path.join(newState, d),
      kind: 'dir',
    });
  }

  const stateFiles = ['progress.json', 'pipeline.json', 'harness.json'];
  for (const f of stateFiles) {
    plans.push({
      src: path.join(legacyRoot, f),
      dest: path.join(newState, f),
      kind: 'file',
    });
  }

  // .planning/ → .ham-autocode/docs/plans/
  plans.push({
    src: path.join(projectDir, '.planning'),
    dest: path.join(projectDir, ROOT, 'docs', 'plans'),
    kind: 'dir',
  });

  return plans;
}

function moveOne(plan: MigrationPlan): { action: 'moved' | 'skipped' | 'merged'; detail?: string } {
  if (!fs.existsSync(plan.src)) return { action: 'skipped', detail: 'src missing' };
  if (fs.existsSync(plan.dest)) {
    if (plan.kind === 'file') {
      return { action: 'skipped', detail: 'dest exists (keeping new)' };
    }
    // dir: merge — move files inside; for conflicts keep newer (by mtime)
    const entries = fs.readdirSync(plan.src);
    for (const entry of entries) {
      const srcEntry = path.join(plan.src, entry);
      const destEntry = path.join(plan.dest, entry);
      if (!fs.existsSync(destEntry)) {
        fs.renameSync(srcEntry, destEntry);
      } else {
        const srcStat = fs.statSync(srcEntry);
        const destStat = fs.statSync(destEntry);
        if (srcStat.mtimeMs > destStat.mtimeMs) {
          fs.rmSync(destEntry, { recursive: true, force: true });
          fs.renameSync(srcEntry, destEntry);
        } else {
          fs.rmSync(srcEntry, { recursive: true, force: true });
        }
      }
    }
    // remove src if empty
    try {
      if (fs.readdirSync(plan.src).length === 0) fs.rmdirSync(plan.src);
    } catch { /* best effort */ }
    return { action: 'merged' };
  }

  // dest missing — create parent and move
  fs.mkdirSync(path.dirname(plan.dest), { recursive: true });
  fs.renameSync(plan.src, plan.dest);
  return { action: 'moved' };
}

export interface MigrateResult {
  moved: string[];
  merged: string[];
  skipped: { path: string; reason: string }[];
  alreadyMigrated: boolean;
}

export function runMigrate(projectDir: string, dryRun = false): MigrateResult {
  const plans = buildPlan(projectDir);
  const result: MigrateResult = { moved: [], merged: [], skipped: [], alreadyMigrated: false };

  // Idempotency check: if state/ exists AND no legacy dirs remain, already migrated
  const hasNewState = fs.existsSync(path.join(projectDir, STATE));
  const hasLegacy = plans.some(p => fs.existsSync(p.src));
  if (hasNewState && !hasLegacy) {
    result.alreadyMigrated = true;
    return result;
  }

  if (dryRun) {
    for (const p of plans) {
      if (fs.existsSync(p.src)) result.moved.push(`${path.relative(projectDir, p.src)} → ${path.relative(projectDir, p.dest)}`);
    }
    return result;
  }

  for (const p of plans) {
    const r = moveOne(p);
    const relSrc = path.relative(projectDir, p.src);
    const relDest = path.relative(projectDir, p.dest);
    if (r.action === 'moved') result.moved.push(`${relSrc} → ${relDest}`);
    else if (r.action === 'merged') result.merged.push(`${relSrc} → ${relDest}`);
    else result.skipped.push({ path: relSrc, reason: r.detail || '' });
  }

  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleMigrate(args: string[], projectDir: string): any {
  const sub = args[1];
  const dryRun = args.includes('--dry-run') || sub === 'dry-run';

  if (sub === 'help') {
    return 'Usage: migrate [dry-run|--dry-run]\n\nMigrates legacy .ham-autocode/{tasks,logs,...} and .planning/ to v4.1 layout (.ham-autocode/state/ + docs/).';
  }

  return runMigrate(projectDir, dryRun);
}
