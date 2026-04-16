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

每层详细说明见 [ARCHITECTURE.md](ARCHITECTURE.md)。

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
