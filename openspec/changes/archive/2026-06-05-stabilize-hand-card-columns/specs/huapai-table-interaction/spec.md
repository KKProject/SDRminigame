## MODIFIED Requirements

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
