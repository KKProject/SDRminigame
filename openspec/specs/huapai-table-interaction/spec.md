# huapai-table-interaction Specification

## Purpose
TBD - created by archiving change build-shangdaren-huapai-game. Update Purpose after archive.
## Requirements
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

### Requirement: Responsive Card Table Layout
系统 SHALL 在当前 canvas 尺寸内渲染背景优先的四人横屏牌桌。原始背景图 SHALL 在正常对局中作为主要可见桌面，渲染器 SHALL 将头像、点数、手牌、凑好牌、弃牌/打牌和动画牌直接放在配置位置上，而不是绘制常驻填充面板、桌面框、座位框、中心操作块或带框弃牌/凑牌区域。布局 SHALL 暴露不可见区域：玩家头像与两行点数、玩家前方动画终点、各玩家弃牌/打牌 mini 排列区、各玩家凑好牌 mini 排列区、我的手牌、动作弹窗、结果弹窗和保留控制命中区域。横屏布局 SHALL 使用更宽的屏幕展示更多手牌列和桌面信息。我的手牌 SHALL 使用稳定牌列：首次排序时每列最多 6 张牌，同一句话可以拆成多个相邻牌列，最后单牌列只收集真正单张牌；首次建列后，凑牌或出牌只从原牌列移除对应牌，非空牌列不得因为剩余数量变化而重新归入其他列，只有空牌列自动消失并让剩余牌列紧挨。canvas backing store SHALL 按设备渲染像素比设置，使牌桌、牌和文字在高密度手机屏幕上保持清晰，同时布局尺寸保持逻辑像素。

#### Scenario: Canvas size changes at startup
- **WHEN** 游戏在不同屏幕尺寸设备上启动
- **THEN** 布局 MUST 计算牌尺寸和位置，使主要控制、头像、点数、手牌、凑牌区和弃牌区可见且不发生关键重叠

#### Scenario: High-density canvas is initialized
- **WHEN** 游戏在 pixel ratio 大于 1 的设备上启动
- **THEN** canvas backing-store 宽高 MUST 按配置渲染像素比大于逻辑屏幕宽高
- **AND** 导出的布局尺寸 MUST 仍然是逻辑屏幕宽高

#### Scenario: Drawing context uses logical coordinates
- **WHEN** high-density canvas 初始化后渲染器绘制牌桌
- **THEN** 2D context MUST 按渲染像素比缩放，使绘制命令继续使用逻辑布局坐标

#### Scenario: Render pixel ratio is bounded
- **WHEN** 设备报告异常高的 pixel ratio
- **THEN** 渲染像素比 MUST 被上限约束，避免 backing-store 占用过多内存

#### Scenario: Landscape table is shown
- **WHEN** 游戏在横屏 canvas 上启动
- **THEN** 布局 MUST 分配更宽的玩家手牌区域、头像点数区域、可见牌摆放区域和弹窗区域，且它们不遮挡手牌、动作弹窗、提示或结果弹窗

#### Scenario: Background-first table is shown
- **WHEN** 横屏正常对局开始
- **THEN** 渲染器 MUST 将原始背景图绘制为可见桌面
- **AND** 渲染器 MUST NOT 在背景上绘制常驻填充牌桌面板、座位框、中心操作块或带框弃牌/凑牌区域

#### Scenario: Top information remains lightweight
- **WHEN** 正常对局中需要显示局数、庄家、将牌、音频或控制信息
- **THEN** 这些信息 MUST 以轻量文字或紧凑控制显示，不得形成覆盖背景的大面积填充条
- **AND** 它们 MUST 不遮挡可见牌、我的手牌、头像点数或动作弹窗控制

#### Scenario: Invisible player placement regions are anchored
- **WHEN** 四个玩家存在
- **THEN** 布局 MUST 为自己、下家、对家、上家暴露玩家前方动画终点、弃牌/打牌 mini 排列区、凑好牌 mini 排列区、头像区域和点数区域
- **AND** 这些区域 MUST 位于 canvas 范围内，不依赖可见面板背景

#### Scenario: Avatar status areas are anchored
- **WHEN** 布局计算四个玩家信息区域
- **THEN** 对家信息区 MUST 在顶部居中
- **AND** 上家信息区 MUST 在左上角
- **AND** 下家信息区 MUST 在右上角
- **AND** 自己信息区 MUST 在左下角

#### Scenario: Discard mini cards follow seat directions
- **WHEN** 玩家有弃牌或未被要走的打牌
- **THEN** 下家的弃牌/打牌 MUST 位于下家头像下方并从右往左紧贴排列
- **AND** 我的弃牌/打牌 MUST 位于下家弃牌/打牌位置下方并从右往左紧贴排列
- **AND** 对家的弃牌/打牌 MUST 位于对家头像右侧并从左往右紧贴排列
- **AND** 上家的弃牌/打牌 MUST 位于上家头像下方并从左往右紧贴排列

#### Scenario: Claimed mini cards follow seat directions
- **WHEN** 玩家有吃、碰、招或踏形成的凑好牌
- **THEN** 我的凑好牌 MUST 位于自己头像上方并从左往右排列
- **AND** 对家的凑好牌 MUST 位于对家头像左侧并从右往左排列
- **AND** 下家的凑好牌 MUST 位于下家头像左侧并从右往左排列
- **AND** 上家的凑好牌 MUST 位于上家头像右侧并从左往右排列

#### Scenario: Claimed melds render as columns
- **WHEN** 玩家每完成一手吃、碰、招或踏
- **THEN** 这一手牌 MUST 作为单独一列 mini 图显示
- **AND** 同一手牌中的 mini 图 MUST 按竖列紧贴排列
- **AND** 多手凑牌列 MUST 按该玩家凑牌区方向依次排列

#### Scenario: Mini cards have no gaps
- **WHEN** 渲染凑好牌、弃牌或打牌 mini 图
- **THEN** 同一连续牌列中的相邻 mini 图 MUST 使用牌宽或牌高作为步进，不额外留缝隙

#### Scenario: Central operation area is absent
- **WHEN** 当前局处于正常对局
- **THEN** 中央桌面区域 MUST NOT 包含常驻操作按钮、带框控制或中心操作面板

#### Scenario: Many hand cards are visible
- **WHEN** 我的手牌包含正常发牌数量
- **THEN** 布局 MUST 使用可用横向空间展示尽可能多的手牌列，同时保持每张牌可点击

#### Scenario: Human hand remains the persistent operation area
- **WHEN** 我的手牌被渲染
- **THEN** 手牌 MUST 占据底部游戏区域并作为最大的可见可操作牌组
- **AND** 其他常驻操作区域 MUST 不与手牌竞争

#### Scenario: Phrase cards split into capped columns
- **WHEN** 首次排序时同一句话中的可见手牌数量超过 6 张
- **THEN** 布局 MUST 将该句话拆成多个相邻牌列
- **AND** 每个牌列 MUST 最多包含 6 张牌
- **AND** 拆列时 MUST 优先将当前数量最多的字拆成独立牌列

#### Scenario: Phrase remainder stays together when small enough
- **WHEN** 首次排序时同一句话拆出最多字牌列后，剩余牌数量不超过 6 张且包含两个或更多不同字
- **THEN** 剩余牌 MUST 按原句字序保留在一个相邻牌列中

#### Scenario: Splitting repeats until under cap
- **WHEN** 首次排序时同一句话拆出一个最多字牌列后剩余牌仍超过 6 张
- **THEN** 布局 MUST 继续从剩余牌中拆出当前数量最多的字作为相邻牌列，直到剩余牌不超过 6 张或进入最后单牌列判断

#### Scenario: Initial singleton cards collect at the end
- **WHEN** 首次排序时某些手牌字在当前手牌中只有 1 张，且不需要保留在同句剩余组合列中
- **THEN** 这些真正单张牌 MUST 按稳定顺序收集到最后的单牌列中
- **AND** 最后单牌列每列仍 MUST 最多包含 6 张，超过 6 张时 MUST 继续拆成相邻的最后牌列

#### Scenario: Initial singleton column excludes pairs
- **WHEN** 首次排序时某句话的剩余手牌只包含一个字但该字有 2 张或更多
- **THEN** 这些牌 MUST 作为该句话的独立牌列保留
- **AND** 这些牌 MUST NOT 和最后单牌列中的真正单张牌混排

#### Scenario: Non-empty hand columns keep identity after discard
- **WHEN** 打牌后某个原本存在的手牌列仍包含至少 1 张牌
- **THEN** 该列 MUST 保留在原来的列顺序位置
- **AND** 该列剩余的牌 MUST NOT 因为数量变为 1 张而移动到最后单牌列

#### Scenario: Non-empty hand columns keep identity after meld
- **WHEN** 吃、碰、招或踏消耗手牌后某个原本存在的手牌列仍包含至少 1 张牌
- **THEN** 该列 MUST 保留在原来的列顺序位置
- **AND** 该列剩余的牌 MUST NOT 因为数量变为 1 张而移动到最后单牌列

#### Scenario: Empty hand columns collapse
- **WHEN** 打牌或凑牌后某个原本存在的手牌列不再包含任何牌
- **THEN** 该空列 MUST 从布局中移除
- **AND** 剩余牌列 MUST 左右压紧且保持原有相对顺序

#### Scenario: Identical cards are adjacent
- **WHEN** 我的手牌中存在同一个字的多张牌
- **THEN** 同字牌在所属牌列或被拆出的独立牌列中 MUST 相邻显示

#### Scenario: Phrase stack order is stable
- **WHEN** 手牌因摸牌、打牌、吃、碰、招或踏发生变化
- **THEN** 布局 MUST 保持已建立手牌列的相对顺序
- **AND** 非空牌列 MUST 不因实时牌面重新排序而改变列位置

#### Scenario: Hand columns touch and center
- **WHEN** 布局计算我的可见手牌区域
- **THEN** 相邻手牌列 MUST 以一张牌宽相隔，不额外增加横向缝隙
- **AND** 完整手牌列组 MUST 在 canvas 中水平居中

#### Scenario: Hand columns align at the bottom
- **WHEN** 不同手牌列包含不同数量的牌
- **THEN** 每个非空手牌列 MUST 对齐到同一个底部边缘

#### Scenario: Hand stack offset scales
- **WHEN** 牌在同一手牌列中上下叠放
- **THEN** 下一张牌相对上一张牌的垂直偏移 MUST 为 `40 * (cardHeight / 108)` 并按布局像素网格取整

#### Scenario: Hand card aspect ratio is preserved
- **WHEN** 布局计算我的可见手牌区域
- **THEN** 牌区域宽高比 MUST 在小误差范围内保持 small atlas 牌面 `88x108` 的比例

### Requirement: 横屏安全区适配
系统 SHALL 在横屏全面屏设备上区分全屏背景区域和安全内容区域。背景图 SHALL 继续覆盖整个 canvas；头像、点数、手牌、弃牌/打牌 mini 排列区、凑好牌 mini 排列区、玩家前方动画终点、动作弹窗、结果弹窗、提示文字和可点击控制 SHALL 布局在安全内容区域内，避免进入刘海、灵动岛、圆角、Home Indicator 或系统手势遮挡区域。

#### Scenario: 背景保持全屏
- **WHEN** 横屏设备存在左侧或右侧安全区遮挡
- **THEN** 渲染器 MUST 仍然把背景图片绘制到完整 canvas 宽高
- **AND** 背景不得被安全内容区域裁剪或缩小

#### Scenario: 可交互元素避开左右遮挡
- **WHEN** 横屏设备报告左侧或右侧安全区 inset
- **THEN** 头像、点数、手牌、弃牌/打牌区、凑牌区、动作弹窗、结果弹窗和控制按钮 MUST 位于安全内容区域内
- **AND** 这些元素的可点击区域 MUST 不进入被遮挡的左侧或右侧区域

#### Scenario: 纵向安全边距参与布局
- **WHEN** 横屏设备报告顶部或底部安全区 inset
- **THEN** 布局 MUST 将顶部和底部安全边距纳入可见元素位置计算
- **AND** 我的手牌、自己头像、底部控制和结果弹窗 MUST 不进入底部系统手势遮挡区域

#### Scenario: 安全区信息缺失时使用兜底边距
- **WHEN** 微信运行时未提供 `safeArea` 或提供的数据无效
- **THEN** 布局 MUST 使用现有保守 safe 边距作为安全内容区域
- **AND** 游戏 MUST 正常渲染，不得因为安全区数据缺失而抛出异常

#### Scenario: 横屏方向切换后更新安全区
- **WHEN** 设备横屏方向或窗口信息发生变化，导致左右安全区 inset 改变
- **THEN** 后续布局 MUST 使用最新安全区数据重新计算元素位置
- **AND** 已有背景绘制仍 MUST 覆盖完整 canvas

#### Scenario: 动画终点位于安全区内
- **WHEN** 出牌、摸牌、无人要牌或有人要牌动画计算终点
- **THEN** 玩家前方停留点、弃牌区终点和凑牌区终点 MUST 位于安全内容区域内
- **AND** 动画使用的大图牌不得停在全面屏遮挡区域

#### Scenario: 自动检查覆盖全面屏横屏
- **WHEN** 运行布局与渲染自检脚本
- **THEN** 检查 MUST 覆盖至少一个左侧大 inset 和一个右侧大 inset 的横屏设备场景
- **AND** 检查 MUST 断言背景仍全屏绘制且关键 UI 区域在安全内容区域内

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

### Requirement: Action Prompts
The system SHALL render legal action choices for pending player decisions such as accept takeover, decline takeover, chi, peng, zhao, ta, hu, pass, and restart. During normal play, the hand SHALL be the only persistent operation area. Chi, peng, zhao, ta, hu, pass, accept takeover, decline takeover, dealer-slip, takeover-limit, forced-action, support-pair, dealer-kezi, chi-lock, discard-restriction, scoring, draw-round, or circle-loss warnings SHALL appear in a temporary modal popup when the current rule state requires a decision or warning. The modal SHALL be the only place where non-hand action controls are shown while the local player has a pending decision. When zhao is legal for the same appearing card, the modal SHALL show a single `招` button instead of one button per legal zhao size; when more than one zhao size is legal, tapping the `招` button SHALL open a zhao-size sub-panel that replaces the main action panel and lets the human player choose the intended zhao size before submitting; when exactly one zhao size is legal, tapping the `招` button SHALL submit that zhao size directly without opening a sub-panel. In an online concurrent response window, the local player's modal SHALL be based only on private actions sent to that player, while public table feedback MAY show that other seats are still responding.

#### Scenario: Pending response choices
- **WHEN** the human player has one or more legal responses to an appearing card
- **THEN** the system MUST show a modal popup containing only the currently legal response buttons using labels `吃`, `碰`, `招`, `踏`, `胡`, and `过` as appropriate, and prevent unrelated hand discards until the player chooses an action
- **AND** when one or more zhao sizes are legal, the popup MUST show a single `招` button rather than a separate button per zhao size

#### Scenario: Concurrent response choices are private
- **WHEN** multiple players can respond to the same appearing card
- **THEN** the local client MUST show only the current player's legal response buttons
- **AND** the local client MUST NOT infer or display other players' concrete legal response actions from public state

#### Scenario: Single zhao size submits directly
- **WHEN** the human player has exactly one legal zhao size for the appearing card
- **THEN** the modal MUST show a single `招` button
- **AND** tapping the `招` button MUST submit that zhao size immediately without opening a zhao-size sub-panel
- **AND** the submitted action MUST preserve the zhao size for server validation

#### Scenario: Multiple zhao sizes open a size sub-panel
- **WHEN** the human player can form more than one legal zhao group size with the same appearing card
- **AND** the player taps the `招` button
- **THEN** the system MUST replace the main action panel with a zhao-size sub-panel showing one text option per legal zhao size, such as `招4`, `招5`, or `招6`
- **AND** the sub-panel MUST offer a return control that restores the main action panel without submitting or passing
- **AND** tapping a size option MUST submit the corresponding zhao size for server validation

#### Scenario: Zhao size sub-panel is transient
- **WHEN** the zhao-size sub-panel is open
- **AND** the response window is closed by server裁决, or the player's legal zhao candidates change, or the player submits a size, or the player returns, or the player chooses a non-zhao action
- **THEN** the system MUST close the sub-panel and render the latest authoritative action choices
- **AND** a later tap on a stale sub-panel option MUST NOT submit a response

#### Scenario: Zhao size support warning
- **WHEN** the human player is choosing among zhao sizes
- **THEN** the modal MUST show or otherwise make available the support-pair requirement for each zhao size
- **AND** a zhao size lacking enough current support pairs MUST NOT be offered as a legal zhao size and MUST NOT hide another zhao size that is currently legal

#### Scenario: Prompt follows global priority
- **WHEN** a higher-priority action tier is available for the current appearing card and has already made lower-priority local actions impossible
- **THEN** the modal MUST NOT offer lower-priority actions that the player is not currently allowed to take

#### Scenario: Prompt controls do not cover hand cards
- **WHEN** legal action buttons or zhao-size sub-panel options are visible
- **THEN** the modal action button hit regions MUST NOT overlap any visible human hand card hit region

#### Scenario: Response is preempted by server裁决
- **WHEN** the server裁决 resolves the response window before the local player submits or wins a response
- **THEN** the modal MUST close and the client MUST render the latest authoritative state
- **AND** a later tap on the closed or stale action MUST NOT submit a response

#### Scenario: Takeover choice is pending
- **WHEN** dealer slip reaches the human player and the human player has at least one kezi base
- **THEN** the system MUST show accept and decline takeover choices in a modal popup and explain that accepting limits the player to 3 grouping operations before listening

#### Scenario: Forced action warning
- **WHEN** the human player is in a mandatory chi or peng situation
- **THEN** the system MUST show modal feedback identifying the required action and the rule reason

#### Scenario: Declined chi penalty warning
- **WHEN** the human player declines a legal chi opportunity that creates or updates a same-phrase same-missing-card penalty key
- **THEN** the system MUST show modal or lightweight feedback that taking the same chi opportunity later will cause circle-loss

#### Scenario: Zhao or ta support warning
- **WHEN** the human player is considering or has completed zhao or ta
- **THEN** the system MUST show the required support-pair count in the modal popup and warn when the current hand lacks enough valid support pairs

#### Scenario: Dealer kezi warning
- **WHEN** the human dealer or takeover dealer is about to chi in a way that would remove the last kezi
- **THEN** the system MUST warn in the modal popup that the move will cause circle-loss

#### Scenario: Discard restriction warning
- **WHEN** the human player attempts to discard a protected complete phrase card or exceed a four-card or five-card phrase discard limit
- **THEN** the system MUST keep game state unchanged and show feedback explaining the discard is illegal

#### Scenario: No center action controls during normal play
- **WHEN** no player decision is pending
- **THEN** the renderer MUST NOT draw center-table action buttons or operation prompts

### Requirement: Game Feedback
The system SHALL render clear feedback for current dealer, jiang card and jiang phrase, dealer slip, takeover choice, takeover operation count, current turn, appearing card source, recent discard, drawn-card resolution, concurrent response waiting state, illegal taps, AI thinking delay, forced actions, chi-decline penalties, zhao/ta support-pair obligations, win/draw result, circle-loss result, score, hu grade, fu summary, point settlement, and hu summary. Normal-play feedback SHALL be lightweight and background-first: persistent feedback MUST avoid large filled panels and central operation blocks, while decision warnings and round-end summaries SHALL use modal overlays when readability or player action is required.

#### Scenario: Illegal tap
- **WHEN** the player taps a card or area that is not legal in the current phase
- **THEN** the system MUST keep game state unchanged and display a short lightweight feedback prompt or modal message

#### Scenario: Appearing card source is visible
- **WHEN** a drawn or discarded card is waiting for response
- **THEN** the system MUST make the appearing card and its source player visually clear until the response resolves

#### Scenario: Concurrent response waiting is visible
- **WHEN** the current appearing card is waiting for one or more players to respond
- **THEN** the system MUST show lightweight feedback that response resolution is pending
- **AND** the feedback MUST NOT reveal other players' concrete legal response actions

#### Scenario: Drawn card auto-discard feedback
- **WHEN** a drawn appearing card cannot be used for any legal operation or hu
- **THEN** the system MUST show that the card went directly to the drawing player's discard area without entering hand

#### Scenario: Central active feedback
- **WHEN** the round is active and no modal result or decision is shown
- **THEN** the system MUST render current turn, deck count, recent discard, drawn-card resolution, or jiang information as lightweight text or card placement without drawing a persistent central panel

#### Scenario: Circle-loss result
- **WHEN** a player enters circle-loss
- **THEN** the system MUST show the loser, reason, score impact, and settlement summary in a readable modal result

### Requirement: Touch Lifecycle
The system SHALL register WeChat touch handlers once during game initialization and route touches through current layout hit regions.

#### Scenario: Restart round does not duplicate handlers
- **WHEN** the player restarts multiple rounds
- **THEN** each touch MUST be handled exactly once

### Requirement: Landscape Runtime Orientation
The system SHALL configure the WeChat minigame to run in landscape orientation for normal gameplay.

#### Scenario: Game launches
- **WHEN** the minigame runtime reads the project configuration
- **THEN** the game MUST request landscape orientation

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

### Requirement: 动作按钮图片化显示
系统 SHALL 在动作区域中优先使用 actions atlas 图片显示接庄、不接庄、胡、招、踏、碰、吃和过。动作区域 MUST 不绘制弹窗背景、边框或动作说明文字。图片按钮 MUST 使用 `50px` 可见高度，并根据 atlas JSON 中切片旋转后的宽高比计算宽度；按钮图片不得被压缩变形，且图片化不得改变按钮的命中区域、动作类型或执行行为。

#### Scenario: 动作弹窗显示图片按钮
- **WHEN** 接庄、不接庄、胡、招、踏、碰、吃或过动作出现在真人玩家动作弹窗中，且对应动作 sprite 可用
- **THEN** renderer MUST 使用对应 atlas 图片替代 Canvas 动作文字

#### Scenario: 动作图片保持比例
- **WHEN** 动作 sprite 绘制到动作按钮区域
- **THEN** renderer MUST 使用 `50px` 高度并按旋转后的图片宽高比计算按钮宽度
- **AND** 图片 MUST 在按钮区域内居中显示且不得拉伸变形

#### Scenario: 动作区域无弹窗装饰
- **WHEN** 真人玩家存在可选动作
- **THEN** renderer MUST NOT 绘制动作弹窗背景或边框
- **AND** renderer MUST NOT 绘制动作说明文字
- **AND** renderer MUST 只显示对应动作图片按钮

#### Scenario: 图片按钮保留视觉反馈
- **WHEN** 图片动作按钮出现或被点击
- **THEN** 图片按钮 MUST 保留现有弹性入场、淡入、点击缩小或变亮反馈

#### Scenario: 图片按钮保持命中区域
- **WHEN** 动作图片的可见边界小于或不同于按钮布局区域
- **THEN** 输入命中 MUST 继续使用既有 `layout.actionButtons` 区域
- **AND** 点击图片按钮 MUST 立即执行原有动作

#### Scenario: 未映射按钮保持原样
- **WHEN** 再来一局、静音或其他未列入动作图片映射的按钮显示
- **THEN** renderer MUST 继续使用现有按钮绘制方式

#### Scenario: 动作图片回退
- **WHEN** 某个动作 sprite 不可用
- **THEN** renderer MUST 使用该动作原有文字标签绘制可点击按钮
- **AND** 其他有可用 sprite 的动作按钮 MUST 继续使用图片显示

### Requirement: 在线牌局逐操作动画
在线牌桌 SHALL 根据服务端下发的当前公开操作事件，展示所有玩家的可见牌局操作和动画。客户端 MUST 一次只播放一个牌局事件动画，MUST 在当前事件完成后向服务端提交动画完成回执，并 MUST 等待服务端下发下一个动作。

#### Scenario: 其他玩家出牌可见
- **WHEN** 其他玩家完成一次服务端确认的出牌
- **THEN** 当前客户端 MUST 播放该牌从对应玩家一侧移动到其前方的出牌动画
- **AND** 该动画 MUST 在后续无人响应或凑牌处理动画之前完成

#### Scenario: 其他玩家摸牌过程可见
- **WHEN** 其他玩家摸出的牌属于当前牌桌公开流程
- **THEN** 当前客户端 MUST 播放对应玩家的摸牌动画
- **AND** 客户端 MUST 在摸牌动画后继续按序展示该牌的响应或弃牌结果

#### Scenario: 连续操作串行播放
- **WHEN** 当前公开操作动画播放完成
- **THEN** 客户端 MUST 提交当前事件动画完成回执
- **AND** 客户端 MUST 等待服务端下发下一个公开操作事件后再播放下一动画

#### Scenario: 凑牌操作过程可见
- **WHEN** 任一玩家完成吃、碰、招或踏
- **THEN** 当前客户端 MUST 显示对应动作特效并将公开响应牌动画移动到该玩家凑牌区
- **AND** 动画结束后凑牌区 MUST 显示服务端下发的最终公开牌组

#### Scenario: 无人响应过程可见
- **WHEN** 一张出牌或摸牌最终无人响应
- **THEN** 客户端 MUST 在该牌停留等待后播放其移动到对应弃牌区的动画
- **AND** 动画完成后弃牌区 MUST 显示对应 mini 牌

#### Scenario: 结算等待前序动画
- **WHEN** 胡牌、进圈、流局或结算事件前仍有未播放的关键动作事件
- **THEN** 客户端 MUST 先完成导致结果的关键动作动画
- **AND** 随后 MUST 展示对应结果特效和结算状态

#### Scenario: 本人操作不重复播放
- **WHEN** 本人提交操作并收到对应服务端确认事件
- **THEN** 客户端 MUST 只播放一次该操作的牌局动画
- **AND** 本地点击反馈与权威操作动画 MUST NOT 导致重复牌或重复动作特效

#### Scenario: 动画期间保持当前进程清晰
- **WHEN** 在线事件队列正在播放
- **THEN** 客户端 MUST 保持当前动画牌、行动玩家和动作结果可辨认
- **AND** 最终弃牌或凑牌 mini 图 MUST NOT 在对应移动动画完成前提前出现

#### Scenario: 动画期间禁止牌局操作
- **WHEN** 当前公开操作动画尚未完成并回执
- **THEN** 客户端 MUST 暂停新的出牌、响应、接庄和其他牌局操作输入
- **AND** 客户端 MUST 保持当前动画与等待提示可见

#### Scenario: 动画完成回执失败重试
- **WHEN** 客户端完成动画但动画完成回执因网络异常失败
- **THEN** 客户端 MUST 重试同一事件序号的回执
- **AND** 客户端 MUST NOT 重复播放已经完成的动画

### Requirement: 运行时屏幕指标稳定与重布局
系统 SHALL 使用最新稳定的 canonical render viewport 作为菜单、牌桌布局、绘制和触摸命中的统一逻辑指标。系统 MUST 优先将运行时报告的设备 `screenWidth/screenHeight` 归一化为横屏逻辑宽高，并 MUST NOT 直接使用短暂变化的 `windowWidth/windowHeight` 覆盖正式布局。系统 MUST 将竖屏指标归一化为横屏逻辑宽高，并 MUST NOT 使用竖屏来源的安全区创建正式横屏内容区域。系统 MUST NOT 使用启动期间无效、未稳定、过小或前台恢复期间短暂缩窄的指标创建正式交互布局。系统 SHALL 在小程序从后台、退出状态或微信分享面板恢复到前台时，在短暂恢复窗口内持续重新解析当前 Canvas/2D context，并重新应用当前 canonical viewport 对应的 Canvas backing store 与 2D context 逻辑缩放，即使窗口指标签名未发生变化。

#### Scenario: 前台恢复短暂横屏缩窄不覆盖 canonical
- **WHEN** 系统已有稳定 canonical 横屏视口，且小程序从分享或后台恢复期间连续读到宽度明显小于 canonical、但仍满足横屏最小尺寸的候选窗口指标
- **THEN** 系统 MUST 将该候选视为恢复过渡指标
- **AND** 系统 MUST NOT 使用该候选更新 Canvas backing store、菜单布局、牌桌布局或触摸命中区域
- **AND** 系统 MUST 继续使用当前 canonical viewport 渲染后续帧

#### Scenario: screen 尺寸稳定而 window 短暂缩窄
- **WHEN** 系统已有稳定 canonical 横屏视口，且分享返回后运行时报告的 `screenWidth/screenHeight` 与 canonical 一致，但 `windowWidth/windowHeight` 短暂变窄
- **THEN** 系统 MUST 继续使用由 `screenWidth/screenHeight` 得出的 canonical viewport
- **AND** 系统 MUST NOT 将该 `windowWidth/windowHeight` 变化提交为布局尺寸变化

#### Scenario: 横屏 safeArea 转置污染不覆盖 stable safeArea
- **WHEN** 系统已有稳定 canonical 横屏视口和稳定横屏 safeArea，且分享返回后运行时报告的 `screenWidth/windowWidth` 仍为横屏尺寸，但 `safeArea.right` 接近横屏高度并导致右侧 inset 异常巨大
- **THEN** 系统 MUST 将该 safeArea 判定为恢复过渡污染
- **AND** 系统 MUST 沿用上一份稳定 safeArea 或回退到全屏安全区
- **AND** 系统 MUST NOT 使用该 safeArea 更新菜单布局、牌桌布局或触摸命中区域

#### Scenario: canonical 恢复后刷新布局缓存
- **WHEN** 前台恢复期间曾观察到被拒绝的过渡窗口指标，随后运行时再次报告与 canonical 一致的横屏指标
- **THEN** 系统 MUST 保持 canonical viewport 不变
- **AND** 系统 SHOULD 触发一次稳定布局缓存刷新，确保菜单按钮、牌桌布局和触摸命中区域与 canonical 一致

#### Scenario: 真实横屏尺寸变化提交 canonical
- **WHEN** 小程序不处于前台恢复保护窗口，或保护窗口结束后连续确认到新的有效横屏宽高、像素比或安全区指标
- **THEN** 系统 MUST 提交该指标为新的 canonical render viewport
- **AND** 系统 MUST 原子更新 Canvas backing store、2D context 逻辑缩放和交互布局

#### Scenario: 自动检查覆盖前台恢复过窄候选
- **WHEN** 运行布局与渲染自检脚本
- **THEN** 检查 MUST 模拟已有稳定 canonical 横屏视口后分享返回连续报告过窄横屏候选
- **AND** 检查 MUST 断言正式布局、Canvas backing store 和触摸指标仍使用 canonical viewport
- **AND** 检查 MUST 模拟 `screenWidth/screenHeight` 稳定但 `windowWidth/windowHeight` 过窄的真机返回场景
- **AND** 检查 MUST 模拟横屏尺寸稳定但 safeArea 为竖屏/转置坐标系的分享返回场景

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

### Requirement: 渲染恢复诊断日志
系统 SHALL 在小程序前后台切换、窗口尺寸变化、渲染指标候选提交、候选拒绝、canonical 恢复和布局刷新时采集客户端诊断事件。系统 SHALL 将诊断事件批量上报到后端日志接口，后端 MUST 对诊断内容做长度裁剪和敏感字段脱敏后写入服务日志。

#### Scenario: 分享返回诊断事件可被后端记录
- **WHEN** 小程序从分享或后台恢复并触发渲染指标检查
- **THEN** 客户端 SHOULD 上报包含 sessionId、事件序号、`wx.getWindowInfo()` 观测值、canonical metrics、Canvas backing store 尺寸和候选处理状态的诊断事件
- **AND** 后端 MUST NOT 在日志中输出 token、secret、authorization 或 password 字段原文

### Requirement: 结算积分展示
系统 SHALL 在牌桌结算面板中展示配置化结算后的实际支付分值，并在头像积分区域展示房间累计积分。胡牌重场、进圈按屁胡赔付、进圈按甲胡赔付和进圈按场胡赔付 MUST 使用服务端下发的结算结果显示，不得由客户端重新猜测分值。

#### Scenario: 胡牌重场展示
- **WHEN** 服务端下发的胡牌结果标记为重场结算
- **THEN** 客户端结算面板 MUST 展示每家实际赔付 8 分
- **AND** 客户端 MUST 保留胡牌等级、总福数和重场提示

#### Scenario: 进圈赔付展示
- **WHEN** 服务端下发进圈结果且 `settlement.point` 为 2
- **THEN** 客户端结算面板 MUST 展示每家赔 2 分
- **AND** 客户端 MUST NOT 把该结果显示为固定 1 分赔付

#### Scenario: 新局头像积分显示累计分
- **WHEN** 多局房间进入下一局开局快照
- **THEN** 客户端头像下方第一行 MUST 显示服务端下发的房间累计积分
- **AND** 客户端 MUST NOT 因为新局重新发牌而把积分清零

#### Scenario: 最终结果展示累计分
- **WHEN** 牌桌达到最大局数并进入最终结果状态
- **THEN** 客户端 MUST 继续展示当前房间累计积分
- **AND** 玩家重连后 MUST 看到同样的累计积分

### Requirement: 全屏单局对局结果
系统 SHALL 在胡牌、进圈、流局或荒庄的终局动画完成后展示独立的横屏全屏“对局结果”页面。页面 MUST 复用牌桌背景并优先使用透明切图绘制结果标题、白板面板、可表达的本机胜负状态及继续游戏按钮；白板 MUST 通过保护四角和边框的九宫格方式适配安全内容区域。页面 MUST 在白板内逐行展示四名玩家的正方形头像、头像下方昵称、最终剩余手牌、吃碰招踏牌组、胡数和本局分数，MUST 使用终局角色标签帮助玩家识别本人及胡牌玩家。结果页 mini 牌 MUST 按原显示宽高约 `80%` 呈现并保持牌面比例，头像 MUST 比原结果页头像更小且不得裁成圆形。

#### Scenario: 胡牌后展示四家最终牌况
- **WHEN** 胡牌终局事件已经完成、快进或跳过并提交显示状态
- **THEN** 客户端 MUST 展示四名玩家的最终剩余手牌和吃碰招踏牌组
- **AND** 胡牌玩家 MUST 标记为本局胡牌玩家
- **AND** 本机玩家 MUST 使用“本家”标签标识

#### Scenario: 缩小牌与纵向身份区
- **WHEN** 客户端展示任一玩家的结果条目
- **THEN** 结果牌的目标宽高 MUST 为原结果页计算尺寸的约 `80%` 并保持原始牌面比例
- **AND** 纵向叠放间距 MUST 随牌尺寸同步缩小
- **AND** 客户端 MUST 使用更小的正方形头像并将昵称居中显示在头像下方
- **AND** 头像和昵称 MUST NOT 与牌型区域重叠

#### Scenario: 同一句剩余手牌纵向叠放
- **WHEN** 一名玩家的最终剩余手牌包含属于同一 `phraseId` 的不同牌面
- **THEN** 这些牌在不超过 5 张时 MUST 在同一个纵向列内按牌序叠放
- **AND** 同一分组超过 5 张时 MUST 拆成达到每列最多 5 张所需的最少相邻列
- **AND** 拆分 MUST 优先保留连续 3～5 张同 key 牌组成的同字门子边界
- **AND** 少于 3 张的相邻片段 MAY 在不超过 5 张的前提下合并
- **AND** 不同 `phraseId` 的剩余手牌 MUST 横向分列
- **AND** 吃碰招踏牌组 MUST 继续按每个公开牌组独立成列

#### Scenario: 六张同句牌按门子拆成两列
- **WHEN** 排序后的同句牌为“上上上大大人”
- **THEN** 结果页 MUST 将其显示为“上上上”和“大大人”两个纵向列
- **AND** 结果页 MUST NOT 将其显示为 6 张高的单列
- **AND** 结果页 MUST NOT 拆成 5 张与 1 张的两列

#### Scenario: 七张同句牌保留两个同字门子
- **WHEN** 排序后的同句牌为“尔尔尔小小小小”
- **THEN** 结果页 MUST 将其显示为“尔尔尔”和“小小小小”两个纵向列
- **AND** 结果页 MUST NOT 将其显示为“尔尔尔小”和“小小小”

#### Scenario: 胡牌玩家显示完整牌型和独立胡牌列
- **WHEN** 结果类型为胡牌且权威结果包含赢家完整胡牌分组和最后胡牌
- **THEN** 赢家结果条目 MUST 按权威分组展示带“吃、碰、对”等标签的完整胡牌牌型
- **AND** 完整胡牌牌型 MUST 保留最后胡到的牌
- **AND** 完整牌型之后 MUST 额外显示一个标签为“胡”的独立牌列
- **AND** “胡”列 MUST 再次显示最后胡到的同一张牌且不得与完整牌型去重
- **AND** 非胡牌玩家 MUST NOT 显示“胡”列

#### Scenario: 赢家牌区显示胡标记和胡型
- **WHEN** 结果类型为胡牌且当前玩家是本局赢家
- **THEN** 赢家全部牌列右侧 MUST 显示金色“胡”PNG
- **AND** “胡”标记右侧 MUST 显示金红竖牌背景
- **AND** 竖牌内 MUST 根据权威胡型由上到下显示“平胡”“小甲”“大甲”或“场胡”两个汉字
- **AND** `屁胡` MUST 以面向玩家的“平胡”文案显示
- **AND** 赢家装饰 MUST NOT 与牌列、胡数或本局分数重叠
- **AND** 非赢家 MUST NOT 预留或显示赢家装饰

#### Scenario: 旧结果详情缺少胡型字段
- **WHEN** 赢家详情包含 `winningCard` 但 `roundDetail.huGrade` 为空，且公共权威结果包含 `result.grade`
- **THEN** 客户端 MUST 使用 `result.grade` 绘制胡型背景和两个竖排汉字
- **AND** `result.grade` 为 `屁胡` 时 MUST 显示“平胡”
- **AND** 客户端 MUST NOT 将赢家的公共胡型回退值应用到非赢家

#### Scenario: 吃上胡保留双重展示
- **WHEN** 玩家以“上”完成“上大人”吃牌句子并胡牌
- **THEN** 完整牌型区 MUST 显示“吃”标签及纵向叠放的“上大人”
- **AND** 完整牌型之后 MUST 另行显示“胡”标签及“上”牌
- **AND** 两处“上”牌 MUST 同时保留

#### Scenario: 同字门子显示真实动作标签
- **WHEN** 结果页展示三张同字牌组成的碰牌组
- **THEN** 该牌组标签 MUST 显示为“碰”
- **WHEN** 结果页展示四张及以上同字牌组成的招牌组
- **THEN** 该牌组标签 MUST 显示为“招”
- **WHEN** 权威牌组的 `meldType` 或 `type` 为 `ta`
- **THEN** 该牌组标签 MUST 显示为“踏”
- **AND** 客户端 MUST NOT 将招或踏错误回退为“碰”

#### Scenario: 二牌门区分对和口
- **WHEN** 胡牌分组包含两张相同牌组成的 `xx` 门，例如“上上”
- **THEN** 该牌组标签 MUST 显示为“对”
- **WHEN** 胡牌分组包含同句两张不同牌组成的 `xy` 门，例如“上大”
- **THEN** 该牌组标签 MUST 显示为“口”
- **AND** 客户端 MUST NOT 将 `xy` 口门错误显示为“对”

#### Scenario: 仅胡牌玩家显示最终胡数
- **WHEN** 结果类型为胡牌且权威结果包含赢家最终胡数
- **THEN** 胡牌玩家所在行 MUST 显示该权威最终胡数
- **AND** 其他玩家的胡数 MUST 显示为 `--`
- **AND** 客户端 MUST NOT 根据牌面重新计算胡数

#### Scenario: 非胡牌结果没有胡数
- **WHEN** 本局结果为进圈、流局或荒庄
- **THEN** 四名玩家的胡数 MUST 显示为 `--`
- **AND** 页面 MUST 继续展示对应结果标题、最终牌况和本局分数

#### Scenario: 胡牌结果使用本机视角状态切图
- **WHEN** 本局结果为胡牌且胜利或失败状态切图可用
- **THEN** 本机玩家是胡牌赢家时页面 MUST 显示胜利状态切图
- **AND** 本机玩家不是胡牌赢家时页面 MUST 显示失败状态切图

#### Scenario: 非胡牌结果没有专用状态切图
- **WHEN** 本局结果为进圈、流局或荒庄且没有对应专用状态切图
- **THEN** 页面 MUST 使用准确的 Canvas 状态文案
- **AND** 页面 MUST NOT 将该结果错误显示为胜利或失败

#### Scenario: 白板适配不同横屏比例
- **WHEN** 结果页白板需要适配不同宽高比的安全内容区域
- **THEN** renderer MUST 保持白板四角装饰和边框的视觉比例
- **AND** renderer MUST 只拉伸九宫格中允许伸缩的边缘和中心区域
- **AND** 白板 MUST NOT 因整体非等比拉伸而产生明显变形

#### Scenario: 结果页不展示排除功能
- **WHEN** 客户端展示单局对局结果页
- **THEN** 页面 MUST NOT 展示累计得分、分享战绩、保存回放或返回大厅控件
- **AND** 页面右下角 MUST 只展示当前结果阶段允许的一个主操作按钮

#### Scenario: 尚有下一局只显示继续
- **WHEN** 当前局数小于房间最大局数
- **THEN** 页面右下角 MUST 只显示“继续下一局”
- **AND** 继续游戏切图可用时页面 MUST 使用该切图呈现主操作
- **AND** 页面 MUST NOT 同时显示“查看战绩”“再来一局”或“返回大厅”

#### Scenario: 最终局只显示查看战绩
- **WHEN** 当前局数已经达到房间最大局数
- **THEN** 页面右下角 MUST 只显示“查看战绩”
- **AND** 页面 MUST NOT 显示“继续下一局”或“再来一局”
- **AND** 在“查看战绩”专用切图缺失时页面 MUST 使用 Canvas 按钮回退
- **AND** 在总战绩页面尚未实现时，点击按钮 MUST 显示待开放反馈并停留在当前结果页

#### Scenario: 四行结果适配横屏安全区
- **WHEN** 客户端在支持的最窄横屏安全区展示结果页
- **THEN** 标题、白板、四名玩家牌况、房号局数和主操作按钮 MUST 完整位于安全内容区域
- **AND** 缩小后的最终手牌、牌组和独立胡牌列 MUST 保持可辨认且不得与胡数或本局分数重叠
- **AND** 白板两侧可视留白 MUST 与结果页安全内容区域对齐

#### Scenario: 玩家条目超过主面板可视高度
- **WHEN** 四个玩家条目超过主面板可视高度
- **THEN** mini 牌 MUST 保持缩小后的可辨认尺寸并纵向分列堆叠
- **AND** 主面板内的玩家结果列表 MUST 支持整体纵向拖动查看全部四家条目
- **AND** 标题、底部局数信息和主操作按钮 MUST 保持固定
- **AND** 拖动结果列表 MUST NOT 误触主操作按钮

### Requirement: 对局结果条目背景复用总结算切图
对局结果页的玩家条目背景 SHALL 优先复用总结算页已注册的条目切图语义资源：本局赢家所在行 MUST 使用金色 `tableRecordFirstRow` 切图，其余玩家所在行 MUST 使用米色 `tableRecordRow` 切图；系统 MUST NOT 为对局结果页条目背景新增图片资源。条目切图 MUST 通过保护四角和边框的九宫格方式绘制以适配行尺寸；行内胡数与分数所在的数据区起点 MUST 与切图内自带的竖分隔线（约行宽 `78%` 处）对齐。切图绘制成功时 renderer MUST NOT 在切图之上叠加自绘底色或行边框，本家 MUST 通过“本家”角色标签保持可辨识；金色底色语义 MUST 与总结算页保持一致（仅赢家使用金色行）。任一条目切图缺失或加载失败时，renderer MUST 回退到 Canvas 自绘条目背景，且页面展示与交互 MUST 不受影响。

#### Scenario: 切图可用时按胜负选择行背景
- **WHEN** 对局结果页展示四名玩家条目且两张条目切图均加载成功
- **THEN** 本局赢家所在行 MUST 使用金色 `tableRecordFirstRow` 切图作为背景
- **AND** 其余玩家所在行 MUST 使用米色 `tableRecordRow` 切图作为背景
- **AND** 系统 MUST NOT 再为这些行绘制自绘填充底色

#### Scenario: 九宫格适配任意行比例
- **WHEN** 条目行的实际长宽比与切图原始比例不一致
- **THEN** renderer MUST 通过九宫格只拉伸切图的边缘和中心区域
- **AND** 切图四角纹饰和边框粗细 MUST NOT 产生明显变形

#### Scenario: 数据区与切图分隔线对齐
- **WHEN** 对局结果页布局计算玩家条目的胡数与分数数据区
- **THEN** 数据区起点 MUST 对齐行宽约 `78%` 处，与切图内自带竖分隔线一致
- **AND** 分隔线 MUST 呈现为牌型区与数据区的分界
- **AND** 胡数与分数内容 MUST 完整位于分隔线右侧且不与牌型区重叠

#### Scenario: 切图背景上不叠加自绘装饰
- **WHEN** 任一玩家条目（含本家）使用切图背景展示
- **THEN** renderer MUST NOT 在切图之上叠加自绘底色或行边框
- **AND** 本家 MUST 继续显示“本家”角色标签
- **AND** 本家不是赢家时其行背景 MUST 使用米色 `tableRecordRow` 切图

#### Scenario: 条目切图缺失时回退自绘
- **WHEN** 任一条目切图缺失、损坏或加载失败
- **THEN** renderer MUST 对受影响的行使用 Canvas 自绘条目背景回退
- **AND** 本家高亮与赢家标识 MUST 在回退样式中仍可辨识
- **AND** 结果列表滚动和主操作按钮 MUST 继续可用

