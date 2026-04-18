# 质量门禁规格（L0-L4）

> agent 执行每个任务后必须通过的门禁序列。任一层 fail 即 reject，触发 fallback 或重试。

## 门禁层级

| 层 | 名称 | 检查器 | 通过标准 | 失败动作 |
|---|------|--------|---------|---------|
| **L0** | 文件存在 | `core/executor/quality-gate.ts::preflightCheck` | `Files:` 声明的文件全部存在（allow 新建） | reject，重发指令 |
| **L1** | 语法正确 | `core/executor/quality-gate.ts::verifyTaskOutput` (tsc --noEmit on touched files) | 无 tsc error | reject，附错误信息重试 |
| **L2** | Spec 兑现 | `core/executor/quality-gate.ts::verifyTaskOutput` (export 匹配 spec interface) | interface 中声明的 export 都能 require 到 | reject，附缺失列表重试 |
| **L3** | 项目整体 | `core/executor/quality-gate.ts::verifyProjectTsc` | 整个项目 tsc --noEmit 通过 | reject，最严格一关 |
| **L4** | 独立审查 | `core/executor/review-gate.ts::reviewTaskOutput` | opencode 自审给出 pass/approve | reject + 回写 review-feedback 给下一轮 |

## L4 Review 细节

- 模型：opencode default (glm-4.7，免费)
- 触发时机：L0-L3 全过后
- 判定依据：diff + spec + acceptance criteria
- 历史数据：真实缺陷发现率约 33%（v3.9 field test）

## 失败统计（v3.9.2 实测）

- L0 误判：~5%（多因 spec files 字段错误）
- L1 fail：~10%（codexfake 输出偶发语法漂移）
- L2 fail：~8%（export 名字不一致）
- L3 fail：~3%（跨文件依赖破坏）
- L4 fail：~15%（含 L4 的严苛性，其中真实缺陷占 ~33%）

## 可观测性

所有门禁结果写入 `state/logs/trace.jsonl`，字段：
```json
{"time":"...","taskId":"task-xxx","gate":"L1","result":"pass|fail","detail":"..."}
```

## 演进方向（v4.1 及之后）

- **L0.5 Hashline 验证**（v4.1 P0）：修改前后比对行级哈希，防止"行号漂移"损坏大文件
- **L2.5 Todo 兑现**（v4.1 P0）：Spec 注入的 todo 必须全部 ticked
- **L3 改为并行**：避免整项目 tsc 阻塞
