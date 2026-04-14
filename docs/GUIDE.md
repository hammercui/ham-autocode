# ham-autocode 使用教程

> 从安装到跑通第一个全自动开发流水线，10 分钟上手。

---

## 一、这是什么

ham-autocode 是一个 Claude Code 插件，给 AI 编程加上了"工厂管理系统"：

- **没有它**：AI 写代码像一个人单打独斗，写完不知对错，崩了从头来
- **有了它**：AI 写代码像一个团队在流水线上工作 — 有排期、有质检、有恢复、有记忆

核心能力：

| 能力 | 说明 |
|------|------|
| DAG 调度 | 任务自动排序，并行执行不冲突的任务 |
| 5 路由标 | 按难度自动分配给 Claude Code / Codex / OpenCode 等 |
| 验证门控 | 每个任务完成后自动跑 lint + typecheck + test |
| 恢复引擎 | 失败自动回滚到检查点，不会一崩全丢 |
| 知识积累 | 每次任务结果自动学习，下次做得更好 |
| Token 节约 | 文件摘要 + 增量加载 + 精简上下文，省 40-60% |

---

## 二、安装（2 分钟）

### 前置条件

- Claude Code 已安装（`npm install -g @anthropic-ai/claude-code`）
- Node.js 18+
- Git

### 安装插件

```bash
# 克隆仓库
git clone https://github.com/hammercui/ham-autocode.git

# 进入你的项目目录
cd your-project

# 启动 Claude Code，加载插件
claude --plugin-dir /path/to/ham-autocode
```

### 验证

在 Claude Code 中输入：

```
/ham-autocode:status
```

看到响应（即使是"no pipeline found"）就说明插件加载成功。

### 安装依赖技能包（可选但推荐）

```
/ham-autocode:setup
```

这会自动检测并安装 gstack、GSD、Superpowers 三个技能包。

---

## 三、三种使用场景

### 场景 1：全新项目 — 从想法到上线

```
/ham-autocode:auto
```

一条命令启动六阶段流水线：

```
想法 → 立项(gstack) → 需求(GSD) → 规划(GSD) → 执行(Agent Teams) → 审查(QA) → 发布
```

每个阶段自动判断是否完成，完成则跳过。关键决策点会暂停询问你。

**适合：** 新项目、概念验证、hackathon

### 场景 2：已有项目 — 检测状态继续开发

```
/ham-autocode:detect
```

扫描项目文件、Git 历史、文档，判断当前进度：

```
Project State: Phase 4 - Development (65%)
  Phase 1 Initiation .......... DONE
  Phase 2 Requirements ........ DONE
  Phase 3 Planning ............ DONE
  Phase 4 Development ......... IN PROGRESS (4 tasks remaining)

Next: Complete 4 P0 features, then run /ham-autocode:ship
```

**适合：** 中途接手的项目、恢复开发

### 场景 3：大项目并行开发

```
/ham-autocode:parallel
```

DAG 调度器找出可以并行的任务，按三个维度评分后自动分配：

| 任务特征 | 分配给 | 原因 |
|---------|--------|------|
| 复杂度 ≤ 20，文件 ≤ 3 | OpenCode (免费) | 简单任务不浪费 |
| 需求清晰 + 文件独立 | Codex | 最擅长明确任务 |
| 文档/配置/热修复 | Claude App | 轻量操作 |
| 复杂架构/多文件 | Claude Code | 需要深度理解 |

**适合：** 多模块项目、团队开发

---

## 四、暂停与恢复

随时可以中断，不会丢失进度：

```
# 暂停（保存精确位置）
/ham-autocode:status   → 输入 "pause"

# 恢复（即使是新会话）
/ham-autocode:resume
```

如果会话意外崩溃，下次启动时插件自动检测到"interrupted"状态并提示恢复。

---

## 五、健康检查

检查项目编译、测试、依赖安全等：

```
/ham-autocode:health-check
```

输出示例：

```
Health Score: 93/100 (Grade A)
  PASS TypeScript: tsconfig.json PASS
  PASS Tests: 8/8 passed
  PASS Dependencies: No known vulnerabilities
  FAIL Git Status: 4 uncommitted changes
```

支持多 tsconfig 项目（如 Electron ESM+CJS 双模）。

---

## 六、核心命令速查

所有命令通过 CLI 调用（技能内部自动调用，通常不需要手动）：

```bash
# 别名（在技能中自动设置）
ham-cli = HAM_PROJECT_DIR="$PWD" node /path/to/ham-autocode/dist/index.js

# 常用
ham-cli pipeline status          # 流水线状态
ham-cli dag status               # 任务进度
ham-cli dag next-wave            # 下一批可执行任务
ham-cli route batch              # 批量路由
ham-cli health check             # 健康检查
ham-cli learn brain              # 查看项目理解
ham-cli learn status             # 学习系统状态
ham-cli quota status             # 路由配额状态
```

---

## 七、配置（可选）

零配置即可工作。如需自定义，在目标项目中创建 `.ham-autocode/harness.json`：

```json
{
  "routing": {
    "codexMinSpecScore": 80,
    "codexMinIsolationScore": 70,
    "defaultTarget": "claude-code"
  },
  "validation": {
    "mode": "strict",
    "maxAttempts": 2,
    "gates": ["lint", "typecheck", "test"]
  },
  "recovery": {
    "highRiskThreshold": 70,
    "highRiskStrategy": "worktree"
  }
}
```

只写需要覆盖的字段，其余用默认值。

---

## 八、它是怎么省 Token 的

| 机制 | 节省 | 原理 |
|------|------|------|
| 文件摘要缓存 | 40-60% | 大文件只加载函数/类签名 |
| 增量上下文 | 20-30% | 只加载变化的文件 |
| TF-IDF 语义检索 | 50-70% | 按任务语义只加载相关文件 |
| 精简 subagent 上下文 | 60-80% | 每个路由目标只传必要信息 |
| CLI 拆分 | -89% 入口 | Agent 只读需要的命令模块 |
| LSP 优先 | -90% 签名查看 | hover 替代 Read 全文 |
| 记忆衰减 | 持续精简 | 过期数据自动清除 |

---

## 九、常见问题

**Q：我没有安装 gstack/GSD/Superpowers 能用吗？**
可以。核心引擎（DAG/路由/验证/恢复）独立工作。技能包增强的是立项、规划、QA 阶段的能力。

**Q：支持 Windows 吗？**
支持。Hooks 使用 bash（Git Bash）。核心引擎纯 Node.js，跨平台。

**Q：Codex 额度用完了怎么办？**
自动降级。连续 2 次 agent_error 后，Codex 任务自动转给 OpenCode（免费）。也可以手动标记：
```bash
ham-cli quota mark-unavailable codex "额度用完"
```

**Q：如何查看项目学到了什么？**
```bash
ham-cli learn brain       # 项目理解（架构/约定/痛点）
ham-cli learn status      # 学习统计
ham-cli learn entities    # 代码实体索引
ham-cli learn patterns    # 任务类型统计
```

---

## 十、版本历史

| 版本 | 主题 |
|------|------|
| v1.0-v1.1 | 纯 Skill 概念 → 插件结构 |
| v2.0 | Node.js Core Engine（DAG/路由/验证/恢复） |
| v2.1 | TypeScript 迁移 |
| v2.2 | 可观测性 + Agent Teams + 规则引擎 |
| v2.3 | OpenSpec 集成 |
| v3.0 | 知识积累（CE）— 100% Harness 覆盖 |
| v3.1 | Token 节省 + CPM/EVM + OpenCode |
| v3.2 | 实战驱动健康检查 |
| v3.3 | Token 优化（-40~60%） |
| v3.4 | 记忆 ROI 修复 + LSP 优先 |
