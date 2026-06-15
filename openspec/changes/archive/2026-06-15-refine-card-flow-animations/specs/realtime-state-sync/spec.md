## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: 动画完成回执同步
系统 SHALL 提供按 OPENID 鉴权且幂等的动画完成回执操作。客户端 MUST 在动画管理器完成当前权威公开事件规定的全部必需阶段后提交对应 `eventSeq`；本地预演完成、动画开始或尚未完成的移动阶段 MUST NOT 被视为权威动画完成。服务端 MUST 同步当前必需回执名单、已回执名单和回执截止时间。`await-response` 出现牌事件在入场动画完成且等待牌已保留时即可回执；`auto-discard` 出现牌事件必须在归位和静态 mini 牌交接完成后回执；完整凑牌事件必须在牌组到达凑牌区并完成静态交接后回执。

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

#### Scenario: 旧事件回执被忽略
- **WHEN** 客户端提交的动画回执序号早于当前待确认事件
- **THEN** 服务端 MUST 幂等忽略该回执
- **AND** 当前动画等待状态 MUST 保持正确

#### Scenario: 取消动画不得回执
- **WHEN** 当前动画因权威事件不匹配、状态恢复或场景退出被取消
- **THEN** 客户端 MUST NOT 因该动画的旧完成回调提交回执
- **AND** 客户端 MUST 依据最新权威事件决定是否播放并回执
