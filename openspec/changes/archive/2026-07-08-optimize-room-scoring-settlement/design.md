## Context

房间创建页已经收集 `maxRounds`、`repeatRound`、`washTwice` 和 `payType`，服务端也会把这些设置保存到房间文档并下发给等待页与牌桌页。当前缺口在规则引擎：胡牌支付只按档位固定算分，进圈固定使用 `circleLossPoint`，没有把房间配置转成实际结算规则。

另一个缺口是积分生命周期。`HuapaiEngine.startRound()` 每局都会通过 `createSeats()` 重建座位，`seat.score` 会回到 0。若继续把 `seat.score` 作为房间总分，就无法实现多局房间内逐局累计。

## Goals / Non-Goals

**Goals:**

- 让 `repeatRound` 在胡牌总福数达到 88 福时把“场”支付翻倍为每家 8 分。
- 让 `payType` 控制进圈赔付：`pihu=1`、`jiahu=2`、`changhu=4`。
- 维护独立于单局座位状态的房间累计积分，并在每局新开局、重连、广播快照时保持一致。
- 让结算结果保留单局支付明细、单局分差和重场/进圈赔付信息，方便客户端显示与测试。
- 保持旧房间和旧客户端兼容：缺省设置仍按当前默认规则运行。

**Non-Goals:**

- 不新增真实货币、账户余额、排行榜或房间外历史战绩。
- 不改变胡牌福数计算、胡牌档位判定或进圈触发条件。
- 不改变房间最大局数、重开确认、洗牌流程或动画队列。

## Decisions

### 1. 将房间配置映射为规则对象后再启动引擎

房间层负责把 `room.settings` 映射成规则覆盖项，例如：

- `repeatRound` 开启时允许重场支付；
- `payType` 映射为 `circleLossPoint`；
- 胡牌支付表继续保留 `屁胡=1`、`小甲/大甲=2`、`场=4`。

这样 `HuapaiEngine` 仍只依赖 `rules`，不会直接读取房间文档。替代方案是在 `finishWin()` 和 `finishCircleLoss()` 中读取 `room.settings`，但这会让核心规则引擎依赖房间编排层，后续测试和客户端镜像更难保持一致。

### 2. 胡牌重场只影响支付，不改变档位

`totalFu >= 88` 且开启重场时，结果仍属于“场”，但 `settlement.point` 从 4 变为 8，并在结果中标记 `heavyRound: true`、`multiplier: 2` 或等价字段。这样既符合“两个场的积分扣”的玩法，也避免把“重场”误建成新的胡牌档位。

替代方案是新增“重场”档位。这个方案会牵连档位展示、胡牌摘要、旧测试和玩家对原有“场”的理解，因此不采用。

### 3. 进圈三档赔付复用 `payType`

保留当前 UI 和传输字段：

- `pihu`：每家赔 1 分；
- `jiahu`：每家赔 2 分；
- `changhu`：每家赔 4 分。

旧房间没有 `payType` 时继续归一化为 `pihu`。这比新增字段更少迁移成本，也和现有创建房间页面一致。

### 4. 房间累计积分独立存储

房间文档维护 `tableScores`，结构按服务端真实 seat id 存储，例如 `{ "0": 4, "1": -4, "2": 0, "3": 0 }`。每次单局结算完成后，服务端根据 `result.settlement.payments` 计算本局 `roundScores`，再累加到 `room.tableScores`。公共状态下发时，`seats[].score` 使用累计分，而不是单局引擎内的临时分。

替代方案是把上局 `seat.score` 复制进下一局 seats。这个方案容易被 `createSeats()` 重置遗漏，也会把“单局状态”和“房间状态”混在一起，重连和最终结果更难验证。

### 5. 当前房间最大局数后重开时重置累计积分

“再来一轮/当前房间重开”会清零已打局数并开启新一组房间局数，因此累计积分也应清零。普通未达最大局数的下一局不能清零。

## Risks / Trade-offs

- [Risk] 旧房间文档没有 `tableScores`。→ 在读写房间状态时按 seat 数量补齐默认 0 分。
- [Risk] 引擎内 `seat.score` 与房间累计分产生双重含义。→ 结算时仍允许引擎记录本局分差，但公共状态统一覆盖为 `room.tableScores`。
- [Risk] 客户端本地 evaluator 与服务端 evaluator 规则不一致。→ 同步更新前后端规则镜像，并用 server/core、huapai、online 三类检查覆盖。
- [Risk] 重场边界容易误判为 `> 88`。→ 明确使用 `>= 88` 并增加 88 福边界测试。

## Migration Plan

1. 部署后端后，旧房间在下一次写入或快照构建时自动补齐 `settings` 与 `tableScores` 默认值。
2. 已结束但未关闭房间没有累计字段时，客户端仍可用旧结果展示；服务端快照会按默认 0 补齐座位分。
3. 若需要回滚，`tableScores` 字段可留在 MongoDB 中不影响旧代码读取；旧代码会继续使用引擎内 `seat.score`。

## Open Questions

- 无。`甲胡=2分` 已确认保留为进圈赔付第二档。
