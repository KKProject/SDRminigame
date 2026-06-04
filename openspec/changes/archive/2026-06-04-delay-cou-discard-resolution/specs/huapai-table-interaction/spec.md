## MODIFIED Requirements

### Requirement: Card Movement Animation
系统 SHALL 使用对应字的大图 atlas sprite 展示可见摸牌或出牌动画。动画大图 SHALL 保持 big atlas 牌面 `88x307` 的宽高比，不得压缩变形。出牌动画 SHALL 先从出牌玩家一侧移动到该玩家前方并停留，等待其他玩家响应；当真人玩家的吃、碰、招、踏、胡或过动作弹窗正在等待选择时，该打出牌 SHALL 继续停留显示，不得消失或提前进入最终 mini 区域；若无人要牌，动画 SHALL 从停留位置移动到出牌玩家对应弃牌/打牌区后消失，并由 mini 图作为历史牌显示；若有人通过吃、碰、招或踏要牌，动画 SHALL 从停留位置移动到要牌玩家对应凑牌区后消失，并由该手凑牌竖列显示。

#### Scenario: Discard animation starts from acting player
- **WHEN** 玩家打出一张牌
- **THEN** 渲染器 MUST 使用该字 big sprite 从出牌玩家一侧朝该玩家前方动画移动
- **AND** 动画大图 MUST 保持 big atlas 牌面宽高比

#### Scenario: Discard waits for responses
- **WHEN** 出牌后存在吃、碰、招、踏、胡或过等响应窗口
- **THEN** 动画牌 MUST 停留在出牌玩家前方
- **AND** 对应弃牌区 MUST 暂不重复显示该牌 mini 图

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

#### Scenario: Human pass moves discard to discarder area
- **WHEN** 真人玩家在动作弹窗中选择过，且最终无人要走该打出牌
- **THEN** 动画牌 MUST 从出牌玩家前方移动到出牌玩家弃牌/打牌 mini 排列区
- **AND** 移动完成后动画牌 MUST 消失，由弃牌/打牌区 mini 图显示该牌

#### Scenario: Unclaimed discard moves to discard area
- **WHEN** 出牌响应窗口结束且无人要牌
- **THEN** 动画牌 MUST 从玩家前方移动到该玩家弃牌/打牌 mini 排列区
- **AND** 移动完成后动画牌 MUST 消失，由弃牌/打牌区 mini 图显示该牌

#### Scenario: Claimed discard moves to claimed area
- **WHEN** 出牌被其他玩家通过吃、碰、招或踏要走
- **THEN** 动画牌 MUST 从玩家前方移动到要牌玩家凑牌区
- **AND** 移动完成后动画牌 MUST 消失，由该手凑牌竖列显示该牌

#### Scenario: Draw animation starts from drawing player
- **WHEN** 玩家摸牌且摸牌过程对桌面流程可见
- **THEN** 渲染器 MUST 使用该字 big sprite 从摸牌玩家一侧朝该玩家前方动画移动
- **AND** 动画大图 MUST 保持 big atlas 牌面宽高比

#### Scenario: Animation does not block modal choices
- **WHEN** legal chi、peng、zhao、ta、hu、pass、accept takeover 或 decline takeover 选择正在等待
- **THEN** 动作弹窗 MUST 保持可见且可点击，即使卡牌移动动画处于活动状态
