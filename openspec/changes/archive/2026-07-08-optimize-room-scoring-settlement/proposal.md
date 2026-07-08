## Why

当前房间创建页已经提供“重场”和“进圈赔付方式”选项，但服务端结算仍使用固定分值，导致玩家配置不会影响实际输赢点数。同时每局开局会重建座位状态，现有积分在新局开始后被清空，不符合多局房间内逐局累计的玩法预期。

## What Changes

- 让房间创建配置中的 `repeatRound` 参与胡牌结算：当胡牌总福数 `>= 88` 且开启重场时，按两个“场”的分值结算。
- 让房间创建配置中的 `payType` 参与进圈赔付：`pihu` 每家赔 1 分，`jiahu` 每家赔 2 分，`changhu` 每家赔 4 分。
- 为房间维护跨局累计积分，单局胡牌、进圈结算产生的分数变化 MUST 累加到房间局数范围内的总分。
- 服务端公共状态和客户端牌桌显示 MUST 使用累计积分，避免新局开始后回到 0 分。
- 结算结果中保留单局支付明细，并补充足够信息用于展示重场、进圈赔付档位和本局分数变化。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `online-matchmaking`: 房间配置新增实际结算语义，并要求房间在最大局数内维护累计积分。
- `huapai-game-rules`: 胡牌重场、进圈三档赔付和结算支付明细的规则发生变化。
- `huapai-table-interaction`: 牌桌头像积分和结算面板需要展示累计积分与配置生效后的结算分值。

## Impact

- 后端规则与房间编排：`services/backend/src/game/core/rules.js`、`services/backend/src/game/core/evaluator.js`、`services/backend/src/game/core/engine.js`、`services/backend/src/game/room.js`
- 客户端规则镜像与显示：`js/game/rules.js`、`js/game/evaluator.js`、`js/game/renderer.js`、`js/net/online.js`
- 回归检查：`scripts/run-server-core-checks.mjs`、`scripts/run-online-checks.mjs`、`scripts/run-huapai-checks.mjs`
