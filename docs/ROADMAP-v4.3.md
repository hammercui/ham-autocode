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

## v4.3 实施任务（按主 token ROI 排序）

### P0：`ham-cli` stdout 瘦身（主 token 最大漏斗）

| ID | 改动 | 预计省（每次调用） |
|---|---|---:|
| T1 | `pipeline status` 默认不输出 log 数组，加 `--log=full\|tail:N\|none`（默认 tail:5） | **~1900 tokens** |
| T2 | `context analyze` 默认只返回 totals + top-3；加 `--detail` 输出全量 | ~400 tokens |
| T3 | `dag status` 去掉 `cycles:[]` 空数组等噪声 | ~15 tokens |
| T4 | 所有 JSON 输出默认紧凑格式（`JSON.stringify` 无 indent），加 `--pretty` 可选 | 每命令省 10-30% |
| T5 | `execute full-auto` 默认 summary-only（总成功数 / 失败 / 时间），详情入 `.ham-autocode/state/logs/auto.log`；`--verbose` 恢复现行 | **每 phase 省 2-5K** |

**累计预期**：主 session 单次 full-auto 流程省 **5-10K tokens**（根据 phase 数和主动轮询频率）。

### P1：spec-generator 预算控制（主 token 第二漏斗）

| ID | 改动 | 预计省 |
|---|---|---:|
| T6 | spec-generator prompt 加硬性长度上限（description ≤ 600 chars, interface ≤ 400, acceptance ≤ 400） | 每 spec 省 300-800 tokens 主侧 input |
| T7 | 超长 spec 回退到"bullet 格式"自动压缩；压缩产物仍满足 L1/L2 门禁 | 同上 |
| T8 | 主 session 的 spec 生成 prompt 本身审计（目前 ~2K 系统 prompt，能否精简） | 每 task 省 200-500 tokens |

### P2：L4 review 结构化输出（主 token 第三漏斗）

| ID | 改动 | 预计省 |
|---|---|---:|
| T9 | review agent 输出 JSON schema：`{verdict, issues:[], rule_for_future}`，主 session 只读 verdict + issues 数组 | 每次 review 省 200-500 tokens |
| T10 | review 详细叙述存 `.ham-autocode/state/logs/review/<taskId>.md`，主 session 按需读 | 同上 |

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

| ID | 改动 | 每次会话节省 |
|---|---|---|
| T17 | CLAUDE.md 去冗余：检查是否有"历史决策陈述"能迁移到 memory | 每会话 500-1500 tokens |
| T18 | MEMORY.md 审计：每条目的"last used"追踪，6 个月未命中自动归档 | 每会话 300-800 |

## 成功指标

1. **主 agent 单次 full-auto phase 总 token** 从当前水位下降 **≥ 40%**
   - 测量方法：同一个 phase，v4.2 vs v4.3 同版本 planPhase → executePhase → verify 全流程主 session token 记录
2. **子 agent prompt 质量不退化**：L4 review 通过率不低于 v4.2 实测 60%
3. **子 agent 输出重试率下降 ≥ 20%**（受 P3 影响）

## 任务复杂度 × 路由建议

| ID | 复杂度 | 路由 |
|---|---|---|
| T1-T4（CLI 瘦身）| 低 | opencode / codexfake |
| T5（full-auto summary 模式）| 中 | codexfake |
| T6-T8（spec-generator 预算） | 中 | claude-code |
| T9-T10（review 结构化） | 中 | claude-code |
| T11-T13（exports/lessons） | 中高 | claude-code |
| T14-T16（代码合并/精简） | 中 | codexfake |
| T17-T18（文档审计） | 低 | claude-app / opencode |

## 风险与降级

- **stdout 瘦身破坏兼容性**：老的脚本 / UI 可能依赖 log 数组 → 所有瘦身都提供 `--verbose` 或 `--log=full` 恢复
- **spec 预算过严导致 acceptance 信息丢失**：每种任务类型单独校准预算，过严打开 `HAM_SPEC_NO_BUDGET=1`
- **lessons 污染**：命中率监控 T13 是硬约束，低于阈值自动停用
- **review 结构化 agent 不配合**：fallback 到 prose 解析（regex 抽 verdict）

## 与 v4.2 的区别

| 维度 | v4.2 | v4.3 |
|---|---|---|
| 优化对象 | 子 agent prompt | **主 agent token** |
| 主要手段 | 注入分层 CONTEXT.md | stdout 瘦身 + spec/review 结构化 + 代码精简 |
| 成功指标 | 子 agent prompt 体积 | 主 session token 消耗 |
| 记忆机制 | brain.json（已删） | exports/lessons JSONL（降级到 P3） |

**一句话**：v4.3 把"省 token"的靶子从便宜的子 agent 端换到昂贵的主 agent 端。
