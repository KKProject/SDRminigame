## MODIFIED Requirements

### Requirement: 牌桌生命周期与座位管理
系统 SHALL 由服务端维护牌桌的生命周期状态（等待、进行中、单局结算、最终结果、关闭）与座位归属。系统 MUST 保证一名玩家最多占用一张 `waiting`、`playing` 或 `finished` 牌桌；`tableResult` 仅供仍停留在最终结果流程中的玩家查看结果、退出或按规则同意重开，不得作为玩家重新启动后的可恢复房间，也不得阻塞玩家创建新房间。牌桌关闭后 MUST 释放其占用的匹配/座位资源。

#### Scenario: 满座开局
- **WHEN** 牌桌座位全部就位且满足开局条件
- **THEN** 服务端 MUST 将牌桌状态置为进行中并触发开局
- **AND** 各客户端 MUST 收到开局后的初始权威状态

#### Scenario: 单局结束仍属于当前房间
- **WHEN** 一局结束但当前局数小于 `settings.maxRounds`
- **THEN** 服务端 MUST 将房间状态同步为 `finished`
- **AND** 该房间 MUST 继续占用玩家当前房间资格并允许开启下一局

#### Scenario: 终局玩家回大厅后释放占用
- **WHEN** 房间处于 `tableResult` 且玩家重新启动进入大厅或确认创建新房间
- **THEN** 服务端 MUST 释放该玩家在终局房间中的成员占用
- **AND** 该终局房间 MUST NOT 阻塞玩家创建新房间

#### Scenario: 牌局结束后关闭
- **WHEN** 最终结果房间无人继续、房主离开、剩余真人不足或续局决策超时
- **THEN** 服务端 MUST 将牌桌置为关闭状态
- **AND** 服务端 MUST 释放该牌桌相关的座位与匹配资源

### Requirement: 查询玩家未结束牌桌
系统 SHALL 允许已登录玩家通过自有 HTTPS 游戏 API 查询自己是否参与了可恢复牌桌。服务端 MUST 以访问 token 解析出的 `OPENID` 为身份来源，并 MUST 只返回该玩家所在且状态为 `waiting`、`playing` 或 `finished` 的牌桌信息；`tableResult` 和 `closed` MUST 返回为没有可恢复牌桌。

#### Scenario: 返回等待房间
- **WHEN** 已登录玩家参与的牌桌处于 `waiting`
- **THEN** 服务端 MUST 返回该牌桌的 `roomId`、玩家座位、牌桌状态、版本和牌桌配置
- **AND** 客户端 MUST 能使用返回信息恢复等待页面

#### Scenario: 返回进行中房间
- **WHEN** 已登录玩家参与的牌桌处于 `playing`
- **THEN** 服务端 MUST 返回该牌桌及 socket 恢复所需信息
- **AND** 客户端 MUST 能订阅权威状态并进入游戏页面

#### Scenario: 返回单局结算房间
- **WHEN** 已登录玩家参与的牌桌处于 `finished`
- **THEN** 服务端 MUST 返回该牌桌和当前结果快照
- **AND** 客户端 MUST 能恢复游戏页面并继续下一局流程

#### Scenario: 最终结果房间不返回
- **WHEN** 当前玩家只参与 `tableResult` 或 `closed` 房间
- **THEN** 服务端 MUST 返回没有可恢复牌桌
- **AND** 服务端 MUST 对该玩家执行幂等的终局成员释放或关闭处理

#### Scenario: 没有可恢复牌桌
- **WHEN** 当前玩家没有参与任何 `waiting`、`playing` 或 `finished` 牌桌
- **THEN** 服务端 MUST 返回没有牌桌的结果
- **AND** 服务端 MUST NOT 自动创建新牌桌

### Requirement: 创建前防止重复房间
系统 SHALL 防止同一玩家在已有 `waiting`、`playing` 或 `finished` 牌桌时再次创建新房间。服务端在创建房间前 MUST 使用与 `activeRoom` 相同的状态分类检查玩家当前房间；若只存在 `tableResult` 或 `closed` 房间，服务端 MUST 先释放旧占用并允许创建。

#### Scenario: 已有可恢复房间时创建
- **WHEN** 当前玩家已经参与一张 `waiting`、`playing` 或 `finished` 牌桌并再次请求创建房间
- **THEN** 服务端 MUST 返回明确的活动房间冲突错误和最小已有房间摘要
- **AND** 服务端 MUST NOT 为该玩家创建第二张活动房间
- **AND** 服务端 MUST NOT 把响应伪装成创建成功

#### Scenario: 只有最终结果房间时创建
- **WHEN** 当前玩家只参与状态为 `tableResult` 的旧房间并请求创建房间
- **THEN** 服务端 MUST 释放该玩家在旧房间中的成员占用
- **AND** 服务端 MUST 创建新的 `waiting` 房间

#### Scenario: 重复创建请求保持唯一
- **WHEN** 同一玩家并发或重复提交创建房间请求
- **THEN** 服务端 MUST 保证最多创建一张新的 `waiting` 房间
- **AND** 后续请求 MUST 返回活动房间冲突而不是再创建一张房间

### Requirement: 最大局数结束牌桌
系统 SHALL 在牌桌达到创建时配置的最大局数后进入 `tableResult` 最终结果状态。达到最大局数后，服务端 MUST 阻止直接继续普通下一局；仍停留在结果页的客户端 MUST 展示牌局已经结束，并允许玩家退出，且只允许房主在 15 秒内决定是否发起当前房间继续牌局确认。玩家重新启动并进入大厅后 MUST NOT 自动恢复该最终结果牌桌。

#### Scenario: 达到最大局数后结束
- **WHEN** 牌桌完成第 `settings.maxRounds` 局结算
- **THEN** 服务端 MUST 将牌桌标记为 `tableResult`
- **AND** 当前仍连接的客户端 MUST 展示当前结果和牌局已经结束提示
- **AND** 服务端 MUST 记录房主决策截止时间 `deadlineAt`

#### Scenario: 未达到最大局数可继续
- **WHEN** 牌桌完成一局结算且当前局数小于 `settings.maxRounds`
- **THEN** 服务端 MUST 将牌桌标记为 `finished`
- **AND** 服务端 MUST 允许房主继续开启下一局

#### Scenario: 最终结果房间不自动重连
- **WHEN** 玩家重新启动且旧牌桌已经达到最大局数并处于 `tableResult`
- **THEN** 服务端查询可恢复牌桌 MUST 返回没有牌桌
- **AND** 客户端 MUST 停留在大厅并允许进入创建房间页面

#### Scenario: 留在结果页的玩家仍可重开
- **WHEN** 玩家持续停留在 `tableResult` 结果页且房主决策窗口尚未结束
- **THEN** 服务端 MUST 继续支持现有退出或重开确认流程
- **AND** 已通过启动大厅释放成员关系的玩家 MUST NOT 再计入重开所需同意成员

## ADDED Requirements

### Requirement: 终局房间释放幂等性
服务端 SHALL 对 `tableResult` 房间的玩家释放和关闭操作提供幂等行为。重复启动查询、重复创建检查、重复退出或终局超时检查 MUST NOT 重新加入玩家、重复创建房间或因目标记录已释放而失败。

#### Scenario: 重复查询终局房间
- **WHEN** 同一玩家连续多次查询当前房间且其旧房间处于 `tableResult`
- **THEN** 每次查询 MUST 返回没有可恢复房间
- **AND** 玩家成员关系 MUST 保持已释放状态

#### Scenario: 已关闭终局房间再次清理
- **WHEN** 终局房间已经标记为 `closed` 且后续入口再次触发清理
- **THEN** 服务端 MUST 返回稳定的无可恢复房间结果
- **AND** 服务端 MUST NOT 重建该房间的玩家占用或公开状态
