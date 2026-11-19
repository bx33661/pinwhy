---
name: pinwhy-ultra
description: 当用户明确要求使用 Ultra 模式进行全量走读、上线前全库安全审计、或 CTF 赛题地毯式深挖时使用。通过 pinwhy-ultra 的确定性切片台账、前提依赖校对与两层对账规程，确保没看过的地方不被当成看过、判断前提随时可追问、未知边界可诚实保留。
license: MIT
compatibility: 需要可调用的 pinwhy 与 pinwhy-ultra CLI；保持核心事件日志与台账分离。
metadata:
  version: "1.1"
  category: "ultra-harness"
---

# Pinwhy Ultra — 全量覆盖承诺与线索深挖规程

Pinwhy Ultra 是附属于宿主 Agent 的一层确定性 Harness：它不替你做安全推理，而是用独立的切片台账（`.pinwhy/ultra/ledger.jsonl`）记录「整轮范围里究竟看过了哪些切片、还欠哪些前提、人类提出了什么现场追问」，同时保持主黑板（`.pinwhy/events.jsonl`）只记录高价值的判断、证据、半成品原语、漏洞发现与诚实的开放边界。

它兑现三个核心承诺：
1. **没看过哪里，不会被当成看过**——由机器通过切片哈希与回执对覆盖负责，不靠模型自觉记账；
2. **凭什么下判断，随时能追问**——用 `--depends-on` 锚定跨文件依赖前提，并优先回应人类在工作台对切片或节点发起的现场追问（`human-followup`）；
3. **还不知道什么，可以诚实留下**——严格区分「必须履约的阅读与凭据承诺（`commitmentComplete`）」与「允许如实保留的知识边界（`allClear` 信号）」。

> 完整命令、参数与 JSON 契约见 [协议与并发模板](references/protocol.md)。

## 什么时候启用

仅当用户明确要求 **Ultra 模式**、**全量覆盖测试/审计**、或**赛题地毯式摸排**时启用；普通日常任务不主动启用。启用前确认已初始化或经授权初始化当前项目黑板（`pinwhy init`）。

## 四步闭环（全量走读与线索深挖共存）

### 1. 盘家底，锁分母（`sync`）

先用确定性扫描锁死全部源码与关键配置（含 `Dockerfile`、网关配置与长文件按边界切出的行区间切片）：

```sh
pinwhy-ultra sync --cwd "/已确认项目" --json
```

局部审计可加 `--scope <子目录或文件>`。后续若源码修改，随时重新执行 `sync`，系统会自动把改动切片标为 `stale`。

### 2. 无紧迫线索时按 `next` 推进；遇到跨文件线索当场绕出去看

`pinwhy-ultra next` 解决的是「没有更紧迫线索时接下来看哪里」，**不是紧身衣**：

```sh
pinwhy-ultra next --budget-lines 420 --workers 1 --cwd "/已确认项目" --json
```

- **正常推进未知版图时**：按 `next` 领取受行数预算控制的一小包切片（默认 420 行，多 Worker 可传 `--workers N` 分扇区并行），读完手头切片的每一行；优先级自动按 `human-followup → stale → 被依赖卡住的切片(blockingFor) → shallow → pending` 排序。
- **读 A 时发现判断取决于 B 时**：不要强忍着等 `next` 发到 B——**当场绕出去直接精读 B**，先在主黑板记下观察/发现，并用 `pinwhy-ultra done B` 交出 B 的回执，随后回到 A 用 `--depends-on B` 销账。如果因为时间或上下文来不及当场读完 B，也可以先对 A 执行 `done --depends-on B`，系统会把 A 自动挂在 `shallow(unverified-dependency)`，并在下次 `next` 时优先把 B（附带 `blockingFor: [A]`）派给你——确保绕出去以后永远能回到原台账。

### 3. 精读交账：主黑板保持纯净，切片按三类回执

读完切片的每一行后按实际情况交账：

1. **确认为纯无害代码**（纯常量、类型定义、无外部输入且无危险调用）：
   直接调用 `done` 在台账打勾，**不要往主黑板灌垃圾节点**。`--note` 只需简明写清模块职责与无攻击面依据（不少于 `6` 字符即可，如 `"纯常量定义无输入"`；仅 `"ok"`/`"lgtm"` 类敷衍回执会被打回为 `shallow`）。
2. **存在校验前提或二阶消费依赖**：
   通过 `--depends-on` 显式声明依赖切片（支持切片 ID、相对路径或 `path:line`；若后续重构不再依赖，重审时传 `--depends-on none` 清理）。所依赖切片若未读、被改动成 `stale` 或被删除，当前切片都会自动打回 `shallow`。
3. **发现疑点、反常机关、半成品原语、漏洞候选，或回应人类现场追问**：
   先用 `pinwhy` CLI 把真正值得保留的思考写进主黑板，再通过 `--refs` 挂回切片：
   - **人类切片追问（`human-followup`）**：人类在工作台直接针对某片已清/未读切片提出 `question`/`hint`/`observation` 后，该切片会自动弹回 `shallow(human-followup)`。务必复核人类提出的特定前提，回应或更新主黑板后把对应节点 ID 挂入 `--refs` 重新交账；
   - **半成品原语**：记为 `observation`/`fact` + `--tag role=primitive --tag pivot=<状态媒介>`；
   - **反常逻辑**：记为 `question`/`hint` + `--tag role=anomaly`；
   - **差前置条件的危险槽位**：记为 `hypothesis --status deferred --tag pivot=<状态媒介>` 并用 `--rel depends-on` 连向前提。

```sh
pinwhy-ultra done s1 s2 --note "纯常量与路由表注册，无动态拼接" --cwd "/已确认项目" --no-disk --json
pinwhy-ultra done s3 --note "导出前调用 auth/session 鉴权" --depends-on src/auth/session.js --refs q1,fd1 --cwd "/已确认项目" --json
```

### 4. 两层体检：区分「欠账工作」与「诚实边界」（`check`）

每波结束后运行只读体检：

```sh
pinwhy-ultra check --cwd "/已确认项目" --json
```

严格区分以下两类信号，**绝不为了凑零而草率结案**：

1. **阅读与凭据承诺（`commitmentComplete === true`，欠账必须补齐）**：
   - `breadthComplete === true`：`pending=0`、`stale=0`、`shallow=0`（含空回执、未核防御依赖 `unverified-dependency`、未回应的人类现场追问 `human-followup`），且无未纳管/磁盘漂移文件；
   - `gaps.unbackedVerdicts` 归零：凡是下了 `confirmed` 或 `refuted` 定论的节点，必须有实证边支撑，不允许空口断案。
2. **认知回看信号与诚实知识边界（值得逐一回看，但不强求归零）**：
   - `gaps.awakenedChains`：同媒介碰撞出的潜在串联链，务必逐条排查能否打通；
   - `gaps.openThreads`、`gaps.unresolvedAnomalies`、`gaps.humanSignals`：排查到有定论的就用证据更新或收口；若受限于外部运行环境、生产网关规则或缺少黑盒凭证而**确实还不知道**，就应如实保留在主黑板上向人类交付。**`commitmentComplete === true` 且 `allClear === false` 是严谨调查的完全正当终态。**

## 不可逾越的边界

- 不修改 `.pinwhy/events.jsonl` 以外的第二事实源去存放漏洞结论；`ledger.jsonl` 只管源码切片覆盖与对 `events.jsonl` 节点 ID 的引用。
- 每条命令显式传 `--cwd "/已确认项目"`；只读项目源码，未经明确执行隔离授权不运行未知 PoC 或目标构建。
- `pinwhy-ultra check` 永远只报告状态与缺口、不阻断宿主行动；最终交付的每条结论必须对应主黑板中的真实证据节点与源码位置。
