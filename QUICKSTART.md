# ham-autocode 快速开始

## 这是什么

ham-autocode 是一个 **Claude Code Plugin**，提供 7 个 skill + 5 个 subagent + 2 个 hooks，
编排 gstack/GSD/Superpowers 实现项目全生命周期自动化。

## 前置条件

```bash
# 1. Claude Code v2.1.32+
npm install -g @anthropic-ai/claude-code

# 2. 依赖的 Skill Pack（至少装一个）
#    - GSD: https://github.com/gsd-build/get-shit-done
#    - gstack: Garry Tan's skill pack
#    - Superpowers: Jesse Vincent's skill pack
```

## 安装

```bash
# 方式1：本地开发测试
claude --plugin-dir ./ham-autocode

# 方式2：从 GitHub 安装（推送后可用）
/plugin install ham-autocode@hammercui

# 方式3：热更新（修改后不用重启）
/reload-plugins
```

## 4 个 Skill

| Skill | 命令 | 用途 |
|-------|------|------|
| **detect** | `/ham-autocode:detect` | 检测已有项目状态，跳过已完成阶段 |
| **auto** | `/ham-autocode:auto` | 全自动 6 阶段开发流水线 |
| **parallel** | `/ham-autocode:parallel` | Agent Teams 并行 + Codex 任务分发 |
| **ship** | `/ham-autocode:ship` | 审查 + QA + 修复 + 发布 |
| **status** | `/ham-autocode:status` | 查看当前流水线进度 |
| **pause** | `/ham-autocode:pause` | 暂停流水线，保存精确位置 |
| **resume** | `/ham-autocode:resume` | 从暂停/中断点恢复 |

## 使用（Claude App 和 Claude Code 通用）

```bash
# 新项目：全自动开发
/ham-autocode:auto

# 已有项目：先检测状态
/ham-autocode:detect

# 大型项目：并行开发
/ham-autocode:parallel

# 开发完成：审查发布
/ham-autocode:ship
```

Claude App 和 Claude Code 均支持斜杠命令，用法完全一致。

## 典型工作流

### 场景1：从零开始新项目

```
/ham-autocode:auto
→ 自动跑 Phase 1-6（立项→需求→规划→执行→审查→发布）
→ 关键节点停下来问你
```

### 场景2：接手已有项目（如 ham-video）

```
/ham-autocode:detect
→ 诊断：Phase 4 进行中(65%)，Phase 1-3 已完成
→ 建议：跳过 Phase 1-3，继续 Phase 4
→ 路由：复杂任务→Claude Code，清晰任务→Codex
```

### 场景3：多人并行开发

```
/ham-autocode:parallel
→ 分析任务 → 创建 Agent Teams → 生成 Codex 任务规格 → 监控合并
```

### 场景4：代码完成，准备发布

```
/ham-autocode:ship
→ 代码审查 → QA测试 → 自动修复 → 创建PR → 更新文档
```

## 三个工具的分工

| 工具 | 角色 | 使用 ham-autocode 的方式 |
|------|------|------------------------|
| **Claude App** | 项目经理 | `/ham-autocode:xxx` 斜杠命令 + 对话管进度 |
| **Claude Code** | 主力工程师 | `/ham-autocode:xxx` 斜杠命令 + skill 链执行 |
| **Codex** | 能力工程师 | 接收 `/ham-autocode:parallel` 生成的任务规格 |

## Windows 注意事项

1. Agent Teams split-pane 不支持 Windows Terminal，使用 in-process 模式
2. 路径用正斜杠 `/`
