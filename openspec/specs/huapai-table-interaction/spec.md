# huapai-table-interaction Specification

## Purpose
TBD - created by archiving change build-shangdaren-huapai-game. Update Purpose after archive.
## Requirements
### Requirement: 玩家头像与点数显示
系统 SHALL 在背景优先牌桌上为四个玩家显示头像占位和两行点数。对家头像 SHALL 位于界面顶部居中，上家头像 SHALL 位于左上角，下家头像 SHALL 位于右上角，自己头像 SHALL 位于左下角。当前没有头像资源时，系统 MUST 使用正方形有色方块作为头像占位。每个头像下方第一行 MUST 显示该玩家累计总输赢点数，第二行 MUST 显示该玩家当前局已操作牌福数。

#### Scenario: 四方头像位置
- **WHEN** 四个玩家进入牌桌
- **THEN** 对家头像 MUST 位于顶部居中
- **AND** 上家头像 MUST 位于左上角
- **AND** 下家头像 MUST 位于右上角
- **AND** 自己头像 MUST 位于左下角

#### Scenario: 头像占位显示
- **WHEN** 玩家没有真实头像资源
- **THEN** 系统 MUST 使用正方形有色方块显示该玩家头像占位

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
系统 SHALL 在当前 canvas 尺寸内渲染背景优先的四人横屏牌桌。原始背景图 SHALL 在正常对局中作为主要可见桌面，渲染器 SHALL 将头像、点数、手牌、凑好牌、弃牌/打牌和动画牌直接放在配置位置上，而不是绘制常驻填充面板、桌面框、座位框、中心操作块或带框弃牌/凑牌区域。布局 SHALL 暴露不可见区域：玩家头像与两行点数、玩家前方动画终点、各玩家弃牌/打牌 mini 排列区、各玩家凑好牌 mini 排列区、我的手牌、动作弹窗、结果弹窗和保留控制命中区域。横屏布局 SHALL 使用更宽的屏幕展示更多手牌列和桌面信息。我的手牌 SHALL 使用动态牌列：每列最多 6 张牌，同一句话可以拆成多个相邻牌列，单字牌集中到最后牌列，空牌列在每次手牌变化后自动消失并让剩余牌列紧挨。canvas backing store SHALL 按设备渲染像素比设置，使牌桌、牌和文字在高密度手机屏幕上保持清晰，同时布局尺寸保持逻辑像素。

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
- **WHEN** 同一句话中的可见手牌数量超过 6 张
- **THEN** 布局 MUST 将该句话拆成多个相邻牌列
- **AND** 每个牌列 MUST 最多包含 6 张牌
- **AND** 拆列时 MUST 优先将当前数量最多的字拆成独立牌列

#### Scenario: Phrase remainder stays together when small enough
- **WHEN** 同一句话拆出最多字牌列后，剩余牌数量不超过 6 张且包含两个或更多不同字
- **THEN** 剩余牌 MUST 按原句字序保留在一个相邻牌列中

#### Scenario: Splitting repeats until under cap
- **WHEN** 同一句话拆出一个最多字牌列后剩余牌仍超过 6 张
- **THEN** 布局 MUST 继续从剩余牌中拆出当前数量最多的字作为相邻牌列，直到剩余牌不超过 6 张或进入单字收集规则

#### Scenario: Single-character phrase cards collect at the end
- **WHEN** 某句话的剩余手牌只包含一个字
- **THEN** 这些单字牌 MUST 不在原句位置单独成列
- **AND** 所有这类单字牌 MUST 按稳定顺序收集到最后的单字牌列中
- **AND** 单字牌列每列仍 MUST 最多包含 6 张，超过 6 张时 MUST 继续拆成相邻的最后牌列

#### Scenario: Empty hand columns collapse
- **WHEN** 打牌或凑牌后某个原本存在的手牌列不再包含任何牌
- **THEN** 该空列 MUST 从布局中移除
- **AND** 剩余牌列 MUST 左右压紧且保持原有相对顺序

#### Scenario: Identical cards are adjacent
- **WHEN** 我的手牌中存在同一个字的多张牌
- **THEN** 同字牌在所属牌列或被拆出的独立牌列中 MUST 相邻显示

#### Scenario: Phrase stack order is stable
- **WHEN** 手牌因摸牌、打牌、吃、碰、招或踏发生变化
- **THEN** 布局 MUST 保持句子顺序、拆列顺序和单字收集列顺序稳定

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

### Requirement: Human Card Selection
系统 SHALL 允许真人玩家通过触摸选择和取消选择自己的手牌，包括动态拆列后的手牌列、最多 6 张的叠放列、相邻同字牌和最后单字收集列。

#### Scenario: Select a hand card
- **WHEN** 玩家在合法出牌阶段点击手牌中的一张牌
- **THEN** 系统 MUST 将该牌标记为选中，并以可见选中状态渲染

#### Scenario: Tap selected card to discard
- **WHEN** 玩家再次点击已选中的牌，或点击合法出牌命令
- **THEN** 系统 MUST 请求游戏引擎打出该牌

#### Scenario: Select a card in split columns
- **WHEN** 玩家点击动态拆列后的手牌列中的牌
- **THEN** 命中测试 MUST 选择该位置最上层的匹配牌区域
- **AND** 选中状态 MUST 绑定到精确的 card id

#### Scenario: Select a card after columns collapse
- **WHEN** 打牌或凑牌导致中间手牌列消失并让剩余列压紧
- **THEN** 后续点击 MUST 使用新的压紧后牌区域命中
- **AND** 不得命中过时的空列区域

### Requirement: Action Prompts
The system SHALL render legal action choices for pending player decisions such as accept takeover, decline takeover, chi, peng, zhao, ta, hu, pass, and restart. During normal play, the hand SHALL be the only persistent operation area. Chi, peng, zhao, ta, hu, pass, accept takeover, decline takeover, dealer-slip, takeover-limit, forced-action, support-pair, dealer-kezi, scoring, or circle-loss warnings SHALL appear in a temporary modal popup when the current rule state requires a decision or warning. The modal SHALL be the only place where non-hand action controls are shown while a decision is pending.

#### Scenario: Pending response choices
- **WHEN** the human player has one or more legal responses to an incoming card
- **THEN** the system MUST show a modal popup containing the available response buttons using labels `吃`, `碰`, `招`, `踏`, `胡`, and `过` as appropriate, and prevent unrelated hand discards until the player chooses an action

#### Scenario: Prompt controls do not cover hand cards
- **WHEN** legal action buttons are visible
- **THEN** the modal action button hit regions MUST NOT overlap any visible human hand card hit region

#### Scenario: Takeover choice is pending
- **WHEN** dealer slip reaches the human player and the human player has at least one three-of-a-kind
- **THEN** the system MUST show accept and decline takeover choices in a modal popup and explain that accepting limits the player to 3 grouping operations before listening

#### Scenario: Forced action warning
- **WHEN** the human player is in a mandatory chi or peng situation
- **THEN** the system MUST show modal feedback that declining the required action can trigger circle-loss according to the rules

#### Scenario: Zhao or ta support warning
- **WHEN** the human player is considering or has completed zhao or ta
- **THEN** the system MUST show the required support-pair count in the modal popup and warn when the current hand lacks enough valid support pairs

#### Scenario: Dealer kezi warning
- **WHEN** the human dealer or takeover dealer is about to chi in a way that would remove the last kezi
- **THEN** the system MUST warn in the modal popup that the move will cause circle-loss

#### Scenario: No center action controls during normal play
- **WHEN** no player decision is pending
- **THEN** the renderer MUST NOT draw center-table action buttons or operation prompts

### Requirement: Game Feedback
The system SHALL render clear feedback for current dealer, jiang card and jiang phrase, dealer slip, takeover choice, takeover operation count, current turn, recent discard, drawn-card resolution, illegal taps, AI thinking delay, forced actions, zhao/ta support-pair obligations, win/draw result, circle-loss result, score, hu grade, fu summary, point settlement, and hu summary. Normal-play feedback SHALL be lightweight and background-first: persistent feedback MUST avoid large filled panels and central operation blocks, while decision warnings and round-end summaries SHALL use modal overlays when readability or player action is required.

#### Scenario: Illegal tap
- **WHEN** the player taps a card or area that is not legal in the current phase
- **THEN** the system MUST keep game state unchanged and display a short lightweight feedback prompt or modal message

#### Scenario: Central active feedback
- **WHEN** the round is active and no modal result or decision is shown
- **THEN** the system MUST render current turn, deck count, recent discard, drawn-card resolution, or jiang information as lightweight text or card placement without drawing a persistent central panel

#### Scenario: Circle-loss result
- **WHEN** a player enters circle-loss
- **THEN** the system MUST show the losing player, the three winning players, and the rule reason that ended the round

#### Scenario: Win scoring result
- **WHEN** a player wins the round
- **THEN** the system MUST show the winner, hu source, jiang phrase, total fu, hu grade, point value, and concise itemized scoring summary

#### Scenario: Draw-round result
- **WHEN** dealer slip produces a draw-round because nobody can or will accept takeover
- **THEN** the system MUST show the draw-round reason and identify the next dealer

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
