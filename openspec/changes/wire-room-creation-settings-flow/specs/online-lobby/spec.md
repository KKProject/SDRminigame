## ADDED Requirements

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
