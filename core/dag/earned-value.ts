import { readAllTasks } from '../state/task-graph.js';
import { readPipeline } from '../state/pipeline.js';

export interface EVMMetrics {
  PV: number;
  EV: number;
  AC: number;
  SPI: number;
  CPI: number;
  EAC: number;
  VAC: number;
  status: 'ahead' | 'on-track' | 'behind' | 'critical';
}

/**
 * EVM 挣值分析。
 * PV = 基于时间线性插值的计划任务数
 * EV = 实际完成的任务数
 * AC = 实际消耗的 token/时间（简化为完成+失败的任务数，因为都消耗了资源）
 */
export function calculateEVM(projectDir: string): EVMMetrics {
  const tasks = readAllTasks(projectDir);
  const pipeline = readPipeline(projectDir);
  const total = tasks.length;
  if (total === 0) {
    return { PV: 0, EV: 0, AC: 0, SPI: 1, CPI: 1, EAC: 0, VAC: 0, status: 'on-track' };
  }

  const completed = tasks.filter(t => t.status === 'done').length;
  const skipped = tasks.filter(t => t.status === 'skipped').length;
  const failed = tasks.filter(t => t.status === 'failed').length;

  // PV: 基于经过时间的线性计划
  let elapsedRatio = 0.5; // 默认假设在中间
  if (pipeline?.started_at) {
    const start = new Date(pipeline.started_at).getTime();
    const now = Date.now();
    const elapsed = now - start;
    // 假设项目计划工期 = total * 10 分钟
    const plannedDuration = total * 10 * 60 * 1000;
    elapsedRatio = Math.min(1, elapsed / plannedDuration);
  }
  const PV = Math.round(total * elapsedRatio);
  const EV = completed + skipped;
  const AC = completed + failed; // 实际消耗资源的任务数

  const SPI = PV > 0 ? Math.round(EV / PV * 100) / 100 : 1;
  const CPI = AC > 0 ? Math.round(EV / AC * 100) / 100 : 1;
  const EAC = CPI > 0 ? Math.round(total / CPI) : total;
  const VAC = total - EAC;

  let status: EVMMetrics['status'] = 'on-track';
  if (SPI >= 1.1) status = 'ahead';
  else if (SPI >= 0.9) status = 'on-track';
  else if (SPI >= 0.7) status = 'behind';
  else status = 'critical';

  return { PV, EV, AC, SPI, CPI, EAC, VAC, status };
}
