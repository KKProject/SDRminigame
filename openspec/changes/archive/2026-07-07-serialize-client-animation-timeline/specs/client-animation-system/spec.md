## ADDED Requirements

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
