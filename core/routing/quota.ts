/**
 * Agent quota — 精简版。
 * v3.9.1: 删除冷却/可用性追踪（从未触发），保留接口兼容性。
 * 路由器始终信任 target 可用。如需临时切换 target，用 --agent 覆盖。
 */
import type { RoutingTarget } from '../types.js';

/** 记录成功（no-op，保留接口兼容） */
export function recordSuccess(_projectDir: string, _target: RoutingTarget): void {
  // 精简后不再持久化状态
}

/** 记录失败（no-op，保留接口兼容） */
export function recordFailure(_projectDir: string, _target: RoutingTarget, _reason?: string): void {
  // 精简后不再持久化状态
}

/** 解析 target — 直通，不做 fallback（用 --agent 覆盖更可控） */
export function resolveTarget(
  _projectDir: string,
  target: RoutingTarget
): { target: RoutingTarget; fallbackApplied: boolean; originalTarget: RoutingTarget; reason: string } {
  return { target, fallbackApplied: false, originalTarget: target, reason: 'available' };
}

/** 获取状态（返回空对象，保留接口兼容） */
export function quotaStatus(_projectDir: string): { targets: Record<string, unknown> } {
  return { targets: {} };
}
