## ADDED Requirements

### Requirement: 全局将牌覆盖显示
系统 SHALL 在本局将牌句子确定后，为所有正面可见且属于该将牌句子的牌面叠加将牌图片覆盖。大牌 MUST 使用 `icon_jiang_big`，小牌 MUST 使用 `icon_jiang_small`，mini 牌 MUST 使用 `icon_jian_mini_hr`。

#### Scenario: 开局后手牌显示将牌覆盖
- **WHEN** 开局发牌完成且 `jiangPhraseId` 已确定
- **AND** 真人玩家手牌中存在属于该将牌句子的牌
- **THEN** renderer MUST 在这些手牌牌面上叠加对应尺寸的将牌覆盖图

#### Scenario: 弃牌区显示将牌覆盖
- **WHEN** 弃牌区或打牌区显示一张属于本局将牌句子的正面 mini 牌
- **THEN** renderer MUST 在该 mini 牌牌面上叠加 `icon_jian_mini_hr`
- **AND** 该覆盖图 MUST 左旋 90 度后绘制

#### Scenario: 凑牌区显示将牌覆盖
- **WHEN** 凑牌区显示吃、碰、招、踏等公开牌组中的正面 mini 牌
- **AND** 其中某张牌属于本局将牌句子
- **THEN** renderer MUST 在该 mini 牌牌面上叠加 `icon_jian_mini_hr`
- **AND** 非将牌 MUST NOT 叠加将牌覆盖图

#### Scenario: 小牌展示显示将牌覆盖
- **WHEN** 牌桌、结果面板或其他局内 UI 使用小牌尺寸显示一张属于本局将牌句子的正面牌
- **THEN** renderer MUST 在该牌面上叠加 `icon_jiang_small`

#### Scenario: 将牌覆盖图按 Atlas 源尺寸比例缩放
- **WHEN** renderer 在任意正面牌面上叠加将牌覆盖图
- **THEN** 覆盖图绘制尺寸与基础牌面绘制尺寸的比例 MUST 等于 atlas JSON 中覆盖图源尺寸与基础牌面源尺寸的比例
- **AND** 覆盖图 MUST 以基础牌面中心为基准居中绘制

#### Scenario: 未确定将牌时不显示覆盖
- **WHEN** 当前牌局尚未确定 `jiangPhraseId`
- **THEN** renderer MUST NOT 为任何牌面叠加将牌覆盖图

#### Scenario: 非将牌不显示覆盖
- **WHEN** 一张正面可见牌不属于本局将牌句子
- **THEN** renderer MUST NOT 在该牌面叠加 `icon_jiang_big`、`icon_jiang_small` 或 `icon_jian_mini_hr`

#### Scenario: 背面牌不泄露将牌信息
- **WHEN** renderer 绘制对手未公开手牌或其他背面牌
- **THEN** renderer MUST NOT 叠加将牌覆盖图
