// core/state/task-graph.js
'use strict';
const fs = require('fs');
const path = require('path');
const { atomicWriteJSON, readJSON } = require('./atomic');
const { withLock } = require('./lock');

function tasksDir(projectDir) {
  return path.join(projectDir, '.ham-autocode', 'tasks');
}

function taskPath(projectDir, taskId) {
  return path.join(tasksDir(projectDir), taskId + '.json');
}

function readTask(projectDir, taskId) {
  return readJSON(taskPath(projectDir, taskId));
}

function writeTask(projectDir, task) {
  const dir = tasksDir(projectDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const sd = path.join(projectDir, '.ham-autocode');
  withLock(sd, () => {
    atomicWriteJSON(taskPath(projectDir, task.id), task);
  });
}

function readAllTasks(projectDir) {
  const dir = tasksDir(projectDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => readJSON(path.join(dir, f)))
    .filter(Boolean);
}

function updateTaskStatus(projectDir, taskId, status, extra = {}) {
  const task = readTask(projectDir, taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  task.status = status;
  Object.assign(task, extra);
  writeTask(projectDir, task);
  return task;
}

module.exports = { readTask, writeTask, readAllTasks, updateTaskStatus, tasksDir };
