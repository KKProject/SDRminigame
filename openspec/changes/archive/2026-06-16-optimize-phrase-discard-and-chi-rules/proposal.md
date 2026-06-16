## Why

当前同句出牌限制使用“发牌时锁定完整原句数量”的模型，会把 `xxxyz`、`xxyyz` 等牌型中符合实战逻辑的拆牌路径错误拦截。玩家还可能在已经打出某个字后，继续吃回同字牌或用同字吃胡，和“出过不吃”的牌理预期不一致。

## What Changes

- **BREAKING** 调整同句出牌限制：从“不能破坏发牌锁定原句数”改为“同句出牌后的剩余牌必须仍可到达一个保留门子”的可达性算法。
- 允许同句出牌在未打满上限时暂时不成门，但必须保留至少一种合法未来路径，最终可保留 `xyz` 或 `xxx/yyy/zzz` 门子。
- 明确典型牌型路径：
  - `xxyz` 只能打多余的 `x`，最终保留 `xyz`。
  - `xxxyz` 可打 `xx` 保留 `xyz`，也可打 `yz` 保留 `xxx`。
  - `xxyyz` 可打 `xy` 保留 `xyz`，也可只打 `z` 后停止继续打该句。
  - `zzzxxy` 可沿 `xzz` 保留 `xyz`，或沿 `xxy` 保留 `zzz`。
- 新增“出过不吃”限制：玩家历史上打出过某个 key 后，后续不能吃该 key，也不能以该 key 作为别人打出的牌触发吃胡。
- 更新 AI 合法出牌选择、自检场景和云端/客户端同构规则，避免客户端提示和服务端权威结果不一致。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `huapai-game-rules`: 调整出牌限制、吃牌限制和吃胡限制的规则要求。

## Impact

- 影响云端权威规则：`cloudfunctions/game/core/evaluator.js`、`cloudfunctions/game/core/engine.js` 及 AI 出牌选择。
- 影响客户端同构规则与本地提示：`js/game/evaluator.js`、相关自检。
- 需要补充 OpenSpec 场景和自检用例，覆盖 `xxyz`、`xxxyz`、`xxyyz`、`zzzxxy`、出过不吃、出过不吃胡。
- 不新增第三方依赖，不改变对外云函数 API 形态。
