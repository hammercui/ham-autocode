// core/dag/graph.ts
import type { TaskState, TopoSortResult } from '../types.js';

interface GraphNode {
  task: TaskState;
  edges: Set<string>;
}

/** Topological sort using Kahn's algorithm. Returns { sorted, cycles } */
export function topoSort(tasks: TaskState[]): TopoSortResult {
  const graph = new Map<string, GraphNode>();
  const inDegree = new Map<string, number>();
  const taskIds = new Set(tasks.map(t => t.id));

  for (const t of tasks) {
    const edges = new Set((t.blockedBy || []).filter(depId => taskIds.has(depId)));
    graph.set(t.id, { task: t, edges });
    inDegree.set(t.id, edges.size);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: TaskState[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(graph.get(id)!.task);
    for (const [otherId, node] of graph) {
      if (node.edges.has(id)) {
        node.edges.delete(id);
        inDegree.set(otherId, inDegree.get(otherId)! - 1);
        if (inDegree.get(otherId) === 0) queue.push(otherId);
      }
    }
  }

  const cycles = tasks.filter(t => !sorted.find(s => s.id === t.id)).map(t => t.id);
  return { sorted, cycles };
}

/** Detect if adding edge from→to would create a cycle */
export function wouldCycle(tasks: TaskState[], fromId: string, toId: string): boolean {
  // BFS from toId, see if we can reach fromId
  const visited = new Set<string>();
  const queue: string[] = [toId];
  while (queue.length > 0) {
    const current = queue.shift()!;
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
