import { BaseAdapter } from './adapter.js';
import type { TaskState } from '../types.js';

export interface TeammateAssignment {
  name: string;
  tasks: string[];
  files: string[];
}

export class AgentTeamsAdapter extends BaseAdapter {
  constructor() {
    super('agent-teams');
  }

  generateInstruction(task: TaskState): string {
    return `# Agent Teams Task: ${task.name}\n## Assigned Files\n${(task.files || []).map(f => '- ' + f).join('\n')}\n## Instructions\n1. Work only on assigned files\n2. Follow TDD methodology\n3. Commit atomically when done\n4. Report results via dag complete/fail`;
  }

  /** Assign teammates based on file ownership grouping (AT3) */
  static assignTeammates(tasks: TaskState[]): TeammateAssignment[] {
    // Build file -> task mapping
    const fileToTasks = new Map<string, string[]>();
    for (const task of tasks) {
      for (const file of task.files || []) {
        const existing = fileToTasks.get(file) || [];
        existing.push(task.id);
        fileToTasks.set(file, existing);
      }
    }

    // Initialize groups: each task owns its files
    const groups: Map<string, Set<string>> = new Map();
    for (const task of tasks) {
      groups.set(task.id, new Set(task.files || []));
    }

    // Merge tasks that share files (conflict detection)
    for (const [_file, taskIds] of fileToTasks) {
      if (taskIds.length > 1) {
        const primary = taskIds[0];
        for (let i = 1; i < taskIds.length; i++) {
          const secondary = taskIds[i];
          const secondaryFiles = groups.get(secondary);
          if (secondaryFiles) {
            const primaryFiles = groups.get(primary)!;
            for (const f of secondaryFiles) primaryFiles.add(f);
            groups.delete(secondary);
          }
        }
      }
    }

    // AT2: Progressive batching — build teammate assignments
    const assignments: TeammateAssignment[] = [];
    let idx = 0;
    for (const [taskId, files] of groups) {
      // Collect all tasks belonging to this group
      const groupTasks = tasks.filter(t =>
        t.id === taskId || (t.files || []).some(f => files.has(f))
      ).map(t => t.id);

      assignments.push({
        name: `teammate-${idx + 1}`,
        tasks: [...new Set(groupTasks)],
        files: [...files],
      });
      idx++;
    }

    return assignments;
  }
}
