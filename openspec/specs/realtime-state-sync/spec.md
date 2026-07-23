# realtime-state-sync Specification

## Purpose
TBD - created by archiving change add-wechat-online-battle. Update Purpose after archive.
## Requirements
### Requirement: 权威状态实时下发
系统 SHALL 通过自有 WebSocket 主通道把牌桌公共状态、当前公开操作事件和动画等待状态下发给本局所有已连接客户端。客户端 MUST 订阅本牌桌的 socket 状态流，在状态变化时更新本地权威镜像，播放当前事件并回执动画完成；公共状态和公开事件 MUST 只包含可对全体玩家公开的信息。并发响应窗口的公共状态 MAY 包含等待响应席位、已响应席位和出现牌来源等摘要，但 MUST NOT 包含其他玩家具体可用动作、胡牌候选、手牌推导结果或私密选择。当 WebSocket 暂时不可用时，客户端 MUST 保留最后一次权威画面并等待重连；当事件缺口无法通过 socket 补齐时，客户端 MUST 以重连订阅后服务端下发的最新权威快照恢复显示，MUST NOT 用本地推断补造缺失事件。

#### Scenario: 状态变化推送
- **WHEN** 服务端更新了牌桌公共状态
- **THEN** 订阅该牌桌 socket 状态流的客户端 MUST 收到最新公共状态、当前公开事件和动画等待状态
- **AND** 客户端 MUST 用最新状态更新权威镜像

#### Scenario: 客户端只镜像不裁决
- **WHEN** 客户端收到新的公共状态或公开操作事件
- **THEN** 客户端 MUST 把服务端状态作为权威来源
- **AND** 客户端 MUST NOT 用本地推断补造服务端未下发的牌局动作

#### Scenario: 当前事件完成后下发下一事件
- **WHEN** 当前公开事件动画完成回执条件满足
- **THEN** 服务端 MUST 推进并通过 socket 下发下一个公开事件
- **AND** 客户端 MUST NOT 在当前事件完成前收到可推进牌局的后续事件

#### Scenario: 并发响应摘要不泄密
- **WHEN** 服务端下发并发响应窗口公共状态
- **THEN** 公共状态 MUST NOT 包含任一玩家的具体响应按钮、胡牌结果、候选动作列表或响应选择详情
- **AND** 公共状态 MAY 只包含响应窗口是否存在、等待席位和已响应席位等摘要信息

#### Scenario: 重复事件去重
- **WHEN** 实时推送重复返回已消费的公开事件
- **THEN** 客户端 MUST 根据事件序号忽略重复事件
- **AND** 同一个动作动画 MUST NOT 重复播放

#### Scenario: 事件缺口等待 socket 恢复
- **WHEN** 客户端发现收到的事件序号与最后已消费事件之间存在缺口
- **THEN** 客户端 MUST 优先通过 socket 补发请求或重新订阅恢复最新权威快照
- **AND** 客户端 MUST NOT 通过 HTTPS 游戏 API 拉取牌桌实时快照作为兜底
- **AND** 客户端 MUST NOT 本地补造缺失公开事件或跳过服务端权威状态

#### Scenario: 首次进入和断线重连
- **WHEN** 客户端首次进入牌桌或断线后恢复
- **THEN** 客户端 MUST 建立或恢复 socket 订阅并获取最新权威快照、当前事件和自身是否仍属于必需回执客户端
- **AND** 当自身仍需回执时客户端 MUST 播放当前事件并提交动画完成回执

#### Scenario: 响应窗口期间保持动作选项可见性
- **WHEN** 服务端下发存在响应窗口的公共状态
- **THEN** 公共状态 MUST 保持响应窗口摘要正确
- **AND** 私密通道 MUST 仅向有权玩家下发本人响应选项
- **AND** 动画等待状态 MUST 不影响响应窗口的 UI 显示

### Requirement: 私密手牌保密下发
系统 SHALL 保证每位玩家只能获取自己的私密信息（如手牌和本人响应按钮）。私密手牌与私密响应动作 MUST 仅通过按 OPENID 鉴权的通道下发给本人；公共状态文档 MUST NOT 包含其他玩家的手牌明细、响应按钮、可胡信息或候选动作明细。

#### Scenario: 玩家获取本人手牌
- **WHEN** 玩家需要查看或操作自己的手牌
- **THEN** 系统 MUST 仅向该玩家本人下发其手牌
- **AND** 其他玩家 MUST NOT 能从公共状态读取到该玩家手牌

#### Scenario: 玩家获取本人响应按钮
- **WHEN** 并发响应窗口中某玩家拥有合法响应动作
- **THEN** 系统 MUST 仅向该玩家本人下发其可选响应按钮和必要参数
- **AND** 其他玩家 MUST NOT 能读取该玩家是否可胡、可碰、可招、可踏或可吃的具体动作明细

#### Scenario: 公共状态不含他人手牌
- **WHEN** 客户端订阅牌桌公共状态
- **THEN** 公共状态 MUST NOT 包含任何玩家的私密手牌明细
- **AND** 仅 MUST 包含各玩家的公开信息（如已亮出的凑牌、弃牌、分数）

### Requirement: 操作意图上报
系统 SHALL 让客户端以「操作意图」形式把玩家动作上报服务端，而不是本地直接执行。客户端 MUST 通过 WebSocket 把出牌、吃、碰、招、踏、胡、过、接庄、不接庄等动作作为意图提交，并在服务端权威确认后才反映为最终状态；并发响应窗口内多个玩家 MAY 同时提交响应意图，服务端 MUST 对这些意图执行身份校验、版本校验、窗口校验和规则裁决。WebSocket 入口 MUST 复用服务端权威状态机、身份校验、版本校验和规则裁决。

#### Scenario: 上报出牌意图
- **WHEN** 玩家在自己回合选择打出一张牌且 socket 可用
- **THEN** 客户端 MUST 把该出牌意图通过 socket 上报服务端
- **AND** 客户端 MUST 等待服务端下发的权威状态来确认该出牌结果

#### Scenario: 上报并发响应意图
- **WHEN** 玩家在并发响应窗口中选择吃、碰、招、踏、胡或过
- **THEN** 客户端 MUST 把该响应意图通过 socket 上报服务端
- **AND** 客户端 MUST 等待服务端权威裁决确认该响应是否最终生效

#### Scenario: 意图被拒绝的反馈
- **WHEN** 服务端拒绝某个操作意图
- **THEN** 客户端 MUST 保持服务端权威状态显示不变
- **AND** 客户端 MUST 向玩家展示对应的拒绝提示

#### Scenario: 提前裁决取消本地按钮
- **WHEN** 服务端已经裁决同一响应窗口且当前玩家的响应未胜出或未提交
- **THEN** 客户端 MUST 收起本地响应按钮并显示最新权威状态
- **AND** 客户端 MUST NOT 继续提交已失效的响应意图

#### Scenario: socket 不可用时禁止提交意图
- **WHEN** 玩家需要提交操作但 socket 通道不可用
- **THEN** 客户端 MUST 显示等待重连提示并保持服务端权威状态显示不变
- **AND** 客户端 MUST NOT 通过 HTTPS 游戏 API 或云函数提交该操作意图

### Requirement: 断线重连恢复
系统 SHALL 支持玩家断线后通过 WebSocket 重连并恢复当前牌局视图。客户端重连后 MUST 重新建立 WebSocket 连接、完成鉴权、订阅原房间，并从服务端获取当前权威状态与本人手牌；服务端 MUST 在玩家掉线期间保留其牌局状态并向同桌玩家展示该玩家离线。若掉线期间服务端已自动推进到新的权威状态，重连玩家 MUST 直接看到最新牌局情况。

#### Scenario: 重连恢复牌局
- **WHEN** 玩家断线后重新进入同一牌局
- **THEN** 客户端 MUST 重新建立 socket 连接并拉取最新权威公共状态与本人手牌
- **AND** 玩家 MUST 看到与当前牌局一致的视图

#### Scenario: 掉线期间状态保留
- **WHEN** 玩家在牌局进行中掉线
- **THEN** 服务端 MUST 保留该玩家在牌局中的状态并标记该玩家离线
- **AND** 服务端 MUST 在重连后允许其继续参与，或在超时后按托管规则处理

#### Scenario: 重连失败保持等待
- **WHEN** 客户端无法恢复 WebSocket 连接
- **THEN** 客户端 MUST 保持重连流程
- **AND** 客户端 MUST NOT 通过 HTTPS 游戏 API 拉取最新权威快照、提交操作或提交动画回执
- **AND** 客户端 MUST NOT 通过本地推断继续推进牌局

#### Scenario: 重连显示最新状态
- **WHEN** 玩家断线期间牌局已因自动摸牌、自动出牌或其他无需手动选择的动作继续推进
- **THEN** 重连后的客户端 MUST 显示最新权威状态和本人手牌
- **AND** 客户端 MUST NOT 等待或补播掉线期间已不再需要本人回执的旧动画

### Requirement: 动画完成回执同步
系统 SHALL 提供按 OPENID 鉴权且幂等的动画完成回执操作。客户端 MUST 通过 WebSocket 在动画管理器完成当前权威公开事件规定的全部必需阶段后提交对应 `eventSeq`；本地预演完成、动画开始或尚未完成的移动阶段 MUST NOT 被视为权威动画完成。服务端 MUST 同步当前必需回执名单、已回执名单和回执截止时间，并 MUST 在玩家断线或超时后将其从当前必需回执名单移除。非最终动画回执 MUST 只更新当前事件的私有回执进度，MUST NOT 推进牌桌公共版本或生成面向全房间的增量广播。`await-response` 出现牌事件在入场动画完成且等待牌已保留时即可回执；`auto-discard` 出现牌事件必须在归位和静态 mini 牌交接完成后回执；完整凑牌事件必须在牌组到达凑牌区并完成静态交接后回执。当 socket 回执失败时，客户端 MUST 等待 socket 重连后重试同一 `eventSeq`，MUST NOT 通过云函数兜底提交回执。

#### Scenario: 等待响应出现牌回执
- **WHEN** 客户端完成 `await-response` 出现牌的入场动画并将其转为保留等待牌
- **THEN** 客户端 MUST 提交包含当前 `eventSeq` 的动画完成回执
- **AND** 保留等待牌继续显示 MUST NOT 阻止该回执

#### Scenario: 自动归位出现牌回执
- **WHEN** 客户端完成 `auto-discard` 出现牌的入场、缩小移动和静态 mini 牌交接
- **THEN** 客户端 MUST 提交包含当前 `eventSeq` 的动画完成回执
- **AND** 客户端 MUST NOT 在归位完成前提交该回执

#### Scenario: 完整凑牌动画回执
- **WHEN** 完整凑牌牌组已到达目标凑牌区并完成静态牌组交接
- **THEN** 客户端 MUST 提交包含当前 `eventSeq` 的动画完成回执
- **AND** 客户端 MUST NOT 在中央展示或飞入阶段提交该回执

#### Scenario: 本地预演确认后回执
- **WHEN** 当前权威事件确认了正在播放或已经播放部分阶段的本地预演
- **THEN** 客户端 MUST 复用该预演并完成权威事件要求的剩余动画阶段
- **AND** 客户端 MUST 仅在权威动画完成通知触发后提交对应 `eventSeq` 回执

#### Scenario: 非必需客户端不阻塞
- **WHEN** 客户端在事件发布时已经掉线、托管或不属于当前真人牌桌玩家
- **THEN** 服务端 MUST NOT 将该客户端加入必需回执名单
- **AND** 该客户端 MUST NOT 阻塞牌局推进

#### Scenario: 断线玩家移出回执名单
- **WHEN** 当前公开事件等待回执期间某个必需客户端断线或超时
- **THEN** 服务端 MUST 将该玩家从当前必需回执名单移除
- **AND** 剩余回执条件满足后服务端 MUST 继续牌局推进

#### Scenario: 旧事件回执被忽略
- **WHEN** 客户端提交的动画回执序号早于当前待确认事件
- **THEN** 服务端 MUST 幂等忽略该回执
- **AND** 当前动画等待状态 MUST 保持正确

#### Scenario: 部分回执不推进公共版本
- **WHEN** 当前公开事件仍有其他必需客户端尚未完成动画回执
- **THEN** 服务端 MUST 只记录该客户端已回执
- **AND** 服务端 MUST NOT 增加房间公共 `version`
- **AND** 服务端 MUST NOT 发送要求其他客户端按新 `baseVersion` 应用的增量 delta

#### Scenario: 取消动画不得回执
- **WHEN** 当前动画因权威事件不匹配、状态恢复或场景退出被取消
- **THEN** 客户端 MUST NOT 因该动画的旧完成回调提交回执
- **AND** 客户端 MUST 依据最新权威事件决定是否播放并回执

#### Scenario: socket 回执失败等待重连
- **WHEN** 客户端通过 socket 提交动画完成回执失败或连接中断
- **THEN** 客户端 MUST 等待 socket 重连后重试同一 `eventSeq`
- **AND** 客户端 MUST NOT 通过云函数兜底路径提交该回执

### Requirement: 出现牌动画分支同步
系统 SHALL 通过权威公开事件同步出现牌动画分支，并 MUST 保证客户端使用与权威快照一致的最终弃牌和凑牌目标完成视觉交接。

#### Scenario: 同步等待响应分支
- **WHEN** 服务端发布 `appearanceResolution` 为 `await-response` 的出现牌事件
- **THEN** 所有客户端 MUST 播放相同的出现牌入场动画并保留等待牌
- **AND** 客户端 MUST NOT 根据本地规则改为自动归位分支

#### Scenario: 同步自动归位分支
- **WHEN** 服务端发布 `appearanceResolution` 为 `auto-discard` 的出现牌事件
- **THEN** 所有客户端 MUST 使用权威快照中的最终弃牌槽位播放自动归位
- **AND** 所有客户端 MUST 在动画完成前隐藏对应静态 mini 弃牌

### Requirement: 发起者与旁观者差异化动画同步
实时同步系统 SHALL 使用服务端权威公开事件作为在线吃、碰、招、踏动作的唯一最终动画来源。动作发起者在点击响应动作后 MUST 只提交操作意图并进入等待态，MUST NOT 在服务端确认前完成凑牌动画或移除手牌；服务端确认后，动作发起者和其他玩家 MUST 使用同一权威事件播放凑牌动画。

#### Scenario: 发起者等待权威凑牌事件
- **WHEN** 动作发起者点击吃、碰、招或踏响应动作
- **THEN** 客户端 MUST 提交响应意图并进入等待态
- **AND** 客户端 MUST NOT 在收到服务端权威凑牌事件前完成凑牌动画或移除手牌

#### Scenario: 发起者收到自己的权威事件
- **WHEN** 动作发起者收到座位匹配的权威凑牌事件
- **THEN** 客户端 MUST 根据该事件移除本机手牌并播放凑牌动画
- **AND** 动画完成后 MUST 提交对应事件的动画回执

#### Scenario: 旁观者播放权威动作
- **WHEN** 其他玩家客户端收到权威凑牌事件
- **THEN** 客户端 MUST 播放一次完整权威动画并在完成后回执
- **AND** 发起者点击时是否存在 pending intent MUST NOT 影响旁观者动画

### Requirement: 动作确认与动画完成双条件回执
客户端 SHALL 仅在收到服务端权威事件并完成该权威事件要求的动画后提交动画完成回执。每个客户端对同一 `eventSeq` MUST 最多提交一次有效完成回执；确认前的点击、按钮反馈或 pending intent MUST NOT 被视为权威动画完成。

#### Scenario: 权威事件动画完成后回执
- **WHEN** 客户端已经收到权威事件并完成对应动画
- **THEN** 客户端 MUST 提交一次当前 `eventSeq` 的动画完成回执
- **AND** 客户端 MUST NOT 因点击响应动作时的 pending intent 提前回执

#### Scenario: 重复权威事件和回执重试
- **WHEN** 客户端重复收到同一权威事件或需要重试动画完成回执
- **THEN** 客户端 MUST 保持该动作已播放状态
- **AND** 客户端 MUST NOT 重播动画、重复音效或生成额外完成通知

### Requirement: 稳定牌编码
实时同步系统 SHALL 使用稳定牌编码表达在线牌局中的牌。`symbolCode` MUST 按固定规则表中的 24 种字顺序编码，`cardCode` MUST 能唯一表示一副牌中的 144 张具体牌，且客户端和服务端 MUST 对编码往返保持一致。

#### Scenario: symbolCode 映射字
- **WHEN** codec 收到任一 `symbolCode`
- **THEN** 系统 MUST 将其映射到固定的牌字、句子、位置和颜色
- **AND** 同一 `symbolCode` 在客户端和服务端 MUST 表示同一种字

#### Scenario: cardCode 映射具体牌
- **WHEN** codec 收到任一合法 `cardCode`
- **THEN** 系统 MUST 还原出对应 `symbolCode` 与 copy 序号
- **AND** 还原后的牌 id MUST 与现有 `key-copy` 语义一致

### Requirement: 稳定动作编码
实时同步系统 SHALL 使用稳定动作编码表达出牌、吃、碰、招、踏、胡、过、接庄、不接庄和交牌等动作。动作编码 MUST 与显示文案解耦，客户端 MUST 使用本地资源和规则表渲染动作文案与动画。

#### Scenario: 解码动作类型
- **WHEN** 客户端收到一个动作编码
- **THEN** 客户端 MUST 将其映射到唯一动作语义
- **AND** 客户端 MUST NOT 依赖服务端下发的中文动作文案决定规则或动画分支

#### Scenario: 未知动作编码
- **WHEN** 客户端收到未知动作编码
- **THEN** 客户端 MUST 拒绝应用该实时增量
- **AND** 客户端 MUST 通过 socket 请求完整快照或重新订阅恢复

### Requirement: 增量牌桌状态流
实时同步系统 SHALL 在正常牌局推进中优先通过权威事件和增量 delta 更新客户端状态。完整快照 MUST 保留用于首次进入、发牌后初始化、断线重连、事件缺口恢复、未知编码恢复和客户端无法应用增量时的状态校正。增量 delta MAY 包含面向单个连接的私有补丁；私有补丁 MUST 只包含该连接玩家本人可见的信息。

#### Scenario: 首次订阅返回快照
- **WHEN** 客户端首次订阅正在进行的牌桌
- **THEN** 服务端 MUST 通过 socket 返回包含公共状态、本人手牌、本人可用响应动作和动画状态的完整快照
- **AND** 客户端 MUST 以该快照初始化本地权威镜像

#### Scenario: 正常推进发送增量
- **WHEN** 服务端裁决一次普通牌局动作并推进版本
- **THEN** 服务端 SHOULD 向已订阅客户端发送权威事件或增量 delta
- **AND** 服务端 SHOULD NOT 为每个连接重新下发完整快照，除非该变化无法安全增量表达

#### Scenario: 响应窗口增量携带本人动作
- **WHEN** 服务端通过增量 delta 下发并发响应窗口
- **THEN** 服务端 MUST 仅通过该连接的私有补丁下发本人响应动作
- **AND** 客户端 MUST 使用私有补丁恢复或清空本机响应按钮

#### Scenario: 增量无法应用时恢复快照
- **WHEN** 客户端发现增量的 `baseVersion`、`eventSeq`、codec version 或本地数据前置条件不满足
- **THEN** 客户端 MUST 停止应用该增量
- **AND** 客户端 MUST 通过 socket 重新订阅或请求完整快照恢复

### Requirement: 公开凑牌和弃牌追加同步
实时同步系统 SHALL 将各玩家公开凑牌区和弃牌区作为只增公开数据同步。普通牌局事件 MUST 通过 append meld、append discard 或明确的扩展事件更新这些公开数据；客户端 MUST NOT 通过重复完整公共状态替换作为正常同步路径。

#### Scenario: 追加弃牌
- **WHEN** 服务端确认某玩家打出或归位一张弃牌
- **THEN** 服务端 MUST 下发包含座位、牌字和弃牌追加位置的公开增量
- **AND** 客户端 MUST 将该牌追加到对应玩家弃牌区

#### Scenario: 追加凑牌
- **WHEN** 服务端确认某玩家吃、碰、招或踏形成公开凑牌
- **THEN** 服务端 MUST 下发包含座位、动作类型和最小凑牌字段的公开增量
- **AND** 客户端 MUST 将该凑牌追加或扩展到对应玩家凑牌区

#### Scenario: 只增数据不匹配
- **WHEN** 客户端发现公开凑牌区或弃牌区追加位置与本地状态不匹配
- **THEN** 客户端 MUST 拒绝应用该增量
- **AND** 客户端 MUST 请求完整快照恢复

### Requirement: 私密手牌边界同步
实时同步系统 SHALL 仅在发牌、首次进入、断线重连和快照恢复时向玩家下发完整私密手牌。正常出牌、吃、碰、招、踏导致的本机手牌减少 MUST 由对应权威事件在本机客户端本地应用；服务端 MUST NOT 在每次普通动作后向动作本人额外广播私密 hand delta，除非该动作不是由公开事件可确定的普通手牌减少。

#### Scenario: 发牌后下发完整手牌
- **WHEN** 新一局发牌完成且玩家进入牌桌
- **THEN** 服务端 MUST 仅向该玩家本人下发完整手牌
- **AND** 其他玩家 MUST 只能看到该玩家手牌数量

#### Scenario: 本机出牌减少手牌
- **WHEN** 客户端收到本机座位的权威出牌事件
- **THEN** 客户端 MUST 从本机手牌移除对应牌
- **AND** 客户端 MUST NOT 等待额外私密 hand delta 才更新手牌

#### Scenario: 本机凑牌减少手牌
- **WHEN** 客户端收到本机座位的权威吃、碰、招或踏事件
- **THEN** 客户端 MUST 根据动作语义从本机手牌移除对应牌字
- **AND** 客户端 MUST NOT 等待额外私密 hand delta 才更新手牌

#### Scenario: 重连恢复完整手牌
- **WHEN** 客户端断线重连或无法应用增量
- **THEN** 服务端 MUST 通过 socket 快照向该玩家本人下发完整手牌
- **AND** 客户端 MUST 以快照手牌替换本地私密手牌

### Requirement: 权威凑牌事件
实时同步系统 SHALL 使用服务端权威凑牌事件同步吃、碰、招、踏动作。权威凑牌事件 MUST 至少包含动作座位、动作类型和构造公开凑牌区所需的最小字段；同一事件 MUST 同时驱动动作本人和其他玩家客户端。

#### Scenario: 广播碰事件
- **WHEN** 服务端裁决某玩家碰一张出现牌胜出
- **THEN** 服务端 MUST 广播包含动作座位、`peng` 动作和对应 `symbolCode` 的权威凑牌事件
- **AND** 客户端 MUST 将该公开凑牌解释为 3 个同字

#### Scenario: 广播吃事件
- **WHEN** 服务端裁决某玩家吃一张出现牌胜出
- **THEN** 服务端 MUST 广播包含动作座位、`chi` 动作和对应 `phraseCode` 的权威凑牌事件
- **AND** 客户端 MUST 将该公开凑牌解释为该句完整 3 个字

#### Scenario: 广播招事件
- **WHEN** 服务端裁决某玩家招一张出现牌胜出
- **THEN** 服务端 MUST 广播包含动作座位、`zhao` 动作、对应 `symbolCode` 和最终 `count` 的权威凑牌事件
- **AND** `count` MUST 只用于招动作，且取值 MUST 为 4、5 或 6

#### Scenario: 动作本人应用权威凑牌事件
- **WHEN** 客户端收到权威凑牌事件且事件座位旋转后为本机座位
- **THEN** 客户端 MUST 根据权威事件从本机手牌移除对应牌字
- **AND** 客户端 MUST 播放与其他玩家一致的权威凑牌动画

#### Scenario: 其他玩家应用权威凑牌事件
- **WHEN** 客户端收到权威凑牌事件且事件座位不是本机座位
- **THEN** 客户端 MUST 播放该座位的凑牌动画
- **AND** 客户端 MUST 只追加公开凑牌区，不得修改本机私密手牌

### Requirement: 显式响应窗口同步协议
实时同步系统 SHALL 在快照和增量中使用显式响应窗口协议同步响应窗口公共摘要和本人私密动作。公共摘要 MUST 只包含窗口 id、来源、出现牌、等待席位、已决策席位、当前最佳选择摘要和仍阻塞裁决的席位；私密动作 MUST 只通过对应连接的私密快照或私密补丁发送给本人。

#### Scenario: 快照包含响应窗口摘要
- **WHEN** 客户端首次进入、断线重连或请求完整快照时服务端存在响应窗口
- **THEN** 快照公共状态 MUST 包含当前响应窗口摘要
- **AND** 快照私密状态 MUST 仅包含该客户端本人仍可操作的响应按钮

#### Scenario: 增量更新响应窗口摘要
- **WHEN** 响应窗口因玩家选择、过牌、托管、超时或提前裁决发生变化
- **THEN** 服务端 MUST 通过增量下发更新后的公共响应窗口摘要
- **AND** 服务端 MUST 通过每连接私密补丁更新或清空该连接玩家本人的响应按钮

#### Scenario: 公共摘要不泄露候选动作
- **WHEN** 服务端下发响应窗口公共摘要
- **THEN** 公共摘要 MUST NOT 包含任一玩家的完整候选动作列表、胡牌结果、手牌推导结果或动作参数
- **AND** 其他玩家 MUST NOT 能从公共摘要判断某个席位具体可胡、可碰、可招、可踏或可吃的细节

#### Scenario: 私密动作绑定窗口 id
- **WHEN** 服务端向玩家下发响应按钮
- **THEN** 私密状态 MUST 包含 `responseWindowId`
- **AND** 客户端提交响应意图时 MUST 能携带或匹配该窗口 id 以避免旧窗口误提交

### Requirement: 响应按钮可见性同步
实时同步系统 SHALL 使用服务端裁决后的私密动作状态控制客户端响应按钮可见性。只有仍处于当前响应窗口、尚未决策且仍可能影响裁决的玩家 MUST 收到可点击响应按钮；已经过牌、已经提交动作、被当前最佳选择淘汰或窗口已关闭的玩家 MUST 收到空动作列表或关闭状态。

#### Scenario: 玩家拥有可操作响应
- **WHEN** 当前连接玩家属于响应窗口候选席位
- **AND** 该玩家尚未决策且仍可能影响最终裁决
- **THEN** 服务端 MUST 在私密补丁中下发该玩家的合法响应按钮
- **AND** 客户端 MUST 显示这些按钮

#### Scenario: 玩家被当前最佳选择淘汰
- **WHEN** 当前连接玩家未决策
- **AND** 服务端已收到一个该玩家无法击败的当前最佳选择
- **THEN** 服务端 MUST 在私密补丁中清空该玩家的响应按钮
- **AND** 客户端 MUST 收起该玩家本地响应按钮

#### Scenario: 玩家已提交响应
- **WHEN** 当前连接玩家已经在响应窗口中提交动作或过牌
- **THEN** 服务端 MUST 不再向该玩家下发可点击响应按钮
- **AND** 客户端 MUST 显示等待裁决或收起按钮，而不是允许重复提交

#### Scenario: 响应窗口关闭
- **WHEN** 服务端裁决响应窗口并生成后续公开事件
- **THEN** 所有连接的私密补丁 MUST 清空该窗口响应按钮
- **AND** 所有客户端 MUST 停止展示该窗口按钮

### Requirement: 动画等待与响应窗口下发顺序
实时同步系统 SHALL 保证出现牌公开事件、动画回执和响应窗口开放的下发顺序一致。`await-response` 出现牌事件的响应窗口 MUST 在该出现牌事件动画屏障解除后才对客户端开放；响应窗口打开后，纯 UI 按钮变化 MUST NOT 建立公开动画屏障；响应窗口的最终结果公开事件 MUST 再次进入动画屏障。

#### Scenario: 等待响应出现牌先播放
- **WHEN** 服务端发布 `appearanceResolution=await-response` 的抓牌或出牌公开事件
- **THEN** 客户端 MUST 先收到并播放该公开事件
- **AND** 服务端 MUST 在该事件动画回执完成后才下发 active 响应窗口

#### Scenario: 响应按钮变化不阻塞全桌
- **WHEN** 响应窗口打开、按钮可用性更新或按钮因当前最佳选择而收起
- **THEN** 服务端 MUST NOT 为该纯 UI 变化创建新的公开动画事件
- **AND** 该变化 MUST 通过状态快照或增量同步给相关客户端

#### Scenario: 响应结果再次进入动画屏障
- **WHEN** 响应窗口以胜出动作或无人响应关闭
- **THEN** 服务端 MUST 发布对应公开事件
- **AND** 所有必需客户端 MUST 完成该公开事件动画回执后服务端才继续后续牌局推进

### Requirement: 响应窗口恢复一致性
实时同步系统 SHALL 支持客户端在响应窗口期间断线、重连和增量恢复。客户端恢复时 MUST 以最新快照的公开事件、响应窗口摘要和本人私密动作作为唯一依据；客户端 MUST NOT 补播已经不再需要回执的旧按钮动画或重新提交已关闭窗口的响应意图。

#### Scenario: 重连后窗口仍 active
- **WHEN** 客户端重连时服务端响应窗口仍处于 active 状态
- **THEN** 服务端 MUST 在快照中返回当前响应窗口摘要和该玩家当前私密动作状态
- **AND** 客户端 MUST 按快照显示或清空本人按钮

#### Scenario: 重连后窗口已关闭
- **WHEN** 客户端重连时原响应窗口已经关闭
- **THEN** 服务端快照 MUST 不再返回该窗口的响应按钮
- **AND** 客户端 MUST 清理本地旧窗口按钮和 pending intent

#### Scenario: 旧窗口响应意图被拒绝
- **WHEN** 客户端因延迟或重连提交了旧 `responseWindowId` 的响应意图
- **THEN** 服务端 MUST 拒绝该意图
- **AND** 客户端 MUST 根据最新快照或增量恢复当前权威状态

### Requirement: 权威状态与可播放事件分离消费
实时同步系统 SHALL 允许客户端把通过 snapshot 或 delta 收到的权威状态与公开事件分开消费。客户端 MUST 立即保存最新权威状态用于版本校验、操作可用性和重连恢复，但公开桌面事件 MUST 通过客户端时间线队列按序播放或跳过后再影响显示状态。结果类 delta MUST 提供或携带足以构建完整权威结果和显示 checkpoint 的数据。

#### Scenario: snapshot 同时包含结果状态和结果事件
- **WHEN** 服务端下发的 snapshot 同时包含 `phase=result` 和当前结果类 `publicEvent`
- **THEN** 客户端 MUST 保存该权威状态
- **AND** 客户端 MUST 通过时间线处理该 `publicEvent` 后再把结果状态提交为可见显示状态

#### Scenario: delta 同时包含结果阶段和结果事件
- **WHEN** 服务端下发的 WebSocket delta 同时包含结果类事件、`phase=result` 补丁和事件对应的结果数据
- **THEN** 客户端 MUST 将完整结果保存到权威状态镜像
- **AND** 客户端 MUST NOT 直接用该补丁把当前可见阶段切换为 `result`
- **AND** 客户端 MUST 把完整结果状态绑定到该事件的显示 checkpoint

#### Scenario: 结果 delta 完成后提交
- **WHEN** 客户端完成、快进或跳过由结果 delta 创建的 `hu`、`circle-loss` 或 `draw-round` 时间线事件
- **THEN** 客户端 MUST 提交该事件绑定的完整结果显示状态
- **AND** 提交的 `result.type` 和结算数据 MUST 与服务端权威结果一致

#### Scenario: 结果 delta 无法构建 checkpoint
- **WHEN** 结果类 delta 缺失结果数据或客户端无法由其重建有效显示 checkpoint
- **THEN** 客户端 MUST 请求重新订阅或恢复最新权威快照
- **AND** 客户端 MUST NOT 本地猜测结果类型或把缺失结果解释为荒庄

#### Scenario: 私密响应动作不等待结果落屏
- **WHEN** 服务端下发本人可响应动作和当前等待响应公开事件
- **THEN** 客户端 MUST 能使用私密动作更新本人响应 UI
- **AND** 客户端 MUST NOT 因桌面显示状态尚未完全提交而丢失或隐藏合法响应按钮

### Requirement: 增量事件进入客户端时间线
实时同步系统 SHALL 通过 snapshot 和 delta 提供足以让客户端时间线排队消费的事件序号、事件内容和权威状态补丁。客户端发现事件缺口、版本缺口或无法重建显示 checkpoint 时 MUST 重新订阅恢复最新权威快照，而不是本地补造事件。

#### Scenario: 连续 delta 入队
- **WHEN** 客户端按版本连续收到多个带 `eventSeq` 的 delta
- **THEN** 客户端 MUST 将这些事件按 `eventSeq` 进入时间线队列
- **AND** 客户端 MUST 按每个事件对应的状态补丁生成显示状态提交点

#### Scenario: 事件缺口恢复
- **WHEN** 客户端收到的 `eventSeq` 跳过了尚未消费的事件
- **THEN** 客户端 MUST 触发 socket 重新订阅或快照恢复
- **AND** 客户端 MUST NOT 本地猜测缺失事件并播放动画

#### Scenario: stateOnly 不生成新动画
- **WHEN** 客户端收到 `stateOnly` 增量
- **THEN** 客户端 MUST 更新权威镜像和必要私密状态
- **AND** 客户端 MUST NOT 为该增量创建新的权威桌面动画事件

### Requirement: 重连恢复跳过非必需历史动画
实时同步系统 SHALL 在客户端重连后提供当前权威状态、当前公开事件和本客户端是否仍属于必需回执方。客户端不再属于当前事件必需回执方时，MUST 直接恢复最新状态，不得要求其补播旧动画。

#### Scenario: 重连玩家不再需要回执
- **WHEN** 玩家断线期间牌局已经推进，且重连 snapshot 标记当前事件对该玩家 `selfAcked` 或非必需
- **THEN** 客户端 MUST 直接对齐最新权威状态
- **AND** 客户端 MUST NOT 补播断线期间已经结束的动画

#### Scenario: 重连玩家仍需响应
- **WHEN** 玩家重连时当前权威状态仍处于本人可响应窗口
- **THEN** 客户端 MUST 恢复当前等待响应牌和本人响应按钮
- **AND** 客户端 MUST 允许本人继续提交合法响应或过牌

### Requirement: 动画降级信号
实时同步系统 MAY 在快照或增量中下发动画降级信息，用于提示客户端缩短或跳过非关键动画。降级信息 MUST NOT 改变权威规则裁决；客户端即使未收到降级信息，也 MUST 能基于本地队列积压和重连状态执行安全快进。

#### Scenario: 服务端提示非关键动画降级
- **WHEN** 房间存在离线玩家、动画屏障超时或服务端判断需要加快播放
- **THEN** 服务端 MAY 下发动画降级提示
- **AND** 客户端 MUST 只将该提示用于动画时长和跳过策略，不得改变权威牌局状态

#### Scenario: 客户端本地积压快进
- **WHEN** 客户端未收到服务端降级提示但本地时间线积压超过阈值
- **THEN** 客户端 MAY 快进或跳过非关键动画
- **AND** 客户端 MUST 继续遵守响应关键事件和 ACK 幂等规则

### Requirement: 跳过权威事件仍应用视觉语义
实时同步客户端 SHALL 将“是否播放权威事件动画”与“是否应用该事件的最终视觉语义”分离。客户端因非必需回执、`selfAcked`、重连积压、已播放去重或快照对齐而跳过事件动画时，MUST 仍完成该事件要求的本地临时视觉收尾，并 MUST 保持事件序号、回执和动画去重语义不变。

#### Scenario: 非动作真人跳过凑牌动画
- **WHEN** 双真人或多真人房间中的一个真人客户端收到其他真人的吃、碰、招或踏事件
- **AND** 服务端标记该客户端对当前事件 `selfAcked=true`
- **THEN** 客户端 MUST 跳过不要求其观看的完整动画
- **AND** 客户端 MUST 移除已经被该凑牌动作消费的 retained 出现牌
- **AND** 客户端 MUST NOT 生成额外动画回执或重复音效

#### Scenario: 重连积压跳过无人响应事件
- **WHEN** 客户端在重连或时间线积压期间跳过 `unclaimed` 事件的播放
- **THEN** 客户端 MUST 结束对应 retained 出现牌的等待状态并与权威弃牌状态对齐
- **AND** 客户端 MUST 继续按现有规则记账或回执该事件

#### Scenario: 跳过终局事件清理桌面
- **WHEN** 客户端通过去重、快照恢复或免回执路径接收进圈、流局或结算结果
- **THEN** 客户端 MUST 清理上一响应窗口遗留的动画视觉
- **AND** 客户端 MUST 直接显示权威结果状态而不得重放已消费事件

#### Scenario: 跳过过牌事件不提前释放
- **WHEN** 客户端跳过一个 `pass` 事件且权威响应窗口仍然有效
- **THEN** 客户端 MUST 保留当前 retained 出现牌
- **AND** 客户端 MUST 等待最终归位、消费或结果事件再清理

### Requirement: 结果阶段公开冻结牌况
实时同步系统 SHALL 在权威牌局进入 `phase=result` 后向本局玩家公开冻结的 `roundDetail`，其中包含四名玩家的最终剩余手牌、公开牌组、本局分数和胡牌玩家最终胡数。胡牌结果中，赢家详情 MUST 额外包含从权威 `result.card` 与 `result.doors` 冻结的最后胡牌和完整胡牌分组；完整胡牌分组 MUST 包含最后胡牌，最后胡牌字段 MUST 允许客户端将同一张牌再次显示为独立“胡”列。系统 MUST 保证非结果阶段的公共 snapshot 与 delta 继续只公开其他玩家的手牌数量，不得携带其完整手牌。

#### Scenario: 进行中不公开对手手牌
- **WHEN** 权威牌局尚未进入 `phase=result`
- **THEN** 公共 snapshot 和 delta MUST NOT 包含其他玩家的完整手牌
- **AND** 现有本人私密手牌下发边界 MUST 保持不变

#### Scenario: 结果阶段公开四家最终手牌
- **WHEN** 权威牌局已经进入 `phase=result`
- **THEN** 公共状态 MUST 包含与当前局号绑定的四家冻结最终牌况
- **AND** 每家详情 MUST 包含座位、最终剩余手牌、公开牌组和本局分数
- **AND** 只有胡牌赢家的详情 MAY 包含最终胡数

#### Scenario: 胡牌结果冻结最后胡牌和完整分组
- **WHEN** 服务端完成胡牌裁决并构造 `roundDetail`
- **THEN** 赢家详情 MUST 包含与权威 `result.card` 一致的 `winningCard`
- **AND** 赢家详情 MUST 包含由权威 `result.doors` 和冻结牌对象构成的 `winningGroups`
- **AND** `finalHand` 或 `winningGroups` 中的完整胡牌牌型 MUST 继续包含 `winningCard`
- **AND** 服务端 MUST NOT 为非赢家或非胡牌结果伪造最后胡牌
- **AND** 赢家详情 MUST 包含来自权威结果的 `huGrade`
- **AND** 非赢家的 `huGrade` MUST 为空

#### Scenario: 吃上胡的冻结结果不去重
- **WHEN** 权威胡牌分组包含以“上”完成的“上大人”吃牌句子
- **THEN** `winningGroups` MUST 包含完整的“上大人”牌组及“吃”语义
- **AND** `winningCard` MUST 另行指向“上”牌
- **AND** 冻结结果 MUST NOT 因两处引用同一张牌而删除任一展示语义

#### Scenario: 冻结结果保留碰招踏语义
- **WHEN** 服务端将权威胡牌门转换为 `winningGroups`
- **THEN** 三张同字门 MUST 标记为“碰”
- **AND** 四张及以上同字门 MUST 标记为“招”
- **AND** `meldType` 为 `ta` 的公开门 MUST 标记为“踏”
- **AND** 服务端 MUST NOT 将招或踏统一标记为“碰”

#### Scenario: 冻结结果区分对门和口门
- **WHEN** 服务端将权威胡牌门转换为 `winningGroups`
- **THEN** `xx` 门 MUST 标记为“对”
- **AND** `xy` 门 MUST 标记为“口”
- **AND** 服务端 MUST NOT 将 `xy` 门标记为“对”

#### Scenario: 结果增量和重连保持胡牌详情
- **WHEN** 客户端通过结果 delta、完整 snapshot 或重连恢复接收同一局 `roundDetail`
- **THEN** `winningCard` 和 `winningGroups` MUST 保持一致
- **AND** 客户端座位旋转 MUST 只调整玩家 seat，不得改变胡牌对象或分组牌序
- **AND** `huGrade` MUST 在结果 delta、完整 snapshot 和重连恢复之间保持一致

#### Scenario: 下一局清除上一局牌况
- **WHEN** 所有真人确认后服务端开始下一局
- **THEN** 新局公共状态 MUST 不再包含上一局的 `roundDetail`
- **AND** 其他玩家的新局手牌 MUST 恢复为仅公开数量

#### Scenario: 结果详情等待终局动画提交
- **WHEN** 客户端先收到 `phase=result` 和 `roundDetail`，但对应终局事件仍在时间线播放
- **THEN** 客户端 MUST 暂存权威结果详情
- **AND** 客户端 MUST 在终局事件完成、快进或跳过的显示提交点才展示全屏结果页

### Requirement: 下一局确认状态实时同步
实时同步系统 SHALL 向每名房间玩家下发当前局的继续确认摘要，并 MUST 通过 snapshot、delta 和重连恢复保持所需真人、已确认真人及本人确认状态一致。确认状态 MUST 与局号绑定，重复或迟到请求不得错误开启下一局。

#### Scenario: 玩家确认后广播等待状态
- **WHEN** 一名真人点击“继续下一局”且仍有其他真人未确认
- **THEN** 服务端 MUST 幂等记录该玩家确认
- **AND** 所有客户端 MUST 收到更新后的已确认人数或座位摘要
- **AND** 已确认客户端 MUST 禁止重复提交但继续显示结果详情

#### Scenario: 重连恢复结果与确认状态
- **WHEN** 玩家在结果详情阶段断线并重新连接
- **THEN** 服务端 MUST 返回同一局冻结的 `roundDetail`
- **AND** 客户端 MUST 恢复该玩家是否已经确认及其他玩家的等待状态

#### Scenario: 拒绝迟到的上一局确认
- **WHEN** 服务端收到绑定旧局号的继续确认请求
- **THEN** 服务端 MUST 拒绝或幂等忽略该请求
- **AND** 当前局状态 MUST NOT 因该请求推进

