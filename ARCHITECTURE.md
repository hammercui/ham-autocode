# ham-autocode: Claude Code 全自动开发 Plugin

> 一个 Claude Code Plugin，编排 gstack + GSD + Superpowers + Agent Teams，
> 实现项目全生命周期自动化开发。
>
> 版本: v2.3 | 日期: 2026-04-13
>
> **项目性质：Claude Code Plugin + Node.js Core Engine**
> - 安装：`/plugin install ham-autocode` 或 `claude --plugin-dir ./ham-autocode`
> - 调用：`/ham-autocode:detect`、`/ham-autocode:auto`、`/ham-autocode:parallel`、`/ham-autocode:ship`
> - 适用：Claude App + Claude Code（均支持 skill 斜杠命令）

---

## 一、v2.0 架构概览

v2.0 引入 **Node.js Core Engine**，将 v1.0 的纯 Skill 编排升级为 **Skill + Core Engine** 双层架构。Core Engine 提供 DAG 调度、Context 管理、Agent 路由、验证门控、恢复引擎和原子状态管理，Skill 层负责用户交互和 Agent 委派。

```
User → Skills (7) → Core Engine (Node.js) → Executor Adapters → Claude Code/Codex/App
                         ↑
                    Hooks (callbacks INTO core, not FROM core)

Core Engine:
  ├── Spec Engine         (OpenSpec 读取, 启发式丰富, 4维评分)
  ├── DAG Scheduler      (拓扑排序, 波次并行)
  ├── Context Engine      (Token 预算, 选择性加载, 三级保护)
  ├── Agent Router        (规格/复杂度/隔离度评分)
  ├── Executor Adapters   (claude-code/codex/app 三种适配器)
  ├── Validation Gates    (检测+运行+捕获结果, 两击出局)
  ├── Recovery Engine     (checkpoint + worktree, 两级恢复)
  └── State Store         (原子 JSON 读写 + 文件锁)
```

### 设计原则

1. **每个能力都有闭环** — CLI、Schema、流程三者对齐
2. **Core 是纯数据/逻辑层** — 永不直接调用 Agent，只输出指令供 Skill 执行
3. **原子状态写入** — Lock + tmp + rename，防止并行任务写坏状态
4. **建议而非强制** — Context Engine 给出建议，Skill/用户决定是否采纳
5. **分类每种失败** — 7 种错误类型，每种有明确处理器
6. **Schema 版本化** — 所有状态文件含 schemaVersion，支持迁移
7. **零配置启动** — defaults/harness.json 覆盖全部默认值
8. **3 个路由目标, 2 级恢复策略** — 刻意约束以保证可靠性

---

## 二、核心认知：三大框架的定位

| 框架 | 核心能力 | 定位 |
|------|---------|------|
| **gstack** (Garry Tan) | 角色化决策 + 28个slash命令 + 浏览器QA | **决策层** - 想什么 |
| **GSD** (Get Shit Done) | 规范驱动 + context隔离 + 自主执行 | **稳定层** - 不跑偏 |
| **Superpowers** (Jesse Vincent) | TDD闭环 + 7阶段流水线 | **执行层** - 怎么做 |

**一句话总结：gstack thinks, GSD stabilizes, Superpowers executes.**

---

## 三、三个工具的角色定位

| 工具 | 角色 | 核心职责 | 编码能力 |
|------|------|---------|---------|
| **Claude App (账号A)** | 项目经理 | 进度把控、状态对话、方向决策、轻量编码 | 轻量（改配置、写文档、小修复） |
| **Claude Code (账号B)** | 主力工程师 | 完整 skill 执行、Agent Teams、Git/测试/部署 | 重度（全栈 + 复杂架构） |
| **Codex** | 能力工程师 | **需求清晰的任何编码任务**，能力不弱，关键是输入要明确 | 中重度（需求清晰即可） |

### 协作模式

```
你 (人)
 │
 ▼
Claude App (项目经理/账号A)
 │  - 与你对话，汇报/了解项目状态
 │  - 把控进度，做关键决策
 │  - 轻量编码：改配置、写文档、hotfix
 │
 ├──→ Claude Code (主力工程师/账号B)
 │     - 跑 GSD/gstack/Superpowers 完整 skill 链
 │     - 通过 Core Engine CLI 驱动 DAG 调度
 │     - Agent Teams 并行（3-5 个 teammate）
 │     - 重度编码 + Git + 测试 + 部署
 │     - 产出状态报告 → 回传给 App
 │
 └──→ Codex (能力工程师)
       - 需求清晰的任何编码任务（能力不弱）
       - 关键前提：输入明确（文件路径、接口定义、预期行为）
       - 独立模块、功能实现、bug修复、重构
```

### 任务路由规则（v2.0 Core Engine 自动路由）

v2.0 通过 Core Engine 的 Agent Router 自动路由，基于三维评分：

```
路由目标枚举: "codex" | "claude-code" | "claude-app"

路由规则:
  specScore >= 80 AND isolationScore >= 70  → codex
  complexityScore >= 70                     → claude-code
  task type in [doc, config, hotfix]        → claude-app
  else                                      → claude-code (默认)

高风险确认:
  complexityScore >= 90 → needsConfirmation=true
  Skill 询问用户确认后再执行
  CLI: node dist/index.js route confirm <task-id>
```

> **Codex 任务分配原则：** Codex 能力不弱，不是"只能做简单活"。
> 关键区分是**需求是否清晰** — specScore 和 isolationScore 高的任务自动路由到 Codex。

---

## 四、Node.js Core Engine（v2.0 新增）

### 4.1 任务模型：单层 DAG

v2.0 使用扁平任务 DAG + 标签组织，而非分层 DAG：

```
task.phase = "40-core"       ← 标签，不是图节点
task.milestone = "M001"      ← 标签，不是图节点
task.blockedBy = ["task-003"] ← 实际依赖边
```

Phase 和 Milestone 仅用于**显示分组和过滤**，调度器只看任务和 `blockedBy` 边。

### 任务状态枚举

```
pending     → 可调度（blockedBy 全部完成）
blocked     → 等待未完成的 blockedBy
in_progress → 正在被 agent 执行
validating  → 执行完毕，正在跑验证门
done        → 已验证通过
failed      → 两击出局，需人工介入
skipped     → 用户手动跳过
```

### 失败类型分类

```
agent_error     → agent 崩溃或无输出
tool_error      → git/lint/test 命令失败
validation_fail → lint/typecheck/test 门控失败
context_exceeded → Token 预算超限
state_error     → pipeline.json / task 文件写入失败
user_rejected   → 用户拒绝路由或计划
timeout         → 执行超时
```

### 4.2 Executor Adapters（执行适配层）

Core Engine 不直接调用 Agent，而是通过执行适配层输出结构化指令：

```
Skill (SKILL.md)
  ├── 调用 core → 获取 task + routing + context
  ├── if target=claude-code → 委派给 subagent，携带预备好的 prompt
  ├── if target=codex → 输出 Codex 任务规格供用户复制
  ├── if target=claude-app → 输出轻量任务描述
  └── 将结果回传 → core 验证 + 更新状态
```

每个适配器实现 `prepare` / `generateInstruction` / `parseResult` 三个方法。

### 4.3 状态管理（原子写入）

- **文件锁**：基于 `mkdir` 的原子锁（跨平台兼容）
- **原子写入**：写入 tmp 文件 → rename（同文件系统上原子操作）
- **Schema 版本化**：所有状态文件含 `"schemaVersion": 2`，读取时自动迁移

### 4.4 验证门控（两击出局）

```
任务执行完成
  ↓
node dist/index.js validate <task-id>
  ↓
自动检测门控: lint → typecheck → test
  ↓
├── 全部通过 → status="done", 建议 git add + commit
├── 部分失败 (attempt < max) → attempts++, 重试
└── 部分失败 (attempt >= max) → status="failed", 触发回滚
```

Core 只做验证和建议，不自动 commit — 由 Skill 决定。

### 4.5 恢复引擎（两级）

```
Tier 1: Checkpoint (低风险 — complexityScore < 70)
  创建: git tag ham-checkpoint-<task-id>
  回滚: git checkout ham-checkpoint-<task-id> -- <files>

Tier 2: Worktree (高风险 — complexityScore >= 70)
  创建: git worktree add .ham-autocode/worktrees/<task-id> -b ham-wt-<task-id>
  成功: merge worktree branch, remove worktree
  回滚: remove worktree + delete branch
```

### 4.6 Context Engine

Token 预算基于 `chars / 4` 粗估（~20-30% 误差），阈值保守设置：

```
< 30%   → 正常：无操作
30-50%  → 建议：记录警告，建议裁剪上下文
50-70%  → 压缩：折叠已完成任务输出
> 70%   → 危急：建议重启 session 或 subagent 隔离
```

Core Engine 只**建议**行动，不强制执行。

### 4.7 Hook 方向（关键澄清）

Hooks 是**回调进 Core**，不是 Core 驱动 Hooks：

```
Claude Code runtime → SessionStart  → calls node dist/index.js session-start
Claude Code runtime → SessionEnd    → calls node dist/index.js session-end
Claude Code runtime → PostToolUse   → calls node dist/index.js post-tool-use
```

Core Engine 是被动的 — 响应 Hook 和 CLI 调用，永不主动发起。

---

## 五、Core Engine CLI 完整命令列表

```bash
# ===== Hooks（由 Claude Code 运行时调用）=====
node dist/index.js session-start          # 注入 pipeline 状态为上下文
node dist/index.js session-end            # 若正在运行则标记 interrupted
node dist/index.js post-tool-use          # Token 预算建议

# ===== Config =====
node dist/index.js config show            # 显示生效配置
node dist/index.js config validate        # 校验 harness.json

# ===== Pipeline =====
node dist/index.js pipeline init <name>   # 初始化 pipeline
node dist/index.js pipeline status        # 显示 pipeline 状态
node dist/index.js pipeline log <action>  # 追加操作日志
node dist/index.js pipeline pause         # 标记暂停
node dist/index.js pipeline resume        # 标记运行

# ===== DAG =====
node dist/index.js dag init [plan] [milestone] [phase]  # 解析 PLAN.md/WBS → 构建任务图
node dist/index.js dag next-wave          # 获取下一波可执行任务
node dist/index.js dag complete <id>      # 标记完成，解锁下游
node dist/index.js dag fail <id> <type>   # 标记失败（含错误类型）
node dist/index.js dag retry <id>         # 重置失败任务为 pending
node dist/index.js dag skip <id>          # 标记跳过，解锁下游
node dist/index.js dag unblock <id>       # 强制解锁
node dist/index.js dag status             # 显示完整 DAG 状态

# ===== Context =====
node dist/index.js context prepare <id>   # 获取文件 + 预算
node dist/index.js context budget         # 显示当前预算估算

# ===== Routing =====
node dist/index.js route <id>             # 获取单任务路由决策
node dist/index.js route batch            # 批量路由所有 pending 任务
node dist/index.js route confirm <id>     # 人工确认高风险路由

# ===== Validation =====
node dist/index.js validate detect        # 自动检测项目 lint/test 命令
node dist/index.js validate <id>          # 运行验证门控

# ===== Recovery =====
node dist/index.js recover checkpoint <id>       # 创建 checkpoint
node dist/index.js recover rollback <id>         # 回滚任务变更
node dist/index.js recover worktree-create <id>  # 创建 worktree
node dist/index.js recover worktree-merge <id>   # 合并成功的 worktree
node dist/index.js recover worktree-remove <id>  # 移除失败的 worktree

# ===== Spec =====
node dist/index.js spec detect              # 检测项目是否使用 OpenSpec
node dist/index.js spec enrich <id>         # 丰富任务规范（OpenSpec 或启发式）
node dist/index.js spec enrich-all          # 批量丰富所有待执行任务
node dist/index.js spec score <id>          # 显示规范完整度评分（4维）
node dist/index.js spec sync <id>           # 完成后合并增量规范

# ===== Token =====
node dist/index.js token estimate <file>  # 估算单文件 token 数
node dist/index.js token index [dir]      # 构建目录文件索引

# ===== Help =====
node dist/index.js help                   # 显示帮助
```

---

## 六、六阶段全自动流水线

```
┌─────────────────────────────────────────────────────────────────────┐
│  你 ←→ Claude App (进度把控 + 状态对话 + 轻量编码)                    │
│         │                                                           │
│         ├── Phase 1: 立项审查 ──→ App 自己做（对话式）                │
│         ├── Phase 2: 需求拆解 ──→ Code 执行 GSD + pipeline init     │
│         ├── Phase 3: 阶段规划 ──→ Code 执行 GSD + dag init          │
│         ├── Phase 4: 并行开发 ──→ Core DAG 调度 + route + validate  │
│         ├── Phase 5: 审查验收 ──→ Code 执行 + App 判断               │
│         └── Phase 6: 发布上线 ──→ Code 执行 + App 确认               │
│                                                                     │
│  底层支撑：Core Engine | Agent Teams | Git Worktree | Subagents     │
└─────────────────────────────────────────────────────────────────────┘
```

### Phase 1: 立项与审查 (Claude App 主导)

**执行者：Claude App** — 纯对话，不需要终端环境

| 步骤 | Skill | 作用 |
|------|-------|------|
| 1.1 | `/office-hours` | YC式头脑风暴，验证需求真实性 |
| 1.2 | `/plan-ceo-review` | CEO/创始人视角审查 |
| 1.3 | `/plan-design-review` | 设计维度评审（如有UI） |

**输出物：** 产品决策文档、设计方向

### Phase 2: 需求拆解与里程碑 (Claude Code 执行)

**执行者：Claude Code** — 需要文件系统

| 步骤 | Skill / CLI | 作用 |
|------|------------|------|
| 2.1 | `/gsd:new-project` | 深度上下文收集，生成 PROJECT.md |
| 2.2 | `/gsd:new-milestone` | 创建里程碑 |
| 2.3 | `node dist/index.js pipeline init` | 初始化 pipeline 状态 |

**输出物：** PROJECT.md, ROADMAP.md, .planning/, .ham-autocode/pipeline.json

### Phase 3: 阶段规划 (GSD + Core Engine)

| 步骤 | Skill / CLI | 作用 |
|------|------------|------|
| 3.1 | `/gsd:discuss-phase --auto` | 收集阶段上下文 |
| 3.2 | `/gsd:plan-phase` | 创建 PLAN.md |
| 3.3 | `node dist/index.js dag init` | 解析 PLAN.md → 构建任务 DAG |
| 3.4 | `node dist/index.js route batch` | 批量路由所有任务 |
| 3.5 | `/plan-eng-review` | 工程视角锁定架构 |

**输出物：** PLAN.md, .ham-autocode/tasks/*.json (含路由决策)

### Phase 4: 并行开发 (Core Engine DAG 驱动)

**核心流程（/ham-autocode:auto 完整 pipeline）：**

```
1. Skill 读取 harness.json（或使用默认值）

2. node dist/index.js dag init
   → 解析 PLAN.md/WBS → 创建 .ham-autocode/tasks/*.json

3. node dist/index.js route batch
   → 评分所有任务，分配路由目标
   → 返回需人工确认的高风险任务

4. node dist/index.js dag next-wave
   → 返回可执行的下一波任务

5. 对波次中每个任务:
   a. node dist/index.js context prepare <task-id>  → 文件 + 预算
   b. node dist/index.js recover checkpoint <id>    → 创建恢复点
   c. 按 routing.target 委派:
      - claude-code → subagent 执行
      - codex → 输出任务规格
      - claude-app → 输出轻量描述
   d. 执行完成后:
      - 成功 → node dist/index.js validate <id>
        - 通过 → node dist/index.js dag complete <id>
        - 失败且可重试 → 重试
        - 失败且耗尽次数 → node dist/index.js dag fail <id> validation_fail
      - Agent 错误 → node dist/index.js dag fail <id> agent_error

6. 重复 4-5 直到 dag next-wave 返回空

7. 检查完成状态:
   - 全部 done/skipped → pipeline complete
   - 部分 failed → 报告摘要
```

**四种执行模式：**

| 模式 | 适用场景 | 说明 |
|------|---------|------|
| A: GSD 自主 | 推荐起步 | `/gsd:autonomous`，自动 discuss→plan→execute |
| B: Code + Codex 分工 | 推荐日常 | Core Engine 自动路由，复杂→Code，清晰→Codex |
| C: Agent Teams | 大型项目 | 3-5 teammate 并行，按文件/目录分配 |
| D: 全混合 | 最大火力 | GSD 管阶段 + Agent Teams 并行 + Codex 分流 |

### Phase 5: 审查与验收

| 步骤 | Skill | 作用 |
|------|-------|------|
| 5.1 | `/gsd:verify-work` | 对话式 UAT 验收 |
| 5.2 | `/gsd:audit-milestone` | 里程碑完成度审计 |
| 5.3 | `/review` (gstack) | PR 级代码审查 |
| 5.4 | `/qa` (gstack) | 系统化 QA 测试+自动修复 |
| 5.5 | `/codex` (gstack) | Codex 独立审查（第二意见） |

### Phase 6: 发布

| 步骤 | Skill | 作用 |
|------|-------|------|
| 6.1 | `/ship` (gstack) | 检测+合并+版本+CHANGELOG+PR |
| 6.2 | `/land-and-deploy` (gstack) | 合并 PR + 等 CI + 部署 |
| 6.3 | `/canary` (gstack) | 部署后金丝雀监控 |

---

## 七、项目结构

### ham-autocode Plugin + Core Engine 结构

```
ham-autocode/                                # Plugin 根目录
├── .claude-plugin/
│   └── plugin.json                          # Plugin 清单 (v2.0.0)
├── core/                                    # ★ v2.0 新增：Node.js Core Engine
│   ├── index.js                             # CLI 入口分发器
│   ├── dag/
│   │   ├── graph.js                         # DAG + 拓扑排序
│   │   ├── scheduler.js                     # 波次调度器
│   │   └── parser.js                        # PLAN.md/WBS → tasks 解析
│   ├── context/
│   │   ├── budget.js                        # Token 预算追踪
│   │   └── manager.js                       # 选择性加载 + 建议
│   ├── spec/
│   │   ├── reader.ts                        # OpenSpec 目录检测与读取
│   │   ├── enricher.ts                      # 任务规范丰富（OpenSpec / 启发式）
│   │   └── sync.ts                          # 增量规范合并
│   ├── routing/
│   │   ├── scorer.js                        # 多维度评分
│   │   └── router.js                        # 评分 → 目标决策
│   ├── executor/
│   │   ├── adapter.js                       # 基础接口
│   │   ├── claude-code.js                   # Subagent prompt 生成
│   │   ├── codex.js                         # Codex 规格生成
│   │   └── claude-app.js                    # 轻量任务生成
│   ├── validation/
│   │   ├── detector.js                      # 自动检测 lint/test 命令
│   │   └── gates.js                         # 两击出局门控运行
│   ├── recovery/
│   │   ├── checkpoint.js                    # Git tag checkpoint
│   │   └── worktree.js                      # Git worktree 生命周期
│   ├── state/
│   │   ├── lock.js                          # mkdir 原子锁
│   │   ├── atomic.js                        # 原子 JSON 写入 (tmp+rename)
│   │   ├── pipeline.js                      # pipeline.json 操作
│   │   ├── task-graph.js                    # tasks/*.json 操作
│   │   ├── config.js                        # harness.json 加载 + 默认值
│   │   └── migrate.js                       # Schema 版本迁移
│   ├── utils/
│   │   ├── token.js                         # Token 估算 (chars/4)
│   │   └── git.js                           # Git 操作封装
│   └── __tests__/                           # 测试
│       ├── cli.test.js
│       ├── context/budget.test.js
│       ├── dag/graph.test.js
│       ├── routing/scorer.test.js
│       ├── state/atomic.test.js
│       ├── state/lock.test.js
│       ├── utils/git.test.js
│       └── utils/token.test.js
├── skills/                                  # 7 个 Skill
│   ├── detect/SKILL.md                      # /ham-autocode:detect   检测项目状态
│   ├── auto/SKILL.md                        # /ham-autocode:auto     全自动流水线
│   ├── parallel/SKILL.md                    # /ham-autocode:parallel  并行开发
│   ├── ship/SKILL.md                        # /ham-autocode:ship     审查+发布
│   ├── status/SKILL.md                      # /ham-autocode:status   查看进度
│   ├── pause/SKILL.md                       # /ham-autocode:pause    暂停流水线
│   └── resume/SKILL.md                      # /ham-autocode:resume   恢复流水线
├── agents/                                  # 5 个 Subagent 定义
│   ├── planner.md                           # 规划 agent (Opus)
│   ├── coder.md                             # TDD 编码 agent (Sonnet)
│   ├── reviewer.md                          # 审查 agent (Opus)
│   ├── qa-tester.md                         # QA agent (Sonnet)
│   └── infra.md                             # 基础设施 agent (Sonnet)
├── hooks/                                   # 3 个 Lifecycle Hook
│   ├── hooks.json                           # Hook 注册配置
│   ├── on-session-start.sh                  # → node dist/index.js session-start
│   ├── on-session-end.sh                    # → node dist/index.js session-end
│   └── on-post-tool-use.sh                  # → node dist/index.js post-tool-use
├── schemas/
│   ├── pipeline.schema.json                 # pipeline.json Schema
│   ├── task.schema.json                     # task.json Schema
│   └── harness.schema.json                  # harness.json Schema
├── defaults/
│   └── harness.json                         # 内建默认配置 (JSON)
├── settings.json                            # 默认设置（启用 Agent Teams）
├── loop.md                                  # /loop 默认维护行为
├── CLAUDE.md                                # 全局指令
├── ARCHITECTURE.md                          # 本文档
├── QUICKSTART.md                            # 快速开始
├── LICENSE                                  # MIT
└── docs/
    └── v2-design.md                         # v2.0 设计文档
```

### 运行时状态（在目标项目中生成）

```
.ham-autocode/
├── harness.json                             # 项目配置 (JSON)
├── pipeline.json                            # Pipeline 状态
├── tasks/                                   # 任务 DAG（每任务一个文件）
│   ├── task-001.json
│   └── ...
├── context/
│   └── file-index.json                      # 项目文件索引 + token 估算
├── worktrees/                               # 活跃 worktree（自动清理）
├── logs/
│   └── trace.jsonl                          # 执行追踪日志
├── .lock/                                   # 状态锁目录（临时）
└── session_id                               # 当前 session（用于 --resume）
```

---

## 八、配置（JSON-Only，零配置启动）

### harness.json

```json
{
  "schemaVersion": 2,
  "context": {
    "advisoryThreshold": 30,
    "compressThreshold": 50,
    "criticalThreshold": 70
  },
  "validation": {
    "mode": "strict",
    "maxAttempts": 2,
    "gates": ["lint", "typecheck", "test"],
    "onFinalFail": "block"
  },
  "routing": {
    "confirmThreshold": 90,
    "codexMinSpecScore": 80,
    "codexMinIsolationScore": 70,
    "defaultTarget": "claude-code"
  },
  "recovery": {
    "lowRiskStrategy": "checkpoint",
    "highRiskThreshold": 70,
    "highRiskStrategy": "worktree"
  }
}
```

如果 `harness.json` 不存在，所有值使用上述默认值。

---

## 九、已有项目状态检测

本系统不只用于新项目，更要能**识别已有项目的状态**，跳过已完成阶段，从断点继续。

### 状态信号矩阵

| 阶段 | 完成信号 | 文件/目录证据 |
|------|---------|--------------|
| Phase 1 立项审查 | 有产品定义、竞品分析 | `docs/*产品*`、`design-*.md` |
| Phase 2 需求拆解 | 有需求文档、里程碑 | `PROJECT.md`、`.planning/` |
| Phase 3 阶段规划 | 有执行计划、技术架构 | `PLAN.md`、`.ham-autocode/tasks/` |
| Phase 4 开发执行 | 有源码、feat commits | `src/`、git log |
| Phase 5 审查验收 | 有审查记录、bug列表 | `VERIFICATION.md` |
| Phase 6 发布 | 有 PR、CHANGELOG | `CHANGELOG.md`、git tags |

### 核心原则：不重复执行

```
if Phase 1 已完成 → 跳过 /office-hours, /plan-ceo-review
if Phase 2 已完成 → 跳过 /gsd:new-project
if Phase 3 已完成 → 跳过 /gsd:plan-phase, dag init
直接定位到第一个未完成的阶段 → 从那里继续
```

使用 `/ham-autocode:detect` 即可自动诊断。

---

## 十、外部依赖与安装

### 外部 Skill Pack 依赖

| 依赖 | 必需程度 | 用于 |
|------|---------|------|
| **GSD** (get-shit-done) | 强烈推荐 | Phase 2-4: 项目初始化、里程碑、自主执行 |
| **gstack** (Garry Tan) | 强烈推荐 | Phase 1/5/6: 立项审查、QA、发布 |
| **Superpowers** (Jesse Vincent) | 推荐 | Phase 4: TDD 执行方法论 |

如果某个依赖未安装，对应阶段的 skill 调用会失败，但 pipeline 不会崩溃。

### 安装方式

**方式1：本地开发测试**
```bash
claude --plugin-dir ./ham-autocode
```

**方式2：从 GitHub 安装**
```bash
/plugin install ham-autocode@hammercui
```

**方式3：提交到官方 marketplace**
```bash
claude plugins publish
```

### 使用方式（Claude App 和 Claude Code 通用）

```bash
/ham-autocode:detect      # 检测项目状态
/ham-autocode:auto        # 全自动开发（Core Engine DAG 驱动）
/ham-autocode:parallel    # 并行开发
/ham-autocode:ship        # 审查发布
/ham-autocode:status      # 查看进度
/ham-autocode:pause       # 暂停流水线
/ham-autocode:resume      # 恢复流水线
```

---

## 十一、版本演进与延迟到 v3 的事项

**已完成（v2.1-v2.3）：**
- ~~TypeScript 迁移~~ → v2.1 完成
- ~~Agent Teams 编排~~ → v2.2 完成
- ~~自动 commit~~ → v2.2 完成
- ~~TypeScript guardrail rules~~ → v2.2 完成
- ~~DAG 可视化~~ → v2.2 完成（ASCII）
- ~~完整 JSON Schema 运行时校验~~ → v2.2 完成
- ~~OpenSpec 集成~~ → v2.3 完成

**延迟到 v3：**
- Branch-based 恢复
- Web Dashboard
- 评估系统 / 自动评分
- YAML 配置（当前仅 JSON）

---

## 十二、参考资源

- [Claude Code Agent Teams 官方文档](https://code.claude.com/docs/en/agent-teams)
- [GSD - Get Shit Done](https://github.com/gsd-build/get-shit-done)
- [Superpowers, GSD, and gstack 对比分析](https://medium.com/@tentenco/superpowers-gsd-and-gstack-what-each-claude-code-framework-actually-constrains-12a1560960ad)
- [Skills Stack 组合指南](https://dev.to/imaginex/a-claude-code-skills-stack-how-to-combine-superpowers-gstack-and-gsd-without-the-chaos-44b3)
