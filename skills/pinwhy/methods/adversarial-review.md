---
name: adversarial-review
description: 跨 Agent 或人机协同的对抗复核与定点证伪记录方式；独立复审者对已有候选暴露隐含前提、局部反驳证据、收敛边界或提供异源印证时可选使用，不规定复审流程或审批门槛。
metadata:
  version: "1"
  invocation: agent
  relations: supports, proves, contradicts, depends-on, supersedes, answers
---

# 对抗复核与定点证伪记录语义

单一会话在长链路研究或代码审计中容易顺着最初猜测搜集有利线索（自证偏差），把局部代码现象夸大为端到端结论，或将前序会话未核实的候选当作既成事实。本参考提供跨 Agent（如提出者与独立质疑者）及人机协同复审时的可选记录方式，把宽泛争论转化为语义图上的定点证伪与异源印证。

本参考仅在需要独立复核或挑刺验证时按需读取；不用它也是正常记录。pinwhy 不是审批门禁或红蓝调度引擎：没有经过复审的候选依然合法，记录关系不自动改变结论状态。

## 独立身份与不覆盖原判断

复审参与者应使用独立且稳定的 `--agent` 身份（例如 `--agent skeptic`、`--agent review`；页面编辑记为 `human`），与原提出者（如 `agent:primary`、`agent:finder`）分开，详见[并行 Agent](../references/parallel-agents.md)。

`/已确认项目` 必须替换成真实绝对项目路径；`<候选ID>`、`<证据ID>`、`<条件ID>` 等必须替换为实际 ID 或唯一前缀。不原样执行未替换占位符。

对抗复核的核心规矩是**追加异源证据与关系，不改写他人原话**：

- 发现原候选标题过宽、证据有偏差或漏写前提时，不要直接把原节点的标题改成“[误报] …”来替原作者改口，而应以复审者自己的身份新建 `fact`、`observation`、`result` 或 `condition`，连向被挑战的具体节点。
- 保留“谁提出原主张、谁用什么观察挑战了哪一环”的完整归属链，方便回放与第三方核查。

## 四种定点下刀方式

不要笼统地对根结论泛泛质疑，按实际核查的对象连到准确节点：

### 1. 暴露并检验隐含前提（`depends-on` + `contradicts`）

原候选默认了某项路由可达性、配置开关或调用方权限但未写出时，先显式补出该 `condition` 并令候选 `depends-on` 它；若核实该前提在目标环境不成立，再把反证连向该 `condition` 节点：

```sh
pinwhy node add condition "反向代理未拦截 /api/v2/admin 外部匿名流量" --cwd "/已确认项目" --agent skeptic --no-init
pinwhy link "<候选ID>" "<条件ID>" --rel depends-on --label "利用需外部请求直达应用层路由" --cwd "/已确认项目" --agent skeptic --no-init
pinwhy node add fact "生产网关网关配置对 /api/v2/admin 强制 mTLS 校验" --status confirmed --at "deploy/gateway.conf:34" --to "<条件ID>" --rel contradicts --label "外部匿名流量在网关层即被拒绝" --cwd "/已确认项目" --agent skeptic --no-init
```

这样既保留了应用层代码确实缺少会话中间件的事实，又准确记录了外部利用前提不成立的原因。

### 2. 挑战具体证据样本（局部 `contradicts` 指向证据）

当某条 `supports` 或 `proves` 证据本身存在测试桩、缓存干扰或版本错位时，将反驳记录连向**那条证据节点**，不要直接连向根候选：

```sh
pinwhy node add result "直连应用容器复测无白名单头时返回 401" --status confirmed --to "<证据ID>" --rel contradicts --label "原抓包命中了预发网关调试白名单，不代表默认行为" --cwd "/已确认项目" --agent skeptic --no-init
```

对单条证据的反驳留在那条证据上，不自动证明根结论一定不成立；原候选若有其他独立证据仍可继续核实。

### 3. 收敛过宽结论（`contradicts` + `supersedes`）

当原候选把局部问题夸大为全局结论时，先用否定观察 `contradicts` 原候选并写清已排除的范围；若收窄后的子范围确实成立，新建边界准确的候选，归属同一问题（`answers`）并用 `supersedes` 取代原候选：

```sh
pinwhy node add observation "写路由分组均挂载 requireAdminSession，匿名请求返回 403" --status confirmed --at "src/routes/admin/write.ts:19" --to "<原候选ID>" --rel contradicts --label "写接口不暴露，原结论范围过宽" --cwd "/已确认项目" --agent skeptic --no-init
pinwhy node add vuln "管理端只读路由分组缺少会话校验暴露成员列表" --sev high --confidence static-confirmed --to "<问题ID>" --rel answers --at "src/routes/admin/users.ts:42" --cwd "/已确认项目" --agent skeptic --no-init
pinwhy link "<新候选ID>" "<原候选ID>" --rel supersedes --label "将影响范围从全部管理接口收敛至 adminReadRouter" --cwd "/已确认项目" --agent skeptic --no-init
pinwhy edit "<原候选ID>" --status superseded --cwd "/已确认项目" --agent skeptic --no-init
```

### 4. 证伪未果转为异源独立印证（跨身份 `supports` / `proves`）

如果复审者尝试寻找上游拦截、类型转换或权限校验来推翻候选，却核实防护确实缺失甚至独立完成了端到端复现，应以复审者自己的身份写入观察或复现结果，连 `supports` 或 `proves` 到该候选：

```sh
pinwhy node add result "独立沙箱使用未登录会话请求导出接口，实测返回完整 CSV" --status confirmed --confidence reproduced --to "<候选ID>" --rel proves --label "排除网关缓存与测试桩干扰后独立复现" --detail "复现命令、环境提交号与响应哈希" --cwd "/已确认项目" --agent skeptic --no-init
```

同一候选下同时存在提出者证据与异源复审者的独立证据，能够如实体现该结论已跨越单一会话的自证局限。

## 交锋与收束边界

- **存在反驳不等于立即 `refuted`**：当反驳仅覆盖部分分支，或环境差异尚待核实时，保持原候选为 `open`，让未决交锋在黑板上保持可见，交由后续实验或人工判断。
- **彻底证伪才设 `refuted`**：只有核心成立路径已被反证完整覆盖时，才将原候选更新为 `--status refuted`（反证节点本身可标 `reproduced` 或 `confirmed`，但不要把被推翻的候选本身标成 `reproduced`）。
- 与代码审计证据等级或竞争假设排除配合使用时，可按需参考[审计记录语义](audit.md)与[研究记录方式](inquiry.md)。
