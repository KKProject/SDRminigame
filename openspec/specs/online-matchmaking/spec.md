# online-matchmaking Specification

## Purpose
TBD - created by archiving change add-wechat-online-battle. Update Purpose after archive.
## Requirements
### Requirement: 在线匹配
系统 SHALL 允许已登录玩家发起快速匹配，由服务端把等待中的玩家撮合到同一张牌桌。系统 MUST 在凑齐开局所需玩家后由服务端创建牌桌并分配座位；匹配过程 MUST 可被玩家取消。

#### Scenario: 快速匹配成功
- **WHEN** 等待队列中的玩家数量达到开局所需人数
- **THEN** 服务端 MUST 创建一张牌桌并把这些玩家分配到座位
- **AND** 各玩家客户端 MUST 收到进入牌桌的通知并开始订阅该牌桌状态

#### Scenario: 玩家取消匹配
- **WHEN** 玩家在匹配完成前取消匹配
- **THEN** 服务端 MUST 将其移出匹配队列
- **AND** 该玩家 MUST NOT 再被本次撮合分配到牌桌

#### Scenario: 人数不足由 AI 补位
- **WHEN** 在配置的等待时限内真人玩家不足以开局
- **THEN** 服务端 MUST 用托管 AI 填充空座以开局，或维持等待，按配置策略执行

### Requirement: 好友房间
系统 SHALL 允许玩家创建带房间码的私有牌桌，其他玩家凭房间码加入。系统 MUST 校验房间是否存在与是否已满；座位分配与开局 MUST 由服务端控制。

#### Scenario: 创建房间
- **WHEN** 玩家选择创建好友房间
- **THEN** 服务端 MUST 生成唯一房间码并创建处于等待状态的牌桌
- **AND** 创建者 MUST 进入该牌桌的一个座位

#### Scenario: 凭码加入
- **WHEN** 玩家输入有效且未满的房间码
- **THEN** 服务端 MUST 把该玩家分配到空座位
- **AND** 当房间不存在或已满时 MUST 返回明确错误且不加入

### Requirement: 牌桌生命周期与座位管理
系统 SHALL 由服务端维护牌桌的生命周期状态（等待、进行中、结算、关闭）与座位归属。系统 MUST 保证一名玩家在同一牌桌只占用一个座位；牌桌关闭后 MUST 释放其占用的匹配/座位资源。

#### Scenario: 满座开局
- **WHEN** 牌桌座位全部就位且满足开局条件
- **THEN** 服务端 MUST 将牌桌状态置为进行中并触发开局
- **AND** 各客户端 MUST 收到开局后的初始权威状态

#### Scenario: 牌局结束后关闭
- **WHEN** 一局结束且无人继续
- **THEN** 服务端 MUST 将牌桌置为结算或关闭状态
- **AND** 服务端 MUST 释放该牌桌相关的座位与匹配资源

