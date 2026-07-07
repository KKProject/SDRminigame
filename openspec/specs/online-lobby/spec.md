# online-lobby Specification

## Purpose
TBD - created by archiving change add-online-lobby-room-entry. Update Purpose after archive.
## Requirements
### Requirement: 登录后在线大厅
系统 SHALL 在玩家完成微信登录并同步资料后进入在线大厅。大厅 MUST 展示当前玩家的基础资料，并作为后续查询房间、重连房间和创建房间的统一入口。

#### Scenario: 登录成功后显示大厅
- **WHEN** 玩家从启动界面选择在线对战并完成微信登录
- **THEN** 客户端 MUST 显示在线大厅
- **AND** 大厅 MUST 展示玩家昵称与头像；资料缺失时 MUST 使用登录流程提供的默认资料

#### Scenario: 登录失败不进入大厅
- **WHEN** 微信登录或服务端身份同步失败
- **THEN** 客户端 MUST 保持在可重试的失败状态
- **AND** 客户端 MUST NOT 显示可创建房间的大厅入口

### Requirement: 大厅内自动查询未结束房间
在线大厅 SHALL 在显示后查询服务端是否存在当前玩家参与且未结束的牌桌。查询期间大厅 MUST 显示加载状态，并 MUST NOT 允许玩家重复触发创建房间。

#### Scenario: 查询未结束房间
- **WHEN** 在线大厅首次显示
- **THEN** 客户端 MUST 调用服务端查询当前玩家未结束牌桌
- **AND** 大厅 MUST 显示正在检查房间的加载状态

#### Scenario: 查询失败可重试
- **WHEN** 查询未结束房间失败
- **THEN** 大厅 MUST 显示查询失败状态
- **AND** 大厅 MUST 提供重试入口以重新查询

### Requirement: 大厅内进入已有房间
当服务端返回未结束房间时，在线大厅 SHALL 显示正在进入房间的 loading，并自动执行牌桌拉取、订阅和重连流程。客户端 MUST NOT 在此状态下显示创建房间按钮。

#### Scenario: 有未结束房间时自动进入
- **WHEN** 服务端查询返回当前玩家存在未结束房间
- **THEN** 大厅 MUST 显示正在进入房间的 loading
- **AND** 客户端 MUST 自动拉取该房间状态并订阅牌桌公共状态
- **AND** 拉取成功后客户端 MUST 进入该牌桌

#### Scenario: 进入已有房间失败
- **WHEN** 大厅尝试进入服务端返回的未结束房间失败
- **THEN** 大厅 MUST 显示进入失败状态
- **AND** 大厅 MUST 允许玩家重试进入房间或重新查询未结束房间

### Requirement: 无房间时主动创建房间
当服务端确认当前玩家没有未结束房间时，在线大厅 SHALL 显示创建房间入口。创建房间 MUST 由玩家主动触发，客户端 MUST NOT 在查询无房间后自动创建牌桌。

#### Scenario: 无未结束房间显示创建入口
- **WHEN** 服务端查询确认当前玩家没有未结束房间
- **THEN** 大厅 MUST 显示创建房间按钮
- **AND** 大厅 MUST NOT 自动调用创建房间接口

#### Scenario: 创建时选择局数
- **WHEN** 玩家点击创建房间
- **THEN** 大厅 MUST 提供最大局数选项 `1`、`2`、`4`、`6`
- **AND** 玩家选择局数后客户端 MUST 使用所选局数请求创建房间

#### Scenario: 创建中防止重复提交
- **WHEN** 客户端正在创建房间
- **THEN** 大厅 MUST 显示创建中的加载状态
- **AND** 大厅 MUST 阻止玩家重复触发创建房间请求

### Requirement: 分享邀请入口衔接
在线大厅 SHALL 处理微信分享参数中的好友房 `roomId`。当存在待加入邀请房间时，客户端 MUST 在登录后优先尝试加入该房间，而不是显示普通创建房间入口。

#### Scenario: 登录后处理邀请房间
- **WHEN** 客户端启动或回前台时带有好友房 `roomId`
- **THEN** 在线入口 MUST 在微信登录后请求加入该房间
- **AND** 加入成功后 MUST 显示对应等待房间

#### Scenario: 已有未结束房间时收到邀请
- **WHEN** 当前玩家已经参与其他未结束房间且又通过分享进入新房间
- **THEN** 客户端 MUST 优先遵守服务端返回的已有房间约束
- **AND** 客户端 MUST NOT 静默加入第二个未结束房间

### Requirement: 创建房间后进入等待房间
在线大厅 SHALL 在创建好友房成功后进入等待房间。客户端 MUST NOT 在创建成功后立即调用开局流程。

#### Scenario: 创建成功进入等待
- **WHEN** 玩家在大厅创建好友房成功
- **THEN** 客户端 MUST 显示该房间等待房间
- **AND** 客户端 MUST NOT 自动开始第一局

### Requirement: 启动页登录门禁
系统 SHALL 在启动页完成微信资料授权检查和后端登录准备。玩家未完成登录前，客户端 MUST NOT 允许进入创建房间流程。

#### Scenario: 已授权玩家静默登录
- **WHEN** 玩家进入启动页且已经授权微信头像昵称
- **THEN** 客户端 MUST 静默读取微信资料并调用后端登录接口
- **AND** 登录成功后客户端 MUST 保存本次会话的用户资料和 openid
- **AND** 启动页 MUST 允许玩家点击开始进入创建房间设置页

#### Scenario: 未授权玩家需要先登录
- **WHEN** 玩家进入启动页且尚未授权微信头像昵称
- **THEN** 启动页 MUST 显示需要登录的提示
- **AND** 客户端 MUST NOT 允许玩家进入创建房间设置页
- **AND** 客户端 MUST 提供微信授权按钮完成登录

#### Scenario: 登录失败可重试
- **WHEN** 启动页静默登录或授权登录失败
- **THEN** 客户端 MUST 留在启动页
- **AND** 客户端 MUST 显示失败状态或重试提示
- **AND** 客户端 MUST NOT 创建房间

### Requirement: 创建页确认创建房间
系统 SHALL 在创建房间设置页提交玩家选择的房间配置并创建服务端房间。创建成功后客户端 MUST 进入选择座位关系页面。

#### Scenario: 提交完整房间设置
- **WHEN** 已登录玩家在创建房间设置页点击确认创建
- **THEN** 客户端 MUST 请求服务端创建房间
- **AND** 请求 MUST 携带 `settings.maxRounds`、`settings.repeatRound`、`settings.washTwice` 和 `settings.payType`
- **AND** 客户端 MUST 在创建中阻止重复提交

#### Scenario: 创建成功进入座位选择
- **WHEN** 服务端创建房间成功
- **THEN** 客户端 MUST 保存创建结果中的房间状态
- **AND** 客户端 MUST 显示选择座位关系页面
- **AND** 客户端 MUST NOT 在本次流程中执行座位确认逻辑

#### Scenario: 创建失败停留设置页
- **WHEN** 服务端创建房间失败
- **THEN** 客户端 MUST 停留在创建房间设置页
- **AND** 客户端 MUST 显示创建失败原因
- **AND** 客户端 MUST 允许玩家再次确认创建

### Requirement: 房间设置预留字段
系统 SHALL 保存创建房间时提交的完整规则设置。当前对局逻辑 MUST 只消费 `maxRounds`，其他字段作为预留字段保存并返回。

#### Scenario: 服务端保存预留字段
- **WHEN** 创建房间请求携带 `repeatRound`、`washTwice` 和 `payType`
- **THEN** 服务端 MUST 将这些字段保存到房间 `settings`
- **AND** 等待房间快照和创建响应 MUST 返回归一化后的完整 `settings`

#### Scenario: 旧客户端兼容
- **WHEN** 创建房间请求只携带旧的顶层 `maxRounds`
- **THEN** 服务端 MUST 使用默认值补齐预留字段
- **AND** 服务端 MUST 保持旧客户端创建房间成功
