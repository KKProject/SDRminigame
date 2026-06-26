## Why

当前招牌实现会在玩家手里有 4 张或 5 张同字牌时自动使用最多数量进行招牌。例如 `xxxxy + x` 会被直接按 5 张招处理，导致系统既剥夺了玩家选择 4 张招以保留 `xy` 组合空间的策略，也会按 5 张招的对子要求错误过滤掉本可执行的招牌。

真实规则需要玩家在可招范围内选择本次招几张手牌：手里 `xxx` 可招成 4 张，手里 `xxxx` 可选择招成 4 张或 5 张，手里 `xxxxx` 可选择招成 4、5 或 6 张。支持对子要求必须基于玩家实际选择形成的招牌大小计算，而不是默认按最大招牌大小计算。

## What Changes

- 将招牌动作从单一 `zhao` 改为带有目标大小或使用手牌数量的可选动作。
- 当玩家手里有 3 到 5 张同 key，且来了同 key 牌时，规则引擎 MUST 枚举所有合法招牌大小。
- 支持对子校验 MUST 使用所选招牌大小：
  - 招成 4 张需要 1 对。
  - 招成 5 张需要 2 个不同字对子。
  - 招成 6 张需要 3 个不同字对子。
- `xxxxy + x` 必须允许选择招 3 张手牌形成 4 张招，并保留剩余 `xy` 参与后续门型组合。
- 真人玩家 UI 需要能区分多个招牌选择；AI 需要在多个招牌大小之间选择，而不能默认最大张数。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `huapai-game-rules`: 调整招牌动作枚举、应用和支持对子校验口径。
- `huapai-table-interaction`: 增加真人玩家选择招牌大小的交互要求。

## Impact

- 影响自有后端权威规则：`services/backend/src/game/core/evaluator.js`、`services/backend/src/game/core/engine.js`、`services/backend/src/game/core/ai.js`。
- 影响客户端同构规则与提示：`js/game/evaluator.js`、动作弹窗、动画预览和自检脚本。
- 需要补充规则用例覆盖 `xxx + x`、`xxxx + x`、`xxxxx + x`、`xxxxy + x`、不同支持对子数量和多个招牌大小过滤场景。
- 不改变动作协议的大类名称，仍使用 `zhao`，但动作载荷需要携带可验证的招牌大小或 `keys` 数量。
