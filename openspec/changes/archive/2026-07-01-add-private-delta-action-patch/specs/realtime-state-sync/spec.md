## MODIFIED Requirements

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

### Requirement: 动画完成回执同步
系统 SHALL 提供按 OPENID 鉴权且幂等的动画完成回执操作。客户端 MUST 通过 WebSocket 在动画管理器完成当前权威公开事件规定的全部必需阶段后提交对应 `eventSeq`；本地预演完成、动画开始或尚未完成的移动阶段 MUST NOT 被视为权威动画完成。服务端 MUST 同步当前必需回执名单、已回执名单和回执截止时间，并 MUST 在玩家断线或超时后将其从当前必需回执名单移除。非最终动画回执 MUST 只更新当前事件的私有回执进度，MUST NOT 推进牌桌公共版本或生成面向全房间的增量广播。`await-response` 出现牌事件在入场动画完成且等待牌已保留时即可回执；`auto-discard` 出现牌事件必须在归位和静态 mini 牌交接完成后回执；完整凑牌事件必须在牌组到达凑牌区并完成静态交接后回执。当 socket 回执失败时，客户端 MUST 等待 socket 重连后重试同一 `eventSeq`，MUST NOT 通过云函数兜底提交回执。

#### Scenario: 部分回执不推进公共版本
- **WHEN** 当前公开事件仍有其他必需客户端尚未完成动画回执
- **THEN** 服务端 MUST 只记录该客户端已回执
- **AND** 服务端 MUST NOT 增加房间公共 `version`
- **AND** 服务端 MUST NOT 发送要求其他客户端按新 `baseVersion` 应用的增量 delta
