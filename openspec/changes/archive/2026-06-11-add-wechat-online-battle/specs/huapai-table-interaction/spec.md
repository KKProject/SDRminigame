## MODIFIED Requirements

### Requirement: 玩家头像与点数显示
系统 SHALL 在背景优先牌桌上为四个玩家显示头像和两行点数。在线对战中，各席的头像与昵称 SHALL 来自服务端下发的公共状态中对应真人玩家（或托管 AI）的资料；本人席位 SHALL 使用本人的微信头像与昵称。对家头像 SHALL 位于界面顶部居中，上家头像 SHALL 位于左上角，下家头像 SHALL 位于右上角，自己头像 SHALL 位于左下角。当某席没有可用头像资源时，系统 MUST 使用默认头像或正方形有色方块作为头像占位。每个头像下方第一行 MUST 显示该玩家累计总输赢点数，第二行 MUST 显示该玩家当前局已操作牌福数。

#### Scenario: 四方头像位置
- **WHEN** 四个玩家进入牌桌
- **THEN** 对家头像 MUST 位于顶部居中
- **AND** 上家头像 MUST 位于左上角
- **AND** 下家头像 MUST 位于右上角
- **AND** 自己头像 MUST 位于左下角

#### Scenario: 真人玩家资料展示
- **WHEN** 在线牌桌中某席为真人玩家且服务端下发了其昵称与头像
- **THEN** 该席 MUST 显示来自服务端公共状态的真人玩家头像与昵称
- **AND** 本人席位 MUST 显示本人的微信头像与昵称

#### Scenario: 头像占位显示
- **WHEN** 某席玩家没有可用头像资源
- **THEN** 系统 MUST 使用默认头像或正方形有色方块显示该玩家头像占位

#### Scenario: 总分显示
- **WHEN** 玩家已经完成若干局
- **THEN** 头像下方第一行 MUST 显示该玩家累计总输赢点数，允许显示负数、零或正数

#### Scenario: 当前局操作福数显示
- **WHEN** 玩家在当前局已经通过碰、招、踏或其他公开操作形成可计福牌组
- **THEN** 头像下方第二行 MUST 显示该玩家当前局已操作牌福数

#### Scenario: 点数不遮挡牌
- **WHEN** 头像、点数、凑牌区、弃牌区和手牌同时显示
- **THEN** 头像与两行点数 MUST 不遮挡可见 mini 牌、手牌或动作弹窗按钮

### Requirement: Human Card Selection
系统 SHALL 允许真人玩家通过触摸选择和取消选择自己的手牌，包括动态拆列后的手牌列、最多 6 张的叠放列、相邻同字牌和最后单字收集列。在线对战中，玩家确认出牌 SHALL 以「出牌意图」上报服务端，由服务端校验后通过下发的权威状态确认结果，客户端 MUST NOT 在本地直接从手牌移除该牌作为最终结果。

#### Scenario: Select a hand card
- **WHEN** 玩家在合法出牌阶段点击手牌中的一张牌
- **THEN** 系统 MUST 将该牌标记为选中，并以可见选中状态渲染

#### Scenario: Tap selected card to discard
- **WHEN** 玩家再次点击已选中的牌，或点击合法出牌命令
- **THEN** 系统 MUST 把该牌的出牌意图上报服务端
- **AND** 客户端 MUST 等待服务端下发的权威状态来确认出牌结果

#### Scenario: Select a card in split columns
- **WHEN** 玩家点击动态拆列后的手牌列中的牌
- **THEN** 命中测试 MUST 选择该位置最上层的匹配牌区域
- **AND** 选中状态 MUST 绑定到精确的 card id

#### Scenario: Select a card after columns collapse
- **WHEN** 打牌或凑牌导致中间手牌列消失并让剩余列压紧
- **THEN** 后续点击 MUST 使用新的压紧后牌区域命中
- **AND** 不得命中过时的空列区域
