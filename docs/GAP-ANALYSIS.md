# ham-autocode v2.0 Gap Analysis

> v2.0 设计规格 vs 实际实现的差距分析，以及 v2.1 / v3.0 路线图。

## Harness 架构背景

ham-autocode 是 **Harness 架构** 在 Claude Code 上的实现。Harness 模式源自 Stripe ("Minions")、Shopify (Sidekick)、Airbnb (TypeScript Migration) 的工程实践，核心思想是：

> Agent 决定能力上限，Harness 决定稳定性。

Harness 的五个核心层：

```
Agent  = 干活的工人（Claude Code / Codex）
Skill  = 工作方法（GSD / gstack / Superpowers）
Harness = 工厂系统 ↓

  1. Context Engine    — 防止 context rot，管理 token 预算
  2. DAG Orchestration — 依赖图调度，替代线性流水线
  3. Validation Gates  — 每任务自动门禁，替代手动 QA
  4. Recovery Engine   — 任务级恢复，替代 phase 级重试
  5. Agent Routing     — 自动按特征路由到最优执行者
```

参考：[harness-analysis.md](harness-analysis.md)

---

## v2.0 五层覆盖评分

| Harness 层 | 设计覆盖 | 实现覆盖 | 评分 | 状态 |
|------------|---------|---------|------|------|
| Context Engine | 90% | 75% | B | 核心功能在，细节 gap |
| DAG Orchestration | 95% | 80% | B+ | 调度器完整，部分功能未接线 |
| Validation Gates | 90% | 85% | A- | 自动检测 + two-strike 完整 |
| Recovery Engine | 85% | 90% | A | 超出设计（多了 cleanup 等） |
| Agent Routing | 90% | 85% | A- | 三维评分 + 三目标路由完整 |
| **总计** | **90%** | **83%** | **B+** | |

---

## Gap 明细

### Category A: 部分实现（有骨架但缺细节）

| # | Gap | 影响 | 修复难度 | 建议版本 |
|---|-----|------|---------|---------|
| A1 | **Executor Adapter 未接入 CLI** — adapter 层已实现但 index.js 没有暴露 `execute prepare <task-id>` 命令，skill 无法通过 CLI 获取格式化执行指令 | Skill 无法标准化获取执行上下文 | 低 | v2.1 |
| A2 | **topoSort 未被 scheduler 调用** — graph.js 实现了拓扑排序和环检测，但 scheduler.js 的 nextWave 直接线性扫描 blockedBy | 环依赖不会被检测到 | 低 | v2.1 |
| A3 | **DAG 依赖推断未实现** — parser.js 有注释 "infer dependencies from file overlap" 但实际 blockedBy 始终为空 | 所有解析出的任务都被视为独立 | 中 | v2.1 |
| A4 | **PostToolUse hook 不消耗 token** — hook 只读取 budget 状态发警告，不调用 budget.consume()，无法获知实际 tool call token 消耗 | Budget 追踪只在 context prepare 时更新 | 中 | v2.1 |
| A5 | **pipeline.current_task 不更新** — initPipeline 设置了 current_task: null 但没有 CLI 命令更新它 | status 无法显示当前执行中的任务 | 低 | v2.1 |
| A6 | **blocked 状态不自动推断** — 设计中 blocked = "waiting on unresolved blockedBy"，但代码不区分 pending 和 blocked | 状态枚举有 blocked 但从不被设置 | 低 | v2.1 |
| A7 | **Recovery 策略不自动选择** — 设计中 checkpoint 用于 complexityScore < 70，worktree 用于 >= 70，但实际由 skill 手动选择 | 不影响功能，但未达到自动化 | 低 | v2.1 |

### Category B: 未实现（设计中有但代码中没有）

| # | Gap | 影响 | 修复难度 | 建议版本 |
|---|-----|------|---------|---------|
| B1 | **Execution Trace 日志** — 设计中有 `.ham-autocode/logs/trace.jsonl` 但未实现 | 无法事后审计执行过程 | 中 | v2.1 |
| B2 | **file-index.json 持久化** — ContextManager 只在内存构建索引，不写入 `.ham-autocode/context/file-index.json` | 每次都要重建索引 | 低 | v2.1 |
| B3 | **session_id 文件** — 设计中有 `.ham-autocode/session_id` 用于 `--resume`，未实现 | 不影响功能（resume 通过 pipeline status 实现） | 低 | v3.0 |
| B4 | **验证失败后自动 rollback** — 设计流程要求 two-strike 后自动调用 recover rollback，实际需 skill 手动执行 | Core 不够"闭环" | 中 | v2.1 |

### Category C: v3 延迟项（设计中明确标记 Deferred）

| # | 功能 | 对标 |
|---|------|------|
| C1 | Agent Teams 编排（作为第四路由目标） | Stripe Minions 并行控制 |
| C2 | Branch-based Recovery（第三层恢复） | 更安全的大型重构隔离 |
| C3 | Auto-commit（验证通过后自动提交） | claude-code-harness 的 worker 自检流程 |
| C4 | TypeScript 守护引擎（声明式规则 R01-R13） | claude-code-harness 的核心竞争力 |
| C5 | DAG 可视化 / Web Dashboard | 可观测性 |
| C6 | Evaluation System / 自动评分 + 回归测试 | Shopify Sidekick 质量闸 |
| C7 | YAML 配置支持 | 社区偏好 |
| C8 | 完整 JSON Schema 运行时校验 | 数据完整性保证 |

---

## 与 claude-code-harness 的对比

| 维度 | claude-code-harness (Chachamaru127) | ham-autocode v2.0 | Gap |
|------|--------------------------------------|-------------------|-----|
| 语言 | TypeScript (编译型) | JavaScript (零依赖) | 无 TypeScript 类型安全 |
| 守护引擎 | 13 条声明式规则 R01-R13 | 无（Skill 驱动） | v3 计划 |
| 并行控制 | `--parallel 5` + progressive batching | DAG 波次调度 | 功能等价 |
| 上下文管理 | agent-trace.jsonl + compaction | token budget + selective loading | 缺 trace + compaction |
| 自动门禁 | worker 自检 -> review -> commit | detect + two-strike + recommend | 缺自动 commit |
| 工作流 | Plan -> Work -> Review -> Release | 6 阶段 + DAG 任务 | 更灵活但不如其闭环 |
| 生态集成 | 独立系统 | 编排 gstack + GSD + Superpowers | 更丰富的上游 skill |
| 安装方式 | 手动配置 | Claude Code Plugin 标准格式 | ham-autocode 更便捷 |

---

## v2.1 路线图（Gap 修复版）

预计覆盖率：83% -> 92%

```
v2.1 修复优先级（按影响排序）：

P0 — Executor Adapter CLI (A1)
  新增: node core/index.js execute prepare <task-id>
  让 skill 能标准化获取执行指令

P0 — topoSort 接入 scheduler (A2)
  scheduler.nextWave 启动时先跑 topoSort 做环检测

P1 — 验证失败自动 rollback (B4)
  validateTask 返回 block 时自动调用 recover rollback

P1 — pipeline.current_task 更新 (A5)
  dag complete/fail 时自动更新 pipeline.current_task

P1 — blocked 状态自动推断 (A6)
  dag status 时扫描 pending 任务，有未解决 blockedBy 的标记为 blocked

P2 — Execution Trace (B1)
  每个 CLI 调用追加到 .ham-autocode/logs/trace.jsonl

P2 — file-index 持久化 (B2)
  context prepare 后写入 .ham-autocode/context/file-index.json

P2 — DAG 依赖推断 (A3)
  parser 解析后基于文件重叠推断 blockedBy

P3 — Recovery 自动选择 (A7)
  根据 complexityScore 自动选择 checkpoint 或 worktree

P3 — PostToolUse token 消耗估算 (A4)
  基于 tool output 大小粗估 token 消耗
```

## v3.0 路线图（生产级 Harness）

```
v3.0 目标：对标 Stripe/Shopify 生产级

1. TypeScript 守护引擎
   - 声明式规则系统（R01-R13）
   - 编译时类型安全

2. Observability
   - agent-trace.jsonl 结构化追踪
   - DAG 可视化 Web Dashboard
   - 执行回放

3. Auto-commit + Agent Teams
   - 验证通过后自动 commit
   - Agent Teams 作为第四路由目标
   - Progressive batching

4. Evaluation System
   - 自动评分 + 回归测试
   - 代码质量趋势追踪

5. 完整 Schema 校验
   - 运行时 JSON Schema 验证所有状态文件
   - YAML 配置可选支持
```

---

## 总结

ham-autocode v2.0 实现了 Harness 五层架构的 **83%**。核心骨架完整（DAG + Context + Routing + Validation + Recovery 均已实现），主要 gap 在"接线"层面（已实现的模块之间的集成不够紧密），而非缺少核心模块。

一句话概括当前状态：

> **v2.0 = 完整的 Harness 骨架 + 部分松散的接线。v2.1 负责拧紧螺丝，v3.0 负责镀金。**
