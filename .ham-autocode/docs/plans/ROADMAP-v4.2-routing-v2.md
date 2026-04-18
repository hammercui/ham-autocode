# v4.2 路由系统 v2 规划

> 基线: v4.1 SHIPPED (2026-04-18)
> 目标: Opus 调用量 -40~60%，通过引入 claude-code 子 agent (sonnet/haiku) 补齐中间档

---

## 变更输入

| 项 | v4.1 | v4.2 |
|---|---|---|
| codexfake 模型 | `gpt-5.3-codex` | **`gpt-5.4-mini`** (能力略强于 opencode 默认) |
| codexfake provider | `github-copilot`, `openai` | 保持双 provider 兜底 |
| 路由目标数 | 5 | **6** (新增 `cc-sonnet` / `cc-haiku`，废除 `claude-app` 入路由) |
| claude-app | 路由目标之一 | **定位为发起者角色，不参与路由**(保留类型供手工指派) |

## 新决策树

```
R1  isolation ≥ 80 AND complexity ≤ 50  → codexfake       (独立中等 → gpt-5.4-mini)
R2  complexity ≤ 40                     → random(opencode, cc-haiku)  + A/B log
R3  complexity ≤ 60 AND isolation ≥ 60  → codexfake
R4  complexity ≤ 75                     → cc-sonnet       (跨文件中复杂)
R5  wave ≥ 3 AND all isolation ≥ 70     → agent-teams
R6  default                             → claude-code     (Opus,兜底)
```

### 设计要点

- **R2 A/B 随机**: 简单任务 50/50 随机分配 opencode vs cc-haiku，每次决策写入 `state/routing/ab-log.jsonl`，积累 N 次后可事后统计成功率/token，不在线自适应
- **R4 中间档**: 新增 sonnet 层把"中复杂但不需要 Opus"的任务吃掉 → Opus 调用量预期 -40~60%
- **provider fallback**: codexfake dispatch 时若主 provider 失败自动换到下一个 (已有机制保留)

## A/B 日志格式

`state/routing/ab-log.jsonl` 每行：
```json
{"ts":1713456789,"taskId":"task-012","bucket":"opencode","complexity":35,"files":2,"result":null}
```

`result` 字段由 auto-runner 在任务结束后回填（`ok|fail`, tokens, durationMs）。查询命令：
```bash
ham-cli routing ab-stats   # 输出 opencode vs cc-haiku 的成功率/平均 token
```

## 落地清单

| # | 文件 | 改动 |
|---|------|------|
| 1 | `core/types/task.ts` | `RoutingTarget` += `cc-sonnet`/`cc-haiku` |
| 2 | `core/types/config.ts` | `RoutingConfig` += `subagent.sonnet`/`haiku` 模型名；`opencodeGptModel` 默认改 `gpt-5.4-mini` |
| 3 | `core/state/config.ts` | DEFAULTS 更新 |
| 4 | `core/executor/dispatcher.ts` | 新 case `cc-sonnet`/`cc-haiku` → `claude -p --model <m> --output-format json` |
| 5 | `core/executor/claude-sub.ts` (新) | 解析 `claude -p` JSON 输出（tokens/cost/结果） |
| 6 | `core/routing/router.ts` | 重写决策链为 R1-R6 |
| 7 | `core/routing/ab-log.ts` (新) | `logRandomChoice()` + `abStats()` |
| 8 | `core/commands/cmd-routing.ts` (新) | `ham-cli routing ab-stats` |
| 9 | `core/executor/context-template.ts` | 加预算 `cc-sonnet: 20000`, `cc-haiku: 8000` |
| 10 | `core/__tests__/router-v2-test.js` (新) | 覆盖 R1-R6 |
| 11 | `harness.json` 默认值 + docs | 更新 |

## 验收标准

- ✅ 单元测试 R1-R6 全通过
- ✅ full-auto 在 ham-video 跑 1 个 phase，Opus 调用占比 < v4.1 的 60%
- ✅ `ab-log.jsonl` 生成且可统计
- ✅ 现有 routeTask() 签名不破坏

## 废除决定 (不改的)

- ❌ claude-app 仍保留为 `RoutingTarget` 类型值，但 router 决策链不再分派到它（仅支持显式 `--agent claude-app` 手工指派）
- ❌ 不做在线自适应，只做离线 A/B 统计
- ❌ 不拆 auto-runner.ts（v4.2 另行推进）
