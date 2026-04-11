// core/dag/graph.js
'use strict';

/** Topological sort using Kahn's algorithm. Returns { sorted, cycles } */
function topoSort(tasks) {
  const graph = new Map(); // id → { task, edges: Set }
  const inDegree = new Map();

  for (const t of tasks) {
    graph.set(t.id, { task: t, edges: new Set(t.blockedBy || []) });
    inDegree.set(t.id, (t.blockedBy || []).length);
  }

  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted = [];
  while (queue.length > 0) {
    const id = queue.shift();
    sorted.push(graph.get(id).task);
    for (const [otherId, node] of graph) {
      if (node.edges.has(id)) {
        node.edges.delete(id);
        inDegree.set(otherId, inDegree.get(otherId) - 1);
        if (inDegree.get(otherId) === 0) queue.push(otherId);
      }
    }
  }

  const cycles = tasks.filter(t => !sorted.find(s => s.id === t.id)).map(t => t.id);
  return { sorted, cycles };
}

/** Detect if adding edge from→to would create a cycle */
function wouldCycle(tasks, fromId, toId) {
  // BFS from toId, see if we can reach fromId
  const visited = new Set();
  const queue = [toId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === fromId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const task = tasks.find(t => t.id === current);
    if (task && task.blockedBy) {
      for (const dep of task.blockedBy) queue.push(dep);
    }
  }
  return false;
}

module.exports = { topoSort, wouldCycle };
