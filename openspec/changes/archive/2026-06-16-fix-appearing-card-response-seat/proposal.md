## Why

当别人摸出/亮出的牌需要我响应时，状态驱动的补偿动画把"出现牌"的座位算成了 `state.currentSeat`（响应权所在座位）。一旦响应权轮到我，这张牌的动画签名从摸牌人座位变成我的座位，导致同一张待响应牌先在摸牌人那边出现一次，又在我的区域重新"出现"一次。

## What Changes

- 修正 `StateAnimationController` 对"出现牌（抓牌/亮牌）"的座位归属：始终使用产生该牌的座位（摸牌人 / `appearingCard.sourceSeat`），不再使用会随响应权转移的 `state.currentSeat`。
- 保证待响应的出现牌在整个响应窗口期间稳定停留在产生它的玩家前方，不因响应权轮转而重播或迁移到响应方区域。
- 出牌（`recentDiscard`）的座位归属本就正确（固定为出牌人），本次保持不变，仅对齐两条分支的语义。
- 扩展动画自检，覆盖"别人摸/亮牌→响应权轮到我"时出现牌座位不变的回归场景。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `client-animation-system`: 明确状态驱动的出现牌动画其座位归属为产生该牌的座位，且在响应权轮转期间保持稳定，不得重复出现或迁移到响应方区域。

## Impact

- 代码：`js/game/animation/state-controller.js`（出现牌事件的座位推导）。
- 测试：`scripts/run-animation-checks.mjs` 增加出现牌座位稳定性回归。
- 不改变服务端裁决、事件协议或牌局规则；不改变出牌、吃碰招踏的现有动画表现。
