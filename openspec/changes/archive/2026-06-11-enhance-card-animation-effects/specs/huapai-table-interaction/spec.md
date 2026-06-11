## MODIFIED Requirements

### Requirement: Card Movement Animation
系统 SHALL 使用对应字的大图 atlas sprite 展示可见摸牌、出牌和凑牌动画。动画大图 SHALL 保持 big atlas 牌面 `88x307` 的宽高比，不得压缩变形。出牌或摸牌飞行动画 SHALL 使用快入慢出的 2D 补间节奏，飞行中短暂放大到约 `1.08` 到 `1.15` 倍并带轻微阴影，落位后回到正常尺寸。当前正在处理或等待响应的动画牌 SHALL 显示青蓝色高亮描边和柔和发光。出牌动画 SHALL 先从出牌玩家一侧移动到该玩家前方并停留，等待其他玩家响应；当真人玩家的吃、碰、招、踏、胡或过动作弹窗正在等待选择时，该打出牌 SHALL 继续停留显示，不得消失或提前进入最终 mini 区域；若无人要牌，动画 SHALL 从停留位置移动到出牌玩家对应弃牌/打牌区后消失，并由 mini 图作为历史牌显示；若有人通过吃、碰、招或踏要牌，动画 SHALL 从停留位置移动到要牌玩家对应凑牌区后消失，并由该手凑牌竖列显示。系统 SHALL 在吃、碰、招、踏、胡、过等关键动作发生时显示短生命周期的大字操作特效，并在动作按钮出现和点击时提供弹性缩放反馈。

#### Scenario: Discard animation starts from acting player
- **WHEN** 玩家打出一张牌
- **THEN** 渲染器 MUST 使用该字 big sprite 从出牌玩家一侧朝该玩家前方动画移动
- **AND** 动画大图 MUST 保持 big atlas 牌面宽高比

#### Scenario: Card flight uses eased scale
- **WHEN** 出牌、摸牌、无人要牌或有人要牌的大牌飞行动画正在播放
- **THEN** 动画位置 MUST 使用快入慢出的 easing 曲线
- **AND** 动画牌 MUST 在飞行中段短暂放大到正常尺寸以上
- **AND** 动画结束时 MUST 回到正常尺寸并落在目标位置

#### Scenario: Active card has glow border
- **WHEN** 一张动画牌正在飞行或停留等待响应
- **THEN** 渲染器 MUST 为该牌绘制青蓝色高亮描边
- **AND** 渲染器 MUST 为该牌绘制柔和 glow 或阴影以突出当前处理牌

#### Scenario: Discard waits for responses
- **WHEN** 出牌后存在吃、碰、招、踏、胡或过等响应窗口
- **THEN** 动画牌 MUST 停留在出牌玩家前方
- **AND** 对应弃牌区 MUST 暂不重复显示该牌 mini 图
- **AND** 停留牌 MUST 保持当前牌高亮状态

#### Scenario: Human cou prompt preserves discard
- **WHEN** 真人玩家可对一张打出牌执行吃、碰、招或踏，且动作弹窗正在等待玩家选择
- **THEN** 该打出牌 MUST 继续在出牌玩家前方可见
- **AND** 该打出牌 MUST NOT 从桌面视图消失
- **AND** 该打出牌 MUST NOT 提前显示在真人玩家凑牌区
- **AND** 该打出牌 MUST NOT 提前显示在出牌玩家弃牌/打牌区

#### Scenario: Human cou choice moves discard to claimed area
- **WHEN** 真人玩家在动作弹窗中选择吃、碰、招或踏来要走待响应牌
- **THEN** 动画牌 MUST 从出牌玩家前方移动到真人玩家凑牌区
- **AND** 移动完成后动画牌 MUST 消失，由该手凑牌竖列显示该牌
- **AND** 系统 MUST 显示对应“吃”、“碰”、“招”或“踏”的大字操作特效

#### Scenario: Human pass moves discard to discarder area
- **WHEN** 真人玩家在动作弹窗中选择过，且最终无人要走该打出牌
- **THEN** 动画牌 MUST 从出牌玩家前方移动到出牌玩家弃牌/打牌 mini 排列区
- **AND** 移动完成后动画牌 MUST 消失，由弃牌/打牌区 mini 图显示该牌
- **AND** 系统 MUST 显示短暂“过”操作反馈

#### Scenario: Unclaimed discard moves to discard area
- **WHEN** 出牌响应窗口结束且无人要牌
- **THEN** 动画牌 MUST 从玩家前方移动到该玩家弃牌/打牌 mini 排列区
- **AND** 移动完成后动画牌 MUST 消失，由弃牌/打牌区 mini 图显示该牌

#### Scenario: Claimed discard moves to claimed area
- **WHEN** 出牌被其他玩家通过吃、碰、招或踏要走
- **THEN** 动画牌 MUST 从玩家前方移动到要牌玩家凑牌区
- **AND** 移动完成后动画牌 MUST 消失，由该手凑牌竖列显示该牌
- **AND** 系统 MUST 在要牌玩家附近显示对应大字操作特效

#### Scenario: Draw animation starts from drawing player
- **WHEN** 玩家摸牌且摸牌过程对桌面流程可见
- **THEN** 渲染器 MUST 使用该字 big sprite 从摸牌玩家一侧朝该玩家前方动画移动
- **AND** 动画大图 MUST 保持 big atlas 牌面宽高比

#### Scenario: Action text pops and fades
- **WHEN** 吃、碰、招、踏或胡动作完成
- **THEN** 渲染器 MUST 在对应玩家或动作区域附近显示大字操作特效
- **AND** 该文字 MUST 以小到大的弹性缩放出现，短暂停留后淡出
- **AND** “胡”字特效 MUST 比普通吃碰特效更醒目

#### Scenario: Action buttons pop in
- **WHEN** legal chi、peng、zhao、ta、hu、pass、accept takeover 或 decline takeover 选择出现
- **THEN** 动作按钮 MUST 以弹性缩放和淡入方式出现
- **AND** 按钮命中区域 MUST 与最终可见按钮区域一致

#### Scenario: Action button click feedback
- **WHEN** 玩家点击动作按钮
- **THEN** 被点击按钮 MUST 短暂缩小或变亮以提供触觉式视觉反馈
- **AND** 该反馈 MUST NOT 延迟或阻止对应游戏动作执行

#### Scenario: Chi meld composition animation
- **WHEN** 玩家选择吃并形成三张同句凑牌
- **THEN** 系统 MUST 先显示“吃”字操作特效
- **AND** 待响应牌 MUST 从停留位置飞向凑牌区域
- **AND** 参与吃牌的两张手牌 MUST 从手牌区域向凑牌区域过渡
- **AND** 三张牌 MUST 短暂并排或成组显示后归入已凑牌 mini 列

#### Scenario: Animation layering keeps UI usable
- **WHEN** 卡牌移动、大字特效和动作按钮同时存在
- **THEN** 渲染器 MUST 按背景、牌桌元素、牌、效果、UI 控制的顺序绘制
- **AND** 动作弹窗 MUST 保持可见且可点击，即使卡牌移动动画或大字特效处于活动状态

#### Scenario: Animation effects are bounded
- **WHEN** 动画结束或效果生命周期完成
- **THEN** 渲染器 MUST 清理对应动画或效果状态
- **AND** 后续渲染 MUST NOT 残留重复 glow、重复大字或隐藏 mini 牌状态
