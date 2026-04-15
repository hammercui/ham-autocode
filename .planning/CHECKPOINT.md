# ham-autocode Progress Checkpoint

> Updated: 2026-04-15 Session 5 | v3.9 DAG Change Management

## Current Version: v3.9

### Session 5 交付清单

**DAG Change Management (8 个新命令)**
- `dag add` — 运行时插入任务 (--after/--files/--spec)
- `dag remove` — 删除任务 (--force/--reparent/--cascade)
- `dag add-dep` / `dag remove-dep` — 依赖关系编辑 (含环检测)
- `dag re-init --merge` — PLAN.md diff 合并 (Dice 系数名称匹配)
- `dag scope-cut` — 批量裁剪范围
- `dag impact` — 影响分析 (下游链 + 关键路径)
- `dag move` — 任务重排序

**基础设施**
- graph.ts: getDirectDependents + getTransitiveDependents (BFS)
- task-graph.ts: deleteTask + nextTaskId
- merge.ts: 新文件 (~160 行), Dice 系数 + 文件重叠匹配

**验证**
- tsc --noEmit: 0 errors
- npm test: 9/9 suites passed (含新 mutations.test.js)
- E2E: 8 命令全部通过 CLI 验证 (add/remove/add-dep/remove-dep/re-init/scope-cut/impact/move)

### Session 4 交付清单

**codexfake 替代 codex CLI (v3.7.1)**
- codex CLI 弃用 → codexfake (opencode + gpt-5.3-codex)
- 14 文件改动，RoutingTarget `codex` → `codexfake`
- 配置: `opencodeGptModel`, `opencodeGptProviders`

**v3.8 改进项 (5 项)**
- B2+I3: `execute stats --since 1h/24h --reset`
- B3: auto-status currentTasks 实时更新
- I4: 波次间 30s cooldown
- I5: ETA 估算（用各任务实际耗时平均）
- I6: bundle surgical rule 不创建测试文件

**多层质量门禁 (L0-L4)**
- L0: 文件存在 + 非空
- L1: TypeScript 单文件语法检查
- L2: spec.interface export 名称验证
- L3: 项目级 tsc --noEmit (warning)
- L4: opencode 自审 diff vs spec (warning, 可 --no-review 跳过)

**Spec 质量强化 (P1-P3)**
- P1: preflightCheck spec 质量评分（description 长度、acceptance 条目、参数使用说明）
- P2: codexfake bundle 追加 pre-implementation checklist
- P3: L4 review FAIL 写入 review-feedback.jsonl

**cc-haha 启发改进 (P0-P1)**
- P0: 捕获 opencode stdout 解析 token 统计（实测 35,549 tokens/task）
- P1: timeout 智能恢复（文件已创建 → 检查质量 → 可标记成功）

**ham-video MCP 接口 (M004)**
- server.ts 接通 create-project + eval handler
- 新增 eval.ts（L4 review 发现 3 缺陷并修复）
- Edge TTS testConnection 临时文件清理
- Electron __dirname ESM 兼容修复

### Agent 角色表
| 路由目标 | 实际执行 | 模型 | 适用场景 |
|---------|---------|------|---------|
| opencode | opencode CLI | glm-4.7 (默认) | 简单任务: complexity ≤ 40, files ≤ 5 |
| codexfake | opencode CLI + --model | github-copilot/gpt-5.3-codex | 中等任务: 高 spec + 高 isolation |
| claude-code | Claude Code 本身 | Opus 4.6 | 复杂架构任务: complexity ≥ 70 |
| claude-app | Claude App (另一账号) | Sonnet | 文档/配置/hotfix |
| agent-teams | Claude Code Agent 工具 | Opus 4.6 | 大规模并行 |

### 实测数据（ham-video 累计）
- 总任务: 37 done, 0 remaining
- codexfake: 7/7 成功, avg 80s
- opencode: 9/9 成功, avg 75s
- L4 review: 发现 1 个真实 FAIL（eval.ts 3 缺陷），3 个 PASS，1 个 timeout
- Token 精确数据: opencode 35,549 tokens/task（glm-4.7 免费）

### Key Files
- `core/executor/auto-runner.ts` — auto 核心（token 捕获 + timeout 恢复）
- `core/executor/quality-gate.ts` — L0-L3 质量门禁 + spec 质量检查
- `core/executor/review-gate.ts` — L4 opencode 自审 + feedback 文件
- `core/executor/context-template.ts` — bundle 模板（含 pre-impl checklist）
- `core/executor/dispatcher.ts` — agent dispatch（codexfake/opencode）
- `core/routing/router.ts` — 5 目标路由规则
- `core/trace/logger.ts` — agent-exec 日志（含 token 统计 + --since 过滤）
