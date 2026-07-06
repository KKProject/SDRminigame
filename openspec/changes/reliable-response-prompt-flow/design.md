## Context

当前在线牌局已经形成了四个关键基础：

- 服务端 `HuapaiEngine` 是权威状态机，负责出牌、摸牌、响应、结算和规则裁决。
- 服务端公开事件 `publicEvent` 与 `pendingContinuation` 已经能在公开动作后暂停自动推进，并等待客户端动画回执。
- 房间层已有动画屏障，按在线真人 OPENID 记录 `eventSeq` 回执，超时后将未回执玩家移出阻塞名单。
- 客户端动画控制器已经支持 `draw` / `discard` 的 `appearanceResolution` 分支，并能把待响应出现牌保留为 `heldAppearance`。

问题主要集中在“响应窗口”不是显式协议，而是由公共状态、私密状态和客户端推断拼出来：

```text
服务端状态机
  ├─ publicEvent: draw/discard/meld/unclaimed/hu
  ├─ responseWindow: 内部裁决状态
  ├─ pendingActions/playerActions: 历史兼容字段
  └─ responseSummary: 摘要字段

客户端
  ├─ 根据 publicEvent 播动画
  ├─ 根据 responseSummary / actions 猜按钮
  ├─ 根据 pendingActions 猜出现牌是否等待响应
  └─ 根据状态补偿避免漏动画
```

本设计将牌局流程拆成三个清晰层次：

```text
┌───────────────────────────────┐
│ 服务端权威事务                 │
│ 规则、阶段、响应裁决、状态落盘 │
└───────────────┬───────────────┘
                │ emits
                ▼
┌───────────────────────────────┐
│ 公开动画事件流                 │
│ eventSeq + publicEvent + ACK  │
└───────────────┬───────────────┘
                │ opens / updates
                ▼
┌───────────────────────────────┐
│ 显式响应窗口协议               │
│ public summary + private actions│
└───────────────┬───────────────┘
                │ renders
                ▼
┌───────────────────────────────┐
│ 客户端表现层                   │
│ 桌面动画、保留牌、按钮 UI      │
└───────────────────────────────┘
```

## Goals / Non-Goals

**Goals:**

- 统一出牌和摸牌后的出现牌流程，让 `draw` 和 `discard` 都通过权威 `appearanceResolution` 决定等待响应或自动弃牌。
- 将响应窗口公共摘要和每连接私密动作定义为稳定协议，减少客户端对 `pendingActions` 和 `playerActions` 的推断。
- 让服务端明确下发“当前最佳选择”和“仍能影响裁决的阻塞席位”，支持高优先级玩家操作后低优先级按钮即时收起。
- 保持公开桌面动画事件仍由 `eventSeq` 和动画 ACK 屏障驱动，避免响应结果在所有玩家看完动画前继续推进。
- 将响应按钮弹出、等待、收起视为本地 UI 生命周期，不为每次按钮变化创建公开动画屏障。
- 支持断线重连和增量恢复：客户端可仅凭当前公开事件、响应窗口摘要和本人私密动作恢复正确画面。
- 保持现有规则裁决、计分、牌编码、动作编码和动画管理器大体结构不变。

**Non-Goals:**

- 不重写花牌规则、胡牌判定、AI 策略或计分算法。
- 不引入新的实时传输协议或外部依赖。
- 不把响应窗口内每个玩家的“过”变成全房间公开动画。
- 不要求实现复杂的客户端预测裁决；客户端继续以服务端为唯一权威。
- 不改变微信小游戏发布流程、后端部署流程或管理后台能力。

## Decisions

### Decision 1: 出牌和摸牌统一为 Appearing Card 事务

服务端把出牌和摸牌都视为“出现牌”：

```text
cardAppeared
  source: discard | draw
  sourceSeat
  card
  appearanceResolution: await-response | auto-discard
  discardIndex?: number
```

`await-response` 表示动画只负责入场和保留牌，完成 ACK 后开启响应窗口。`auto-discard` 表示同一个公开事件包含入场和归位，完成 ACK 后继续下一步。

替代方案：让客户端根据是否存在 `pendingActions` 推断分支。这个方案沿用成本低，但会在动画等待期间、增量缺失或断线恢复时产生重复补偿动画，继续扩大隐式状态面。

### Decision 2: 响应窗口协议显式化

服务端在公共状态中提供不泄密摘要：

```js
responseSummary: {
  active: true,
  id,
  sourceSeat,
  sourceType,
  cardId,
  candidateSeats,
  waitingSeats,
  decidedSeats,
  blockingSeats,
  currentBest: {
    seat,
    type,
    priority,
    responseIndex
  },
  closedReason: null
}
```

每个连接的私密视图或私密补丁只包含本人仍可操作的动作：

```js
privatePatch: {
  seat,
  responseWindowId,
  playerActions,
  actionState: "available" | "waiting" | "superseded" | "closed"
}
```

`currentBest` 只暴露动作类别和优先级摘要，不暴露胡牌详情、手牌推导或其他玩家完整候选。具体按钮、胡牌结果和动作参数只通过本人私密通道发送。

替代方案：继续公开 `pendingActions` 再由客户端按座位过滤。该方案实现简单，但会泄露其他玩家具体候选动作，也会让按钮可见性依赖客户端同步时机。

### Decision 3: 服务端只等待能够击败当前最佳选择的候选

响应窗口内，服务端每次收到决策后计算：

```text
best = 已选择动作中按 priority、responseIndex、seat 排序的最高动作
blockingSeats = 仍 pending 且至少有一个动作可击败 best 的席位
```

如果 `best` 存在且 `blockingSeats` 为空，立即裁决并关闭窗口。其他仍未操作但无法击败 `best` 的玩家进入 `superseded` 状态，私密动作清空，后续提交旧窗口动作会被拒绝。

替代方案：等待所有候选玩家都点过或响应。该方案更直观，但会让低优先级玩家无意义阻塞高优先级动作，在线体验更慢。

### Decision 4: 响应 UI 不创建公开动画屏障

响应窗口打开、按钮弹出、按钮消失和等待态属于本地 UI。它们可以跟随快照或 delta 更新，不增加 `publicEvent`，也不要求所有客户端 ACK。

真正需要屏障的是全桌共享状态变化：

- 出现牌入场或自动归位。
- 保留出现牌无人响应后的 `unclaimed` 归位。
- 吃、碰、招、踏形成公开牌组。
- 胡、进圈、流局、结算。

替代方案：为按钮弹出/消失也创建公开事件。这样可以让表现严格同步，但会让牌局推进被纯 UI 动画拖慢，也增加移动端掉线和超时的阻塞面。

### Decision 5: 客户端只渲染协议，不推演裁决

客户端职责收敛为：

```text
publicEvent          → 桌面动画
animation state      → 是否等待 ACK、是否隐藏动作 UI
responseSummary      → 展示“有人响应/等待谁”等公共提示
private playerActions→ 本人按钮
```

客户端不得根据本地规则重新计算谁还能响应，也不得根据旧 `pendingActions` 补造按钮。兼容期可以保留少量 fallback，但主路径必须优先使用 `responseWindowId`、`actionState` 和私密 `playerActions`。

替代方案：客户端继续从公共候选动作里过滤本人按钮。该方案会让 UI 响应更快一点，但与“服务端唯一裁判”和私密性目标冲突。

### Decision 6: 增量和快照都使用同一协议模型

首次进入、断线重连和无法应用增量时，通过完整快照恢复：

- 当前公共状态。
- 当前 `publicEvent` 和动画屏障状态。
- 当前 `responseSummary`。
- 本人完整手牌。
- 本人 `private.playerActions` 和 `responseWindowId`。

正常推进通过 socket delta 更新：

- `publicPatch.responseSummary`。
- `privatePatch.playerActions`、`privatePatch.responseWindowId`、`privatePatch.actionState`。
- 公开事件对应的 append discard / append meld。

替代方案：快照支持新协议，delta 继续走旧字段。这个方案会让断线恢复和正常实时推进表现不一致，测试面更大。

## Risks / Trade-offs

- [Risk] 响应窗口字段变多，服务端和客户端旋转座位、脱敏、增量逻辑都更复杂 → Mitigation: 先集中实现 `buildResponseSummary()`、`buildPrivateResponseView()`、`rotateResponseSummary()` 三类单点函数，测试这些函数的输入输出。
- [Risk] 旧客户端或旧快照仍依赖 `pendingActions` → Mitigation: 在一个变更内保留兼容字段，但新主路径使用 `responseSummary.id` 和私密 `playerActions`；回归稳定后再考虑清理旧字段。
- [Risk] 按钮 UI 不走动画屏障，可能出现不同客户端按钮弹出时机略有差异 → Mitigation: 这是可接受的本地表现差异；共享桌面状态仍由公开事件屏障同步。
- [Risk] `await-response` 出现牌 ACK 后才开放响应窗口会增加一次动画等待 → Mitigation: 该等待确保所有玩家先看到牌出现，再看到响应按钮；后续可通过缩短出现牌入场动画优化体感。
- [Risk] 服务端提前裁决后，未操作玩家可能看到按钮突然消失 → Mitigation: 私密 `actionState: "superseded"` 可用于客户端显示短暂等待/失效反馈，避免像 bug。
- [Risk] 断线恢复期间当前 `heldAppearance` 和静态状态可能重复显示 → Mitigation: 客户端恢复时优先以 `publicEvent` 和 `appearanceResolution` 重建保留牌，并用 card id 释放同卡补偿视觉。

## Migration Plan

1. 服务端先抽出响应窗口摘要构建函数，不改变现有流程，只在公共状态中新增字段。
2. 服务端补全私密响应视图，确保只有 `blockingSeats` 或尚未被裁决淘汰的本人能收到动作。
3. socket 快照和 delta 使用新字段，同时保留旧 `pendingActions` / `playerActions` 兼容一轮。
4. 客户端在线状态构建优先使用新 `responseSummary.id`、`private.playerActions` 和 `actionState`，减少公共动作 fallback。
5. 客户端渲染按钮时区分 `available`、`waiting`、`superseded`、`closed`，并让按钮弹出/消失只作为本地 UI 过渡。
6. 收紧动画控制器：出现牌保留、释放、无人响应归位只跟随权威公开事件，不再由响应动作碎片推断。
7. 补充服务端核心、在线同步和动画回归脚本。
8. 本地回归通过后再部署后端，生产验证至少覆盖两人同时响应、一人高优先级响应、所有人过牌、断线重连恢复。

Rollback 策略：如果新协议导致客户端按钮异常，可在客户端临时回退到旧 `private.playerActions` 过滤路径；如果服务端响应窗口裁决异常，应回滚后端到变更前版本，因为服务端是裁决权威。

## Open Questions

- `currentBest` 是否需要对所有玩家公开动作类型，还是只公开“已有更高优先级响应”这类更模糊状态？当前建议公开 `type` 和排序摘要，不公开具体动作参数。
- `actionState: "superseded"` 是否需要渲染短暂提示，还是直接收起按钮？当前建议先直接收起，保留字段给后续 UI 优化。
- 是否在本变更中彻底移除公共 `pendingActions`，还是保留兼容字段到下一次清理？当前建议保留兼容字段，但新实现不依赖它。
