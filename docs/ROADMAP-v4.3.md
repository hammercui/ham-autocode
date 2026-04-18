# v4.3 Roadmap — 主 agent token 瘦身 + 子 agent 质量保障

> **核心目标修正**：
> - ✅ **省主 agent token**（Opus 账号，昂贵稀缺，这是真钱）
> - ✅ **子 agent 质量**（输出好 = 主 agent 不用重试/复盘 = 间接省主 token）
> - ❌ **不优先省子 agent token**（opencode 免费 / codexfake 走订阅 / cc-sub 可控）

## 成本账核实（2026-04-18 实测 ham-video）

### 主 agent 侧消耗来源

| 消耗来源 | 实测 | 主付 |
|---|---:|---|
| `ham-cli pipeline status` stdout | **2187 tokens** | 是 |
| `ham-cli context analyze` stdout | 607 tokens | 是 |
| `ham-cli dag status` stdout | 30 tokens | 是 |
| `ham-cli execute auto-status` | 73 tokens | 是 |
| spec-generator 生成 spec（每 task） | 1-3K input+output | 是 |
| L4 review 反馈回流 | 200-1000 / 次 | 是 |
| 维护 ham-autocode 代码时 Read 文件 | 每文件 200-5000 | 是 |
| **CLAUDE.md + MEMORY.md 开场注入** | ~5-10K | 是 |

### 子 agent 侧（v4.3-step1 已优化）

v4.2 → v4.3 step1 每 task prompt 从 1850 → 635 tokens（-66%）。但这是**便宜 token**，
仅作"质量 × 预算纪律"副产品看待。

## ✅ 已完成（v4.3 step1，2026-04-18 commit 2f3475e）

| ID | 改动 | 实测效果 |
|---|---|---|
| S1 | 删除 `core/learning/` 模块（project-brain.ts + auto-learn.ts）+ cmd-learn + 相关 paths/gitignore | -596 净行（主维护侧减负） |
| S2 | 分层 CONTEXT.md 默认关闭（`HAM_HIERARCHICAL_CONTEXT=1` opt-in） | 子 agent prompt 不再被 1313 tokens 同目录全量污染 |
| S3 | 新增 `symbolMapForFiles()` 窄带符号指路：只列 task.files + 依赖文件的 `file:Lxx kind name` | 子 agent prompt -60~66%；质量：agent 精确跳转而非扫目录 |

实测 ham-video task-002：opencode 1951→736、codexfake 2036→821、claude-code 1850→635 tokens。

## v4.3 实施任务（按主 token ROI 排序）

| ID | 改动 | 预计省（每次调用） |
|---|---|---:|
| T1 | `pipeline status` 默认不输出 log 数组，加 `--log=full\|tail:N\|none`（默认 tail:5） | **~1900 tokens** |
| T2 | `context analyze` 默认只返回 totals + top-3；加 `--detail` 输出全量 | ~400 tokens |
| T3 | `dag status` 去掉 `cycles:[]` 空数组等噪声 | ~15 tokens |
| T4 | 所有 JSON 输出默认紧凑格式（`JSON.stringify` 无 indent），加 `--pretty` 可选 | 每命令省 10-30% |
| T5 | `execute full-auto` 默认 summary-only（总成功数 / 失败 / 时间），详情入 `.ham-autocode/state/logs/auto.log`；`--verbose` 恢复现行 | **每 phase 省 2-5K** |

**累计预期**：主 session 单次 full-auto 流程省 **5-10K tokens**（根据 phase 数和主动轮询频率）。

### P1：spec-generator 分级化（主 token 第二漏斗）

> **修正**：不做硬截断（会牺牲子 agent 质量 → L4 打回 → 重试 → 主 token 不降反升）。
> 改为"分级 spec"：essential 子必读 / details 主知全量。

| ID | 改动 | 预计省 |
|---|---|---:|
| T6 | task.spec 拆两段：`essential`（name+interface+acceptance 核心条款，≤800 chars）与 `details`（description 长文+边界条件，存 task.json 不注入默认）| 每 spec 子侧 prompt 省 500-1000 tokens |
| T7 | `buildMinimalContext` 只注入 essential；子 agent 需要 details 时可执行 `ham-cli spec detail <taskId>` 主动拉取（懒加载） | 命中率低的 task 零主 token 开销 |
| T8 | 主 session 的 spec 生成 prompt 审计（目前 ~2K 系统 prompt） | 每 task 省 200-500 tokens 主 input |
| T8b | **质量守护**：L4 review 若命中"子 agent 漏读 detail"，自动在下次 retry 时注入 details | 减少重试 → 间接省主 |

### P2：L4 review 混合格式（主 token 第三漏斗）

> **修正**：纯 JSON schema 会让 review agent 套路化输出 → lessons 提炼深度下降。
> 改为"JSON header + prose body"混合：主 agent 解析 header 做决策，prose 落盘供 lessons。

| ID | 改动 | 预计省 |
|---|---|---:|
| T9 | review 输出格式：头部 `--- REVIEW JSON ---\n{verdict, issues:[{file,line,severity}], rule_for_future}\n--- END ---` 后接自由叙述 | 每次 review 主 session 只读 header 省 200-500 tokens |
| T10 | prose 叙述落 `.ham-autocode/state/logs/review/<taskId>.md`，header JSON 入 `state/context/reviews.jsonl` | — |
| T10b | **子 agent 记忆共享**：下游 task 若 `task.files` 目录前缀匹配某个 review 的 issues.file，自动注入该 review 的 JSON header（最多 3 条）| 子 agent 质量提升，减少重复踩坑 |

### P3：子 agent 质量（间接省主 token — 减少重试 / 复盘）

这是原 v4.3 roadmap 的核心（exports/lessons），**仍做但降级优先级**：

| ID | 改动 | 主 token 间接节省 |
|---|---|---|
| T11 | exports.jsonl：task done 后 LSP 提取 exports，下 task 自动反查 spec 文本中引用 | 减少 agent 幻觉重建接口 → 减少 L4 打回重试 → **每次重试省主侧 2-5K** |
| T12 | lessons.jsonl：L4 review 提炼 rule，按 scope 前缀匹配注入下次 prompt | 减少重复踩坑 → 同上 |
| T13 | 注入命中率日志：lessons/exports 被 agent 输出真引用的比例，低于 30% 自动停用该条 | 防止 memory 膨胀 |

### P4：代码精简延续（主 agent 维护侧 token）

| ID | 改动 | 主维护时节省 |
|---|---|---|
| T14 | 合并 `core/executor/{claude-app,claude-code,claude-sub,codex,opencode,agent-teams}.ts` 进 dispatcher.ts（-246 行） | 主下次调 dispatcher 时少 Read 5 个文件 |
| T15 | `core/health/` 砍掉 esm-cjs-detector.ts + uncommitted-analyzer.ts（-614 行，保留 checker + drift） | 同上 |
| T16 | `core/research/competitor.ts` 评估必要性；冷门 → 删 | -139 行 |

### P5：开场注入优化（每次新 session 主 agent 烧掉）

> **修正**：归档 ≠ 删除。保持可检索，防止跨会话记忆断链。

| ID | 改动 | 每次会话节省 |
|---|---|---|
| T17 | CLAUDE.md 去冗余：检查是否有"历史决策陈述"能迁移到 memory 单独文件 | 每会话 500-1500 tokens |
| T18 | MEMORY.md 审计：每条目 "last used" 追踪，6 个月未命中移到 `memory/archive/`（保留可 grep），不从 MEMORY.md 索引里删 | 每会话 300-800 |
| T18b | 主 session 按需查询归档：`ham-cli memory search <keyword>` 检索 archive/ | 连续性不丢 |

## 跨 agent 记忆共享矩阵

| 记忆载体 | 主 agent 访问 | 子 agent 访问 | 存储位置 |
|---|---|---|---|
| `task.spec.essential` | 按需读 task.json | **自动注入 prompt** | state/tasks/*.json |
| `task.spec.details` | 按需读 task.json | 懒加载：`ham-cli spec detail <id>` | state/tasks/*.json |
| `exports.jsonl`（前 task 导出符号） | 按需读 | **自动注入 prompt**（命中时）| state/context/exports.jsonl |
| `lessons.jsonl`（rule + scope）| 按需读 | **自动注入 prompt**（scope 匹配时）| state/context/lessons.jsonl |
| `reviews.jsonl`（L4 header JSON）| 按需读 | **自动注入 prompt**（下游 task 匹配时）| state/context/reviews.jsonl |
| `review/<taskId>.md` prose 详情 | 按需读 | 懒加载 | state/logs/review/ |
| `pipeline status` log 数组 | 默认 tail:5，`--log=full` 全量 | 不注入（主独用）| state/pipeline.json |
| `auto.log` full-auto 详情 | 按需读 | 不注入 | state/logs/auto.log |
| CLAUDE.md + MEMORY.md 当前索引 | **每会话自动注入** | 不注入 | CLAUDE.md / memory/ |
| memory/archive/（冷条目）| `ham-cli memory search` 按需 | 不注入 | memory/archive/ |

**原则**：
- 每个记忆载体有**明确的存储位置 + 主 / 子访问策略**
- 自动注入的载体必须有**命中过滤**（scope / 文件匹配 / 时效）— 防止污染
- 懒加载的载体提供 CLI 检索入口，保证"共享可达"即使"不默认注入"

## 成功指标

1. **主 agent 单次 full-auto phase 总 token** 从当前水位下降 **≥ 40%**
   - 测量：同一 phase，v4.2 vs v4.3 全流程主 session token 记录
2. **子 agent 一次通过率** ≥ v4.2 实测 **60%**（质量不退硬约束，硬性守护）
   - 测量：L4 review verdict=PASS 比例
3. **子 agent 重试率下降 ≥ 20%**（受 P3 + T10b 影响）
4. **记忆共享命中率** ≥ 30%（注入的 exports/lessons/reviews 被 agent 输出真引用的比例，低于阈值自动停用对应条目）

## 任务复杂度 × 路由建议

| ID | 复杂度 | 路由 |
|---|---|---|
| T1-T4（CLI 瘦身）| 低 | opencode / cc-haiku |
| T5（full-auto summary 模式）| 中 | codexfake / cc-sonnet |
| T6-T8（spec-generator 分级化） | 中 | cc-sonnet / claude-code |
| T9-T10（review 混合格式） | 中 | cc-sonnet |
| T10b + T11-T13（exports/lessons/reviews 注入） | 中高 | claude-code |
| T14-T16（代码合并/精简） | 中 | codexfake |
| T17-T18/T18b（memory 审计 + search CLI） | 低 | opencode |

## 风险与降级

- **stdout 瘦身破坏兼容性**：老的脚本 / UI 可能依赖 log 数组 → 所有瘦身都提供 `--verbose` 或 `--log=full` 恢复
- **spec 分级导致子 agent 漏读 details**：T8b 守护 — L4 review 若命中"漏读"，下次 retry 自动注入 details；`HAM_SPEC_FORCE_FULL=1` 全局强制推全量
- **lessons/exports/reviews 注入污染**：T13 命中率监控是硬约束，低于 30% 自动停用对应条目
- **review 混合格式 agent 不配合**：header 区块缺失时 fallback 到 prose 全文解析（regex 抽 verdict 字段）
- **memory archive 检索盲区**：T18b `ham-cli memory search` 必须在 T18 归档前上线，否则跨会话断链

## 与 v4.2 的区别

| 维度 | v4.2 | v4.3 |
|---|---|---|
| 优化对象 | 子 agent prompt | **主 agent token** |
| 主要手段 | 注入分层 CONTEXT.md | stdout 瘦身 + spec/review 结构化 + 代码精简 + 共享记忆矩阵 |
| 成功指标 | 子 agent prompt 体积 | 主 session token 消耗（≥40%）+ 子质量 ≥ v4.2 60% 一次通过率 |
| 记忆机制 | brain.json（已删）| exports.jsonl + lessons.jsonl + reviews.jsonl（结构化、按 scope 匹配注入）|
| 默认上下文 | 同目录全量 symbols（1300 tokens 浪费） | 窄带符号指路（v4.3 step1 已完成，-60~66%）|

**一句话**：v4.3 把"省 token"的靶子从便宜的子 agent 端换到昂贵的主 agent 端。
