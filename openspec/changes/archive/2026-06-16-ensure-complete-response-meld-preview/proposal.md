## Why

当前在线响应流程中，玩家点击吃、碰、招、踏后，客户端可能先播放一段单张牌飞行动画，再播放服务端确认后的完整凑牌动画。这个中间动画看起来像“出现牌重播”，破坏了预期的三段流程：出现牌动画 → 本地凑牌预演 → 玩家出牌动画。

## What Changes

- 响应动作的本地预演必须表现为完整凑牌牌组动画，不得退化为单张牌飞行动画。
- 当客户端无法在本地构造完整凑牌牌组时，必须跳过本地响应预演，等待服务端权威凑牌事件播放完整动画。
- 本地响应预演与权威凑牌事件仍需对账，成功对账后不得重播权威完整动画。
- 扩展动画/在线自检，覆盖吃、碰、招、踏点击后不会插入单张 fallback 动画。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `client-animation-system`: 强化在线响应本地预演要求，确保吃、碰、招、踏的本地预演只能是完整凑牌牌组动画，或不播放并等待权威事件。

## Impact

- 影响 `js/game/animation/controller.js` 的 `playLocalActionPreview()` 与 `previewMeld()` 处理。
- 影响 `js/net/online.js` 的本地预演完成/权威确认回执时序，需要保证无预演时仍能播放权威事件并回执。
- 影响 `scripts/run-animation-checks.mjs` 和/或 `scripts/run-online-checks.mjs`，需要增加单张 fallback 禁止回归断言。
- 不改变服务端规则裁决、公开事件协议或牌局状态机。
