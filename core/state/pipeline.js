// core/state/pipeline.js
'use strict';
const path = require('path');
const { atomicWriteJSON, readJSON } = require('./atomic');
const { withLock } = require('./lock');
const { migrate } = require('./migrate');

function pipelinePath(projectDir) {
  return path.join(projectDir, '.ham-autocode', 'pipeline.json');
}

function stateDir(projectDir) {
  return path.join(projectDir, '.ham-autocode');
}

function readPipeline(projectDir) {
  const data = readJSON(pipelinePath(projectDir));
  return data ? migrate(data) : null;
}

function writePipeline(projectDir, data) {
  data.updated_at = new Date().toISOString();
  withLock(stateDir(projectDir), () => {
    atomicWriteJSON(pipelinePath(projectDir), data);
  });
}

function initPipeline(projectDir, projectName) {
  const data = {
    schemaVersion: 2,
    project: projectName,
    status: 'running',
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    current_task: null,
    log: [],
  };
  writePipeline(projectDir, data);
  return data;
}

function appendLog(projectDir, action) {
  const pipeline = readPipeline(projectDir);
  if (!pipeline) return;
  pipeline.log.push({ time: new Date().toISOString(), action });
  writePipeline(projectDir, pipeline);
}

module.exports = { readPipeline, writePipeline, initPipeline, appendLog };
