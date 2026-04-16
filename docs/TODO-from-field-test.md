# ham-autocode 优化 TODO（实战驱动）

> 来源：ham-video v0.4 full-auto 实战（10 tasks, 3 phases, 6 done / 4 skipped）
> 日期：2026-04-16

---

## P0 — 阻塞自治循环的问题

### 1. ~~L0 质量门禁不支持"删除文件"任务~~ ✅ v3.9.3 已修复
- spec.description 含删除/清理/remove/delete → L0 反转：文件不存在=通过

### 2. ~~spec-generator 不了解项目文件结构~~ ✅ v3.9.3 已修复
- buildSpecPrompt 加入递归文件树（深度 3，最多 100 行）

### 3. ~~任务连续失败时 wave 间无限重试~~ ✅ v3.9.3 已修复
- taskFailHistory 追踪每任务连续失败次数，≥2 次自动 dagSkip

---

## P1 — 影响质量但不阻塞

### 4. ~~deferred tasks 的 claude -p 执行路径未验证~~ ✅ v3.9.3 已修复
- dag complete 路径改为 __dirname 可移植路径

### 5. ~~L2 门禁 spec.interface 验证过于严格~~ ✅ v3.9.3 已修复
- L2 搜索范围扩大: task.files + git diff 变更文件，export 名在任意文件找到即通过

### 6. ~~spec-generator 的 claude -p 超时频繁~~ ✅ v3.9.3 已修复
- 超时从 120s → 180s

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

### 9. ~~PLAN.md phase 格式标准化文档~~ ✅ v3.9.3 已完成
- GUIDE.md 新增第十章：PLAN.md 编写规范 + 4 种格式示例 + full-auto 用法

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
