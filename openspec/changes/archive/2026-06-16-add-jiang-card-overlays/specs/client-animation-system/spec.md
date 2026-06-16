## ADDED Requirements

### Requirement: 动画牌将牌覆盖显示
客户端动画系统 SHALL 在所有正面动画牌上沿用全局将牌覆盖规则。动画牌属于本局将牌句子时，renderer MUST 按该动画牌当前绘制尺寸叠加对应将牌覆盖图。

#### Scenario: 出现牌动画显示将牌覆盖
- **WHEN** 客户端播放摸牌或出牌出现牌动画
- **AND** 该出现牌属于本局将牌句子
- **THEN** renderer MUST 在该出现牌牌面上叠加 `icon_jiang_big`

#### Scenario: 出现牌同时显示来源覆盖和将牌覆盖
- **WHEN** 一张属于本局将牌句子的出现牌需要显示来源覆盖图
- **THEN** renderer MUST 先绘制基础牌面
- **AND** renderer MUST 再绘制对应的出现牌来源覆盖图
- **AND** renderer MUST 最后绘制将牌覆盖图

#### Scenario: 出牌飞行动画显示将牌覆盖
- **WHEN** 客户端播放一张属于本局将牌句子的出牌飞行动画
- **THEN** renderer MUST 在该动画牌牌面上叠加与当前绘制尺寸匹配的将牌覆盖图

#### Scenario: 摸牌飞行动画显示将牌覆盖
- **WHEN** 客户端播放一张属于本局将牌句子的摸牌飞行动画
- **THEN** renderer MUST 在该动画牌牌面上叠加与当前绘制尺寸匹配的将牌覆盖图

#### Scenario: 凑牌动画显示将牌覆盖
- **WHEN** 客户端播放吃、碰、招或踏形成的完整凑牌牌组动画
- **AND** 动画牌组中存在属于本局将牌句子的牌
- **THEN** renderer MUST 在这些动画牌牌面上叠加对应尺寸的将牌覆盖图
- **AND** 动画牌组中的非将牌 MUST NOT 显示将牌覆盖图

#### Scenario: 自动归位后静态 mini 牌保持将牌覆盖
- **WHEN** 一张属于本局将牌句子的出现牌完成自动归位动画并切换为静态 mini 弃牌
- **THEN** 动画期间的牌面 MUST 显示将牌覆盖图
- **AND** 交接后的静态 mini 牌 MUST 继续显示 `icon_jian_mini_hr`
