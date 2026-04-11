# ham-autocode

> Claude Code 全自动开发插件。
> 编排 gstack + GSD + Superpowers + Agent Teams，通过 Node.js Core Engine 驱动六阶段开发流水线。

**v2.0.0** | [更新日志](CHANGELOG.md) | [架构文档](ARCHITECTURE.md) | [English](README.md)

---

## ham-autocode 是什么？

ham-autocode 是 **Harness 架构** 在 Claude Code 上的一种实现 -- 让 AI 编码 Agent 从"能跑"变成"稳定跑"的基础设施层。

> **Agent** = 干活的工人（Claude Code / Codex）
> **Skill** = 工作方法（GSD / gstack / Superpowers）
> **Harness** = 工厂系统（管理工人 + 流程 + 质量 + 状态 + 恢复）

灵感来自 Stripe（"Minions"系统）、Shopify（Sidekick）和 Airbnb（TypeScript 迁移）的工程实践。Harness 模式为纯 Agent + Skill 的组合补充了五个关键层：

| Harness 层 | 解决什么问题 | ham-autocode 实现 |
|------------|------------|------------------|
| **Context Engine** | 上下文窗口超 60% 后质量退化 | Token 预算追踪、选择性文件加载、三级保护 |
| **DAG 编排** | 线性流水线无法并行 | 拓扑排序、波次调度、依赖追踪 |
| **验证门控** | 手动 QA 不稳定 | 自动检测 lint/test、两击出局策略、逐任务门控 |
| **恢复引擎** | 一个失败拖垮整个流程 | Git 检查点 + Worktree 隔离、两级恢复策略 |
| **Agent 路由** | 手动分配任务不扩展 | 三维评分、自动路由到 Claude Code/Codex/App |

ham-autocode 将这些能力打包为 **Claude Code Plugin**（便捷安装）+ **Node.js Core Engine**（可靠执行），自动化完整开发生命周期：

```
想法 --> 立项审查 --> 需求拆解 --> 阶段规划 --> 并行开发 --> 审查验收 --> 发布上线
         (gstack)      (GSD)       (GSD)     (Agent Teams)  (gstack)    (gstack)
```

它将三个社区框架统一编排为一条流水线：

| 框架 | 角色 | 做什么 |
|------|------|-------|
| **gstack** (Garry Tan) | 决策层 — 想什么 | CEO 审查、QA 测试、发布上线 |
| **GSD** (Get Shit Done) | 稳定层 — 不跑偏 | 项目初始化、里程碑管理、自主执行 |
| **Superpowers** (Jesse Vincent) | 执行层 — 怎么做 | TDD 方法论、代码审查、调试 |

完整的 Harness 理想架构与当前实现的差距分析，见 [GAP-ANALYSIS.md](docs/GAP-ANALYSIS.md)。

---

## 安装

### 前置条件

- **Claude Code** v2.1.32+（`npm install -g @anthropic-ai/claude-code`）
- **Node.js** v18+（Core Engine CLI 需要）
- 至少安装一个框架 Skill Pack（GSD、gstack 或 Superpowers）

### 方式一：本地开发测试（推荐上手）

```bash
# 克隆仓库
git clone https://github.com/hammercui/ham-autocode.git

# 加载插件启动 Claude Code
claude --plugin-dir ./ham-autocode
```

### 方式二：从 GitHub 安装

```bash
# 在 Claude Code 会话中执行
claude plugin install hammercui/ham-autocode
```

### 方式三：项目级安装

```bash
# 复制到目标项目（变为项目级插件）
cp -r ham-autocode /path/to/your/project/.claude/plugins/ham-autocode
```

### 验证安装

启动 Claude Code 后输入：

```
/ham-autocode:status
```

有响应（即使是"未找到 pipeline"）说明插件已加载。

也可以直接验证 Core Engine：

```bash
node ham-autocode/core/index.js help
```

---

## 快速上手

### 场景一：从零开始新项目

```
/ham-autocode:auto
```

自动运行完整六阶段流水线：
1. **立项审查** — `/office-hours` 验证想法 + `/plan-ceo-review` CEO 视角审查
2. **需求拆解** — `/gsd:new-project` 初始化 + `/gsd:new-milestone` 创建里程碑
3. **阶段规划** — `/gsd:discuss-phase` 收集上下文 + `/gsd:plan-phase` 创建详细计划
4. **并行开发** — `/gsd:autonomous` 自主执行 或 Agent Teams 多 agent 并行
5. **审查验收** — `/gsd:verify-work` UAT + `/review` 代码审查 + `/qa` QA 测试
6. **发布上线** — `/ship` 创建 PR + `/document-release` 同步文档

关键决策节点会暂停并征求你的意见。

### 场景二：接手已有项目

```
/ham-autocode:detect
```

扫描项目文件、Git 历史和文档，判断哪些阶段已完成，推荐从哪里继续。绝不重复执行已完成的工作。

示例输出：
```
项目状态：Phase 4 — 开发执行（65%）
  Phase 1 立项审查 .......... 完成
  Phase 2 需求拆解 .......... 完成
  Phase 3 阶段规划 .......... 完成
  Phase 4 开发执行 .......... 进行中（剩余 4 个任务）
  Phase 5 审查验收 .......... 未开始
  Phase 6 发布上线 .......... 未开始

下一步：修复 6 个 HIGH 问题，完成 4 个 P0 功能。
```

### 场景三：大型项目并行开发

```
/ham-autocode:parallel
```

使用 DAG 调度器识别独立任务，按三维评分（规格完整度、复杂度、隔离度）路由：
- **Claude Code** — 复杂架构、多文件联动
- **Codex** — 需求清晰（有文件路径 + 接口定义 + 验收标准）
- **Claude App** — 文档、配置、小修复

为 Claude Code 任务创建 Agent Teams（3-5 个 teammate），为 Codex 任务生成结构化规格。

### 场景四：代码写完，准备发布

```
/ham-autocode:ship
```

执行：验证门控 --> 代码审查 --> QA 测试 --> 自动修复 --> 创建 PR --> 更新文档。

---

## 全部 7 个 Skill

| Skill | 命令 | 用途 |
|-------|------|------|
| **detect** | `/ham-autocode:detect` | 检测项目状态，跳过已完成阶段 |
| **auto** | `/ham-autocode:auto` | 全自动六阶段开发流水线 |
| **parallel** | `/ham-autocode:parallel` | Agent Teams 并行 + DAG 路由 |
| **ship** | `/ham-autocode:ship` | 审查 + QA + 修复 + 发布 |
| **status** | `/ham-autocode:status` | 查看流水线进度 |
| **pause** | `/ham-autocode:pause` | 暂停流水线，保存精确位置 |
| **resume** | `/ham-autocode:resume` | 从暂停/中断点恢复 |

---

## Core Engine CLI

Core Engine 是纯 Node.js CLI（零 npm 依赖），Skill 通过它管理状态、调度任务和路由决策。

```bash
node core/index.js <command> [subcommand] [options]
```

### 流水线状态

```bash
node core/index.js pipeline init "my-project"    # 初始化流水线
node core/index.js pipeline status                # 读取当前状态
node core/index.js pipeline log "started phase 4" # 追加日志
node core/index.js pipeline pause                 # 设置为暂停
node core/index.js pipeline resume                # 设置为运行
node core/index.js pipeline mark-interrupted      # 标记为中断（hook 使用）
```

### DAG 任务调度

```bash
node core/index.js dag init PLAN.md M001 phase-1  # 解析计划为任务
node core/index.js dag status                      # 显示完成统计
node core/index.js dag next-wave                   # 获取下一波可执行任务
node core/index.js dag complete <task-id>           # 标记任务完成
node core/index.js dag fail <task-id> <error-type>  # 标记任务失败
node core/index.js dag retry <task-id>              # 重置任务为待执行
node core/index.js dag skip <task-id>               # 跳过任务
```

### Agent 路由

```bash
node core/index.js route batch            # 批量路由所有待执行任务
node core/index.js route <task-id>        # 路由单个任务（返回评分+目标）
node core/index.js route confirm <task-id> # 确认高风险路由决策
```

### Context 预算

```bash
node core/index.js context budget              # 显示 Token 使用水平
node core/index.js context prepare <task-id>   # 估算任务所需 Token
```

### 验证门控

```bash
node core/index.js validate detect        # 自动检测可用门控（lint、test 等）
node core/index.js validate <task-id>     # 对任务运行门控（两击出局策略）
```

### 恢复引擎

```bash
node core/index.js recover checkpoint <task-id>      # 创建 git tag 检查点
node core/index.js recover rollback <task-id>         # 回滚到检查点
node core/index.js recover worktree-create <task-id>  # 创建隔离 worktree
node core/index.js recover worktree-merge <task-id>   # 合并 worktree
node core/index.js recover worktree-remove <task-id>  # 移除 worktree
```

### 配置与工具

```bash
node core/index.js config show            # 显示生效配置（默认值 + 覆盖值）
node core/index.js config validate        # 验证配置值
node core/index.js token estimate <file>  # 估算文件 Token 数
node core/index.js token index [dir]      # 构建目录文件索引（含 Token 估算）
```

---

## 配置

Core Engine 零配置即可使用。如需自定义，在目标项目中创建 `.ham-autocode/harness.json`：

```json
{
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

只需包含要覆盖的字段，缺失字段使用默认值。

---

## 运行时状态

运行时，ham-autocode 在**目标项目**中创建 `.ham-autocode/` 目录（不是在插件本身内）：

```
your-project/
  .ham-autocode/
    pipeline.json          # 流水线状态（阶段、状态、日志）
    harness.json           # 可选的用户配置覆盖
    tasks/
      task-001.json        # 单个任务状态
      task-002.json
    logs/
```

该目录默认被 git 忽略。pipeline.json 文件支持：
- `/ham-autocode:status` 显示实时进度
- `/ham-autocode:pause` 保存精确位置
- `/ham-autocode:resume` 从断点恢复
- 崩溃自动恢复（SessionEnd hook 自动标记为 "interrupted"）

---

## 三工具协作模式

ham-autocode 设计为三个工具同时协作：

```
你（人类）
  |
  v
Claude App（项目经理）
  |  - 与你对话，汇报进度，做关键决策
  |  - 运行 /ham-autocode:detect, /ham-autocode:status
  |  - 轻量编码（改配置、写文档、小修复）
  |
  +---> Claude Code（主力工程师）
  |      - 运行 /ham-autocode:auto, /ham-autocode:parallel
  |      - 完整 skill 链执行
  |      - Agent Teams（3-5 个并行 teammate）
  |      - 重度编码 + Git + 测试 + 部署
  |
  +---> Codex（能力工程师）
         - 接收 /ham-autocode:parallel 生成的结构化任务规格
         - 需求清晰的任何任务（文件路径 + 接口定义 + 验收标准）
         - 能力不弱，关键是需求描述要清晰，不是只能做简单活
```

---

## 暂停与恢复

```bash
# 随时暂停（保存精确位置）
/ham-autocode:pause

# 稍后恢复（即使在新会话中）
/ham-autocode:resume
```

如果会话崩溃，SessionEnd hook 自动将流水线标记为 "interrupted"。下次会话，`/ham-autocode:resume` 检测到中断状态并从最后检查点继续。

---

## 插件结构

```
ham-autocode/
  .claude-plugin/
    plugin.json              # 插件清单（名称、版本、描述）
  skills/                    # 7 个 Skill（斜杠命令）
    detect/SKILL.md          # /ham-autocode:detect
    auto/SKILL.md            # /ham-autocode:auto
    parallel/SKILL.md        # /ham-autocode:parallel
    ship/SKILL.md            # /ham-autocode:ship
    status/SKILL.md          # /ham-autocode:status
    pause/SKILL.md           # /ham-autocode:pause
    resume/SKILL.md          # /ham-autocode:resume
  agents/                    # 5 个 Subagent 定义
    planner.md               # 规划 agent（Opus）
    coder.md                 # TDD 编码 agent（Sonnet）
    reviewer.md              # 代码审查 agent（Opus）
    qa-tester.md             # QA 测试 agent（Sonnet）
    infra.md                 # 基础设施 agent（Sonnet）
  hooks/                     # 3 个生命周期 Hook
    hooks.json               # Hook 注册配置
    on-session-start.sh      # 新会话注入流水线状态
    on-session-end.sh        # 崩溃时标记为中断
    on-post-tool-use.sh      # 追踪 Context 预算
  core/                      # Node.js Core Engine（零依赖）
    index.js                 # CLI 调度器（30+ 命令）
    dag/                     # DAG 图、调度器、计划解析器
    context/                 # Token 预算、上下文管理器
    routing/                 # 评分器、路由器
    executor/                # 适配器（claude-code/codex/claude-app）
    validation/              # 门控检测器、门控运行器
    recovery/                # 检查点、worktree 管理器
    state/                   # 锁、原子写入、配置、流水线、任务图
    utils/                   # Token 估算、Git 封装
    __tests__/               # 8 个测试套件
  schemas/                   # 所有状态文件的 JSON Schema
  defaults/                  # 默认配置（harness.json）
  settings.json              # Claude Code 设置（启用 Agent Teams）
  loop.md                    # /loop 默认维护行为
```

---

## 外部依赖

ham-autocode 编排以下框架 Skill Pack（至少安装一个）：

| 依赖 | 重要程度 | 用于 |
|------|---------|------|
| **GSD** ([get-shit-done](https://github.com/gsd-build/get-shit-done)) | 强烈推荐 | Phase 2-4：项目初始化、里程碑、自主执行 |
| **gstack** (Garry Tan) | 强烈推荐 | Phase 1/5/6：立项审查、QA 测试、发布 |
| **Superpowers** (Jesse Vincent) | 推荐 | Phase 4：TDD 执行方法论 |

如果某个依赖未安装，对应的 skill 调用会优雅失败 — 流水线报告错误并继续。

---

## Windows 注意事项

1. Agent Teams 的 split-pane 模式不支持 Windows Terminal，使用 in-process 模式代替
2. Core Engine 内部统一使用正斜杠路径
3. Hook 脚本使用 bash（Windows 上通过 Git Bash 执行），请确保已安装 Git

---

## 许可证

MIT - 见 [LICENSE](LICENSE)
