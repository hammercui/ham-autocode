# ham-autocode 与 Harness 的关系分析

> 基于 Stripe/Shopify/Airbnb 实践 + claude-code-harness 开源项目 + 2026 Harness Engineering 趋势

## 一、三层架构的真相

```
Agent  = 干活的工人（Claude Code / Codex）
Skill  = 工作方法（GSD / gstack / Superpowers）
Harness = 工厂系统（管理工人 + 流程 + 质量 + 状态 + 恢复）
```

ham-autocode 现在自称 Plugin，但它想做的事情是 Harness。
Plugin 是分发形式（怎么安装），Harness 是架构本质（怎么运行）。

## 二、Harness 的五个核心层

来源：Stripe "Minions"系统 + Shopify Sidekick + Airbnb TypeScript Migration

| 层 | 能力 | ham-autocode 现状 | 差距 |
|---|------|------------------|------|
| **Context Engine** | token 预算、上下文裁剪、选择性文件加载 | 一句话指令"保持30-40%" | 没有执行机制 |
| **Task Orchestration** | DAG 依赖图、拓扑排序、并行/串行自动调度 | 6 阶段线性流水线 | 不是 DAG |
| **Validation Gates** | 编译检查→测试→语义校验→人工审查自动门禁 | 手动调 /review /qa | 非自动门禁 |
| **Recovery** | task 级 retry、git rollback、two-strike 升级 | phase 级 watchdog | 粒度太粗 |
| **Agent Routing** | 按任务特征自动选模型/工具/agent | 用户手动选模式 A/B/C/D | 无自动路由 |

## 三、行业参考：claude-code-harness (Chachamaru127)

这是目前最成熟的 Claude Code 专用 Harness 开源实现：

```
claude-code-harness/
├── core/                 # TypeScript 守护引擎（13条声明式规则 R01-R13）
│   └── src/             # guardrails/ state/ engine/
├── skills-v3/           # 5 个动词 skill (plan/execute/review/release/setup)
├── agents-v3/           # 3 个 agent (worker/reviewer/scaffolder)
├── hooks/               # Hook → core engine 桥接
└── templates/           # 代码生成模板
```

核心差异 vs ham-autocode：

| 维度 | claude-code-harness | ham-autocode |
|------|-------------------|-------------|
| 守护引擎 | TypeScript 编译的 13 条规则 | 无 |
| 并行控制 | `--parallel 5` + progressive batching | Agent Teams（依赖官方实验功能） |
| 上下文管理 | agent-trace.jsonl + compaction 保留图片 | 无 |
| 自动门禁 | 每个 worker 自检 → 独立 review → 才能 commit | 手动调 /review |
| 工作流 | Plan → Work → Review → Release（闭环） | 6 阶段线性（无闭环） |

## 四、ham-autocode 的定位选择

### 选项 A：保持 Plugin，承认不是 Harness

```
定位：编排层 Plugin — 串联 GSD/gstack/Superpowers 的"胶水"
价值：降低使用门槛，一键串联现有 skill
不做：不做 context 管理、不做 DAG、不做自动门禁
```

优点：简单、轻量、现在就能用
缺点：稳定性取决于 Claude 的指令跟随能力，无法真正 24h 无人值守

### 选项 B：进化为 Harness（推荐）

```
定位：Claude Code 自动开发 Harness — 工厂级基础设施
价值：让 Agent 从"能跑"变成"稳定跑"
核心：context engine + DAG + validation gates + recovery
```

优点：真正 production-grade，对标 Stripe/Shopify
缺点：需要 TypeScript/Python 运行时，不再是纯 Markdown skill

### 选项 C：Harness 套壳 Plugin（折中）

```
定位：Harness 内核 + Plugin 外壳
价值：用 Plugin 分发，但核心逻辑由脚本/hooks 执行
不需要完整的 TypeScript 引擎，用 shell + hooks + pipeline.json 近似实现
```

优点：保持 Plugin 的安装便利性，但加入 Harness 的关键能力
缺点：比真 Harness 弱，但比纯 Plugin 强得多

## 五、如果选 B/C：需要补什么

### 1. Context Engine（最关键）

```
问题：context window 超过 60% 后，agent 质量急剧下降（context rot）
解法：
  - token 预算追踪（每次 tool call 后估算已用 token）
  - 选择性文件加载（只给 agent 相关文件，不是整个 codebase）
  - progressive compaction（接近阈值时自动压缩历史）
  - GSD 已经通过 subagent 隔离部分解决了这个问题
```

### 2. DAG Task System（替代线性 6 阶段）

```
问题：现在 Phase 1→2→3→4→5→6 严格线性，但实际项目中很多任务可以并行
解法：
  - pipeline.json 升级为 task graph（每个 task 有 blockedBy 依赖）
  - 拓扑排序找出可并行的 wave
  - 每个 wave 内的 task 并行执行（Agent Teams 或 subagent）
  - Claude Code 原生 Task 系统已支持 blockedBy 依赖
```

### 3. Validation Gates（自动门禁）

```
问题：现在审查是 Phase 5 手动调用，不是每个 task 的自动门禁
解法：
  - 每个 task 完成后自动跑 lint + type-check + test
  - 失败 → 自动 retry（最多 2 次，Stripe two-strike rule）
  - 第二次失败 → 标记为 blocked，升级给人
  - 通过 → 自动 commit
  - PostToolUse hook 可以实现
```

### 4. Task-level Recovery（替代 phase-level watchdog）

```
问题：现在 watchdog 只在 phase 级别重试，一个 task 失败整个 phase 重跑
解法：
  - 每个 task 独立的 try/retry/rollback
  - 失败时 git stash 或 git checkout 回滚该 task 的改动
  - 标记该 task 为 failed，不阻塞无依赖的其他 task
```

### 5. Agent Routing（自动选执行者）

```
问题：现在用户手动选"模式 A/B/C/D"，手动决定哪些任务给 Codex
解法：
  - 每个 task 元数据包含：文件路径、接口定义、验收标准的完整度
  - 自动评分：三项全有 → Codex，缺任一项 → Claude Code
  - 架构级任务（涉及 3+ 文件联动）→ Claude Code Agent Teams
  - 纯文档/配置 → Claude App
```

## 六、演进路线建议

```
v1.1（现在）→ Plugin + 半个 Harness
  已有：pipeline.json、hooks、watchdog、7 skills、5 agents

v2.0 → Harness 内核（关键跃迁）
  新增：
  ├── Context Engine（token 追踪 + 选择性加载）
  ├── DAG Task Graph（替代线性 pipeline）
  ├── Validation Gates（PostToolUse hook 自动门禁）
  ├── Task-level Retry（two-strike rule）
  └── Agent Routing（自动分发给 Code/Codex/App）

v3.0 → 生产级 Harness
  新增：
  ├── TypeScript 守护引擎（声明式规则）
  ├── Observability（agent-trace.jsonl）
  ├── Evaluation System（自动打分 + 回归测试）
  └── DAG 可视化 + Web Dashboard
```

## 七、结论

ham-autocode 现在是一个**半成品 Harness，包装成了 Plugin**。

它做对的事情：
- 用 pipeline.json 管状态（Harness 思维）
- 用 hooks 管 session 生命周期（Harness 思维）
- 用 watchdog 管崩溃恢复（Harness 思维）

它缺的事情：
- Context Engine（Harness 的灵魂）
- DAG（Harness 的骨架）
- Validation Gates（Harness 的质量保证）
- Task-level Recovery（Harness 的韧性）
- Agent Routing（Harness 的智能）

一句话：
> Agent 决定能力上限，Harness 决定稳定性。
> ham-autocode 有 Agent、有 Skill，缺的是 Harness 内核。

## 参考

- [AI Coding Agent Harness: Stripe, Shopify, Airbnb](https://www.mindstudio.ai/blog/ai-coding-agent-harness-stripe-shopify-airbnb)
- [Harness Engineering Complete Guide 2026](https://www.nxcode.io/resources/news/what-is-harness-engineering-complete-guide-2026)
- [claude-code-harness (Chachamaru127)](https://github.com/Chachamaru127/claude-code-harness)
- [DAG Task Execution Skill](https://mcpmarket.com/es/tools/skills/dag-task-execution)
- [The Coding Agent Harness: Context Engineering at Scale](https://www.vibesparking.com/en/blog/ai/claude-code/2026-03-04-coding-agent-harness-context-engineering-at-scale/)
- [Harness Engineering: The Missing Layer](https://www.louisbouchard.ai/harness-engineering/)
- [Building AI Coding Agents (arXiv)](https://arxiv.org/html/2603.05344v1)
