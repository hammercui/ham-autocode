# v4.3 Roadmap — 跨任务共享记忆

> **目标**：让多 agent 协同时，后续任务能无损继承前置任务的"事实性记忆"，
> 在不烧 Opus 编排 token 的前提下保证质量不降。

## 背景

v4.2 把"目录级 LSP 符号树"作为默认注入，field test 发现每 task 烧掉 ~1300 tokens
注入同目录无关文件的符号，命中率极低（10 个文件注入，任务只改 1 个）。

**v4.3 第一步（已完成 2026-04-18）**：
- 分层 CONTEXT.md 默认关闭（`HAM_HIERARCHICAL_CONTEXT=1` opt-in）
- 改为窄带"符号指路"：只列 `task.files` + 依赖任务文件的 top-level 符号
- 每 task 节省 **60-66% prompt tokens**

**v4.3 第二步（本文档范围）**：解决 agent 之间如何共享"非代码类"记忆。

## 问题陈述

当前跨 task 传递只有两条窄带：
1. **代码本身** — 后任务 Read 前任务产出的文件
2. **`task.spec.interface` 注入** — 只是前任务的 spec 文本，不是实际 export

缺口：
| 记忆类型 | 当前 | 差距 |
|---|---|---|
| 前任务的导出符号（interface/class/const） | agent 需 grep 再发现 | 应有精确目录 |
| 前任务做出的决策（"Pattern A over B"） | 无记录 | 应有 append-only 日志 |
| 前任务踩的坑（"don't use React.memo here"） | 无记录 | 同上 |
| 约定（命名/模式） | 散在代码里 | 保持现状（agent 看相邻文件即可） |

## 设计原则

- **事实优先，不做 AI 合并**：符号位置、rule 陈述，不做 brain.json 式"architecture.summary"。
- **append-only**：JSONL 日志，无并发合并逻辑。
- **按文件名反查**：只把与当前 `task.files` 目录前缀匹配的条目注入 prompt，避免无关记忆污染。
- **被动生成**：执行循环内自动捕获，不依赖用户显式运行 `ham-cli learn`。

## 数据结构

### 1. 符号导出目录 `state/context/exports.jsonl`

每 task 完成后，LSP 扫描 `task.files` 导出符号，追加一行：
```json
{"taskId":"task-003","ts":"2026-04-18T12:00:00Z","file":"app/src/renderer/pages/Setup.tsx","exports":[{"name":"CapabilityStep","kind":"interface","line":29},{"name":"CAPABILITY_STEPS","kind":"const","line":43}]}
```

**用途**：下一个 task 的 prompt 里，若 `spec.interface` 文本 mentions `CapabilityStep`，
自动注入 `Resolved: CapabilityStep at app/src/renderer/pages/Setup.tsx:29 (from task-003)`。

**LSP 已有**：复用 `core/lsp/client.ts` 的 `documentSymbol` + `core/context/hierarchical.ts` 的 flatten 逻辑。

### 2. 任务遗产 `state/context/lessons.jsonl`

每 task 完成后，由 L4 review 阶段或 agent 自主声明追加：
```json
{"taskId":"task-005","ts":"...","scope":["app/src/renderer/pages/"],"rule":"Setup 页面的 step 状态由 CAPABILITY_STEPS 驱动，新增能力需同步更新 task-1 的数组而非硬编码"}
```

**用途**：下个 task 若 `task.files` 路径前缀匹配 `scope` 数组任一条 → 注入 rule 到 prompt。

**生成来源**（按优先级）：
1. L4 review agent 在 review prompt 里额外问一句 `rule_for_future_tasks: ...`
2. 执行 agent 自主在输出里 emit `<LESSON scope="...">...</LESSON>` 标签
3. 手动 `ham-cli lessons add <scope> <rule>`（fallback）

### 3. 任务决策 `state/context/decisions.jsonl`（可选，视必要性）

```json
{"taskId":"task-008","ts":"...","decision":"用 TanStack Query 而非 SWR","reason":"项目已有 TanStack Query 依赖，避免引入新库"}
```

仅在决策与代码可读性强相关、而 commit message 难以覆盖时启用。初版可只做 exports + lessons。

## 注入策略（context-template.ts）

扩展 `buildMinimalContext`：

```
## Symbols in scope                 ← v4.3 已实装
<来自 task.files + dep files 的 LSP 输出>

## Exports from prior tasks         ← v4.3-step2 新增
<按 task.files 目录前缀 + 名字命中筛选>

## Lessons from prior tasks         ← v4.3-step2 新增
<按 task.files scope 前缀匹配的 rule，每条 1 行>
```

预算：
- exports：最多 10 条，≤400 tokens
- lessons：最多 5 条，≤200 tokens
- 总新增：≤600 tokens per task（可接受，相比 v4.2 同目录全量 1300 tokens 仍净省）

## 实施任务拆分

| ID | 任务 | 复杂度 | 路由 |
|---|---|---|---|
| T1 | exports.jsonl 写入：task 完成 hook 调 LSP 提取 exports | 低 | codexfake |
| T2 | exports 查询函数 + 注入到 prompt | 低 | opencode |
| T3 | lessons.jsonl 写入 CLI：`ham-cli lessons add <scope> <rule>` | 低 | opencode |
| T4 | lessons scope 匹配 + 注入 | 中 | codexfake |
| T5 | L4 review prompt 扩展 `rule_for_future_tasks` 字段 | 中 | claude-code |
| T6 | execute 流程钩子：task done → 调 T1 写 exports | 中 | claude-code |
| T7 | 测试：exports 注入命中验证；lessons scope 前缀匹配 | 中 | codexfake |
| T8 | README + CHANGELOG v4.3 | 低 | claude-app |

## 成功指标

1. **命中率**：下 task prompt 里注入的 exports 条目中，至少 50% 被 agent 在输出里引用
2. **复现失败率下降**：同一批 lessons 生效前后，L4 review 发现的"重复踩坑"下降 ≥30%
3. **Token 预算**：per task 总注入（spec + symbols + exports + lessons）维持 ≤1000 tokens

## 风险与降级

- **exports.jsonl 膨胀**：按 7 天 TTL 轮换，超龄自动丢弃
- **lessons 污染**：scope 必须明确（目录前缀 / 文件名模式），全局 rule 拒收
- **多任务并发写入**：JSONL append-only 天然安全；读取不要求原子快照
- **kill switch**：`HAM_TASK_MEMORY=0` 全部关闭

## 与 learning 模块的区别

v4.2 已删除的 `core/learning/{project-brain,auto-learn}.ts`：
- ❌ `brain.architecture.summary` — 叙述性文本，AI 合成
- ❌ `brain.evolvedFrom` 计数 — 没实际用途的元数据
- ❌ `brain.provenPatterns` — 抽象 pattern，没指向具体符号

v4.3 保留的"轻记忆"：
- ✅ exports：纯 LSP 输出，`file:line name kind` 四元组
- ✅ lessons：短句 rule + 明确 scope，不做泛化

**一句话**：learning 想做 RAG，v4.3 只做结构化引用目录。
