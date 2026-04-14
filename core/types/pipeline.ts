/** Pipeline and phase state types */

export interface PipelineState {
  schemaVersion: number;
  project: string;
  status: PipelineStatus;
  started_at: string;
  updated_at: string;
  paused_at?: string | null;
  interrupted_at?: string | null;
  resumed_at?: string | null;
  current_task?: string | null;
  current_phase?: number | null;
  current_step?: string | null;
  last_completed?: string | null;
  next_action?: string | null;
  resume_instructions?: string | null;
  active_agent_teams?: string[];
  phases?: Record<string, PhaseState>;
  log: LogEntry[];
}

export type PipelineStatus = 'running' | 'paused' | 'interrupted' | 'completed';

export interface PhaseState {
  status: 'pending' | 'running' | 'done' | 'skipped';
  name: string;
  completed_at?: string | null;
}

export interface LogEntry {
  time: string;
  action: string;
}
