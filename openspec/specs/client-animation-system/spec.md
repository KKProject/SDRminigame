# client-animation-system Specification

## Purpose
TBD - created by archiving change refactor-tween-animation-system. Update Purpose after archive.
## Requirements
### Requirement: 单一动画更新循环
客户端动画系统 SHALL 使用 Tween.js 进行数值补间，并 MUST 由游戏现有的 `requestAnimationFrame` 主循环传入统一时间戳更新；动画系统 MUST NOT 创建独立的持续帧循环。

#### Scenario: 主循环驱动动画
- **WHEN** 游戏主循环产生新一帧并传入时间戳
- **THEN** 动画系统 MUST 使用该时间戳更新所有活动 Tween
- **AND** Canvas 渲染 MUST 使用更新后的视觉状态绘制当前帧

#### Scenario: 无活动动画
- **WHEN** 当前没有活动动画
- **THEN** 动画系统 MUST 保持可更新且不得启动额外帧循环
- **AND** 正常牌桌渲染 MUST 不受影响

### Requirement: 动画职责解耦
客户端 SHALL 将动画编排、游戏事件映射和 Canvas 绘制分离。动画管理器 MUST NOT 访问网络、云函数、牌局裁决或 Canvas 上下文；渲染器 MUST NOT 管理 Tween 生命周期、在线事件序号或动画完成回执。

#### Scenario: 渲染动画视觉状态
- **WHEN** 动画管理器输出一张动画牌及其位置、缩放和透明度
- **THEN** 渲染器 MUST 按视觉状态绘制该牌
- **AND** 渲染器 MUST NOT 自行计算该动画的时间进度或完成时机

#### Scenario: 游戏事件映射为动画方案
- **WHEN** 客户端需要播放抓牌、出牌、弃牌归位、吃、碰、招、踏、胡或结算事件
- **THEN** 独立动画预设层 MUST 将事件转换为声明式动画方案
- **AND** 网络控制器和渲染器 MUST NOT 分别实现同一事件的动画流程

### Requirement: 可编排动画生命周期
动画管理器 SHALL 支持动画步骤的串行、并行、停留、取消和完成通知。每次动画播放的完成通知 MUST 恰好触发一次，已取消或被替换动画的完成通知 MUST NOT 影响后续动画。

#### Scenario: 串行动画
- **WHEN** 动画方案要求牌先移动到玩家前方并等待响应，再移动到弃牌区
- **THEN** 动画管理器 MUST 按方案顺序执行各阶段
- **AND** 后一阶段 MUST NOT 在前一阶段完成或被明确释放前开始

#### Scenario: 并行动画
- **WHEN** 动画方案包含同时发生的牌移动和动作效果
- **THEN** 动画管理器 MUST 并行更新这些步骤
- **AND** 方案完成通知 MUST 在所有必需并行步骤完成后触发

#### Scenario: 动画被取消
- **WHEN** 活动动画因状态恢复、权威事件不匹配或场景退出被取消
- **THEN** 动画管理器 MUST 清理对应 Tween 和临时视觉状态
- **AND** 被取消动画的旧完成回调 MUST NOT 在之后触发

### Requirement: 统一播放入口
客户端 SHALL 让在线权威事件和在线操作的本地预演通过同一动画管理器播放。相同牌局事件 MUST NOT 因多个入口或重复状态更新而重复播放，客户端 MUST NOT 保留单机牌局状态变化的动画入口。

#### Scenario: 在线权威事件播放
- **WHEN** 在线控制器提交一个尚未播放的权威公开事件
- **THEN** 动画管理器 MUST 使用对应预设播放该事件
- **AND** 动画完成后 MUST 向调用方返回唯一完成通知

#### Scenario: 在线本地操作预演播放
- **WHEN** 在线玩家操作需要在服务端确认前开始本地预演
- **THEN** 客户端 MUST 将该操作转换为统一动画事件或方案后交给动画管理器
- **AND** 后续匹配的权威事件 MUST 与本地预演对账而不得重复播放

#### Scenario: 重复事件被忽略
- **WHEN** 同一事件因重复快照、重复调用或重连恢复再次提交
- **THEN** 动画管理器或其调用方 MUST 根据稳定事件标识忽略重复播放
- **AND** 已完成事件的视觉效果和完成通知 MUST NOT 再次触发

### Requirement: 本地预演对账
动画管理器 SHALL 支持本地操作预演的确认与取消。匹配的权威事件 MUST 复用本地预演并继续完成，不得从头重播；不匹配或被拒绝的预演 MUST 被取消并恢复到权威状态。

#### Scenario: 本地预演被权威事件确认
- **WHEN** 玩家操作已开始本地预演，随后收到类型和来源匹配的权威事件
- **THEN** 动画管理器 MUST 将预演对账为该权威事件并继续必要的剩余阶段
- **AND** 已经播放的动画与音效 MUST NOT 重复播放

#### Scenario: 本地预演被拒绝或不匹配
- **WHEN** 服务端拒绝本地操作或返回不匹配的权威事件
- **THEN** 动画管理器 MUST 取消预演并清理临时视觉状态
- **AND** 客户端 MUST 根据最新权威快照和事件恢复画面

### Requirement: 动画表现兼容
迁移到 Tween.js 后，客户端 MUST 保持现有牌图比例、四座位动画目标、安全区域适配、动作音效触发和关键动画阶段语义。

#### Scenario: 不同座位播放牌动画
- **WHEN** 任一座位执行抓牌、出牌、弃牌归位或凑牌动作
- **THEN** 动画 MUST 从该座位对应位置移动到正确的桌前、弃牌区或凑牌区
- **AND** 动画牌 MUST 按资源比例显示且不得被全面屏安全区域遮挡

#### Scenario: 迁移后动作音效
- **WHEN** 一个未重复的牌或动作事件首次开始播放
- **THEN** 客户端 MUST 播放对应音效
- **AND** 动画确认、重复快照或回执重试 MUST NOT 导致音效重复

### Requirement: 出现牌复合动画
客户端动画系统 SHALL 将抓牌和出牌统一播放为出现牌复合动画，并 MUST 使用服务端公开的动画分支决定牌是保留等待响应还是自动归入弃牌区。

#### Scenario: 有响应机会时保留出现牌
- **WHEN** 客户端收到 `appearanceResolution` 为 `await-response` 的抓牌或出牌事件
- **THEN** 客户端 MUST 在出现位置将大牌按 `80% → 120% → 100%` 播放入场动画
- **AND** 入场动画完成后 MUST 以正常大小保留该大牌等待响应

#### Scenario: 初始无人响应时直接归位
- **WHEN** 客户端收到 `appearanceResolution` 为 `auto-discard` 的抓牌或出牌事件
- **THEN** 客户端 MUST 在完成 `80% → 120% → 100%` 入场动画后立即将大牌缩小并移动到最终弃牌槽位
- **AND** 动画到达时的尺寸和位置 MUST 与最终静态 mini 弃牌一致

#### Scenario: 消耗操作立即移除等待牌
- **WHEN** 吃、碰、招、踏或胡操作开始并消耗当前保留出现牌
- **THEN** 客户端 MUST 立即移除保留出现牌
- **AND** 客户端 MUST 随即开始对应动作动画

#### Scenario: 过操作保留等待牌
- **WHEN** 玩家对当前出现牌选择“过”且仍可能有其他玩家响应
- **THEN** 客户端 MUST 继续显示保留出现牌
- **AND** 客户端 MUST NOT 因单个玩家选择“过”而提前将牌移入弃牌区

### Requirement: 出现牌与静态弃牌无缝交接
客户端动画系统 SHALL 使用布局系统提供的最终弃牌槽位和尺寸完成动画，并 MUST 在动画过程中隐藏对应静态 mini 牌，到达后再切换显示。

#### Scenario: 自动归位期间隐藏静态牌
- **WHEN** `auto-discard` 出现牌正在缩小并移动到弃牌区
- **THEN** 渲染器 MUST 隐藏与当前动画 card id 对应的静态 mini 弃牌
- **AND** 画面中 MUST NOT 同时显示动画大牌和最终静态弃牌

#### Scenario: 到达目标后显示静态牌
- **WHEN** 自动归位动画到达布局系统提供的最终目标矩形
- **THEN** 客户端 MUST 移除动画牌并立即显示对应静态 mini 弃牌
- **AND** 交接前后的牌位置、尺寸和方向 MUST 保持一致

### Requirement: 完整凑牌牌组动画
客户端动画系统 SHALL 将吃、碰、招、踏等动作形成的最终公开牌组作为一个整体播放，并 MUST 使用大图构建牌组动画。

#### Scenario: 完整牌组在中央展示
- **WHEN** 客户端开始播放吃、碰、招或踏动作动画
- **THEN** 客户端 MUST 按手牌分列方式构建最终完整牌组
- **AND** 完整牌组 MUST 在牌桌中央整体按 `80% → 120% → 100%` 播放展示动画

#### Scenario: 完整牌组飞入凑牌区
- **WHEN** 完整牌组完成中央展示动画
- **THEN** 客户端 MUST 保持组内牌相对位置并整体缩小移动到目标玩家凑牌区
- **AND** 到达时的组位置和牌尺寸 MUST 与最终静态凑牌显示一致

#### Scenario: 凑牌动画与静态牌组交接
- **WHEN** 完整牌组动画正在播放
- **THEN** 渲染器 MUST 隐藏与当前 meld id 对应的最终静态牌组
- **AND** 动画到达后 MUST 移除动画牌组并立即显示最终静态牌组

### Requirement: 出现牌本地预演衔接
客户端动画系统 SHALL 复用已经开始的本地抓牌、出牌和凑牌预演，并 MUST 根据权威事件继续剩余动画阶段而不重复播放。

#### Scenario: 本地出牌预演被权威事件确认
- **WHEN** 权威出牌事件确认当前正在播放的本地出牌预演
- **THEN** 客户端 MUST 复用当前动画牌和已完成阶段
- **AND** 客户端 MUST 按权威 `appearanceResolution` 继续等待或自动归位分支

#### Scenario: 本地凑牌预演被权威事件确认
- **WHEN** 权威凑牌事件确认当前正在播放的本地完整牌组预演
- **THEN** 客户端 MUST 继续尚未完成的牌组动画阶段
- **AND** 客户端 MUST NOT 再次创建相同的完整牌组动画

### Requirement: 单客户端动作动画唯一所有权
客户端动画系统 SHALL 为每次在线牌局动作在每个客户端确定唯一动画来源，并 MUST 保证同一次动作在同一客户端最多播放一次完整动画。在线吃、碰、招、踏动作 MUST 使用服务端权威事件作为动作本人和其他玩家的唯一完整动画来源；动作发起者点击时 MAY 播放轻量按钮反馈，但 MUST NOT 播放最终凑牌动画。

#### Scenario: 动作发起者收到匹配权威事件
- **WHEN** 玩家已经提交吃、碰、招或踏响应意图，随后收到匹配的服务端权威事件
- **THEN** 客户端 MUST 使用该权威事件创建并播放完整凑牌动画
- **AND** 客户端 MUST NOT 将提交意图时的按钮反馈视为已播放动画

#### Scenario: 其他玩家收到权威事件
- **WHEN** 客户端收到由其他玩家发起的吃、碰、招、踏或胡权威事件
- **THEN** 客户端 MUST 播放一次该事件对应的完整动画
- **AND** 客户端 MUST NOT 同时启动状态观察或副露差异产生的重复动画

#### Scenario: 本地动作被服务端拒绝
- **WHEN** 服务端拒绝尚未播放最终动画的本地响应意图
- **THEN** 客户端 MUST 清理 pending intent 和按钮等待态
- **AND** 客户端 MUST 保持最新权威状态显示，不得播放凑牌完成动画

### Requirement: 正常在线流程禁止补偿动画重复播放
状态观察器、副露差异检测和静态恢复逻辑 SHALL 仅用于事件缺失、断线重连或显式恢复场景。正常在线权威事件或已确认本地动画存在时，这些补偿入口 MUST NOT 为同一动作启动额外动画。

#### Scenario: 权威凑牌事件正常播放
- **WHEN** 吃、碰、招或踏动作已由本地动画或权威事件动画负责播放
- **THEN** 副露差异检测 MUST 只更新最终静态牌组
- **AND** 副露差异检测 MUST NOT 再播放动作文字或牌组飞行动画

#### Scenario: 断线恢复缺少可播放事件
- **WHEN** 客户端恢复时只有最新权威快照且无法获得当前动作事件
- **THEN** 客户端 MUST 直接恢复正确静态牌面
- **AND** 客户端 MAY 使用明确标记的恢复动画，但 MUST NOT 将其当作正常动作动画重复回执

### Requirement: 在线待响应出牌出现动画唯一
在线权威出牌事件处于动画等待或响应窗口期间时，客户端 SHALL 使用该权威事件作为出牌出现动画的唯一正常播放入口；状态观察补偿入口 MUST NOT 为同一 `recentDiscard` 启动额外出现动画。

#### Scenario: 其他玩家出牌且本机需要响应
- **WHEN** 客户端收到其他玩家的 `discard` 权威事件，且服务端快照包含同一张 `recentDiscard` 与本机可用响应动作
- **THEN** 客户端 MUST 只播放一次该出牌的出现动画
- **AND** 客户端 MUST NOT 同时启动 `online:<eventSeq>` 与 `state:discard:<seat>:<cardId>` 两个出现牌动画
- **AND** 入场动画完成后该牌 MUST 保留在出牌玩家前方等待响应

#### Scenario: 在线动画等待期间状态观察不抢播
- **WHEN** 服务端快照标记当前存在在线动画等待，且 `recentDiscard` 指向当前权威出牌事件
- **THEN** 状态观察器 MUST NOT 根据该 `recentDiscard` 播放补偿出现动画
- **AND** 权威事件入口 MUST 继续负责播放、保留和完成回执

#### Scenario: 无权威事件恢复仍显示牌面
- **WHEN** 客户端恢复时没有可播放的在线权威事件，但权威状态仍包含需要展示的待响应出牌
- **THEN** 客户端 MUST 恢复正确牌面显示
- **AND** 客户端 MAY 使用状态补偿或静态恢复路径
- **AND** 客户端 MUST NOT 在已播放过同一权威事件后重新播放入场动画

### Requirement: 出现牌座位归属稳定
状态驱动的出现牌（抓牌/亮牌）动画 SHALL 使用产生该牌的座位（摸/亮牌人）作为动画座位，并 MUST 在整个响应窗口内保持该座位不变；该动画 MUST NOT 因响应权（`currentSeat`）轮转到其他玩家而重播或迁移到响应方区域。

#### Scenario: 别人摸/亮牌且响应权轮到我
- **WHEN** 其他玩家摸出/亮出一张需要响应的牌，且响应权随后轮转到本机座位
- **THEN** 该出现牌动画 MUST 始终停留在摸/亮牌玩家前方
- **AND** 客户端 MUST NOT 在本机（响应方）区域重新播放该牌的出现动画

#### Scenario: 出牌待响应座位固定
- **WHEN** 其他玩家打出一张需要响应的牌，且响应权随后轮转到本机座位
- **THEN** 该出现牌动画 MUST 始终停留在出牌玩家前方
- **AND** 客户端 MUST NOT 因响应权轮转而迁移或重播该牌

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

### Requirement: 布局尺寸变化时动画安全恢复
客户端动画系统 SHALL 在稳定 canonical render viewport 变化时停止使用旧布局坐标，并 MUST 清理或恢复所有依赖旧动画目标的临时视觉状态。客户端动画系统 MUST NOT 将前台恢复时的相同 canonical 视口渲染上下文重应用、或被拒绝的恢复过渡候选视为布局尺寸变化。

#### Scenario: 被拒绝的恢复候选不取消动画
- **WHEN** 小程序前台恢复期间运行时报告的过窄横屏候选被渲染指标管理器拒绝
- **THEN** 动画管理器 MUST NOT 取消、重启或完成当前动画
- **AND** 动画目标 MUST 继续使用当前 canonical viewport 对应的布局坐标

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

### Requirement: 响应动作等待权威凑牌动画
在线玩家点击吃、碰、招或踏响应动作时，客户端 SHALL 只提交响应意图并进入等待态。客户端 MUST 等待服务端权威凑牌事件后，才构造完整凑牌牌组、移除被消耗的等待牌视觉、播放完整凑牌动画并在完成后回执。

#### Scenario: 点击响应动作不播放最终动画
- **WHEN** 玩家点击吃、碰、招或踏响应动作
- **THEN** 客户端 MUST 提交响应意图并禁用或收起相关按钮
- **AND** 客户端 MUST NOT 在权威事件到达前播放完整凑牌牌组动画

#### Scenario: 权威凑牌事件接手
- **WHEN** 客户端收到匹配的吃、碰、招或踏权威事件
- **THEN** 客户端 MUST 播放一次该权威事件的完整凑牌牌组动画
- **AND** 动画完成后 MUST 正常发送动画完成回执

#### Scenario: 权威事件消耗保留出现牌
- **WHEN** 客户端收到消耗当前保留出现牌的权威凑牌事件
- **THEN** 客户端 MUST 在权威凑牌动画开始时移除该出现牌的保留视觉
- **AND** 状态补偿 MUST NOT 再播放该出现牌飞入凑牌区的动画

### Requirement: 响应 UI 由私密窗口协议驱动
客户端动画系统 SHALL 将响应按钮的弹出、等待、失效和收起视为本地 UI 生命周期，并 MUST 由服务端下发的私密响应动作和窗口状态驱动。客户端 MUST NOT 根据本地规则、公共响应候选或零散 `pendingActions` 推导可点击响应按钮；客户端 MAY 播放按钮弹出或收起过渡，但这些过渡 MUST NOT 触发公开动画回执。

#### Scenario: 私密动作可用时弹出按钮
- **WHEN** 客户端收到当前 `responseWindowId` 的私密 `playerActions`
- **AND** 私密动作列表不为空
- **THEN** 客户端 MUST 展示本机响应按钮
- **AND** 客户端 MAY 播放本地按钮弹出动画

#### Scenario: 私密动作清空时收起按钮
- **WHEN** 客户端收到当前响应窗口的空 `playerActions` 或 `actionState` 表示不可操作
- **THEN** 客户端 MUST 收起本机响应按钮
- **AND** 客户端 MUST NOT 再允许点击该窗口的旧按钮

#### Scenario: 按钮 UI 不提交动画回执
- **WHEN** 响应按钮弹出、进入等待态、失效或收起动画完成
- **THEN** 客户端 MUST NOT 将该 UI 过渡作为公开事件动画完成
- **AND** 客户端 MUST NOT 因按钮 UI 变化提交 `eventSeq` 回执

#### Scenario: 不从公共摘要构造按钮
- **WHEN** 公共响应窗口摘要显示某些席位正在等待响应
- **THEN** 客户端 MUST 只将该摘要用于公共提示或等待状态
- **AND** 客户端 MUST NOT 根据公共摘要构造具体吃、碰、招、踏、胡或过按钮

### Requirement: 出现牌保留与响应窗口衔接
客户端动画系统 SHALL 使用权威出现牌公开事件控制出现牌保留、归位和释放。`await-response` 出现牌入场完成后 MUST 保留在来源席位前方等待响应窗口；响应按钮变化 MUST NOT 移除该保留牌；只有权威 `unclaimed`、吃、碰、招、踏或胡公开事件才能释放或消耗该保留牌。

#### Scenario: 等待响应出现牌保留到窗口结果
- **WHEN** 客户端完成 `appearanceResolution=await-response` 的抓牌或出牌入场动画
- **THEN** 客户端 MUST 保留该出现牌视觉
- **AND** 客户端 MUST 在响应窗口打开、按钮变化或玩家过牌时继续保留该牌

#### Scenario: 无人响应事件释放保留牌
- **WHEN** 客户端收到与当前保留牌匹配的 `unclaimed` 权威公开事件
- **THEN** 客户端 MUST 从保留位置开始播放归位到弃牌区的动画
- **AND** 动画完成后 MUST 移除保留视觉并显示最终静态弃牌

#### Scenario: 响应动作事件消耗保留牌
- **WHEN** 客户端收到与当前保留牌匹配的吃、碰、招、踏或胡权威公开事件
- **THEN** 客户端 MUST 在该动作动画开始前释放当前保留出现牌
- **AND** 客户端 MUST 使用权威事件播放对应动作动画

#### Scenario: 过牌不释放保留牌
- **WHEN** 本机玩家提交过牌且响应窗口仍可能等待其他玩家
- **THEN** 客户端 MUST 收起或置灰本机按钮
- **AND** 客户端 MUST 继续显示当前保留出现牌直到收到窗口结果公开事件

### Requirement: 响应窗口恢复清理
客户端动画系统 SHALL 在快照恢复、断线重连和窗口切换时清理过期响应 UI 与 pending intent。客户端 MUST 使用 `responseWindowId` 区分当前窗口和旧窗口；当快照或增量不再包含旧窗口私密动作时，客户端 MUST 清理旧按钮、等待态和本地待提交意图。

#### Scenario: 新窗口替换旧窗口
- **WHEN** 客户端收到不同于本地记录的 `responseWindowId`
- **THEN** 客户端 MUST 清理旧窗口按钮和 pending intent
- **AND** 客户端 MUST 按新窗口私密动作重新渲染响应 UI

#### Scenario: 快照显示无 active 窗口
- **WHEN** 客户端恢复快照且公共响应窗口摘要为空
- **THEN** 客户端 MUST 清理所有响应按钮和 pending response intent
- **AND** 客户端 MUST 只根据当前公开事件或静态状态恢复桌面画面

#### Scenario: 响应提交后等待服务端裁决
- **WHEN** 本机玩家点击响应按钮并已提交响应意图
- **THEN** 客户端 MUST 防止该窗口重复点击
- **AND** 客户端 MUST 等待服务端私密补丁或公开结果事件决定按钮收起和桌面动画

### Requirement: 权威协议优先于状态补偿动画
客户端动画系统 SHALL 优先使用服务端公开事件和显式响应窗口协议驱动画面。状态观察补偿入口 MAY 仅在没有当前权威公开事件且无法从协议恢复视觉时使用；当 `publicEvent`、`responseSummary` 或私密 `playerActions` 已能表达当前流程时，客户端 MUST NOT 通过状态差异额外启动出现牌、无人响应或响应完成动画。

#### Scenario: 权威出现牌事件存在
- **WHEN** 客户端收到当前 `draw` 或 `discard` 权威公开事件
- **THEN** 客户端 MUST 使用该事件播放出现牌动画
- **AND** 状态补偿入口 MUST NOT 为同一 card id 启动第二个出现牌动画

#### Scenario: 响应结果事件存在
- **WHEN** 客户端收到 `unclaimed`、吃、碰、招、踏或胡权威公开事件
- **THEN** 客户端 MUST 使用该事件释放保留牌并播放结果动画
- **AND** 状态补偿入口 MUST NOT 根据弃牌区或凑牌区差异再播放同一结果动画

#### Scenario: 无权威事件时静态恢复
- **WHEN** 客户端重连后没有需要播放或回执的当前权威公开事件
- **THEN** 客户端 MUST 以快照静态状态恢复牌桌
- **AND** 客户端 MUST NOT 补播已经结束的响应窗口按钮动画

### Requirement: 在线权威事件时间线队列
客户端动画系统 SHALL 为在线权威公开事件维护一个按 `eventSeq` 排序的时间线队列。正常在线流程中，客户端 MUST 通过该队列播放、完成、跳过和确认公开事件；同一客户端同一时间 MUST NOT 播放多个权威桌面事件。

#### Scenario: 事件按序播放
- **WHEN** 客户端连续收到 `eventSeq=41` 的 `hu` 事件和随后结果状态对应的 `eventSeq=42` 事件
- **THEN** 客户端 MUST 先完成或明确跳过 `eventSeq=41`
- **AND** 客户端 MUST NOT 在 `eventSeq=41` 完成前开始播放 `eventSeq=42`

#### Scenario: 重复事件入队去重
- **WHEN** 同一 `eventSeq` 通过重复 snapshot、delta 或 ACK 响应多次到达客户端
- **THEN** 时间线队列 MUST 只保留一个可消费记录
- **AND** 该事件的动画、音效和完成回调 MUST 最多执行一次

#### Scenario: 正在播放时收到新事件
- **WHEN** 时间线正在播放一个权威事件且客户端收到更大的 `eventSeq`
- **THEN** 客户端 MUST 将新事件排入队列或请求恢复缺口
- **AND** 客户端 MUST NOT 释放当前事件并抢播新事件，除非当前事件被明确标记为可跳过

### Requirement: 显示状态闸门
客户端动画系统 SHALL 区分权威状态镜像和用于渲染的显示状态。桌面牌面、结果面板、结果按钮和结算信息 MUST 只在时间线允许的显示状态提交点进入渲染状态；响应按钮和必要的本人操作状态 MAY 在权威状态到达后即时更新。

#### Scenario: 胡牌动画先于结算面板
- **WHEN** 客户端收到包含 `publicEvent.type=hu` 且权威 `phase=result` 的快照
- **THEN** 客户端 MUST 先播放、快进或跳过 `hu` 事件
- **AND** 客户端 MUST 在该事件完成提交点之后才显示结算面板和结果按钮

#### Scenario: 响应按钮即时可用
- **WHEN** 客户端收到当前玩家可响应的私密动作且当前显示状态仍在播放等待响应出现牌动画
- **THEN** 客户端 MUST 在不破坏出现牌动画的前提下保持响应按钮可见或在入场完成后立即可见
- **AND** 响应按钮点击 MUST 不被仅用于桌面动画的显示状态闸门永久阻塞

#### Scenario: 结果状态不抢占动画
- **WHEN** 权威状态已经进入 `phase=result` 但时间线仍在播放导致结果的公开事件
- **THEN** 渲染器 MUST 继续使用时间线允许的显示状态绘制牌桌
- **AND** 渲染器 MUST NOT 因权威镜像已为 `phase=result` 而提前绘制结果面板

### Requirement: 在线动画快进与跳过策略
客户端动画系统 SHALL 根据事件类型、队列积压、重连恢复和服务端降级信息决定是否完整播放、缩短播放或跳过动画。响应关键事件 MUST 保留必要视觉语义；非关键收尾事件 MAY 被快进或跳过，但最终静态状态 MUST 正确提交。

#### Scenario: 响应关键事件保留
- **WHEN** 客户端收到 `appearanceResolution=await-response` 的 `draw` 或 `discard` 事件
- **THEN** 客户端 MUST 完成出现牌入场并保留该牌等待响应
- **AND** 客户端 MUST NOT 因队列积压直接跳过到看不到等待牌的状态

#### Scenario: 积压时快进行为确认事件
- **WHEN** 客户端时间线存在多个待播放事件且当前事件为 `chi`、`peng`、`zhao`、`ta`、`hu`、`circle-loss` 或 `draw-round`
- **THEN** 客户端 MAY 使用缩短时长播放该事件
- **AND** 该事件完成后 MUST 正确提交静态牌面、分数或结果状态

#### Scenario: 重连后不补播过期历史事件
- **WHEN** 客户端断线重连后收到最新快照，且快照中的旧事件不再要求本客户端回执
- **THEN** 客户端 MUST 直接恢复最新显示状态或仅播放当前仍需处理的事件
- **AND** 客户端 MUST NOT 补播断线期间已经结束的历史动画

### Requirement: 正常在线流程禁止补偿动画抢跑
客户端动画系统 SHALL 将状态观察器、副露差异检测和静态恢复动画限制为恢复补偿路径。正常在线权威事件已经进入时间线时，补偿动画入口 MUST NOT 为同一牌、同一副露或同一结果启动并行动画。

#### Scenario: 权威出牌事件独占出现牌动画
- **WHEN** 时间线正在处理某个 `discard` 权威事件
- **THEN** 状态观察器 MUST NOT 同时根据 `recentDiscard` 为同一张牌启动 `state:discard` 出现动画
- **AND** 该牌的出现、保留和归位 MUST 由时间线事件负责

#### Scenario: 结果特效不重复
- **WHEN** 时间线正在播放 `hu`、`circle-loss` 或 `draw-round` 结果类事件
- **THEN** 渲染器差异检测 MUST NOT 同时启动同一结果的独立文字特效
- **AND** 结果面板 MUST 等待显示状态闸门提交

### Requirement: 在线动画队列诊断
客户端动画系统 SHALL 为在线事件时间线输出诊断信息，覆盖事件入队、去重、开始、完成、快进、跳过、显示状态提交和 ACK 重试。诊断 MUST 不包含其他玩家私密手牌、密钥、token 或后台凭证。

#### Scenario: 点击卡住可定位原因
- **WHEN** 玩家反馈按钮或手牌看得见但无法点击
- **THEN** 客户端诊断 MUST 能显示当前是否被时间线播放、显示状态闸门、本地预演锁、socket 状态或响应动作状态阻塞
- **AND** 诊断 MUST 包含当前 `eventSeq`、队列长度和阻塞原因

#### Scenario: 结算冲突可定位顺序
- **WHEN** 胡牌后结算页面和动画发生异常
- **THEN** 客户端诊断 MUST 能显示 `hu` 事件开始、完成、结果显示状态提交和 ACK 的顺序
- **AND** 诊断 MUST 能区分完整播放、快进和跳过

