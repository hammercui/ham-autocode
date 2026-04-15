# ham-autocode

[![CI](https://github.com/hammercui/ham-autocode/actions/workflows/ci.yml/badge.svg)](https://github.com/hammercui/ham-autocode/actions/workflows/ci.yml)

> Claude Code 插件：全自动项目开发。
> Harness 架构对齐 [Harness Engineering 四大支柱](docs/Harness%20Engineering%20深度解析：AI%20Agent%20时代的工程范式革命%201.md)：上下文架构、Agent 专业化、持久化记忆、结构化执行。

**v3.9.1** | [更新日志](CHANGELOG.md) | [架构文档](ARCHITECTURE.md) | [入门指南](docs/GUIDE.md) | [示例](examples/) | [English](README.md)

## 这是什么？

**Harness 层**——让 AI 编程 Agent 从"能跑"变成"稳定交付"：

| 支柱 | 解决什么问题 | 核心模块 |
|------|-------------|---------|
| 上下文架构 | 给对的 agent 对的上下文，不多不少。40% Smart Zone 预算控制 | context-template, summary-cache |
| Agent 专业化 | 5 目标路由：opencode(免费) / codexfake(中等) / claude-code(复杂) / claude-app / agent-teams | router, scorer |
| 持久化记忆 | 跨会话连续性：CHECKPOINT.md + DAG 状态 + git log。CLAUDE.md 活反馈循环 | DAG state, review-gate → CLAUDE.md |
| 结构化执行 | DAG → 波次调度 → 质量门禁(L0-L4) → 自动提交。运行时 DAG 编辑(v3.9) | auto-runner, quality-gate, review-gate |

## 设计理念

基于 OpenAI、Anthropic、Stripe、Hashimoto 的行业共识：

- **基础设施 > 模型智能** — 同模型、好 Harness = 质变级提升
- **静态规则 > ML 自适应** — 路由用确定性评分，不用学习阈值
- **简化而非复杂化** — v3.9.1 删除 1,760 行过度工程的"学习"代码
- **错误消息即教学** — 质量门禁失败时告诉 agent 怎么修（OpenAI Linter 模式）
- **CLAUDE.md 活反馈循环** — L4 review FAIL 自动追加到 CLAUDE.md（Hashimoto AGENTS.md 模式）

## 安装

**要求：** Node.js >= 18，Claude Code

```bash
git clone https://github.com/hammercui/ham-autocode.git
cd ham-autocode && npm ci && npm run build
claude --plugin-dir ./ham-autocode
```

验证：`/ham-autocode:status`

## 快速开始

```
/ham-autocode:auto        # 全自动流水线
/ham-autocode:detect      # 扫描现有项目状态
/ham-autocode:parallel    # Agent Teams + DAG 路由
/ham-autocode:ship        # 审查 + QA + 发布
```

详见 [GUIDE.md](docs/GUIDE.md)（10 分钟入门教程）。

## CLI 命令

```bash
node dist/index.js <命令>
```

| 分类 | 命令 |
|------|------|
| DAG | `dag init\|status\|next-wave\|complete\|fail\|visualize\|critical-path\|estimate\|evm\|gantt` |
| DAG 编辑 (v3.9) | `dag add\|remove\|add-dep\|remove-dep\|re-init --merge\|scope-cut\|impact\|move` |
| 路由 | `route <id>\|batch\|confirm` |
| 执行 | `execute prepare\|run\|auto\|auto-status\|stats` |
| 上下文 | `context summary <file>` |
| 学习 | `learn brain\|detail\|scan\|entities\|status` |
| 健康 | `health check\|drift\|uncommitted\|esm-cjs` |
| 验证 | `validate detect\|gates` |

## 实测数据

在真实项目上验证（ham-video — 43 个任务，3 个里程碑）：

- **8/8 单元测试通过**
- **43 任务全部完成**：opencode 15/15 (100%), codexfake 7/7 (100%)
- **平均任务耗时**：91s (opencode), 80s (codexfake)
- **Token 成本**：35,549 tokens/任务，opencode 免费 (glm-4.7)
- **编排器开销**：~7,400 tokens / 37 任务（节省 93%）
- **L4 review**：在 ham-video v0.3 中发现真实 bug（缺少 await）
- **DAG 变更管理**：执行中运行时插入/删除/重排任务
- **CI**：GitHub Actions，Node 18 + 22 矩阵

## 编译与测试

```bash
npm ci && npm run build && npm test
```

## 配置

开箱即用。可在 `.ham-autocode/harness.json` 中覆盖：

```json
{
  "routing": { "codexMinSpecScore": 80, "codexMinIsolationScore": 70 },
  "validation": { "mode": "strict", "maxAttempts": 2 },
  "recovery": { "highRiskThreshold": 70 }
}
```

## 许可证

MIT
