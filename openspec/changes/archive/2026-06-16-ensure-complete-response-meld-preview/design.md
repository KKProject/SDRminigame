## Context

在线响应动作目前有本地即时预演：玩家点击吃、碰、招、踏后，`OnlineController.startLocalActionPreview()` 会立即调用 `TableAnimationController.playLocalActionPreview()`。该控制器会尝试用 `previewMeld(action, renderer.lastState)` 从本机手牌和 incoming card 构造完整凑牌牌组。

如果 `previewMeld()` 返回完整牌组，动画预设会播放 `meldGroupPlan()`：完整牌组在桌面中央展示并飞入凑牌区。若 `previewMeld()` 返回 `null`，当前事件仍可能携带 `action.card`，`eventPlan()` 会走单张 `cardFlightPlan()` fallback，导致玩家看到一段像“出现牌重播”的单张飞行动画。随后服务端权威事件带回完整 `meld`，又播放或确认完整凑牌动画，视觉上形成多余的中间段。

目标路径应稳定为：

```
出现牌动画  ->  完整凑牌预演/权威凑牌动画  ->  玩家出牌动画
```

## Goals / Non-Goals

**Goals:**

- 吃、碰、招、踏的本地响应预演只能播放完整凑牌牌组动画。
- 无法本地构造完整牌组时，不播放单张 fallback 动画，等待服务端权威凑牌事件。
- 保持本地预演与权威事件对账；成功对账不得重播完整权威动画。
- 覆盖吃、碰、招、踏四类响应动作的自动检查。

**Non-Goals:**

- 不改变服务端裁决、响应优先级或公开事件协议。
- 不改变出现牌动画、出牌动画或无人响应归位动画。
- 不要求所有响应动作都必须有本地即时动画；正确性优先于错误的即时反馈。

## Decisions

### 1. 禁止响应预演的单张 fallback

`playLocalActionPreview()` 对 `chi/peng/zhao/ta` 应先判断是否能构造 `localMeld`。如果不能构造完整 `localMeld`，该方法应返回 `false`，让在线控制器把本地预演标记为完成并等待权威事件，而不是继续把 `action.card` 交给 `eventPlan()` 生成单张飞行动画。

备选方案是保留单张 fallback 但改样式。该方案仍会在语义上多出一段“不是完整凑牌”的动作，和目标三段流程冲突，不采用。

### 2. 能构造完整牌组时继续即时预演

当 `previewMeld()` 能根据 `action.keys`、`action.card`、当前手牌或已有招/踏牌组构造完整牌组时，继续播放 `meldGroupPlan()`，并将牌组视觉对象标记为 retained，等待权威事件确认。

这保留点击后的即时反馈，也避免服务端确认后重新创建相同完整动画。

### 3. 权威事件作为无本地预演时的完整动画来源

如果本地预演被跳过，`pendingLocalAction.localAnimationCompleted` 会很快满足，但 `localActionMatchesEvent()` 不应把未实际启动的预演当作可确认动画。权威事件到达时应正常走 `playOnlineEvent()`，播放一次完整凑牌动画并回执。

实现时需要确认“本地预演未启动”与“本地预演已启动等待确认”在在线控制器状态中可区分，避免误把权威事件吞掉。

## Risks / Trade-offs

- [本地手牌快照短暂缺失导致预演被跳过] → 等待权威完整动画，保证视觉正确但牺牲一次即时反馈。
- [对账状态误判导致权威动画不播] → 增加自动检查：本地预演返回 false 时，权威凑牌事件必须播放一次完整牌组动画。
- [踏动作依赖已有 meld，构造条件不同] → 单独覆盖 `ta`，确保已有招/踏牌组可构造时仍本地预演，否则等待权威事件。
