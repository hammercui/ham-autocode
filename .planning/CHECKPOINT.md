# ham-autocode Progress Checkpoint

> Updated: 2026-04-14 Session 2 | Synced to v3.6.1

## Current Version: v3.6.1

### Session 2 交付
- v3.6.0: context bundle 管道修复（5 target 全部接通）
- v3.6.1: execute run + prepare --raw + dispatcher + 阅读清单去噪
- Karpathy Surgical Changes 约束融入所有 agent bundle
- Agent 执行追踪: execute log/stats (agent-exec.jsonl)
- OpenCode parseOpenCodeOutput token 解析
- ham-video Phase 3: 12/12 tasks 100% 完成

### 核心认知更新
- **项目核心目的**: 节省编排 agent token，分发到多 agent，24h 不间断
- **Harness 是手段不是目的**: AI 编排 + harness 数据供给
- **AI 编排成本递减**: 首任务 8K → 后续 1.5K tokens
- **execute prepare --raw**: 直接输出 bundle，可管道给 codex/opencode
- **stdin 传 prompt**: 用 `< file` 不用 `$()`，避免中文转义问题

### Agent 实测数据
- Codex (gpt-5.4, 无MCP): 125-180s/任务, 170-250 行产出
- OpenCode (glm-4.7): 120s/任务, 89-113 行产出
- 10 次执行, 0 失败, 100% 成功率
- 禁用 Codex MCP 后速度 2.4x 提升

### Key Files
- `.planning/CHECKPOINT.md` — this file
- `CHANGELOG.md` — v1.0-v3.6.1
- `core/executor/context-template.ts` — context bundle 核心
- `core/executor/dispatcher.ts` — agent CLI 参数封装
- `core/trace/logger.ts` — agent 执行追踪
