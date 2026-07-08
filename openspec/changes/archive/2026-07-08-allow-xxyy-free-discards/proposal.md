## Why

当前同句出牌合法性以“保留可成门路径”为主规则，已经覆盖 `xxyz`、`xxxyz`、`xxyyz` 等结构，但缺少“发牌手牌 `xxyy` 可以自由拆打”的明确规则。这个缺口会让 `上上人人` 这类开局双对牌型被误判为不能打，和实际玩法不一致。

## What Changes

- 明确同一句开局手牌结构为 `xxyy` 时，玩家可以从该句打出任意一张 `x` 或 `y`。
- `xxyy` 的后续同句出牌不再要求保留 `xyz` 或 `xxx/yyy/zzz` 可达门，可以继续打，直到该句牌被打完。
- 保持既有 `xxyyz` 规则不变：`xxyyz` 可以按 `xy + xyz` 路径出牌，也可以先打单张 `z`；若先打 `z`，后续该句牌仍应停止出牌。
- 同步服务端与客户端 evaluator，避免前端显示可打牌与服务端裁决不一致。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `huapai-game-rules`: 修改同句出牌限制，新增 `xxyy` 开局双对可自由拆打的规则场景。

## Impact

- 服务端规则判断：`services/backend/src/game/core/evaluator.js`
- 客户端规则判断：`js/game/evaluator.js`
- 回归测试：服务端核心规则、自检或在线流程相关测试
- OpenSpec 主规则能力：`huapai-game-rules`
