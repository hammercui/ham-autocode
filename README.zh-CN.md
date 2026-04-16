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

### 核心能力

| 能力 | 做什么 | 核心收益 |
|------|--------|---------|
| **任务拆分与路由** | PLAN.md → DAG → 按复杂度路由到 5 个 agent 目标 | 对的 agent 做对的事 |
| **自治执行循环** | Opus spec → 分发 → 执行 → 质量门禁 → 提交 → 下一波 | 零人工干预 |
| **质量保障** | L0-L4 门禁 + 失败诊断 + L4 重试 + fallback 链 | 产出可信赖 |
| **Spec 反馈闭环** (v4.0) | Review 失败 → 注入下次 spec → agent 不再犯同样错误 | 自我改进精度 |

### 5 目标路由

| 目标 | 模型 | 成本 | 适用场景 |
|------|------|------|---------|
| opencode | glm-4.7 | 免费 | 简单任务：complexity ≤ 40, files ≤ 5 |
| codexfake | gpt-5.3-codex | 低 | 中等复杂度：specScore ≥ 80, isolationScore ≥ 70 |
| claude-app | Sonnet | 中 | 文档/配置/hotfix 任务 |
| claude-code | Opus 4.6 | 高 | 复杂架构任务（默认 fallback） |
| agent-teams | Opus x N | 高 | 并行波次 ≥ 3 个隔离任务 |

Fallback 链：codexfake → opencode → claude-code。静态规则，无 ML。

### 质量门禁 (L0-L4)

每个任务产出经过分层验证。错误消息包含可操作的修复指令（OpenAI Linter 模式）。

| 层级 | 检查内容 | 失败时 |
|------|---------|--------|
| L0 | 文件存在 + 非空（支持删除/重构任务） | `创建文件并实现 spec 要求` |
| L1 | TypeScript 单文件语法 | `TS 错误码对照：TS2304/2339/2345/2307` |
| L2 | spec.interface export 验证（搜索所有产出文件） | `添加与 spec.interface 一致的 export 声明` |
| L3 | 项目级 `tsc --noEmit` | 仅警告（项目可能有预存错误） |
| L4 | AI 自审：diff vs spec → **FAIL 自动重试** (v4.0) | 警告 + 修复重试 + 经验追加到 CLAUDE.md |

**v4.0 新增：** 结构化失败诊断（5 类分类 → `diagnosis.jsonl`），L4 FAIL 注入 review feedback 重试一次。

### 项目管理引擎

内置 DAG 调度器 + 经典 PM 方法论，用于进度跟踪：

| 能力 | 模块 | 说明 |
|------|------|------|
| WBS 解析 | `parser.ts` | 解析 PLAN.md（标题/复选框/表格）→ 任务 DAG |
| 拓扑排序 | `graph.ts` | Kahn 算法、环检测、依赖解析 |
| 波次调度 | `scheduler.ts` | 基于依赖就绪的并行波次生成 |
| 关键路径 (CPM) | `critical-path.ts` | 前推/后推、浮动时间、瓶颈检测 |
| PERT / EVM / 甘特图 | `estimation.ts` `earned-value.ts` `gantt.ts` | 三点估算、挣值分析、ASCII 甘特图 |
| DAG 可视化 | `visualize.ts` | ASCII 依赖树 + 状态图标 |
| 运行时 DAG 编辑 | `merge.ts` | PLAN.md 变更与现有 DAG 的 diff 合并 |

## 三层框架

**gstack 思考 → GSD 稳定 → Superpowers 执行**

| 框架 | 角色 | 提供什么 |
|------|------|---------|
| [gstack](https://github.com/garrytan/gstack) | 战略思考 | CEO/工程/设计审查、QA、调研、发布、部署 |
| [GSD](https://github.com/gsd-build/get-shit-done) | 工作流稳定 | 阶段驱动开发、spec 强制、验证体系 |
| [Superpowers](https://github.com/obra/superpowers) | 执行纪律 | TDD、头脑风暴、代码审查、调试方法论 |

ham-autocode 编排三者，并遵循 **Skill-First 原则**：优先使用社区 skill，自建模块只覆盖社区 skill 不提供的能力——多 agent 分发、DAG 调度、适配自治执行的质量门禁。

## 设计理念

借鉴 Harness Engineering 实践（OpenAI、Anthropic、Stripe、Hashimoto），作为方法论运用而非目标本身：

- **经济约束驱动架构** — Opus 昂贵 → 拆分任务给免费 agent → 编排层保持精简
- **基础设施 > 模型智能** — 同模型、好 harness = 质变级提升
- **静态规则 > ML 自适应** — 路由用确定性评分，不用学习阈值
- **错误消息即教学** — 质量门禁失败时告诉 agent 怎么修
- **反馈闭环** — L4 FAIL → CLAUDE.md + review-feedback.jsonl → 下次 spec 读取两者 (v4.0)
- **Skill-First** — 优先使用社区 skill，自建只做包装和增强

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

## 编译与测试

```bash
npm ci && npm run build && npm test
```

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
