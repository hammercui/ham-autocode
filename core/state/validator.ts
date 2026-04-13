// core/state/validator.ts
// Lightweight runtime schema validation (zero dependencies).
// Validates pipeline.json and task-*.json on read to catch corruption early.

import type { PipelineState, TaskState } from '../types.js';

export interface ValidationError {
  field: string;
  message: string;
}

const PIPELINE_STATUSES = new Set(['running', 'paused', 'interrupted', 'completed']);
const TASK_STATUSES = new Set(['pending', 'in_progress', 'blocked', 'validating', 'done', 'failed', 'skipped']);

function checkString(obj: Record<string, unknown>, field: string, errors: ValidationError[]): void {
  if (typeof obj[field] !== 'string') errors.push({ field, message: `must be a string` });
}

function checkNumber(obj: Record<string, unknown>, field: string, errors: ValidationError[]): void {
  if (typeof obj[field] !== 'number') errors.push({ field, message: `must be a number` });
}

/**
 * Validate pipeline.json structure.
 * Returns empty array if valid, errors otherwise.
 */
export function validatePipeline(data: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!data || typeof data !== 'object') return [{ field: 'root', message: 'must be an object' }];

  const obj = data as Record<string, unknown>;
  checkNumber(obj, 'schemaVersion', errors);
  checkString(obj, 'project', errors);
  checkString(obj, 'status', errors);
  checkString(obj, 'started_at', errors);
  checkString(obj, 'updated_at', errors);

  if (typeof obj.status === 'string' && !PIPELINE_STATUSES.has(obj.status)) {
    errors.push({ field: 'status', message: `must be one of: ${[...PIPELINE_STATUSES].join(', ')}` });
  }

  if (!Array.isArray(obj.log)) {
    errors.push({ field: 'log', message: 'must be an array' });
  }

  return errors;
}

/**
 * Validate task-*.json structure.
 * Returns empty array if valid, errors otherwise.
 */
export function validateTask(data: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!data || typeof data !== 'object') return [{ field: 'root', message: 'must be an object' }];

  const obj = data as Record<string, unknown>;
  checkNumber(obj, 'schemaVersion', errors);
  checkString(obj, 'id', errors);
  checkString(obj, 'name', errors);
  checkString(obj, 'status', errors);

  if (typeof obj.status === 'string' && !TASK_STATUSES.has(obj.status)) {
    errors.push({ field: 'status', message: `must be one of: ${[...TASK_STATUSES].join(', ')}` });
  }

  if (!Array.isArray(obj.blockedBy)) {
    errors.push({ field: 'blockedBy', message: 'must be an array' });
  }

  if (!Array.isArray(obj.files)) {
    errors.push({ field: 'files', message: 'must be an array' });
  }

  return errors;
}

/**
 * Validate and return typed data, or throw with details.
 */
export function assertValidPipeline(data: unknown): PipelineState {
  const errors = validatePipeline(data);
  if (errors.length > 0) {
    throw new Error(`Invalid pipeline.json: ${errors.map(e => `${e.field} ${e.message}`).join('; ')}`);
  }
  return data as PipelineState;
}

export function assertValidTask(data: unknown): TaskState {
  const errors = validateTask(data);
  if (errors.length > 0) {
    throw new Error(`Invalid task file: ${errors.map(e => `${e.field} ${e.message}`).join('; ')}`);
  }
  return data as TaskState;
}
