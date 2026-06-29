## Why

线上出现 2 名真人 + 2 名 AI 的牌桌在本局结果页点击“再来一局”无反应。排查发现部分结果阶段由动画回执、断线同步或 AI 自动推进触发后，房间文档仍停留在 `playing`，导致客户端显示结果页但服务端拒绝 `startRound`。

## What Changes

- 统一服务端房间状态落态：只要权威引擎进入 `phase=result`，写入房间前必须将房间状态同步为 `finished` 或 `tableResult`。
- 修复 `startRound` 对旧漂移状态的恢复：当房间状态仍是 `playing` 但引擎已经是非最终局结果时，房主点击“再来一局”必须能开启下一局。
- 保持最大局数结束后的重开确认流程不变，但确保最终局结果会稳定进入 `tableResult`。
- 增加覆盖 2 真人 + 2 AI 结果后继续下一局、最大局数结束后重开确认的回归测试。

## Capabilities

### New Capabilities

### Modified Capabilities
- `online-matchmaking`: 牌桌生命周期必须从权威结果阶段恢复出正确房间状态，并允许未达最大局数的结果页继续下一局。
- `server-game-engine`: 动画屏障或 AI 自动推进触发结果后，持久化前必须同步房间生命周期状态。

## Impact

- 后端房间编排：`services/backend/src/game/room.js`
- 后端回归测试：`scripts/run-online-checks.mjs`
- OpenSpec 主规格：`openspec/specs/online-matchmaking/spec.md`、`openspec/specs/server-game-engine/spec.md`
- 部署：修复后需要同步到阿里云并重启 `huapai-backend.service`
