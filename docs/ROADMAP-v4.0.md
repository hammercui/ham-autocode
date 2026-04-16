# ham-autocode v4.0 Roadmap

> 代号: Skill-First | 基线: v3.9.3 | 目标: 成功率 90%+, 编排成本再降 30%

---

## 核心目标

**协同多个 AI agent 不间断完成整个软件项目。**

v4.0 围绕两条主线：
1. **提升成功率** — 从 60% (v3.9.2) → 80% (v3.9.3) → 90%+ (v4.0)
2. **Skill-First 瘦身** — 自建只做包装和增强，不重复社区 skill

---

## Milestone 1: 闭环强化（已完成）

> 状态: ✅ Done | 见 OPTIMIZATION-REPORT-v4.0.md

| # | 任务 | 状态 |
|---|------|------|
| 1.1 | Spec prompt 注入历史 FAIL 经验 (review-feedback.jsonl) | ✅ |
| 1.2 | Spec prompt 注入项目 CLAUDE.md 经验教训 | ✅ |
| 1.3 | Spec prompt 要求输出 testFile + testCases (TDD) | ✅ |
| 1.4 | 失败诊断引擎 diagnosis.ts (5 类分类 + 修复建议) | ✅ |
| 1.5 | L4 FAIL 触发 1 次修复重试 (feedback 注入 context) | ✅ |
| 1.6 | 5 个 Skill 文档标注社区 skill 关系 | ✅ |

---

## Milestone 2: 成功率冲刺 90%

> 目标: 在真实项目上验证 full-auto 成功率达到 90%+

### Phase 1: 诊断驱动优化
- [ ] **2.1** 在 ham-video 跑一轮 full-auto，收集 diagnosis.jsonl 数据
- [ ] **2.2** 分析失败分布（spec-issue / agent-limitation / env-issue / dep-missing / unknown）
- [ ] **2.3** 针对 Top-1 失败类别实施专项修复
- Files: `core/executor/diagnosis.ts`, `core/executor/phase-loop.ts`

### Phase 2: Spec 质量闭环验证
- [ ] **2.4** 验证 T1 (历史 FAIL 注入) 是否减少同类错误重犯
- [ ] **2.5** 验证 T2 (TDD testFile) — agent 是否真的产出了测试文件
- [ ] **2.6** 验证 T5 (L4 重试) — 统计重试成功率，评估 ROI
- [ ] **2.7** 如果 testFile 产出率 > 50%，扩展 L2 门禁验证测试文件存在性
- Files: `core/executor/spec-generator.ts`, `core/executor/quality-gate.ts`

### Phase 3: 门禁精准化
- [ ] **2.8** L2 门禁 — 区分"新建文件"和"修改文件"，降低对修改任务的误判
- [ ] **2.9** L0 门禁 — 支持"重构/移动"类任务（文件从 A 移到 B）
- [ ] **2.10** 门禁错误消息增强 — 包含具体的 agent 可操作修复指令
- Files: `core/executor/quality-gate.ts`

---

## Milestone 3: Skill-First 瘦身

> 目标: 消除重复自建，社区 skill 覆盖的能力不再自己维护

### Phase 4: 评估与替换
- [ ] **3.1** 对比 gstack `/health` vs `core/health/checker.ts` — 输出覆盖度矩阵
- [ ] **3.2** 如果 `/health` 覆盖 ≥ 80%，将 `health-check` skill 改为纯调用 `/health` + 补充 drift/esm-cjs
- [ ] **3.3** 评估 `core/research/competitor.ts` — 如果 skill 层已标注 wrapper，考虑删除 core 模块
- [ ] **3.4** 评估 `core/learning/auto-learn.ts` 的实际触发频率和产出价值
- Files: `skills/health-check/SKILL.md`, `core/health/`, `core/research/`, `core/learning/`

### Phase 5: 未利用 Skill 集成
- [ ] **3.5** full-auto 完成后自动调用 `/retro` 生成执行总结报告
- [ ] **3.6** 评估 `verification-before-completion` 理念融入 quality-gate（完成前硬验证）
- [ ] **3.7** 大 wave (≥ 4 tasks) 时参考 `dispatching-parallel-agents` 方法论分组
- Files: `core/executor/phase-loop.ts`, `core/executor/auto-runner.ts`

---

## Milestone 4: 自治深度提升

> 目标: 从"执行任务"升级到"管理项目"

### Phase 6: 失败自动修复（诊断 → 行动）
- [ ] **4.1** spec-issue 类失败 → 自动重新生成 spec 并重试（不消耗 Opus，用 diagnosis 信息指导）
- [ ] **4.2** dep-missing 类失败 → 自动检查上游任务状态，若已完成则重新解析产出文件
- [ ] **4.3** env-issue 类失败 → 自动运行 `npm install` / 检查 tsconfig 后重试
- Files: `core/executor/auto-runner.ts`, `core/executor/diagnosis.ts`

### Phase 7: 进度可观测性
- [ ] **4.4** full-auto 进度实时写入 `.ham-autocode/full-auto-progress.json`（P2-#7 遗留项）
- [ ] **4.5** diagnosis.jsonl 汇总报告命令 `ham-cli diagnosis report`
- [ ] **4.6** 每次 full-auto 结束生成结构化执行报告（成功/失败/跳过/诊断分布/耗时/token）
- Files: `core/executor/phase-loop.ts`, `core/commands/`

### Phase 8: 跨 Session 连续性
- [ ] **4.7** full-auto 中断后自动写 CHECKPOINT.md（当前需手动）
- [ ] **4.8** resume 时自动检测上次 full-auto 的中断点，从断点继续
- [ ] **4.9** 诊断数据跨 session 累积分析（趋势：哪类失败越来越多/越来越少）
- Files: `core/executor/phase-loop.ts`, `.planning/CHECKPOINT.md`

---

## Milestone 5: 多 Agent 协同深化

> 目标: 从"各干各的"升级到"协同作战"

### Phase 9: Agent 间上下文传递
- [ ] **5.1** 上游任务完成后，自动提取产出摘要（export 签名 + 关键行为），传递给下游任务 spec
- [ ] **5.2** 失败 fallback 时，将前一个 agent 的错误信息传递给下一个 agent
- Files: `core/executor/context-template.ts`, `core/executor/auto-runner.ts`

### Phase 10: 智能路由进化
- [ ] **5.3** 基于 diagnosis.jsonl 数据，调整路由阈值（某类任务 opencode 总失败 → 自动升级到 codexfake）
- [ ] **5.4** 基于实际 token 消耗数据，优化路由决策（性价比最优而非固定规则）
- Files: `core/routing/router.ts`, `core/routing/scorer.ts`

---

## 优先级与依赖

```
Milestone 1 (✅ Done)
    ↓
Milestone 2 (成功率冲刺) ← 依赖 M1 的闭环机制产出数据
    ↓
Milestone 3 (Skill-First 瘦身) ← 可与 M2 并行
    ↓
Milestone 4 (自治深度) ← 依赖 M2 的诊断数据积累
    ↓
Milestone 5 (协同深化) ← 依赖 M4 的自动修复基础
```

## 核心指标追踪

| 指标 | v3.9.2 | v3.9.3 | v4.0 目标 |
|------|--------|--------|-----------|
| full-auto 成功率 | 60% | ~80% | 90%+ |
| 编排 token/task | 未追踪 | ~$0.032 (Opus spec) | < $0.025 |
| 成本节省比 (vs 纯 Opus) | 82% | 82% | 85%+ |
| 失败可解释率 | 0% | ~100% (diagnosis) | 100% |
| L4 FAIL 自动修复率 | 0% | ~30-50% (重试) | 50%+ |
| agent 产出含测试率 | 0% | 待验证 | 50%+ |

## 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| Opus spec 成本随 prompt 膨胀（T1/T3 注入更多内容） | 编排成本上升 | 监控 spec 生成 token 消耗，设上限截断 |
| L4 重试增加执行时间 | 总耗时增加 ~20% | 仅 FAIL 时触发，大多数任务 PASS 不受影响 |
| testFile 要求导致 agent 分心 | 主功能质量下降 | complexity < 50 不要求测试，保守推进 |
| gstack `/health` 更新导致自建 wrapper 失效 | health-check 功能中断 | 自建作为 fallback 保留 |
