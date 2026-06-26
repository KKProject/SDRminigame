## Why

当前在线牌桌在单局结束、指定局数结束和玩家断线时存在状态边界不一致：未达最大局数时“再来一局”可能被动画/状态屏障卡住；达到最大局数后牌桌被当作已关闭导致玩家看不到最终提示；断线玩家又可能在需要手动选择的阶段被自动代操作。

## What Changes

- 修正本局结算后的继续开局流程：未达到 `settings.maxRounds` 时房主可点击“再来一局”继续下一局。
- 修正指定局数完成后的牌桌最终结果：玩家仍停留在牌桌查看“牌局已结束”，可选择退出；房主可发起“再来一桌/再来一局”请求。
- 增加最终结果后的全员同意重开机制：房主发起后，所有真人玩家同意才在当前房间重置已打局数并开新局。
- 调整断线托管边界：断线玩家在自动摸牌/自动出牌等无需手动选择的位置可由服务端推进；吃、碰、招、踏、接庄、送牌、手中选牌等必须手动选择的位置暂停等待该玩家重连。
- 确保动画完成回执不等待已断线玩家，重连后直接展示最新权威状态。

## Capabilities

### New Capabilities

### Modified Capabilities
- `online-matchmaking`: 修改好友牌桌在最大局数结束后的最终结果、退出和全员同意重开行为。
- `realtime-state-sync`: 修改断线玩家对动画回执屏障和重连恢复的要求。
- `server-game-engine`: 修改断线托管策略，区分可自动推进与必须等待手动操作的阶段。

## Impact

- 后端房间编排：`services/backend/src/game/room.js`、`services/backend/src/game-service.js`。
- WebSocket 协议入口：`services/backend/src/socket-server.js`。
- 在线客户端控制与牌桌交互：`js/net/online.js`、`js/game/layout.js`、`js/game/renderer.js`。
- 验证脚本：`scripts/run-online-checks.mjs`、`scripts/run-server-core-checks.mjs`。
