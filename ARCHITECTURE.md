# ham-autocode: Claude Code 全自动开发 Plugin

> 一个 Claude Code Plugin，编排 gstack + GSD + Superpowers + Agent Teams，
> 实现项目全生命周期自动化开发。
>
> 版本: v1.0 | 日期: 2026-04-11
>
> **项目性质：Claude Code Plugin**
> - 安装：`/plugin install ham-autocode` 或 `claude --plugin-dir ./ham-autocode`
> - 调用：`/ham-autocode:detect`、`/ham-autocode:auto`、`/ham-autocode:parallel`、`/ham-autocode:ship`
> - 适用：Claude App + Claude Code（均支持 skill 斜杠命令）

---

## 一、核心认知：三大框架的定位

经过对社区最佳实践的深度调研，2026年三大 Claude Code 框架的定位已经非常清晰：

| 框架 | 核心能力 | Stars | 定位 |
|------|---------|-------|------|
| **gstack** (Garry Tan) | 角色化决策 + 28个slash命令 + 浏览器QA | 50K | **决策层** - 想什么 |
| **GSD** (Get Shit Done) | 规范驱动 + context隔离 + 自主执行 | 48K | **稳定层** - 不跑偏 |
| **Superpowers** (Jesse Vincent) | TDD闭环 + 7阶段流水线 | 106K | **执行层** - 怎么做 |

**一句话总结：gstack thinks, GSD stabilizes, Superpowers executes.**

---

## 二、三个工具的角色定位

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
 │     - Agent Teams 并行（3-5 个 teammate）
 │     - 重度编码 + Git + 测试 + 部署
 │     - 产出状态报告 → 回传给 App
 │
 └──→ Codex (能力工程师)
       - 需求清晰的任何编码任务（能力不弱）
       - 关键前提：输入明确（文件路径、接口定义、预期行为）
       - 独立模块、功能实现、bug修复、重构
```

### 任务路由规则

| 任务类型 | 路由到 | 原因 |
|---------|--------|------|
| 想法讨论、方向确认 | Claude App | 对话体验好，来回讨论方便 |
| 查看进度、了解状态 | Claude App | 直接问就行 |
| 改个配置、写文档、小修复 | Claude App | 轻量活，不用开终端 |
| 项目初始化、skill 执行 | Claude Code | 需要文件系统和 skill |
| 复杂架构、多文件联动 | Claude Code | 需要全局上下文 + Agent Teams |
| 代码审查、QA测试 | Claude Code | 需要读代码 + 跑测试 |
| **需求清晰的功能开发** | **Codex** | **能力足够，关键是需求描述要清晰** |
| 独立模块、bug修复 | Codex | 输入输出明确，适合独立执行 |
| 重构、代码清理 | Codex | 给定范围和规则即可 |

> **Codex 任务分配原则：** Codex 能力不弱，不是"只能做简单活"。
> 关键区分是**需求是否清晰** — 给 Codex 的任务必须包含：
> 1. 要修改的文件路径
> 2. 接口/函数签名或预期行为
> 3. 验收标准（怎么算完成）
>
> 满足以上条件的任务，不论复杂度，都可以分给 Codex。

---

## 三、六阶段全自动流水线

```
┌─────────────────────────────────────────────────────────────────┐
│  你 ←→ Claude App (进度把控 + 状态对话 + 轻量编码)               │
│         │                                                       │
│         ├── Phase 1: 立项审查 ──→ App 自己做（对话式）            │
│         ├── Phase 2: 需求拆解 ──→ 指挥 Claude Code 执行 GSD     │
│         ├── Phase 3: 阶段规划 ──→ 指挥 Claude Code 执行 GSD     │
│         ├── Phase 4: 并行开发 ──→ Claude Code (主) + Codex (辅) │
│         ├── Phase 5: 审查验收 ──→ Claude Code 执行 + App 判断   │
│         └── Phase 6: 发布上线 ──→ Claude Code 执行 + App 确认   │
│                                                                 │
│  底层支撑：Agent Teams | Git Worktree | Subagents | CLAUDE.md   │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 1: 立项与审查 (Claude App 主导)

**执行者：Claude App** — 纯对话，不需要终端环境

**目标：** 验证想法可行性，确定产品方向

| 步骤 | Skill | 作用 |
|------|-------|------|
| 1.1 | `/office-hours` | YC式头脑风暴，6个强制问题验证需求真实性 |
| 1.2 | `/plan-ceo-review` | CEO/创始人视角审查，挑战前提假设 |
| 1.3 | `/plan-design-review` | 设计维度评审（如有UI） |

**输出物：** 产品决策文档、设计方向
**App 的附加价值：** 你可以随时对话追问，来回讨论到满意为止

### Phase 2: 需求拆解与里程碑 (Claude Code 执行)

**执行者：Claude Code** — 需要文件系统，App 发出指令后 Code 执行

**目标：** 将产品决策转化为可执行的里程碑和阶段

| 步骤 | Skill | 作用 |
|------|-------|------|
| 2.1 | `/gsd:new-project` | 深度上下文收集，生成 PROJECT.md |
| 2.2 | `/gsd:new-milestone` | 创建里程碑，更新 PROJECT.md |
| 2.3 | GSD Roadmapper Agent | 自动生成阶段路线图 (M001-ROADMAP.md) |

**输出物：** PROJECT.md, ROADMAP.md, .planning/ 目录
**App 的附加价值：** Code 执行完后，你在 App 里对话确认路线图是否合理

### Phase 3: 阶段规划 (GSD + Superpowers)

**目标：** 为每个阶段创建详细执行计划

| 步骤 | Skill | 作用 |
|------|-------|------|
| 3.1 | `/gsd:discuss-phase` | 收集阶段上下文，适应性提问 |
| 3.2 | `/gsd:plan-phase` | 创建 PLAN.md（研究→规划→验证循环） |
| 3.3 | `/gsd:list-phase-assumptions` | 暴露 Claude 的假设 |
| 3.4 | `/plan-eng-review` (gstack) | 工程视角锁定架构 |

**输出物：** PLAN.md, RESEARCH.md per phase

### Phase 4: 并行开发 (Agent Teams + Superpowers)

**目标：** 多 agent 并行执行，TDD 驱动

这是核心阶段，有三种执行模式：

#### 模式A：GSD 自主模式（推荐起步）
```
/gsd:autonomous
```
Claude Code 自动：研究→规划→执行→验证→提交→推进下一阶段。
每个任务获得干净的 context window。

**App 做什么：** 随时对话问 "现在到哪个阶段了"，Code 产出的状态文件 App 可以读取。

#### 模式B：Claude Code + Codex 分工（推荐日常）

**任务路由逻辑：**
```
Claude Code (主力)             Codex (辅助)
├── 复杂业务逻辑                ├── CRUD 模板页面
├── 架构层代码                  ├── 数据模型 / DTO
├── Agent Teams 协调            ├── 工具函数 / helpers
├── 集成测试                    ├── 简单组件
└── Git / 部署                  └── 配置文件生成
```

**实操方式：**
1. Claude Code 跑 `/gsd:plan-phase`，计划里标注每个任务的复杂度
2. 复杂度 low 的任务 → 手动丢给 Codex 执行
3. 复杂度 medium/high 的任务 → Claude Code 自己做
4. 两边产出合并到同一个 Git 仓库

#### 模式C：Agent Teams 全并行（大型项目）
```
创建一个 4 人团队来并行开发这个里程碑：
- frontend-dev: 负责 src/components/ 下的 React 组件
- backend-dev: 负责 src/api/ 下的 API 端点
- test-engineer: 为前后端编写集成测试
- infra-dev: 负责 Docker/CI/CD 配置

每个队员使用 Superpowers TDD 方法论：先写测试，再实现，再重构。
要求每个队员提交计划后经我审批才能开始实现。
```

**Codex 在这个模式下：** 接收 Agent Teams 规划中标记为 low 的独立任务。

#### 模式D：GSD + Agent Teams + Codex 混合（最大火力）
- GSD 管理阶段推进和状态
- 每个阶段内部用 Agent Teams 并行
- 简单子任务分流给 Codex
- Superpowers 保证每个 agent 的执行质量
- **App 全程可对话查询进度**

### Phase 5: 审查与验收 (gstack + GSD)

| 步骤 | Skill | 作用 |
|------|-------|------|
| 5.1 | `/gsd:verify-work` | 对话式 UAT 验收 |
| 5.2 | `/gsd:audit-milestone` | 里程碑完成度审计 |
| 5.3 | `/review` (gstack) | PR 级代码审查 |
| 5.4 | `/qa` (gstack) | 系统化 QA 测试+自动修复 |
| 5.5 | `/design-review` (gstack) | 视觉一致性审计 |
| 5.6 | `/codex` (gstack) | Codex 独立审查（第二意见） |

### Phase 6: 发布 (gstack)

| 步骤 | Skill | 作用 |
|------|-------|------|
| 6.1 | `/ship` (gstack) | 检测+合并+测试+版本+CHANGELOG+PR |
| 6.2 | `/land-and-deploy` (gstack) | 合并 PR + 等 CI + 部署 + 健康检查 |
| 6.3 | `/canary` (gstack) | 部署后金丝雀监控 |
| 6.4 | `/document-release` (gstack) | 同步文档到最新状态 |

---

## 四、项目结构（Plugin）

### ham-autocode Plugin 结构

```
ham-autocode/                            # Plugin 根目录
├── .claude-plugin/
│   └── plugin.json                      # Plugin 清单
├── skills/                              # 7 个 Skill
│   ├── detect/SKILL.md                  # /ham-autocode:detect   检测项目状态
│   ├── auto/SKILL.md                    # /ham-autocode:auto     全自动流水线
│   ├── parallel/SKILL.md               # /ham-autocode:parallel  并行开发
│   ├── ship/SKILL.md                    # /ham-autocode:ship     审查+发布
│   ├── status/SKILL.md                  # /ham-autocode:status   查看进度
│   ├── pause/SKILL.md                   # /ham-autocode:pause    暂停流水线
│   └── resume/SKILL.md                  # /ham-autocode:resume   恢复流水线
├── agents/                              # 5 个 Subagent 定义
│   ├── planner.md                       # 规划 agent (Opus)
│   ├── coder.md                         # TDD 编码 agent (Sonnet)
│   ├── reviewer.md                      # 审查 agent (Opus)
│   ├── qa-tester.md                     # QA agent (Sonnet)
│   └── infra.md                         # 基础设施 agent (Sonnet)
├── hooks/                               # 2 个 Lifecycle Hook
│   ├── hooks.json                       # Hook 注册配置
│   ├── on-session-start.sh              # 新 session 自动注入 pipeline 状态
│   └── on-session-end.sh               # session 断线自动标记 interrupted
├── schemas/
│   └── pipeline.json                    # pipeline.json 的 JSON Schema
├── settings.json                        # 默认设置（启用 Agent Teams）
├── loop.md                              # /loop 默认维护行为
├── CLAUDE.md                            # 全局指令
├── ARCHITECTURE.md                      # 本文档
├── QUICKSTART.md                        # 快速开始
├── LICENSE                              # MIT
└── scripts/
    └── auto-orchestrator.sh             # headless 链式调用 + watchdog
```

### 外部依赖

本 plugin 编排以下第三方 skill pack，需至少安装一个：

| 依赖 | 必需程度 | 用于 |
|------|---------|------|
| **GSD** (get-shit-done) | 强烈推荐 | Phase 2-4: 项目初始化、里程碑、自主执行 |
| **gstack** (Garry Tan) | 强烈推荐 | Phase 1/5/6: 立项审查、QA、发布 |
| **Superpowers** (Jesse Vincent) | 推荐 | Phase 4: TDD 执行方法论 |

如果某个依赖未安装，对应阶段的 skill 调用会失败，但 pipeline 不会崩溃 — Claude 会报告并跳到下一步。

### 安装方式

**方式1：本地开发测试**
```bash
claude --plugin-dir ./ham-autocode
```

**方式2：从 GitHub 安装**
```bash
# 推送到 GitHub 后，其他用户直接安装
/plugin install ham-autocode@hammercui
```

**方式3：提交到官方 marketplace**
```bash
claude plugins publish
# 提交后用户通过 /plugin install ham-autocode 安装
```

### 使用方式（Claude App 和 Claude Code 通用）

```bash
# 安装后，所有项目中均可调用：
/ham-autocode:detect      # 检测项目状态
/ham-autocode:auto        # 全自动开发
/ham-autocode:parallel    # 并行开发
/ham-autocode:ship        # 审查发布
```

**无需任何复制操作。** 安装一次，全局可用，Claude App 和 Claude Code 均可通过斜杠命令调用。

---

## 五、关键配置文件

### 4.1 CLAUDE.md（主控指令）

见 `CLAUDE.md` 文件。

### 4.2 settings.json（启用 Agent Teams）

见项目根目录 `settings.json` 文件。

### 4.3 Subagent 定义

见 `agents/` 目录下的各 agent 定义文件。

---

## 六、已有项目状态检测（关键能力）

本系统不只用于新项目，更要能**识别已有项目的状态**，跳过已完成阶段，从断点继续。

### 6.1 状态信号矩阵

| 阶段 | 完成信号（检测什么） | 文件/目录证据 |
|------|-------------------|--------------|
| Phase 1 立项审查 | 有产品定义、竞品分析、设计决策 | `docs/*产品*`、`*竞品*`、`design-*.md`、`office-hours` 产出 |
| Phase 2 需求拆解 | 有需求文档、里程碑计划、WBS | `PROJECT.md`、`docs/*需求*`、`*里程碑*`、`*WBS*`、`.planning/` |
| Phase 3 阶段规划 | 有详细执行计划、技术架构 | `PLAN.md`、`docs/*架构*`、`docs/*设计*`、任务拆分表 |
| Phase 4 开发执行 | 有源码、git feat commits、部分任务完成 | `src/`、`app/`、git log、WBS 中"已完成"标记 |
| Phase 5 审查验收 | 有审查记录、bug列表、验收报告 | `*审查*`、`*待办*`、`VERIFICATION.md`、CRITICAL/HIGH 问题列表 |
| Phase 6 发布 | 有 PR、CHANGELOG、部署记录 | `CHANGELOG.md`、git tags、PR history |

### 6.2 检测 Prompt

在 Claude Code 或 Claude App 中输入 `/ham-detect` 即可自动诊断。

### 6.3 实例：已有项目状态诊断

以一个视频创作工具项目为例（已完成立项/需求/规划，正在开发中）：

```
项目状态诊断：my-video-app

总体进度：Phase 4 — 开发执行（约 65%）

各阶段状态：
| 阶段 | 状态 | 完成度 | 证据 |
|------|------|--------|------|
| Phase 1 立项审查 | 完成 | 100% | office-hours产出(design-mvp.md)、产品定义、竞品分析、CEO审查记录 |
| Phase 2 需求拆解 | 完成 | 100% | 7份需求文档、里程碑计划(3个)、WBS(06-工作结构分解.md)、验收标准 |
| Phase 3 阶段规划 | 完成 | 100% | 技术架构(6份)、设计文档(5份)、Phase 1/2/3 任务拆分、依赖关系明确 |
| Phase 4 开发执行 | 进行中 | 65% | Phase1 CLI 已完成、Phase2 GUI 主体完成但有4项待开发、审查发现6个HIGH问题 |
| Phase 5 审查验收 | 部分 | 30% | 已做2轮代码审查、有问题列表，但未做系统QA |
| Phase 6 发布上线 | 未开始 | 0% | 无 PR/CHANGELOG/部署记录 |

当前阻塞项：
- 4 个 P0 待开发功能（GUI桥接Orchestrator、模型选择持久化、首次引导、S5等待体验）
- 6 个 HIGH 审查问题待修复
- Phase 1 前置验证（S5异步、API成本、一致性测试）未执行

建议下一步：
1. 不需要执行 /office-hours、/plan-ceo-review（已完成）
2. 不需要执行 /gsd:new-project（已有完整文档，但可选择性跑一次导入状态到 GSD）
3. 直接从 Phase 4 继续：先修复 6 个 HIGH 问题，再完成 4 个 P0 功能
4. 可以把 HIGH 问题和 P0 功能拆分给 Claude Code + Codex：
   - Claude Code: GUI桥接Orchestrator（复杂，涉及IPC）、状态机实现
   - Codex: extractJSON 重复消除、import 扩展名修复、模型选择持久化（需求清晰）
5. 完成后运行 /qa 做系统测试
```

### 6.4 核心原则：不重复执行

系统在分析项目后，自动跳过已完成阶段：

```
if Phase 1 已完成 → 跳过 /office-hours, /plan-ceo-review
if Phase 2 已完成 → 跳过 /gsd:new-project（或仅导入状态）
if Phase 3 已完成 → 跳过 /gsd:plan-phase
直接定位到第一个未完成的阶段 → 从那里继续
```

对于没用 GSD 初始化的项目，等效文档同样有效：
- `docs/06-工作结构分解.md` ≈ GSD ROADMAP
- `docs/07-里程碑计划.md` ≈ GSD Milestone
- `docs/08-当前待办.md` ≈ GSD Task Queue

---

## 七、24小时不停机运行机制

### 6.1 GSD 自主模式（核心）

```bash
# 最简方式：在 Claude App 中输入
/gsd:autonomous
```

GSD 的自主模式会：
1. 自动推进每个阶段：discuss → plan → execute
2. 每个执行任务使用独立 subagent（干净 context window）
3. 自动验证和提交
4. 阶段完成后自动推进下一阶段

### 6.2 断点恢复

```bash
# 保存进度
/gsd:pause-work

# 恢复工作
/gsd:resume-work

# 或使用 checkpoint
/checkpoint
```

### 6.3 watchdog 脚本

```bash
# scripts/auto-orchestrator.sh
# 见独立脚本文件
```

---

## 八、Skill 组合速查表

### 完整生命周期一键流程

```
# === 第一步：立项 ===
/office-hours          # 头脑风暴验证想法
/plan-ceo-review       # CEO 视角审查

# === 第二步：需求 ===
/gsd:new-project       # 初始化项目
/gsd:new-milestone     # 创建里程碑

# === 第三步：规划 ===
/gsd:discuss-phase     # 收集阶段上下文（可用 --auto 跳过交互）
/gsd:plan-phase        # 创建详细计划
/plan-eng-review       # 工程审查锁定

# === 第四步：执行 ===
/gsd:autonomous        # 全自动执行所有阶段
  # 或
/gsd:execute-phase     # 执行单个阶段

# === 第五步：审查 ===
/gsd:verify-work       # UAT 验收
/review                # PR 审查
/qa                    # QA 测试+修复

# === 第六步：发布 ===
/ship                  # 创建 PR
/land-and-deploy       # 部署上线
/canary                # 监控
```

### 按场景选择

| 场景 | 推荐 Skill |
|------|-----------|
| "我有个想法" | `/office-hours` → `/plan-ceo-review` |
| "开始新项目" | `/gsd:new-project` → `/gsd:new-milestone` |
| **"接手已有项目"** | **`/ham-detect` → 跳到未完成阶段** |
| "需要并行开发" | Agent Teams + `/gsd:execute-phase` |
| "全自动跑完" | `/gsd:autonomous` |
| "分任务给 Codex" | 从 WBS/PLAN.md 中提取需求清晰的任务 → 写清文件+接口+验收标准 |
| "代码写完了" | `/review` → `/qa` → `/ship` |
| "出 bug 了" | `/investigate` (gstack) 或 `/gsd:debug` |
| "看看进度" | `/gsd:progress` 或在 Claude App 中直接问 |

---

## 九、可行性分析与已知问题

### 9.1 可以稳定做到的

- [x] 多 agent 并行开发（Agent Teams，3-5 个 teammate）
- [x] GSD 自主模式长时间运行（context 隔离解决退化问题）
- [x] Superpowers TDD 保证代码质量
- [x] gstack 提供完整的审查+发布流水线
- [x] 断点恢复和状态持久化（GSD .planning/ 目录）
- [x] Git Worktree 隔离避免冲突

### 9.2 存在的风险与限制

| 风险 | 级别 | 缓解措施 |
|------|------|---------|
| **Token 成本爆炸** | 高 | Agent Teams 3-7x 成本；限制 teammate 数量 3-5 个 |
| **Superpowers 交互阻塞** | 中 | Superpowers 的 Q&A 提示会阻塞输入流；用 `--auto` 跳过 |
| **Agent Teams 不支持恢复** | 中 | 使用 GSD 状态管理作为备份恢复点 |
| **框架间冲突** | 中 | GSD v2 是 TypeScript 应用，与 Superpowers Markdown 技术路线不同 |
| **24h 真正无人值守** | 中 | Agent Teams 需要偶尔人工干预；GSD autonomous 更可靠 |
| **Git 冲突** | 低 | Agent Teams 按文件/目录分配；Worktree 隔离 |
| **Windows 兼容性** | 中 | Agent Teams split-pane 需要 tmux（Windows 用 in-process 模式） |
| **模型选择限制** | 低 | Agent Teams 当前所有 teammate 必须用同一模型 |

### 9.3 最佳实践建议

1. **先用 GSD autonomous，再考虑 Agent Teams** — GSD autonomous 是最稳定的全自动方案
2. **每个 teammate 5-6 个任务** — 太细协调开销大，太粗失去并行优势
3. **按文件/目录分配 agent** — 避免同文件冲突
4. **CLAUDE.md 写充分** — teammate 不继承 lead 的对话历史，只读 CLAUDE.md
5. **Windows 环境用 in-process 模式** — split-pane 不支持 Windows Terminal
6. **定期 checkpoint** — 使用 `/checkpoint` 或 `/gsd:pause-work` 保存进度

---

## 十、与 Requirement.md 方案的对比

| 维度 | Requirement.md 方案 | 本方案 |
|------|-------------------|--------|
| 编排器 | 自写 Python orchestrator | Claude 原生 Agent Teams + GSD |
| Agent 定义 | 简单 Markdown | subagent 定义 + skill 组合 |
| 状态管理 | queue.json | GSD .planning/ 持久化 |
| 并行方式 | subprocess.Popen | Agent Teams 原生协调 |
| Git 隔离 | 手动 worktree | Agent Teams 自动 + GSD 管理 |
| 24h 运行 | watchdog loop | GSD autonomous + checkpoint |
| 质量保证 | 无 | Superpowers TDD + gstack QA |
| 审查流程 | 简单 reviewer.md | gstack 多维度审查 |
| **代码量** | ~200行 Python | **0行自定义代码** |
| **可维护性** | 需维护自写代码 | 社区维护的成熟框架 |

**核心差异：** 本方案完全利用现有 skill 和 Claude 原生能力，不需要自写 orchestrator 代码。

---

## 十一、参考资源

- [Claude Code Agent Teams 官方文档](https://code.claude.com/docs/en/agent-teams)
- [GSD - Get Shit Done](https://github.com/gsd-build/get-shit-done)
- [Superpowers, GSD, and gstack 对比分析](https://medium.com/@tentenco/superpowers-gsd-and-gstack-what-each-claude-code-framework-actually-constrains-12a1560960ad)
- [Skills Stack 组合指南](https://dev.to/imaginex/a-claude-code-skills-stack-how-to-combine-superpowers-gstack-and-gsd-without-the-chaos-44b3)
- [Swarm Orchestration Skill](https://gist.github.com/kieranklaassen/4f2aba89594a4aea4ad64d753984b2ea)
- [Ruflo (Claude Flow)](https://github.com/ruvnet/ruflo)
- [Claude Swarm](https://github.com/affaan-m/claude-swarm)
