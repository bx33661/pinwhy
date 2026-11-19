# Pinwhy Ultra 协议与并行派单参考

本文档说明 `pinwhy-ultra` CLI 的完整命令参数、JSON 返回结构以及多子 Agent 并行扫描时的协作模板。示例中的 `/已确认项目` 须替换为实际项目绝对路径。

## 1. CLI 命令一览

### `sync` — 扫描源码树并建立/更新切片台账

```sh
pinwhy-ultra sync --cwd "/已确认项目" [--target "/源码路径"] [--scope "src/api"] [--max-lines 320] [--agent primary] --json
```

- 自动过滤 `.git`、`node_modules`、构建产物、锁文件、`.min.*`、二进制及 >2MB 文件。
- 保留源码文件及 `Dockerfile*`、网关/服务配置文件、SQL、脚本等关键高危面。
- 超过 `--max-lines`（默认 `320`）的大文件按顶层函数/类/路由声明边界自动切分为连续行区间切片，并为每个切片计算 SHA-256 短哈希。
- 当代码改动导致某切片哈希变化时，自动将该切片状态置为 `stale`；未改动切片保持原状态与关联引用。

### `next` — 定量领取待审切片包（只读）

```sh
pinwhy-ultra next --cwd "/已确认项目" [--budget-lines 420] [--max-slices 4] [--workers 1] [--sector "src/auth"] --json
```

- 按优先级排队：`human-followup (人类现场追问) -> stale -> 被其它切片 depends-on 卡住的切片 (blockingFor) -> shallow -> pending`。
- 因 `unverified-dependency` 正在等待活跃前置切片的后续切片会暂时让路，待其前置切片被清查后自动恢复，避免重复发单。
- `--workers N` 一次切出 `N` 个互不重叠的切片包（优先分配给不同模块扇区），适合交给多个并行子 Agent 分头精读；遇跨文件关键线索时仍鼓励当场绕出去核实目标文件再回账。

### `done` — 提交切片清查回执

```sh
pinwhy-ultra done <切片ID、相对路径或path:line...> --note "精读依据与控制结论" [--refs q1,fd1] [--depends-on s2,src/guard.js] [--status cleared|flagged] --cwd "/已确认项目" --json
```

- `--refs` 会校验节点 ID 在主黑板 `.pinwhy/events.jsonl` 中真实存在。
- `--depends-on` 支持切片 ID（如 `s3`）、`path:start-end` 完整键、`path:line` 行定位或相对路径。如果所依赖的切片还没清查、后来变成 `stale` 或被删除，本切片会自动标为 `shallow`（`unverified-dependency`）；若重构后不再依赖，传 `--depends-on none` 即可清除旧依赖。
- 非空回执下限为 `6` 个字符（含中文简练说明如 `"纯常量无外部输入"`，若已传 `--refs` 或 `--depends-on` 也可通过）；`"ok"` 等极短敷衍回执会被打回为 `shallow`（`insufficient-note`）。
- 若人类针对某切片写入了未关闭且未列入 `--refs` 的追问（`author=human`），该切片会自动转为 `shallow`（`human-followup`）。
- 省略 `--status` 时：带 `--refs` 自动记为 `flagged`，不带记为 `cleared`。

### `reopen` & `reset`

```sh
pinwhy-ultra reopen s4 --reason "发现新增旁路入口，需重审" --cwd "/已确认项目" --json
pinwhy-ultra reset --yes --cwd "/已确认项目" --json
```

- `reset` 仅清空 `.pinwhy/ultra/ledger.jsonl` 中的切片台账，**绝不触碰主黑板 `.pinwhy/events.jsonl`**。

### `check`（别名 `status`）— 五门禁只读对账

```sh
pinwhy-ultra check --cwd "/已确认项目" [--target "/源码路径"] [--no-disk] --json
```

永远以退出码 `0` 返回（只报告缺口，不阻断），关键输出字段：

- `breadthComplete`: 仅当切片台账已初始化、`pending === 0`、`stale === 0`、`shallow === 0`（含空回执、未核依赖、人类现场追问）、`untrackedFiles` 为空且 `diskStaleIds` 为空时为 `true`。
- `commitmentComplete`: 当 `breadthComplete === true` 且 `gaps.unbackedVerdicts` 归零时为 `true`（代表阅读覆盖与有据裁定的契约均已履约）。
- `allClear`: 当 `commitmentComplete === true` 且主黑板 `openThreads`、`awakenedChains` 与 `unresolvedAnomalies` 也全部归零时为 `true`；注意 **`commitmentComplete=true, allClear=false` 可以是一次扎实调查的正当终态**（反映诚实保留的知识边界）。
- `gaps.shallowSlices`: 列出回执过短（`insufficient-note`）、依赖切片未清/失效（`unverified-dependency`）或人类新增追问待回应（`human-followup`）的打回项。
- `gaps.awakenedChains`: 列出处于 `deferred` 状态的假设，在其 `depends-on` 条件或相同 `pivot=<媒介>` / `component=<模块>` 下发现了尚未连边的新 `role=primitive` 原语或确认事实（值得优先回看）。
- `gaps.humanSignals`: 列出人类在工作台最新补充的 `author=human` / `updatedBy=human` 节点。

---

## 2. 多子 Agent 并行派单模板

协调者可按如下波次循环驱动多个只读探查子 Agent：

1. 协调者先运行 `pinwhy-ultra sync --cwd "/已确认项目" --json` 锁定全量切片。
2. 协调者运行 `pinwhy-ultra next --workers 4 --budget-lines 420 --cwd "/已确认项目" --json`，拿到 4 个互不重叠的 `batches`。
3. 每个子 Agent 只拿自己那一包切片路径与行区间精读源码，返回结构化回执：
   - 切片 ID 与读后的准确功能/控制描述；
   - 是否依赖外部切片校验（写明被调路径）；
   - 是否发现新疑点（`question`）、半成品原语（`role=primitive` + `pivot=`）、反常逻辑（`role=anomaly`）或漏洞候选（`finding`）。
4. 协调者在每波结束时，先用 `pinwhy batch` 一次性把本波有价值的节点与边写入主黑板，再调用 `pinwhy-ultra done` 销掉这批切片，最后跑 `pinwhy-ultra check --json` 决定下一波。

---

## 3. 赛题（CTF / 审计挑战）强化约定

面对代码量不大但机关重重的赛题时：

- 用 `--max-lines 220` 缩小切片粒度，逼迫每个关键文件按小块过筛，不错过细节转换。
- 遇到“看似没用”的怪异代码（如异常响应头、冷门路由参数、特殊序列化分支、非默认配置文件），务必在主黑板建 `question` 或 `observation` 并标 `--tag role=anomaly`，直到能正面解释出题用意或确认无害后再关闭。
- 遇到“能控但不知道怎么利用”的局部效应（如可控路径拼接、可控属性赋值、可控请求方法），标 `--tag role=primitive --tag pivot=<作用媒介>`；遇到“危害极大但参数暂时看似不可控”的 Sink，建 `hypothesis --status deferred --tag pivot=<作用媒介>`。每一波结束后查看 `gaps.awakenedChains` 即可精准定位串联链。
