## 1. 修正出现牌座位归属

- [x] 1.1 在 `StateAnimationController.observe` 中，将 `draw` 事件的 `seat` 从 `state.currentSeat` 改为产生该牌的座位（优先 `state.appearingCard.sourceSeat`，回退 `state.currentSeat`）
- [x] 1.2 确认 `discard` 分支仍使用 `recentDiscard.seat`，与 draw 分支座位语义对齐

## 2. 回归验证

- [x] 2.1 在 `scripts/run-animation-checks.mjs` 增加"别人摸/亮牌→响应权轮到我"时出现牌座位保持在摸牌人前方、不在响应方重播的断言
- [x] 2.2 运行动画自检与相关自检脚本，确认通过且无回归
- [x] 2.3 校验 OpenSpec change（`openspec validate`）通过
