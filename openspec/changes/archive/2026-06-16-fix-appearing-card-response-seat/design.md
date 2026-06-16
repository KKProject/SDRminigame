## Context

`StateAnimationController.observe` 通过观察 `state` 自动补播动画。它从 `state` 推导一个"当前应保留显示的事件"：

```js
const event = state.drawnCard && typeof state.currentSeat === 'number'
  ? { type: 'draw', seat: state.currentSeat, card: state.drawnCard }
  : (state.recentDiscard ? { type: 'discard', seat: state.recentDiscard.seat, card: state.recentDiscard.card } : null);
```

动画去重签名是 `${type}:${seat}:${cardId}`。`draw` 分支用 `state.currentSeat` 作为座位，而 `currentSeat` 会在响应窗口轮转到响应方。结果：别人(座位1)摸/亮牌时签名为 `draw:1:X`（牌在座位1出现），轮到我(座位0)响应时签名变成 `draw:0:X`，触发 `releaseActive()` + `playRetained()`，把同一张待响应牌重画到我的座位前。`discard` 分支用 `recentDiscard.seat`（固定为出牌人），不受影响。

该问题在状态驱动路径生效（单机始终，在线在未被 `heldAppearance` 阻塞时）。已用真实模块复现：`draw` 两阶段座位从 right 跳到 bottom，`discard` 始终在 right。

## Goals / Non-Goals

**Goals:**

- 出现牌（抓牌/亮牌）的动画座位始终为产生该牌的座位，响应权轮转期间保持稳定。
- 出现牌在响应窗口内只在产生它的玩家前方出现一次，不迁移到响应方区域。

**Non-Goals:**

- 不改服务端裁决、事件协议、牌局规则。
- 不改出牌、吃碰招踏、归位等其他动画表现。
- 不调整在线 `heldAppearance` / 权威事件主路径。

## Decisions

### 1. 出现牌座位改用产生该牌的座位

`draw` 事件的 `seat` 从 `state.currentSeat` 改为该牌的来源座位。来源取值优先级：

```
state.appearingCard.sourceSeat  →  回退 state.currentSeat
```

`state.appearingCard.sourceSeat` 在单机（engine.js `createAppearingCard`）和在线（online.js `rotateAppearing`，已按本机=0 旋转）都可用，语义为"摸/亮这张牌的座位"，正是动画应停留的位置。仅当 `appearingCard` 缺失时回退到 `currentSeat`，保持向后兼容。

**备选**：保留 `currentSeat` 但在签名中剔除座位——会破坏不同座位的去重与目标定位，不采用。

### 2. 保持 discard 分支不变

`discard` 已用 `recentDiscard.seat`（出牌人），行为正确，仅与 draw 分支语义对齐，不改逻辑。

## Risks / Trade-offs

- [`appearingCard` 在某些过渡帧缺失，回退到 `currentSeat` 可能短暂落到响应方] → 回退仅在 `appearingCard` 为空时发生，此时通常也没有待响应牌；并以自检覆盖有 `appearingCard` 的主路径。
- [签名变化影响既有去重行为] → 仅 draw 分支座位来源变化，签名仍稳定（同一摸牌人同一张牌签名不变），反而消除了错误的二次重播。
