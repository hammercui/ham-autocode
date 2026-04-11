// core/state/task-graph.ts
import fs from 'fs';
import path from 'path';
import { atomicWriteJSON, readJSON } from './atomic.js';
import { withLock } from './lock.js';
import type { TaskState, TaskStatus } from '../types.js';

const TASK_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function tasksDir(projectDir: string): string {
  return path.join(projectDir, '.ham-autocode', 'tasks');
}

function taskPath(projectDir: string, taskId: string): string {
  const validTaskId = validateTaskId(taskId);
  const dir = tasksDir(projectDir);
  const filePath = path.resolve(dir, validTaskId + '.json');
  const root = path.resolve(dir);
  if (filePath !== path.join(root, validTaskId + '.json')) {
    throw new Error(`Invalid taskId: ${taskId}`);
  }
  return filePath;
}

function validateTaskId(taskId: string): string {
  if (typeof taskId !== 'string' || !TASK_ID_PATTERN.test(taskId)) {
    throw new Error(`Invalid taskId: ${taskId}`);
  }
  return taskId;
}

export function readTask(projectDir: string, taskId: string): TaskState | null {
  const { data, error } = readJSON<TaskState>(taskPath(projectDir, taskId));
  if (error && error.code !== 'ENOENT') throw error;
  return data;
}

export function writeTask(projectDir: string, task: TaskState): void {
  validateTaskId(task.id);
  const dir = tasksDir(projectDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const sd = path.join(projectDir, '.ham-autocode');
  withLock(sd, () => {
    atomicWriteJSON(taskPath(projectDir, task.id), task);
  });
}

export function readAllTasks(projectDir: string): TaskState[] {
  const dir = tasksDir(projectDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const { data, error } = readJSON<TaskState>(path.join(dir, f));
      if (error) throw error;
      return data;
    })
    .filter((d): d is TaskState => d !== null);
}

export function updateTaskStatus(
  projectDir: string,
  taskId: string,
  status: TaskStatus,
  extra: Partial<TaskState> = {},
): TaskState {
  const dir = path.join(projectDir, '.ham-autocode');
  return withLock(dir, () => {
    const task = readTask(projectDir, taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    task.status = status;
    Object.assign(task, extra);
    atomicWriteJSON(taskPath(projectDir, task.id), task);
    return task;
  });
}
