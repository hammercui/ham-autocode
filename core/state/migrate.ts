// core/state/migrate.ts
import type { PipelineState } from '../types.js';

export const CURRENT_VERSION = 2;

const migrations: Record<number, (data: PipelineState) => PipelineState> = {
  // 1: (data) => { data.schemaVersion = 2; return data; }
};

export function migrate(data: Partial<PipelineState> | null): PipelineState {
  if (!data || !data.schemaVersion) {
    data = data || {} as Partial<PipelineState>;
    data.schemaVersion = CURRENT_VERSION;
    return data as PipelineState;
  }
  let version = data.schemaVersion;
  while (version < CURRENT_VERSION) {
    if (migrations[version]) {
      data = migrations[version](data as PipelineState);
    }
    version++;
    data.schemaVersion = version;
  }
  return data as PipelineState;
}
