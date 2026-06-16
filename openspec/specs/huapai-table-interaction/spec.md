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
The system SHALL render legal action choices for pending player decisions such as accept takeover, decline takeover, chi, peng, zhao, ta, hu, pass, and restart. During normal play, the hand SHALL be the only persistent operation area. Chi, peng, zhao, ta, hu, pass, accept takeover, decline takeover, dealer-slip, takeover-limit, forced-action, support-pair, dealer-kezi, chi-lock, discard-restriction, scoring, draw-round, or circle-loss warnings SHALL appear in a temporary modal popup when the current rule state requires a decision or warning. The modal SHALL be the only place where non-hand action controls are shown while a decision is pending.

#### Scenario: Pending response choices
- **WHEN** the human player has one or more legal responses to an appearing card
- **THEN** the system MUST show a modal popup containing only the currently legal response buttons using labels `吃`, `碰`, `招`, `踏`, `胡`, and `过` as appropriate, and prevent unrelated hand discards until the player chooses an action

#### Scenario: Prompt follows global priority
- **WHEN** a higher-priority action tier is available for the current appearing card
- **THEN** the modal MUST NOT offer lower-priority actions that the player is not currently allowed to take

#### Scenario: Prompt controls do not cover hand cards
- **WHEN** legal action buttons are visible
- **THEN** the modal action button hit regions MUST NOT overlap any visible human hand card hit region

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
The system SHALL render clear feedback for current dealer, jiang card and jiang phrase, dealer slip, takeover choice, takeover operation count, current turn, appearing card source, recent discard, drawn-card resolution, illegal taps, AI thinking delay, forced actions, chi-decline penalties, zhao/ta support-pair obligations, win/draw result, circle-loss result, score, hu grade, fu summary, point settlement, and hu summary. Normal-play feedback SHALL be lightweight and background-first: persistent feedback MUST avoid large filled panels and central operation blocks, while decision warnings and round-end summaries SHALL use modal overlays when readability or player action is required.

#### Scenario: Illegal tap
- **WHEN** the player taps a card or area that is not legal in the current phase
- **THEN** the system MUST keep game state unchanged and display a short lightweight feedback prompt or modal message

#### Scenario: Appearing card source is visible
- **WHEN** a drawn or discarded card is waiting for response
- **THEN** the system MUST make the appearing card and its source player visually clear until the response resolves

#### Scenario: Drawn card auto-discard feedback
- **WHEN** a drawn appearing card cannot be used for any legal operation or hu
- **THEN** the system MUST show that the card went directly to the drawing player's discard area without entering hand

#### Scenario: Central active feedback
- **WHEN** the round is active and no modal result or decision is shown
- **THEN** the system MUST render current turn, deck count, recent discard, drawn-card resolution, or jiang information as lightweight text or card placement without drawing a persistent central panel

#### Scenario: Circle-loss result
- **WHEN** a player enters circle-loss
- **THEN** the system MUST show the losing player, the three winning players, the rule reason that ended the round, and the 1-base-point payments

#### Scenario: Win scoring result
- **WHEN** a player wins the round
- **THEN** the system MUST show the winner, hu source, jiang phrase, total fu, hu grade, three-player payment value, and concise itemized scoring summary

#### Scenario: Slip draw-round result
- **WHEN** dealer slip produces a draw-round because nobody can or will accept takeover
- **THEN** the system MUST show the slip draw-round reason and identify the next dealer

#### Scenario: Low-deck draw-round result
- **WHEN** the deck has fewer than 15 cards and the round ends without a winner
- **THEN** the system MUST show the low-deck draw-round reason and indicate that the dealer remains unchanged

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
系统 SHALL 使用最新稳定的横屏窗口宽高、渲染像素比和安全区作为菜单、牌桌布局、绘制和触摸命中的统一逻辑指标。系统 MUST NOT 使用启动期间无效、未稳定或属于纵屏过渡状态的指标创建正式交互布局。

#### Scenario: 启动首帧返回异常尺寸
- **WHEN** 微信运行时在横屏游戏启动首帧返回无效尺寸、过小尺寸或宽度不大于高度的过渡尺寸
- **THEN** 系统 MUST NOT 使用该候选指标创建正式菜单、牌桌元素或触摸命中区域
- **AND** 系统 MUST 在后续帧或窗口变化通知后重新读取窗口指标

#### Scenario: 横屏尺寸稳定后创建布局
- **WHEN** 系统确认一组有效横屏窗口指标已经稳定
- **THEN** 系统 MUST 使用该组逻辑宽高、安全区和渲染像素比配置 Canvas 与正式布局
- **AND** 头像、手牌、弃牌区、凑牌区、菜单按钮和触摸区域 MUST 使用同一组稳定指标

#### Scenario: 稳定尺寸发生变化
- **WHEN** 微信运行时报告与当前稳定指标不同的有效横屏宽高、像素比或安全区
- **THEN** 系统 MUST 原子更新 Canvas backing store、2D context 逻辑缩放和安全内容区域
- **AND** 系统 MUST 重新计算菜单、牌桌元素和触摸命中区域
- **AND** 背景 MUST 继续覆盖更新后的完整 Canvas

#### Scenario: 异常候选不覆盖稳定布局
- **WHEN** 已存在稳定横屏布局后运行时短暂返回无效或纵屏过渡指标
- **THEN** 系统 MUST 保留当前稳定布局
- **AND** 异常候选 MUST NOT 导致元素挤在一起、Canvas 重置或触摸区域错位

#### Scenario: 重复相同指标通知
- **WHEN** 系统重复收到与当前稳定指标相同的窗口信息
- **THEN** 系统 MUST 幂等忽略重复通知
- **AND** 系统 MUST NOT 重复重置 Canvas、布局或原生授权按钮

#### Scenario: 启动未稳定期间保持背景可见
- **WHEN** 首次启动尚未获得稳定横屏指标
- **THEN** 系统 MAY 显示覆盖完整 Canvas 的背景或轻量等待状态
- **AND** 系统 MUST NOT 显示基于错误尺寸计算的正式交互元素

#### Scenario: 自动检查覆盖异常首帧恢复
- **WHEN** 运行布局与渲染自检脚本
- **THEN** 检查 MUST 模拟异常启动尺寸随后恢复为稳定横屏尺寸
- **AND** 检查 MUST 断言正式布局只使用稳定尺寸且重复通知不会重复重建

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
