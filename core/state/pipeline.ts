// core/state/pipeline.ts
import path from 'path';
import { atomicWriteJSON, readJSON } from './atomic.js';
import { withLock } from './lock.js';
import { migrate } from './migrate.js';
import { validatePipeline } from './validator.js';
import type { PipelineState, PipelineStatus } from '../types.js';
import { PIPELINE_JSON, ROOT } from '../paths.js';

function pipelinePath(projectDir: string): string {
  return path.join(projectDir, PIPELINE_JSON);
}

function stateDir(projectDir: string): string {
  return path.join(projectDir, ROOT);
}

export function readPipeline(projectDir: string): PipelineState | null {
  const { data, error } = readJSON<PipelineState>(pipelinePath(projectDir));
  if (error && error.code !== 'ENOENT') throw error;
  if (!data) return null;
  const validationErrors = validatePipeline(data);
  if (validationErrors.length > 0) {
    throw new Error(`Corrupt pipeline.json: ${validationErrors.map(e => `${e.field} ${e.message}`).join('; ')}`);
  }
  return migrate(data);
}

export function writePipeline(projectDir: string, data: PipelineState): void {
  data.updated_at = new Date().toISOString();
  withLock(stateDir(projectDir), () => {
    atomicWriteJSON(pipelinePath(projectDir), data);
  });
}

export function initPipeline(projectDir: string, projectName: string): PipelineState {
  const data: PipelineState = {
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

export function appendLog(projectDir: string, action: string): PipelineState | null {
  return withLock(stateDir(projectDir), () => {
    const pipeline = readPipeline(projectDir);
    if (!pipeline) return null;
    pipeline.log.push({ time: new Date().toISOString(), action });
    atomicWriteJSON(pipelinePath(projectDir), pipeline);
    return pipeline;
  });
}

export function setPipelineStatus(
  projectDir: string,
  status: PipelineStatus,
  extra: Partial<PipelineState> = {},
): PipelineState {
  return withLock(stateDir(projectDir), () => {
    const pipeline = readPipeline(projectDir);
    if (!pipeline) throw new Error('No pipeline found');
    pipeline.status = status;
    Object.assign(pipeline, extra);
    atomicWriteJSON(pipelinePath(projectDir), pipeline);
    return pipeline;
  });
}

/** Gap A5: update arbitrary pipeline fields without changing status. */
export function updatePipelineFields(projectDir: string, fields: Partial<PipelineState>): PipelineState | null {
  return withLock(stateDir(projectDir), () => {
    const pipeline = readPipeline(projectDir);
    if (!pipeline) return null;
    Object.assign(pipeline, fields);
    pipeline.updated_at = new Date().toISOString();
    atomicWriteJSON(pipelinePath(projectDir), pipeline);
    return pipeline;
  });
}
