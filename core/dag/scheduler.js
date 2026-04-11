// core/dag/scheduler.js
'use strict';

const DONE_STATUSES = new Set(['done', 'skipped']);

/** Get next wave of executable tasks (all blockedBy resolved) */
function nextWave(tasks) {
  return tasks.filter(t => {
    if (t.status !== 'pending') return false;
    if (!t.blockedBy || t.blockedBy.length === 0) return true;
    return t.blockedBy.every(depId => {
      const dep = tasks.find(d => d.id === depId);
      return dep && DONE_STATUSES.has(dep.status);
    });
  });
}

/** Compute DAG statistics */
function dagStats(tasks) {
  const total = tasks.length;
  const byStatus = {};
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  }
  const done = (byStatus.done || 0) + (byStatus.skipped || 0);
  return { total, byStatus, done, remaining: total - done, progress: total > 0 ? Math.round(done / total * 100) : 0 };
}

module.exports = { nextWave, dagStats };
