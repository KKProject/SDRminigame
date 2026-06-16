## Why

在线牌局中，其他玩家打出一张牌且本机需要响应时，本机可能看到同一张出牌的出现动画播放两次。当前系统同时存在两条入口：服务端权威 `discard` 事件通过 `playOnlineEvent()` 播放一次，状态观察器又可能根据 `state.recentDiscard` 补播一次 `state:discard:<seat>:<cardId>` retained 动画。两条动画使用不同 plan id，动画管理器无法把它们识别为同一动作。

该问题会让响应窗口显得抖动、重复，并削弱在线权威事件作为唯一动画来源的语义。

## What Changes

- 在线权威动画等待期间，状态观察器 MUST NOT 根据同一 `recentDiscard` 启动补偿出现动画。
- 其他玩家出牌且本机有响应动作时，该出牌在本机只播放一次 `discard` 出现动画，并在出现位置保留等待响应。
- 保留断线恢复、事件缺失、布局变化后的静态或显式恢复能力；恢复不得重新播放入场 pulse。
- 增加动画/在线自检，覆盖“其他玩家出牌 -> 本机出现响应按钮”的双播回归场景。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `client-animation-system`: 明确在线权威出牌事件处于动画等待/响应窗口期间时，状态观察补偿不得抢播同一出牌出现动画。

## Impact

- 影响 `js/game/renderer.js`：状态动画观察的 blocked 条件需要纳入在线动画等待状态。
- 影响 `js/game/animation/state-controller.js` 或调用方：确保在线权威事件存在时不会为同一 `recentDiscard` 生成重复 retained 动画。
- 影响 `scripts/run-animation-checks.mjs` 和/或 `scripts/run-online-checks.mjs`：增加双播回归断言。
- 不改变服务端裁决、公开事件协议、出牌规则或响应优先级。
