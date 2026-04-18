# ham-autocode 知识库索引

> 本目录是 ham-autocode 插件的生产关系核心。所有 agent（Claude Code / opencode / codex / openclaw ...）从这里进入。
> 设计原则：`.ham-autocode/` 完全自治，对项目根零侵入。

## Tier 1 — 会话常驻（agent 启动时必读）

| 文件 | 内容 |
|------|------|
| [INDEX.md](INDEX.md) | 本文件 — 全目录导航 |
| [docs/design/architecture.md](docs/design/architecture.md) | 系统架构总览（唯一事实源） |
| [runtime/init.sh](runtime/init.sh) | 一键启动项目环境（Anthropic 式初始化） |

## Tier 2 — 按需加载（skill/子 agent 调用时）

| 目录 | 用途 |
|------|------|
| [docs/quality/](docs/quality/) | L0-L4 质量门禁规格 |
| [docs/plans/](docs/plans/) | 当前与历史计划（roadmap、phase plan、retros） |
| [docs/todos/](docs/todos/) | 待办清单 |

## Tier 3 — 持久化知识库（agent 主动查询）

| 目录 | 用途 |
|------|------|
| [docs/requirements/](docs/requirements/) | 需求文档 |
| [docs/design/](docs/design/) | 设计文档、ADR |
| [docs/failures/](docs/failures/) | 历史失败案例（规则的论据） |
| [docs/research/](docs/research/) | 调研资料（外部文章、竞品分析） |
| [docs/plans/retros/](docs/plans/retros/) | 会话回顾 |

## 运行时状态（机器读写，agent 仅查询）

| 路径 | 内容 |
|------|------|
| [state/tasks/](state/tasks/) | DAG 任务状态 `task-*.json` |
| [state/progress.json](state/progress.json) | 跨会话进度（JSON，agent 不应修改） |
| [state/logs/](state/logs/) | `trace.jsonl`, `review-feedback.jsonl` |
| [state/learning/](state/learning/) | project-brain, observations |
| [state/dispatch/](state/dispatch/) | agent-status, auto-progress |

## 核心约定

1. **INDEX.md 是唯一入口** — 任何 agent 只要找到这个文件，就能找到一切。
2. **docs/ 是"产物知识"，state/ 是"运行数据"** — 人写 docs，机器写 state，不交叉。
3. **零外部侵入** — 不修改项目根的 CLAUDE.md / AGENTS.md / docs/。
4. **tasks 用 JSON，plans 用 Markdown** — JSON 抗 agent 乱改，Markdown 利于人类审阅（Anthropic 经验）。

## 迁移

从旧布局（v4.0 及之前）升级：`ham-cli migrate`。幂等，可重复运行。
