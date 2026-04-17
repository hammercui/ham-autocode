# ham-autocode v4.1+ 未来版本计划 — 借鉴 oh-my-openagent

> 基线: v4.0 | 来源: [code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) 对标分析
> 原则: 只抄"帮助多 agent 协同不间断完成项目"的能力，不抄角色化包装

---

## P0 — 必抄（直接提升核心指标）

### 1. Hashline 编辑保护（对标任务成功率）
- **问题**: opencode/codexfake 改大文件偶发"行号漂移"损坏，是 full-auto 失败的隐性杀手
- **方案**: 执行前对目标文件按行生成内容哈希，Spec 中 `Files:` 携带 `{path, lineHash[]}`；执行后 diff 比对，哈希不匹配即 reject 并触发 fallback
- **落点**: `core/quality/hashline.ts` + L1 门禁前插入 `L0.5: hashline-verify`
- **预期**: full-auto 成功率 +5~10pp

### 2. Todo 强制执行（防"agent 放弃任务"）
- **问题**: 观察到 opencode 偶发 "looks good, skip" 式提前退出，任务未真正完成
- **方案**: Spec 注入显式 todo list，执行结束前校验 todo 全部 ticked，否则判定未完成
- **落点**: `core/spec/todo-enforcer.ts`，接入 L2 语义验证
- **预期**: 减少"假绿"，提升真实成功率

---

## P1 — 应抄（降本 / DX）

### 3. MCP 按需启停（对标编排 token 消耗）
- **现状**: context7 等 MCP 常驻，占用上下文 token
- **方案**: skill/task 级声明需要的 MCP，runtime 按需 spawn，任务结束即 kill
- **落点**: `core/mcp/on-demand.ts`
- **预期**: 编排 token -10~15%

### 4. 分层 AGENTS.md（任务上下文自动注入）
- **对标**: oh-my-openagent `/init-deep` 生成分层文档，agent 按路径自动读取
- **方案**: 为每个目录生成轻量 `CONTEXT.md`（LSP 摘要 + 职责），dispatch 时按 `Files:` 路径上溯拼接为任务上下文
- **落点**: `core/context/hierarchical.ts` + `ham-cli context build`
- **预期**: 减少冗余 Read，Spec 更精准

---

## P2 — 选抄（有价值但非刚需）

### 5. 后台 agent 池 + 瘦主会话
- **对标**: ultrawork 并行后台 agent
- **现状**: 我们已用波次调度 + fresh context；并发维度可再加强
- **方案**: DAG 执行器支持"后台 detach 模式"，主 session 仅轮询状态
- **风险**: 增加状态同步复杂度，收益需压测后定

### 6. 注释质量检查器
- **对标**: AI-generated 低质量注释过滤
- **方案**: L3 门禁加一条 lint 规则（基于注释/代码比 + 废话模式匹配）
- **优先级**: 低，等社区 lint 规则成熟再接

---

## 明确不抄

- ❌ **神话角色化命名**（Sisyphus/Hephaestus 等）— 我们走任务化，角色是副产品
- ❌ **OpenCode-native 插件形态** — 与 Claude Code 主导的路由策略冲突
- ❌ **自建 skill 生态** — 违反 Skill-First 原则，社区已有的继续用

---

---

# 瘦身专项（v4.1 并行执行）

> 原则: YAGNI + "功能是否保留的唯一标准：它帮不帮助多 agent 协同不间断完成项目"
> 现象: 编排层 token 未达预期下降，疑似 learning/ 注入 + 人类友好模块拖累

## Step 0 — 离线分析实测结果（2026-04-17，ham-video 7 任务）

```
context 平均 553 tokens/task
├─ spec          77%  (必要)
├─ brain         23%  (126 固定/task)
├─ entities       0%  (索引未生成 — 死代码)
├─ dependencies   0%
└─ hints          0%  (getHints 永远空 — 死代码)
```

**关键发现（颠覆假设）**:
- `code-entities.ts` (159 行) + `rules/engine+hints` 路径 = **0 token 贡献 = 纯死代码**
- `project-brain.ts` (493 行) 只产出 126 token/task，ROI 极差
- Token 大头在 spec 本身 (77%)，需要 Opus 侧压缩，不是注入侧

**修正后的目标**: 砍死代码 + 压 spec prompt，而不是继续做 brain 增强

## Step 1 — A/B 压测（先量化再动刀）

**对照项**: full-auto 跑同一个 phase，开关单个模块，记录 spec token + 成功率

| 开关 | 命令 | 观察指标 |
|------|------|---------|
| 基线 | `ham-cli execute full-auto --max-phases 1 --trace-tokens` | spec_avg_tokens, success_rate |
| 关 brain 注入 | `HAM_DISABLE_BRAIN=1 ...` | token 降幅 / 成功率变化 |
| 关 entity 搜索 | `HAM_DISABLE_ENTITIES=1 ...` | 同上 |
| 关 L4 自审 | `HAM_DISABLE_L4=1 ...` | token 降幅 / 缺陷漏网率 |

**决策规则**: 关掉后成功率持平或下降 <2pp 但 token 降 ≥15% → 砍

**落点**: `core/executor/context-template.ts` 加环境变量开关 + `ham-cli bench slim` 子命令

## Step 2 — 确定要砍的目标（按压测结果）

### 🔴 P0 高嫌疑（压测后大概率砍）

**S1. `core/learning/` 三件套（759 行）**
- `project-brain.ts` (493) + `code-entities.ts` (159) + `auto-learn.ts` (107)
- 每任务 spec 注入 brain context + entity search — 最大 token 嫌疑犯
- 行动: 压测证明无效即整包删除，连带清理 `cmd-learn.ts`

**S2. `core/dag/` 的 PM 可视化模块（243 行）**
- `earned-value.ts` (59) + `gantt.ts` (69) + `estimation.ts` (30) + `critical-path.ts` (85)
- 违背自己的原则"agent 不用就不需要"却进了 `phase-loop.ts` 执行路径
- 行动: 从 `phase-loop.ts:20-21` 移除 import；保留 CLI 子命令供人类查询，不走执行循环

### 🟡 P1 中度冗余

**S3. `core/research/competitor.ts` (138 行)**
- 竞品分析，与核心循环无关
- 行动: 移到 `tools/` 或整包删

**S4. `core/trace/report.ts` (79 行)**
- 人类可读报告；agent 只需 structured log
- 行动: 合并到 `logger.ts` 或删

**S5. `core/rules/engine.ts` (51 行)**
- 为 155 行规则包装的引擎，3:1 抽象比过重
- 行动: 把 engine 拍扁到 `core-rules.ts`

### 🟢 P2 结构性重构（推迟到 v4.2）

**S6. `core/executor/auto-runner.ts` (882 行单文件) — 推迟**
- 已评估（2026-04-17）：紧密耦合，有模块级状态（_progressState/_projectDir）
- 前置条件：先给 runAuto 加集成测试 + 设计 RunContext 对象
- 行动: v4.2 按职责拆成 task-exec / wave-commit / progress / runAuto 四个 <300 行文件

**S7. `core/health/` 4 个检测器（1378 行）**
- drift / esm-cjs / uncommitted 有重叠嫌疑
- 行动: 审计重叠逻辑，合并到单一 `checker.ts` + 若干策略函数

## Step 3 — 验收标准

瘦身完成必须同时满足:
- ✅ full-auto 成功率不下降（基线 v4.0 = 100%）
- ✅ Opus spec 生成平均 token **-25%**
- ✅ core/ 总行数 **-30%**
- ✅ 所有 CLI 子命令保持向后兼容（或在 CHANGELOG 明确废弃）

---

## 路线图（整合后）

| 版本 | 内容 | 预期 |
|------|------|------|
| **v4.1** | **瘦身 Step 1+2 (P0/P1)** + 借鉴 P0 (Hashline + Todo 强制) | 成功率保持 100%, 编排 token -25% |
| v4.2 | 瘦身 Step 2 (P2 重构) + 借鉴 P1 (MCP 按需 + 分层 CONTEXT) | 代码量 -30%, token 再 -15% |
| v4.3 | 借鉴 P2 (后台 agent 池)（视 v4.1/4.2 压测结果决定） | 并发提升 |
