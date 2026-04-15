# ham-autocode Progress Checkpoint

> Updated: 2026-04-15 Session 4 | v3.7.1 codexfake 替代 codex CLI

## Current Version: v3.7.1

### Session 4 交付
- codex CLI 彻底弃用，替换为 codexfake (opencode + GPT-5.3-Codex)
- RoutingTarget `codex` → `codexfake`，14 个文件改动
- 新配置: `opencodeGptModel`, `opencodeGptProviders` (harness.json)
- ham-video 实测 3/3 任务一次通过，零卡死

### Agent 角色表
| 路由目标 | 实际执行 | 模型 | 适用场景 |
|---------|---------|------|---------|
| opencode | opencode CLI | glm-4.7 (默认) | 简单任务: complexity ≤ 40, files ≤ 5 |
| codexfake | opencode CLI + --model | github-copilot/gpt-5.3-codex | 中等任务: 高 spec + 高 isolation |
| claude-code | Claude Code 本身 | Opus 4.6 | 复杂架构任务: complexity ≥ 70 |
| claude-app | Claude App (另一账号) | Sonnet | 文档/配置/hotfix |
| agent-teams | Claude Code Agent 工具 | Opus 4.6 | 大规模并行 (≥3 任务 + 高 isolation) |

### 实测数据
- codexfake (gpt-5.3-codex): 2/2 成功, avg 97s
- opencode (glm-4.7): 6/6 成功, avg 120s (含历史)
- Token 节约: execute auto 模式 Claude 消耗 ~100 tokens / 26 tasks

### v3.8 待修复 (见 .planning/v3.8-plan.md)
- ~~B1: codex stdin 并行超时~~ → 已通过 codexfake 解决
- B2: agent-exec.jsonl 数据污染 → stats --since/--reset
- B3: auto-status currentTasks 不更新
- I1-I6: 智能超时, stats 过滤, ETA, bundle 不创建测试文件

### Key Files
- `.planning/CHECKPOINT.md` — this file
- `.planning/v3.8-plan.md` — v3.8 待修复清单
- `core/executor/auto-runner.ts` — auto 核心
- `core/executor/dispatcher.ts` — agent dispatch (codexfake/opencode 统一走 opencode CLI)
- `core/routing/router.ts` — 5 目标路由规则
- `core/types/config.ts` — opencodeGptModel/opencodeGptProviders 配置
