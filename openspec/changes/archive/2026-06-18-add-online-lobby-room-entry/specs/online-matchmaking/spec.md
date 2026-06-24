## ADDED Requirements

### Requirement: 查询玩家未结束牌桌
系统 SHALL 允许已登录玩家查询自己是否参与了未结束牌桌。服务端 MUST 以当前请求的 `OPENID` 为身份来源，并 MUST 只返回该玩家所在且尚未关闭或最终结算完成的牌桌信息。

#### Scenario: 返回未结束牌桌
- **WHEN** 已登录玩家参与的牌桌仍处于等待、进行中或本局结算后可继续的状态
- **THEN** 服务端 MUST 返回该牌桌的 `roomId`、玩家座位、牌桌状态、版本和牌桌配置
- **AND** 客户端 MUST 能使用返回信息继续执行 `pull` 重连流程

#### Scenario: 没有未结束牌桌
- **WHEN** 当前玩家没有参与任何未结束牌桌
- **THEN** 服务端 MUST 返回没有牌桌的结果
- **AND** 服务端 MUST NOT 创建新牌桌

#### Scenario: 已关闭牌桌不返回
- **WHEN** 当前玩家只参与了已关闭或最终结束的牌桌
- **THEN** 服务端 MUST 返回没有未结束牌桌

### Requirement: 创建房间局数配置
系统 SHALL 在创建好友房间时支持配置牌桌最大局数。服务端 MUST 校验最大局数，只允许 `2`、`4`、`6`，并 MUST 将该配置保存到房间文档。

#### Scenario: 创建指定局数房间
- **WHEN** 玩家创建好友房间并传入 `maxRounds` 为 `2`、`4` 或 `6`
- **THEN** 服务端 MUST 创建房间并保存 `settings.maxRounds`
- **AND** 创建者 MUST 进入该牌桌的一个座位

#### Scenario: 非法局数被拒绝或归一化
- **WHEN** 玩家创建好友房间时传入不受支持的 `maxRounds`
- **THEN** 服务端 MUST 拒绝该请求或使用默认值 `2`
- **AND** 服务端 MUST NOT 保存不在 `2`、`4`、`6` 范围内的局数配置

#### Scenario: 旧客户端创建房间
- **WHEN** 创建房间请求未传入 `maxRounds`
- **THEN** 服务端 MUST 使用默认最大局数 `2`
- **AND** 房间文档 MUST 包含可供客户端读取的牌桌配置

### Requirement: 创建前防止重复房间
系统 SHALL 防止同一玩家在已有未结束牌桌时再次创建新房间。服务端在创建房间前 MUST 检查该玩家是否已经参与未结束牌桌。

#### Scenario: 已有房间时创建
- **WHEN** 当前玩家已经参与一张未结束牌桌并再次请求创建房间
- **THEN** 服务端 MUST 返回已有牌桌信息或明确错误
- **AND** 服务端 MUST NOT 为该玩家创建第二张未结束牌桌

### Requirement: 最大局数结束牌桌
系统 SHALL 在牌桌达到创建时配置的最大局数后结束该牌桌。达到最大局数后，服务端 MUST 阻止继续开新局，客户端 MUST NOT 展示继续下一局入口。

#### Scenario: 达到最大局数后结束
- **WHEN** 牌桌完成第 `settings.maxRounds` 局结算
- **THEN** 服务端 MUST 将牌桌标记为最终结算或已结束状态
- **AND** 客户端 MUST 展示当前结果但不再允许玩家点击“再来一局”

#### Scenario: 未达到最大局数可继续
- **WHEN** 牌桌完成一局结算且当前局数小于 `settings.maxRounds`
- **THEN** 服务端 MUST 允许房主继续开启下一局

#### Scenario: 最终结算房间不再重连
- **WHEN** 玩家重新登录且只存在已达到最大局数的牌桌
- **THEN** 服务端查询未结束牌桌 MUST 返回没有牌桌
