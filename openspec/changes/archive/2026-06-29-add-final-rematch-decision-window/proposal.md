## Why

当前最大局数结束后，最终结果页的退出和重开流程不完整：点击退出可能因为服务端状态漂移被拒绝，重开也只有“同意”没有“拒绝”和房主 15 秒选择窗口。需要把最终结算后的房间生命周期变成明确、可退出、可超时关闭的流程。

## What Changes

- 最大局数结束进入最终结果后，系统为房主创建 15 秒“是否继续牌局”选择窗口。
- 15 秒内只有房主可选择“再来一局”；此处“再来一局”表示清零当前房间已打局数并发起当前房间重开确认。
- 房主发起继续后，其他真人玩家可选择接受或拒绝；拒绝者直接退出房间回大厅。
- 等待房主选择期间，其他玩家也可直接退出并回大厅。
- 房主 15 秒内未操作时，服务端关闭该房间；客户端回到大厅。
- 修复最终结果页点击退出无反应：服务端在退出前会先从权威引擎结果阶段恢复房间状态，客户端在退出成功、房间关闭或自己被移出房间时回大厅。

## Capabilities

### New Capabilities

### Modified Capabilities
- `online-matchmaking`: 完善最大局数后当前房间重开流程，增加房主 15 秒选择窗口、玩家拒绝退出、超时关闭和退出可用性要求。

## Impact

- 后端房间生命周期与动作：`services/backend/src/game/room.js`、`services/backend/src/game-service.js`、`services/backend/src/socket-server.js`
- 小程序在线控制器和结果页按钮：`js/net/online.js`、`js/game/layout.js`、`js/game/renderer.js`
- 回归测试：`scripts/run-online-checks.mjs`
- OpenSpec 主规格：`openspec/specs/online-matchmaking/spec.md`
