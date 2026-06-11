## ADDED Requirements

### Requirement: 微信登录与服务端身份
系统 SHALL 在玩家进入在线对战前完成微信登录，使用 `wx.login` 获取临时 code，并由服务端云函数借助 `wx-server-sdk` 解析出稳定的用户标识（OPENID）作为唯一身份。系统 MUST 在云数据库为每个 OPENID 维护一条用户记录；登录失败时 MUST 阻止进入在线对战并给出可重试提示。

#### Scenario: 首次登录建立身份
- **WHEN** 玩家首次进入在线对战
- **THEN** 客户端 MUST 调用 `wx.login` 获取 code 并提交给登录云函数
- **AND** 云函数 MUST 解析 OPENID 并在 `users` 集合写入或更新该玩家记录
- **AND** 客户端 MUST 在拿到登录结果后才允许进入匹配流程

#### Scenario: 登录失败可重试
- **WHEN** 登录请求失败或超时
- **THEN** 系统 MUST 显示登录失败提示并提供重试入口
- **AND** 系统 MUST NOT 在未登录状态下进入在线牌局

#### Scenario: 老玩家再次登录
- **WHEN** 已有记录的玩家再次登录
- **THEN** 云函数 MUST 复用同一 OPENID 对应的用户记录，而不是新建重复记录

### Requirement: 玩家资料获取与回退
系统 SHALL 获取并展示玩家的微信昵称与头像用于牌桌显示。系统 MUST 使用微信小游戏当前可用的头像昵称获取能力请求资料；当玩家拒绝授权或资料不可用时，系统 MUST 回退为默认头像与默认昵称，并允许玩家后续补充，且 MUST NOT 因资料缺失而阻断进入游戏。

#### Scenario: 玩家授权资料
- **WHEN** 玩家同意提供头像与昵称
- **THEN** 系统 MUST 保存该昵称与头像并用于牌桌内自己与对手的展示
- **AND** 系统 MUST 将资料同步到服务端用户记录

#### Scenario: 玩家拒绝授权
- **WHEN** 玩家拒绝授权或资料获取失败
- **THEN** 系统 MUST 使用默认头像和默认昵称进入游戏
- **AND** 系统 MUST 允许玩家在之后重新设置头像与昵称

#### Scenario: 对手资料展示
- **WHEN** 牌局中存在其他真人玩家
- **THEN** 客户端 MUST 显示来自服务端公共状态的对手昵称与头像
- **AND** 客户端 MUST NOT 依赖本地直接读取对手的微信资料
