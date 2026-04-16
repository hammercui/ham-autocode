# ham-autocode

[![CI](https://github.com/hammercui/ham-autocode/actions/workflows/ci.yml/badge.svg)](https://github.com/hammercui/ham-autocode/actions/workflows/ci.yml)

> 协同多个 AI agent，自动完成整个软件项目，节省 82% token 成本。

**v4.0** | [更新日志](CHANGELOG.md) | [架构文档](ARCHITECTURE.md) | [入门指南](docs/GUIDE.md) | [路线图](docs/ROADMAP-v4.0.md) | [English](README.md)

## 这是什么？

Claude Code (Opus) 强大但昂贵且有额度限制。ham-autocode 的解决方案：**拆分任务，路由给免费/低成本 agent 执行**，同时保证质量：

```
PLAN.md → DAG → Opus 写 spec → 路由到 agent → 执行 → 质量门禁 → 提交 → 下一波
```

一条命令完成全部流程，无需人工干预：

```bash
ham-cli execute full-auto              # 自动跑完所有 phase
ham-cli execute full-auto --push       # 完成后自动 git push
ham-cli execute full-auto --dry-run    # 预览模式，不实际执行
```

架构借鉴 Harness Engineering 实践（OpenAI、Anthropic、Stripe、Hashimoto），作为方法论运用而非目标本身。项目遵循 **Skill-First 原则**：优先使用社区 skill（gstack、GSD、Superpowers），自建模块只覆盖它们不提供的能力——多 agent 分发、DAG 调度、适配自治执行的质量门禁。

## 7 层架构

| 层 | 解决什么问题 | 核心模块 |
|----|-------------|---------|
| **上下文引擎** | 给对的 agent 对的上下文 — 按目标裁剪模板，40% Smart Zone 预算 | `context-template.ts` `summary-cache.ts` |
| **DAG 编排** | 任务依赖调度 — 拓扑排序、波次并行、关键路径、运行时编辑 | `parser.ts` `graph.ts` `scheduler.ts` `critical-path.ts` `merge.ts` |
| **验证门禁** | 分层质量保障 — L0-L4 门禁、失败诊断、L4 自动重试 (v4.0) | `quality-gate.ts` `review-gate.ts` `diagnosis.ts` |
| **恢复引擎** | 故障容错 — git checkpoint、worktree 隔离、fallback 链 | `recovery/checkpoint.ts` `recovery/worktree.ts` |
| **Agent 路由** | 成本最优分发 — 5 目标评分、额度追踪、静态规则 | `router.ts` `scorer.ts` `quota.ts` |
| **Spec 引擎** | Spec 质量决定成功率 — Opus 生成、反馈闭环、TDD 要求 (v4.0) | `spec-generator.ts` `spec/reader.ts` `spec/enricher.ts` |
| **知识沉淀** | 跨会话学习 — 项目脑、代码实体索引、任务后自动学习 | `project-brain.ts` `code-entities.ts` `auto-learn.ts` |

### 第 1 层：上下文引擎

Agent 需要恰到好处的上下文——太少会遗漏需求，太多会失去焦点。上下文引擎按目标裁剪每个 bundle：

| 目标 | 上下文大小 | 包含内容 |
|------|-----------|---------|
| opencode | ~1K tokens | 任务 spec + 文件路径 |
| codexfake | ~2K tokens | + 阅读清单 + 依赖产出 |
| claude-code | ~3-5K tokens | + 项目脑 + 惯例 + 实体搜索 |

预算：40% Smart Zone 阈值——上下文超过窗口 40% 后产出质量下降。

### 第 2 层：DAG 编排

PLAN.md 被解析为有向无环图，任务按依赖关系分波次并行执行：

```
dag init PLAN.md   →   Wave 1: [A, B]   →   Wave 2: [C, D]   →   Wave 3: [E]
                       (并行)                (并行)                (依赖 C+D)
```

| 能力 | 说明 |
|------|------|
| WBS 解析 | 解析 PLAN.md（标题/复选框/表格）→ 任务 DAG |
| 波次调度 | 基于依赖就绪的并行波次生成 |
| 关键路径 (CPM) | 前推/后推、浮动时间、瓶颈检测 |
| 运行时编辑 | 执行中 `dag add/remove/move/re-init --merge` |
| PM 报告 | PERT 估算、挣值分析、ASCII 甘特图 |

### 第 3 层：验证门禁

每个任务产出经过分层验证。错误消息包含可操作的修复指令。

| 层级 | 检查内容 | 失败时 |
|------|---------|--------|
| L0 | 文件存在 + 非空（支持删除/重构任务） | `创建文件并实现 spec 要求` |
| L1 | TypeScript 单文件语法 | `TS 错误码对照：TS2304/2339/2345/2307` |
| L2 | spec.interface export 验证（搜索所有产出文件） | `添加与 spec.interface 一致的 export 声明` |
| L3 | 项目级 `tsc --noEmit` | 仅警告（项目可能有预存错误） |
| L4 | AI 自审：diff vs spec → **FAIL 自动重试** (v4.0) | 修复重试 + 经验追加到 CLAUDE.md |

**v4.0：** 结构化失败诊断将每次 skip 分为 5 类（`spec-issue`、`agent-limitation`、`env-issue`、`dep-missing`、`unknown`），附修复建议 → `diagnosis.jsonl`。

### 第 4 层：恢复引擎

| 策略 | 触发条件 | 做什么 |
|------|---------|--------|
| Checkpoint | complexity < 70 | 执行前打 git tag，失败时回滚 |
| Worktree | complexity >= 70 | git worktree 隔离，失败时丢弃 |
| Fallback 链 | Agent 失败 | codexfake → opencode → claude-code |
| 自动跳过 | 同一错误 2 次 | 停止重试，诊断，继续下一个 |

### 第 5 层：Agent 路由

5 个目标，静态规则，无 ML。成本优化是第一驱动力。

| 目标 | 模型 | 成本 | 适用场景 |
|------|------|------|---------|
| opencode | glm-4.7 | 免费 | 简单：complexity ≤ 40, files ≤ 5 |
| codexfake | gpt-5.3-codex | 低 | 中等：specScore ≥ 80, isolationScore ≥ 70 |
| claude-app | Sonnet | 中 | 文档/配置/hotfix |
| claude-code | Opus 4.6 | 高 | 复杂架构（默认 fallback） |
| agent-teams | Opus x N | 高 | 并行波次 ≥ 3 个隔离任务 |

### 第 6 层：Spec 引擎

"当规格正确时，实现自然可靠。" Opus 写详细 spec，免费 agent 执行。

| 能力 | 说明 |
|------|------|
| Opus 生成 | `claude -p` 生成 JSON spec（description, interface, acceptance, files, complexity） |
| 项目文件树 | spec prompt 包含文件树（深度 3, 最多 100 行）— Opus 不再猜错路径 |
| 反馈闭环 (v4.0) | review-feedback.jsonl FAIL 记录注入下次 spec — 同类错误不再重犯 |
| CLAUDE.md 闭环 (v4.0) | 项目 CLAUDE.md 经验教训注入 spec prompt — 跨会话学习 |
| TDD 要求 (v4.0) | complexity ≥ 50 时要求输出 testFile + testCases |

### 第 7 层：知识沉淀

跨会话连续性，无 ML 复杂度：

| 模块 | 存储什么 | 如何使用 |
|------|---------|---------|
| 项目脑 | 痛点、已验证模式、架构连接 | 通过 `getBrainContext()` 注入 agent 上下文 |
| 代码实体 | 每个文件的函数/类/接口索引 | `searchEntities()` 发现相关代码 |
| 自动学习 | 每次 `dag complete` 后触发 | 增量更新 brain + 实体索引 |

## 三层框架

**gstack 思考 → GSD 稳定 → Superpowers 执行**

| 框架 | 角色 | 提供什么 |
|------|------|---------|
| [gstack](https://github.com/garrytan/gstack) | 战略思考 | CEO/工程/设计审查、QA、调研、发布、部署 |
| [GSD](https://github.com/gsd-build/get-shit-done) | 工作流稳定 | 阶段驱动开发、spec 强制、验证体系 |
| [Superpowers](https://github.com/obra/superpowers) | 执行纪律 | TDD、头脑风暴、代码审查、调试方法论 |

ham-autocode 编排三者：gstack 定方向，GSD 搭结构，Superpowers 保质量。

### Skill 映射表

项目全生命周期中，每个环节用到哪个框架的哪个 skill：

| 阶段 | 步骤 | Skill | 框架 | ham-autocode 角色 |
|------|------|-------|------|-------------------|
| **1. 构思** | 想法验证 | `/office-hours` | gstack | —（直接使用） |
| | 战略审查 | `/plan-ceo-review` | gstack | — |
| | 设计审查 | `/plan-design-review` | gstack | — |
| **2. 需求** | 项目初始化 | `/gsd:new-project` | GSD | — |
| | 里程碑创建 | `/gsd:new-milestone` | GSD | — |
| | 路线图生成 | GSD Roadmapper | GSD | — |
| **3. 规划** | 阶段讨论 | `/gsd:discuss-phase --auto` | GSD | — |
| | 阶段计划 | `/gsd:plan-phase` | GSD | — |
| | 架构锁定 | `/plan-eng-review` | gstack | — |
| | 头脑风暴 | `brainstorming` | Superpowers | — |
| **4. 执行** | 自治循环 | `execute full-auto` | **ham-autocode** | 核心：spec 生成 → 路由 → 执行 → 门禁 → 提交 |
| | Spec 生成 | `spec-generator.ts` | **ham-autocode** | 第 6 层：Opus 写 spec |
| | 任务路由 | `router.ts` | **ham-autocode** | 第 5 层：5 目标分发 |
| | 质量门禁 | `quality-gate.ts` | **ham-autocode** | 第 3 层：L0-L4 验证 |
| | 失败诊断 | `diagnosis.ts` | **ham-autocode** | 第 3 层：5 类分类 |
| | TDD 纪律 | `test-driven-development` | Superpowers | 理念：spec 要求 testFile (v4.0) |
| | 并行分发 | `dispatching-parallel-agents` | Superpowers | 理念：波次并行 |
| **5. 审查** | UAT 验证 | `/gsd:verify-work` | GSD | `skills/ship/` 包装 |
| | 代码审查 | `/review` | gstack | `skills/ship/` 包装 |
| | QA + 自动修复 | `/qa` | gstack | `skills/ship/` 包装 |
| | L4 AI 自审 | `review-gate.ts` | **ham-autocode** | 第 3 层：opencode 审查 diff vs spec |
| | 完成前验证 | `verification-before-completion` | Superpowers | 理念：证据先于断言 |
| **6. 发布** | 创建 PR | `/ship` | gstack | `skills/ship/` 包装 |
| | 部署 + 验证 | `/land-and-deploy` | gstack | — |
| | 部署后监控 | `/canary` | gstack | — |
| | 文档更新 | `/document-release` | gstack | — |
| **初始化** | 安装缺失 skill | `/ham-autocode:setup` | **ham-autocode** | 自动检测 + 安装 gstack/GSD/Superpowers |
| **支撑** | 调试失败 | `/investigate` | gstack | 可用但尚未自动集成 |
| | 系统化调试 | `systematic-debugging` | Superpowers | 可手动使用 |
| | 进度查询 | `/gsd:progress` | GSD | `skills/status/` 扩展 |
| | 暂停/恢复 | `/gsd:pause-work` `/gsd:resume-work` | GSD | `skills/resume/` 扩展 |
| | 项目健康 | `/health` | gstack | `skills/health-check/` 补充 |
| | 回顾总结 | `/retro` | gstack | 可用于定期回顾 |

**图例：** 标记为 **ham-autocode** 的是自建核心能力（7 层架构）。其余全部是社区 skill，直接使用或包装。

## 安装

**要求：** Node.js >= 18，Claude Code

```bash
git clone https://github.com/hammercui/ham-autocode.git
cd ham-autocode && npm ci && npm run build
```

注册为 Claude Code 插件：
```bash
claude --plugin-dir ./ham-autocode
```

验证：`/ham-autocode:status`

检查并安装缺失的依赖 skill 包（gstack、GSD、Superpowers）：
```
/ham-autocode:setup
```

## 快速开始

```bash
# 全自动执行（核心用法）
ham-cli execute full-auto
ham-cli execute full-auto --push --max-phases 3

# Skills
/ham-autocode:auto        # 全流水线（含 phase 检测）
/ham-autocode:detect      # 扫描现有项目状态
/ham-autocode:parallel    # Agent Teams + DAG 路由
/ham-autocode:ship        # 审查 + QA + 发布（包装 gstack /ship）
```

详见 [GUIDE.md](docs/GUIDE.md)（10 分钟入门教程）。

## CLI 命令

```bash
ham-cli <命令>     # 或: node dist/index.js <命令>
```

| 分类 | 命令 |
|------|------|
| 执行 | `execute auto\|full-auto\|prepare\|run\|auto-status\|stats` |
| DAG | `dag init\|status\|next-wave\|complete\|fail\|skip\|visualize\|critical-path\|estimate\|evm\|gantt` |
| DAG 编辑 | `dag add\|remove\|add-dep\|remove-dep\|re-init --merge\|scope-cut\|impact\|move` |
| 路由 | `route <id>\|batch\|confirm` |
| 上下文 | `context summary <file>` |
| 学习 | `learn brain\|detail\|scan\|entities\|status` |
| 健康 | `health check\|quick\|drift\|uncommitted\|esm-cjs` |
| 验证 | `validate detect\|gates` |
| 提交 | `commit auto\|message\|rollback` |
| 流水线 | `pipeline status\|resume\|log` |

## 实测数据

在真实项目上验证（ham-video — 53 个任务，4 个里程碑）：

| 指标 | 数值 |
|------|------|
| 单元测试 | 8/8 通过 |
| 累计完成任务 | 53（opencode 15/15, codexfake 7/7, full-auto 6/10）|
| full-auto 成功率 | 60% → 80% (v3.9.3) → 目标 90% (v4.0) |
| Token 成本/任务 | 35,549 tokens，opencode 免费 (glm-4.7) |
| Opus spec 生成 | ~$0.032/任务（9 个 spec 约 27K tokens）|
| 成本节省 vs 纯 Opus | 82% |
| L4 review | 发现真实 bug（缺少 await、eval.ts 3 个缺陷）|
| 失败诊断 (v4.0) | 5 类分类 → diagnosis.jsonl |
| CI | GitHub Actions，Node 18 + 22 矩阵 |

## 配置

开箱即用。可在 `.ham-autocode/harness.json` 中覆盖：

```json
{
  "routing": {
    "codexMinSpecScore": 80,
    "codexMinIsolationScore": 70,
    "opencodeGptModel": "github-copilot/gpt-5.3-codex",
    "opencodeGptProviders": ["copilot"]
  },
  "validation": { "mode": "strict", "maxAttempts": 2 },
  "recovery": { "highRiskThreshold": 70 },
  "autoCommit": true
}
```

## 许可证

MIT
