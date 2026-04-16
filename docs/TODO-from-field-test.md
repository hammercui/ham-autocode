# ham-autocode 优化 TODO（实战驱动）

> 来源：ham-video v0.4 full-auto 实战（10 tasks, 3 phases, 6 done / 4 skipped）
> 日期：2026-04-16

---

## P0 — 阻塞自治循环的问题

### 1. L0 质量门禁不支持"删除文件"任务
- **现象**: task-002（清理 TabBar.tsx）无限重试，L0 检查"文件存在"对删除任务语义反转
- **修复**: 如果 spec.description 含"删除/清理/remove/delete"且 task.files 中的文件不存在 → 视为通过
- **文件**: `core/executor/quality-gate.ts` verifyTaskOutput()
- **复杂度**: 低 (~10 行)

### 2. spec-generator 不了解项目文件结构
- **现象**: Opus 为 task-005 生成的 spec 把 files 指向 orchestrator.ts，但实际代码应写在 evaluation/engine.ts
- **修复**: spec-generator.ts 的 prompt 中加入 `ls -R` 或文件树摘要，让 Opus 知道项目有哪些文件
- **文件**: `core/executor/spec-generator.ts` buildSpecPrompt()
- **复杂度**: 低 (~20 行)

### 3. 任务连续失败时 wave 间无限重试
- **现象**: task-002 和 task-010 在 wave 2/3/4 反复失败同一个错误，浪费时间
- **修复**: 如果同一任务连续失败 2 次且错误信息相同 → 自动 skip 并记录原因
- **文件**: `core/executor/auto-runner.ts` wave 循环内
- **复杂度**: 中 (~30 行)

---

## P1 — 影响质量但不阻塞

### 4. deferred tasks 的 claude -p 执行路径未验证
- **现象**: Phase 2 的 task-006 (PromptEditor, complexity 100) 被 defer 到 claude-code，但 full-auto 的 handleDeferredTask 未被触发（因为 runAuto 先消耗了所有 wave）
- **修复**: phase-loop.ts 中 deferred 处理逻辑需要在 runAuto 返回后立即处理，而非等待 wave 空
- **文件**: `core/executor/phase-loop.ts` deferred 处理段
- **复杂度**: 中

### 5. L2 门禁 spec.interface 验证过于严格
- **现象**: task-005 的 spec.interface 声明了 EvalRunOptions 和 runEvaluation 应在 orchestrator.ts 中，但 agent 正确地写在了 engine.ts —— L2 只检查 spec.files 中的文件
- **修复**: L2 验证应搜索 task 产出的所有文件（不仅限于 spec.files 声明的文件）
- **文件**: `core/executor/quality-gate.ts` verifySpecKeywords()
- **复杂度**: 低 (~15 行)

### 6. spec-generator 的 claude -p 超时频繁
- **现象**: Phase 3 的 "Provider mock 测试" spec 生成 ETIMEDOUT
- **修复**: 超时时间从 120s 提高到 180s；或分批生成（不并行调用 claude -p）
- **文件**: `core/executor/spec-generator.ts`
- **复杂度**: 低

---

## P2 — 体验优化

### 7. full-auto 进度实时报告
- **现象**: full-auto 运行中只有 console.log，没有结构化进度文件
- **修复**: 写入 `.ham-autocode/full-auto-progress.json`，每 phase/wave 更新
- **文件**: `core/executor/phase-loop.ts`
- **复杂度**: 低

### 8. dag init 与 full-auto 的 task 混合问题
- **现象**: 如果先 `dag init` 再 `execute full-auto`，两组 tasks 会混合
- **修复**: 已在 v3.9.1 修复（full-auto 启动时清理 default phase 旧任务）
- **状态**: ✅ 已修复

### 9. PLAN.md phase 格式标准化文档
- **现象**: full-auto 支持 4 种任务格式但用户不知道最佳写法
- **修复**: 在 GUIDE.md 中增加 PLAN.md 编写规范和示例
- **复杂度**: 文档工作

---

## 实测数据备忘

| 指标 | 数值 |
|------|------|
| full-auto 总耗时 | ~37 min (3 phases) |
| Opus spec 生成 | 9 次, ~27K tokens, ~$0.32 |
| 执行层 (免费) | ~187K tokens |
| 任务成功率 | 6/10 (60%) |
| 失败原因分布 | 门禁误判 40%, 复杂度过高 20%, tsconfig 40% |
| 自动 phase 跳过 | ✓ 有效 |
| CPM/PERT 分析 | ✓ 有效 |
| fallback 机制 | ✓ 有效 (opencode→codexfake) |
| deferred→claude-p | ✗ 未触发 |

### 最高 ROI 修复顺序

```
P0-#1 (L0 删除支持) + P0-#3 (重复失败自动 skip)
  → 消除 2 个无限重试问题
  → 预期成功率从 60% → 80%

P0-#2 (spec 含文件树) + P1-#5 (L2 搜索所有产出文件)
  → 消除 spec files 指向错误 + L2 误判
  → 预期成功率从 80% → 90%
```
