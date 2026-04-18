# Session Retro — 2026-04-14

## 产出

### ham-autocode (7 commits, v3.4.0 → v3.5.0)

| Commit | 内容 |
|--------|------|
| `dd9acfe` | refactor: 裁剪 1516 行冗余 |
| `0ef0360` | docs: GUIDE.md 10 分钟入门 |
| `0c01c4e` | fix: 3 个 ham-video 实战发现（paths.ts ESM/CJS、unused import、文档漂移） |
| `9a357e4` | feat: GitHub Actions CI + badge + examples/ |
| `f919a21` | **feat: v3.5.0 Memory 渐进披露**（getBrainDetail、PostToolUse 观察、任务摘要） |
| `6c60145` | doc: 完整 v3.5.0 CHANGELOG |
| `380af27` | **fix: 4 个路由 Bug**（findPlanFile、inline deps、Files 提取、route 写回） |

### ham-video (3 commits, Phase 2→Phase 3)

| Commit | 内容 |
|--------|------|
| `9d06984` | feat: Phase 2 MVP 100%（onboarding demo + API Key 链接） |
| `a92ee5b` | feat: 版本 0.2.0 + MCP SDK 依赖 — **codex 自动执行** |
| `6bb4762` | feat: S6 Edge TTS 多语音 + rate/pitch — **codex 自动执行** |

---

## 验证成果

| 验证项 | 结果 |
|--------|------|
| PLAN.md → DAG init | ✅ 12 任务，依赖正确 |
| Scorer → Router | ✅ specScore 100，codex 路由 |
| execute prepare → context-template | ✅ 51-156 tokens |
| codex exec → 实际代码变更 | ✅ 2 个任务成功执行 |
| compile verify → git commit → dag complete | ✅ 完整闭环 |
| Memory 渐进披露 | ✅ 紧凑索引 ~150 token + detail 按需 |
| CI | ✅ GitHub Actions Node 18+22 矩阵 |

---

## 发现的 Bug（已修复）

| # | Bug | 影响 |
|---|-----|------|
| 1 | `findPlanFile()` 不搜索 `.planning/` | DAG init 找不到 GSD 标准位置的 PLAN |
| 2 | Parser 不解析 `- Deps: Task N` 内联依赖 | 所有任务无依赖，全在 Wave 1 |
| 3 | Parser 文件提取只匹配反引号包裹路径 | files=[] → complexity=0 → 全路由到 opencode |
| 4 | `route <task-id>` 不写回任务文件 | execute prepare 读到默认 claude-code 而非实际路由 |
| 5 | paths.ts `import.meta.url` 在 CJS 模式失败 | Electron tsconfig 编译报错 |
| 6 | orchestrator.ts 未使用的 readFileSync import | 代码质量 |
| 7 | 待办文档 6 个状态标记与代码不同步 | 误导项目状态判断 |

---

## 关键发现

1. **外部 deep-research-report 对 memory 的评价 4 条全错** — 因为无法读取源码。但底层关切有效：需要可观测性证明 memory 真的生效。

2. **claude-mem 值得借鉴 3 点已落地** — 渐进披露、观察捕获、结构化摘要。不引入新依赖。

3. **codex 执行质量高** — Task 1（Edge TTS 多语音）codex 自动读文件、理解接口、生成兼容代码，编译零错误。

4. **PLAN.md 质量决定路由** — spec 完整时 12/12 路由到 codex，证明"需求清晰 = codex 可用"的设计假设正确。

5. **Parser 是最脆弱的环节** — 4 个 bug 中 3 个在 parser。需要更多格式容错。

---

## 下次 Session 计划

1. **批量执行 ham-video Phase 3 Wave 1**（Task 2/3/10 并行 codex）
2. **Task 3 完成后执行 Wave 2**（Task 4-9 MCP tools）
3. **关注 codex 执行失败时的 quota fallback 路径**
4. **Parser 需要更多测试覆盖**（各种 PLAN.md 格式）

---

## 数字

- ham-autocode: 97 commits, 10 tags (v2.0-v3.5)
- ham-video: Phase 2 ✅, Phase 3 进度 17% (2/12)
- Codex 额度: weekly 72% used (28% remaining)
