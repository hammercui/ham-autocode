# ham-autocode

[![CI](https://github.com/hammercui/ham-autocode/actions/workflows/ci.yml/badge.svg)](https://github.com/hammercui/ham-autocode/actions/workflows/ci.yml)

> Claude Code 插件：全自动项目开发。
> Harness 架构：DAG 调度、上下文引擎、Agent 路由、验证门、恢复引擎、知识复利。

**v3.5.0** | [更新日志](CHANGELOG.md) | [架构文档](ARCHITECTURE.md) | [入门指南](GUIDE.md) | [示例](examples/) | [English](README.md)

## 这是什么？

**Harness 层**——让 AI 编程 Agent 从"能跑"变成"稳定交付"：

| 层 | 解决什么问题 |
|----|-------------|
| 上下文引擎 | Token 预算、文件摘要、TF-IDF 搜索、渐进披露 |
| DAG 编排 | 拓扑排序、波次调度、关键路径/挣值分析/甘特图 |
| 验证门 | 自动检测 lint/test，两次失败策略 |
| 恢复引擎 | Git checkpoint + worktree 隔离 |
| Agent 路由 | 5 目标评分（Claude Code/Codex/App/Teams/OpenCode）+ 配额回退 |
| Spec 引擎 | OpenSpec 集成 + 启发式补全 |
| 知识复利 | Brain、实体索引、模式记忆、Guard——每次任务自动学习 |

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
/ham-autocode:auto        # 全自动 6 阶段流水线
/ham-autocode:detect      # 扫描现有项目状态
/ham-autocode:parallel    # Agent Teams + DAG 路由
/ham-autocode:ship        # 审查 + QA + 发布
/ham-autocode:setup       # 安装缺失依赖（gstack/GSD/Superpowers）
```

详见 [GUIDE.md](GUIDE.md)（10 分钟入门教程）。

## 技能（10 个）

| 技能 | 用途 |
|------|------|
| detect | 扫描项目，跳过已完成阶段 |
| auto | 全自动 6 阶段流水线 |
| parallel | Agent Teams + DAG 路由 |
| ship | 审查 + QA + 修复 + 发布 |
| status | 显示进度 / 暂停流水线 |
| resume | 从保存状态恢复 |
| pause | 暂停并保存状态 |
| setup | 安装缺失的技能包 |
| health-check | 项目健康评分（git/编译/测试/依赖/lint） |
| research | 竞品分析 |

## CLI 命令（45+）

```bash
node dist/index.js <命令>
```

| 分类 | 命令 |
|------|------|
| 配置 | `config show` |
| DAG | `dag init`, `dag status`, `dag next-wave`, `dag complete <id>`, `dag fail <id> <type>`, `dag visualize`, `dag critical-path`, `dag estimate`, `dag evm`, `dag gantt` |
| 路由 | `route <id>`, `route batch`, `route confirm <id>` |
| 执行 | `execute prepare <id>` |
| 上下文 | `context budget`, `context summary <file>`, `context search <query>` |
| 学习 | `learn brain`, `learn detail <topic>`, `learn scan`, `learn analyze`, `learn suggest`, `learn apply`, `learn patterns`, `learn hints <name>`, `learn entities`, `learn deps`, `learn impact <files>`, `learn guard`, `learn field-test` |
| 健康 | `health check`, `health drift`, `health uncommitted`, `health esm-cjs` |
| 验证 | `validate detect`, `validate gates` |
| 配额 | `quota status`, `quota mark-unavailable <target>`, `quota mark-available <target>` |
| 团队 | `teams assign`, `teams should-use` |

## 已验证证据

在真实项目上测试（ham-video —— Electron 桌面视频创作管线）：

- **8/8 单元测试通过**（token、git、lock、atomic、DAG、routing、context、CLI）
- **完整执行闭环**：PLAN.md → dag init → route → codex exec → 编译 → commit → dag complete
- **12 任务 DAG**：依赖解析、波次调度、5 目标路由
- **Codex 自动执行**：2 个任务由 Codex 成功执行，零人工干预
- **Memory 渐进披露**：~150 token 紧凑索引 vs ~400 token 全量注入（-60%）
- **CI**：GitHub Actions，Node 18 + 22 矩阵，每次推送自动检查

## 依赖

| 框架 | 作者 | Star 数 | 角色 | 安装 |
|------|------|---------|------|------|
| [GSD](https://github.com/gsd-build/get-shit-done) | TACHES | 52k+ | 上下文工程、Spec 驱动工作流 | `git clone --depth 1 https://github.com/gsd-build/get-shit-done.git ~/.claude/plugins/gsd` |
| [gstack](https://github.com/garrytan/gstack) | Garry Tan | 72k+ | 23 个专业工具：CEO/设计师/工程经理/QA | `git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack` |
| [Superpowers](https://github.com/obra/superpowers) | Jesse Vincent | 151k+ | Agent 技能框架与开发方法论 | `git clone --depth 1 https://github.com/obra/superpowers.git ~/.claude/plugins/superpowers` |

## 编译与测试

```bash
npm ci              # 安装依赖
npm run build       # TypeScript → dist/
npm test            # 运行 8 个测试套件
npm run test:quick  # 编译 + 测试一步完成
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
