## MODIFIED Requirements

### Requirement: 断线重连恢复
系统 SHALL 支持玩家断线后通过 WebSocket 重连并恢复当前牌局视图。客户端重连后 MUST 重新建立 WebSocket 连接、完成鉴权、订阅原房间，并从服务端获取当前权威状态与本人手牌；服务端 MUST 在玩家掉线期间保留其牌局状态并向同桌玩家展示该玩家离线。客户端无法恢复 WebSocket 连接时 MUST 停留在等待重连状态，MUST NOT 使用 HTTPS API 或云函数快照恢复路径继续实时同步。若掉线期间服务端已自动推进到新的权威状态，重连玩家 MUST 直接看到最新牌局情况。

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
- **THEN** 客户端 MUST 保持等待重连状态
- **AND** 客户端 MUST NOT 使用 HTTPS API 或云函数快照接口恢复当前牌局视图

#### Scenario: 重连显示最新状态
- **WHEN** 玩家断线期间牌局已因自动摸牌、自动出牌或其他无需手动选择的动作继续推进
- **THEN** 重连后的客户端 MUST 显示最新权威状态和本人手牌
- **AND** 客户端 MUST NOT 等待或补播掉线期间已不再需要本人回执的旧动画

### Requirement: 动画完成回执同步
系统 SHALL 提供按 OPENID 鉴权且幂等的动画完成回执操作。客户端 MUST 通过 WebSocket 在动画管理器完成当前权威公开事件规定的全部必需阶段后提交对应 `eventSeq`；本地预演完成、动画开始或尚未完成的移动阶段 MUST NOT 被视为权威动画完成。服务端 MUST 同步当前必需回执名单、已回执名单和回执截止时间，并 MUST 在玩家断线或超时后将其从当前必需回执名单移除。`await-response` 出现牌事件在入场动画完成且等待牌已保留时即可回执；`auto-discard` 出现牌事件必须在归位和静态 mini 牌交接完成后回执；完整凑牌事件必须在牌组到达凑牌区并完成静态交接后回执。当 socket 回执失败时，客户端 MUST 等待 socket 重连后重试同一 `eventSeq`，MUST NOT 通过云函数兜底提交回执。

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

#### Scenario: 取消动画不得回执
- **WHEN** 当前动画因权威事件不匹配、状态恢复或场景退出被取消
- **THEN** 客户端 MUST NOT 因该动画的旧完成回调提交回执
- **AND** 客户端 MUST 依据最新权威事件决定是否播放并回执

#### Scenario: socket 回执失败等待重连
- **WHEN** 客户端通过 socket 提交动画完成回执失败或连接中断
- **THEN** 客户端 MUST 等待 socket 重连后重试同一 `eventSeq`
- **AND** 客户端 MUST NOT 通过云函数兜底路径提交该回执
