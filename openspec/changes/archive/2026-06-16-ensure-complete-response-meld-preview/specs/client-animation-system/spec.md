## ADDED Requirements

### Requirement: 响应本地预演必须是完整凑牌动画
在线玩家点击吃、碰、招或踏响应动作时，客户端 SHALL 只在能够构造完整凑牌牌组时播放本地响应预演；客户端 MUST NOT 将响应本地预演退化为单张牌飞行动画。

#### Scenario: 可构造完整吃碰招踏牌组
- **WHEN** 玩家点击吃、碰、招或踏，且客户端可从当前手牌、当前出现牌和动作描述构造完整凑牌牌组
- **THEN** 客户端 MUST 播放完整凑牌牌组本地预演
- **AND** 客户端 MUST NOT 播放额外单张 incoming card 飞行动画

#### Scenario: 无法构造完整响应牌组
- **WHEN** 玩家点击吃、碰、招或踏，但客户端无法在本地构造完整凑牌牌组
- **THEN** 客户端 MUST 跳过本地响应预演
- **AND** 客户端 MUST 等待服务端权威凑牌事件播放完整凑牌动画
- **AND** 客户端 MUST NOT 播放单张牌 fallback 动画

#### Scenario: 跳过本地预演后权威事件接手
- **WHEN** 客户端跳过本地响应预演，随后收到匹配的吃、碰、招或踏权威事件
- **THEN** 客户端 MUST 播放一次该权威事件的完整凑牌牌组动画
- **AND** 动画完成后 MUST 正常发送动画完成回执

#### Scenario: 本地完整预演被权威事件确认
- **WHEN** 客户端已经播放完整凑牌本地预演，随后收到匹配的吃、碰、招或踏权威事件
- **THEN** 客户端 MUST 将权威事件与本地预演对账
- **AND** 客户端 MUST NOT 重新播放该权威凑牌动画

#### Scenario: 本机完整响应预演接管保留出现牌
- **WHEN** 本机玩家对一张已出现且可响应的牌点击吃、碰、招或踏，且客户端可构造完整凑牌牌组
- **THEN** 客户端 MUST 在完整凑牌本地预演开始时移除该出现牌的保留视觉
- **AND** 状态补偿 MUST NOT 在本地预演完成后再播放该出现牌飞入本机凑牌区的动画

#### Scenario: 待响应权威出现动画接管状态补偿
- **WHEN** 客户端收到一张需要本机响应的权威摸牌或出牌出现动画，且同一张牌的状态补偿出现动画已经启动
- **THEN** 客户端 MUST 在权威出现动画开始时移除同一张牌的状态补偿视觉
- **AND** 客户端 MUST 只保留一次权威出现动画
- **AND** 动画等待期间客户端 MUST NOT 暴露 `pendingActions` 或 `playerActions` 给渲染层触发额外待响应保留视觉

#### Scenario: 权威出现动画未结束时服务端快照已进入响应窗口
- **WHEN** 客户端本地正在播放待响应权威摸牌或出牌出现动画，随后收到不再包含 `currentEvent` 的响应窗口快照
- **THEN** 客户端 MUST NOT 取消本地正在播放的权威出现动画
- **AND** 客户端 MUST NOT 因响应窗口快照再次播放同一张牌的出现动画

#### Scenario: 缺少 appearanceResolution 的权威出现事件
- **WHEN** 客户端收到摸牌或出牌权威出现事件，事件未携带 `appearanceResolution`
- **AND** 当前状态中的 `drawnCard` / `appearingCard` 或未解决 `recentDiscard` 指向同一张牌
- **THEN** 客户端 MUST 将该权威出现事件按 `await-response` 处理并保留该牌视觉
- **AND** 客户端 MUST NOT 在响应窗口快照到达后通过状态补偿重播同一张牌的出现动画

#### Scenario: currentEvent 存在时强制视为动画等待
- **WHEN** 服务端快照包含 `currentEvent`，即使 `animation.waiting` 为 false 或缺失
- **THEN** 客户端 MUST 将该快照视为动画等待中
- **AND** 客户端 MUST 暂不暴露 `pendingActions` 或 `playerActions` 给渲染层
