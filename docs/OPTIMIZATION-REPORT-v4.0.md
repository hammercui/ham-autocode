# ham-autocode v4.0 优化报告

> 日期: 2026-04-16 | 基线: v3.9.3 | 方法: 项目审查 + Skill-First 优化

---

## 一、审查背景

项目经过 v1.0 → v3.9.3 的快速迭代，积累了大量功能。本次审查目标：
1. 确认项目是否偏离核心目标
2. 识别重复造轮子的自建功能
3. 规划如何更好地利用社区 skill

## 二、核心目标重申

**ham-autocode 是一套协同多个 AI agent 不间断完成整个软件项目的机制。**

| 维度 | 定义 |
|------|------|
| 经济约束 | Claude Code (Opus) 额度有限 → 拆分任务给免费/低成本 agent |
| 核心能力 | 任务拆分与路由 / 自治执行循环 / 质量保障 |
| 核心指标 | 任务成功率 / 编排 token 消耗 / 成本节省比 |
| 关键原则 | Harness 是手段不是目的；功能保留标准 = 帮不帮助多 agent 协同 |

## 三、审查发现

### 3.1 核心对齐度

| 分类 | 代码量 | 占比 | 说明 |
|------|--------|------|------|
| 核心对齐 | 6,936 行 | 72% | executor/dag/routing/spec/state |
| 基础设施 | 1,668 行 | 17% | commands/types/utils/trace/commit |
| 辅助功能 | 1,086 行 | 11% | health/research/rules/learning |

**结论: 主干无偏移，辅助功能保留（人类也需要了解项目状态）。**

### 3.2 Skill 利用度审查

发现两类问题：

**重复造轮子（6 处）:**

| 自建功能 | 社区 skill 已有 | 判定 |
|---------|----------------|------|
| `core/research/competitor.ts` | gstack `/research` + `/crawl` | 壳子，实际能力在社区 skill |
| `skills/ship/` | gstack `/ship` + `/gsd:ship` | 已是 wrapper，标注即可 |
| `skills/status/` | `/gsd:progress` | 加了 DAG 专有状态，保留但标注 |
| `skills/resume/` | `/gsd:resume-work` | 同上 |
| `skills/health-check/` | gstack `/health` | 重叠度高，改为补充角色 |
| `core/learning/` | gstack `/learn` | 数据格式不兼容，保留（评估结论） |

**好 skill 没用起来（4 处关键）:**

| 场景 | 应利用的能力 | 预期收益 |
|------|-------------|---------|
| spec 生成 | TDD 理念 — 要求 agent 产出含测试 | 提升代码质量 |
| L4 审查发现问题 | 闭环回 spec — 经验不再重犯 | 提升成功率 |
| 任务失败 | 结构化诊断 — 分类归因 | 积累数据，未来自动修复 |
| L4 FAIL | 修复重试 — 注入 feedback 再执行 | 部分缺陷可自动修复 |

## 四、优化措施

### 4.1 Spec 生成闭环强化（Phase 1）

**原问题:** spec-generator 是"单向"的 — Opus 写 spec，但不知道历史上哪些 spec 导致了失败。

**修复:** 三路经验注入

```
review-feedback.jsonl (L4 FAIL 记录)
         ↓
spec-generator.ts ← buildSpecPrompt()
         ↑
项目 CLAUDE.md (经验教训段落)
```

| 改动 | 文件 | 效果 |
|------|------|------|
| T1: 历史 FAIL 注入 | spec-generator.ts | 读取最近 5 条 FAIL，避免重犯 |
| T2: TDD 测试要求 | spec-generator.ts | prompt 要求输出 testFile + testCases |
| T3: CLAUDE.md 经验注入 | spec-generator.ts | 读取项目经验教训段落 |

**闭环建成:** review FAIL → feedback 文件 + CLAUDE.md → spec 生成读取 → agent 规避

### 4.2 失败诊断增强（Phase 2）

**原问题:** 任务失败 = 直接 skip，没有诊断，没有修复尝试。

**修复:**

| 改动 | 文件 | 效果 |
|------|------|------|
| T4: 结构化诊断 | diagnosis.ts (新增 132 行) | 5 类故障分类 + 修复建议，写入 diagnosis.jsonl |
| T5: L4 FAIL 重试 | auto-runner.ts | review feedback 注入 context → 同一 agent 重跑 1 次 |

**诊断分类体系:**

| 类别 | 含义 | 修复建议 |
|------|------|---------|
| `spec-issue` | spec 描述不清/文件路径错 | 重新生成 spec |
| `agent-limitation` | agent 能力不足 | 升级到 claude-code 或拆分子任务 |
| `env-issue` | tsconfig/依赖/权限 | 检查环境配置 |
| `dep-missing` | 依赖模块或上游产出缺失 | 检查 blockedBy 依赖 |
| `unknown` | 未分类 | 需人工分析 |

### 4.3 Skill 文档标注（Phase 3）

5 个自建 skill 明确标注了与社区 skill 的关系：

| Skill | 标注 |
|-------|------|
| ship | Wrapper over gstack /ship + /review + /qa |
| status | Extends /gsd:progress with ham-autocode DAG state |
| resume | Extends /gsd:resume-work with ham-autocode state |
| research | Wrapper over gstack /research + /crawl |
| health-check | Prefer gstack /health, this adds supplement checks |

### 4.4 学习模块评估（Phase 4）

**结论:** `core/learning/` 保留。gstack `/learn` 的数据格式与自建 brain 不兼容，替换会断掉 context-template 的数据注入管道。未来可考虑 `/learn` 作为额外数据源。

## 五、代码变更统计

| 指标 | 数值 |
|------|------|
| 变更文件 | 7 existing + 1 new |
| 新增行 | +312 (含新文件 diagnosis.ts 132 行) |
| 删除行 | -19 |
| 净增 | +293 行 |
| tsc --noEmit | 零错误 |
| npm test | 8/8 通过 |

**变更清单:**

| 文件 | 类型 | 说明 |
|------|------|------|
| `core/executor/spec-generator.ts` | 修改 | +68 行 — 三路经验注入 (T1/T2/T3) |
| `core/executor/auto-runner.ts` | 修改 | +101 行 — 诊断集成 + L4 重试 (T4/T5) |
| `core/executor/diagnosis.ts` | 新增 | 132 行 — 失败诊断引擎 (T4) |
| `skills/ship/SKILL.md` | 修改 | Wrapper 标注 (T6) |
| `skills/status/SKILL.md` | 修改 | Extends 标注 (T7) |
| `skills/resume/SKILL.md` | 修改 | Extends 标注 (T7) |
| `skills/research/SKILL.md` | 修改 | Wrapper 标注 (T8) |
| `skills/health-check/SKILL.md` | 修改 | Supplement 标注 (T9) |

## 六、建立的原则（写入项目记忆）

### Skill-First 原则

1. 新功能先查社区 skill，有则包装，无则自建
2. 自建只做三件事：胶水层 / 适配 multi-agent 分发 / 社区不覆盖的核心逻辑
3. 自建执行引擎 (full-auto) 是核心价值 — 在社区 skill 之上加"拆分给免费 agent"

### 核心目标锚定

- 目标不是"建 harness"，harness 是手段
- 功能保留标准：帮不帮助多 agent 协同不间断完成项目
- 经济约束是第一驱动力：Opus 贵 → 拆分 → 省钱

## 七、预期效果

| 指标 | 优化前 (v3.9.3) | 预期 (v4.0) | 提升机制 |
|------|-----------------|-------------|---------|
| full-auto 成功率 | 60% (P0 修复后 ~80%) | 85-90% | spec 闭环 + L4 重试 + 诊断数据积累 |
| 同类错误重犯率 | 未追踪 | 显著降低 | 历史 FAIL + CLAUDE.md 注入 spec |
| 失败可解释性 | 仅 error message | 5 类结构化诊断 | diagnosis.jsonl |
| L4 FAIL 修复率 | 0% (只记录) | ~30-50% | 注入 feedback 重试 1 次 |
| agent 产出测试覆盖 | 0% | ~50% (complexity>=50) | spec 要求 testFile + testCases |

## 八、后续方向

1. **诊断数据驱动优化** — 积累 diagnosis.jsonl 后，分析失败分布，针对性改进
2. **L4 重试成功率追踪** — 验证重试机制 ROI，决定是否扩展到 L0-L2 FAIL
3. **gstack /learn 数据融合** — 评估将 `/learn` 记忆注入 brain 的可行性
4. **自建 health 模块评估** — 对比 gstack `/health` 覆盖度后决定是否进一步精简
