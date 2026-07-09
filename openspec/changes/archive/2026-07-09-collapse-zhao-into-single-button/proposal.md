## Why

当玩家手里同 key 牌有 4 张或 5 张时，规则引擎会枚举出多个招选项（`招4张`、`招5张`、`招6张`），客户端目前把每个选项都渲染成独立按钮并排放在动作弹窗里。这会让动作面板在多招场景下按钮数量膨胀，和其他动作（碰/过等）挤在一起，视觉嘈杂、误触概率高。

招本质上是单一意图，张数只是该意图的参数。玩家更自然的操作是：看到唯一的"招"入口，点开后再决定招几张；手里只有 3 张时（只有一个招方案）则点"招"直接执行，无需再做无意义的选择。

## What Changes

- 真人玩家动作弹窗中，把同一出现牌的所有 `zhao` 候选动作折叠为单个"招"按钮。
- 折叠按钮使用 `actions` atlas 中的招精灵图（`zhao: { originalIndex: 47, rotateCcw: true }`），与碰/吃/踏/胡按钮风格一致。
- 当折叠后的招候选数量为 1（手里同 key 3 张，仅 `招4`）时，点击"招"按钮 MUST 直接提交该招动作，不再弹出子选项。
- 当折叠后的招候选数量大于 1（手里同 key 4 或 5 张）时，点击"招"按钮 MUST 用招张数子面板替换当前动作面板，展示纯文字选项 `招4 / 招5 / 招6`；玩家选择某项后提交对应 `zhaoSize`。
- 招张数子面板 MUST 提供返回路径，让玩家回到主动作面板（点"招"只是展开，不构成承诺）。
- 提交动作时 MUST 仍携带所选 `zhaoSize`，服务端校验与 AI 选择逻辑不变。
- 规则引擎的招动作枚举、支持对子校验、协议载荷、AI 行为均不变——本次为纯客户端呈现与交互折叠。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `huapai-table-interaction`: 调整真人动作弹窗对多个招张数的呈现方式，从"多按钮并排"改为"单招入口 + 张数子面板"，并补充单一招方案直接执行的交互。

## Impact

- 影响客户端动作弹窗布局：`js/game/layout.js`（`createActionModal` 与 `actionButtons` 生成）。
- 影响客户端动作按钮渲染：`js/game/renderer.js`（`drawButtons` 与 `actionSpriteType` 取值，招按钮改用精灵图、子选项纯文字）。
- 影响客户端输入与提交：`js/net/online.js`（`handleActionTap`，新增子面板展开/返回状态，提交仍走现有 `response` ref）。
- 可能涉及本地 UI 状态：`js/databus.js`（新增"招张数子面板是否展开"的瞬时状态）。
- 不影响：`services/backend/src/game/core/evaluator.js`、`engine.js`、`ai.js`、在线动作协议、`js/game/evaluator.js` 的招枚举与 `self-check.js` 中对 `xxx/xxxx/xxxxx` 枚举张数的断言。
- 需要补充客户端交互用例：单招方案直接执行、多招方案展开子面板、子面板返回、子面板展开期间响应窗口被服务端裁决关闭。
