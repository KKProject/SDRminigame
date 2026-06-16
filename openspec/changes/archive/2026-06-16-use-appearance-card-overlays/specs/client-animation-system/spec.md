## ADDED Requirements

### Requirement: 出现牌来源覆盖图
客户端动画系统 SHALL 在出现牌牌面上按来源叠加对应 atlas 覆盖图。打出来的出现牌 MUST 使用 `ui_left_play_panel_da`，从牌堆摸出来的出现牌 MUST 使用 `ui_left_move_panel_ban`。

#### Scenario: 出牌出现动画叠加出牌覆盖图
- **WHEN** 客户端绘制 `discard` 类型的出现牌动画视觉
- **THEN** 客户端 MUST 先绘制基础牌面图片
- **AND** 客户端 MUST 在同一牌面矩形上叠加 `ui_left_play_panel_da`
- **AND** 客户端 MUST NOT 绘制默认卡牌边框

#### Scenario: 摸牌出现动画叠加摸牌覆盖图
- **WHEN** 客户端绘制 `draw` 类型的出现牌动画视觉
- **THEN** 客户端 MUST 先绘制基础牌面图片
- **AND** 客户端 MUST 在同一牌面矩形上叠加 `ui_left_move_panel_ban`
- **AND** 客户端 MUST NOT 绘制默认卡牌边框

#### Scenario: 覆盖图按 Atlas 源尺寸比例缩放
- **WHEN** 客户端在出现牌牌面上叠加来源覆盖图
- **THEN** 覆盖图绘制尺寸与基础牌面绘制尺寸的比例 MUST 等于 atlas JSON 中覆盖图 frame 源尺寸与基础牌面 frame 源尺寸的比例
- **AND** 覆盖图 MUST 以基础牌面中心为基准居中绘制

#### Scenario: 待响应出牌兜底显示叠加出牌覆盖图
- **WHEN** 客户端通过待响应出牌兜底路径显示 `recentDiscard`
- **THEN** 客户端 MUST 在该牌面上叠加 `ui_left_play_panel_da`
- **AND** 客户端 MUST NOT 绘制默认卡牌边框

#### Scenario: 待响应摸牌兜底显示叠加摸牌覆盖图
- **WHEN** 客户端通过待响应摸牌兜底路径显示 `drawnCard`
- **THEN** 客户端 MUST 在该牌面上叠加 `ui_left_move_panel_ban`
- **AND** 客户端 MUST NOT 绘制默认卡牌边框

#### Scenario: 非出现牌不叠加来源覆盖图
- **WHEN** 客户端绘制手牌、静态弃牌区 mini 牌、凑牌区牌组或结果面板中的普通牌面
- **THEN** 客户端 MUST NOT 叠加 `ui_left_play_panel_da` 或 `ui_left_move_panel_ban`

#### Scenario: 覆盖图缺失时保留基础牌面
- **WHEN** 出现牌来源覆盖图 sprite 无法获取
- **THEN** 客户端 MUST 继续绘制基础牌面
- **AND** 客户端 MUST NOT 阻断出现牌动画或待响应牌显示
