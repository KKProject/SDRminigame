# wechat-auth Specification

## Purpose
TBD - created by archiving change add-wechat-online-battle. Update Purpose after archive.
## Requirements
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

### Requirement: WebSocket 短期连接凭证
系统 SHALL 在玩家完成微信登录后签发用于 WebSocket 连接的短期凭证。凭证 MUST 绑定 OPENID、过期时间和随机标识，并 MUST 使用服务端密钥签名；客户端 MUST 使用该凭证建立 socket 连接，socket 服务 MUST 校验凭证后才允许订阅房间或提交操作。凭证过期、签名错误或绑定身份不一致时，系统 MUST 拒绝 socket 连接并允许客户端重新登录或刷新凭证。

#### Scenario: 登录后获取 socket 凭证
- **WHEN** 玩家完成微信登录并准备进入在线牌桌
- **THEN** 服务端 MUST 返回或提供可刷新获取的短期 socket token
- **AND** 该 token MUST 绑定当前玩家 OPENID

#### Scenario: socket 服务校验凭证
- **WHEN** 客户端携带 socket token 建立连接
- **THEN** socket 服务 MUST 校验 token 签名、过期时间和绑定 OPENID
- **AND** 只有校验通过后才允许该连接订阅房间

#### Scenario: 凭证过期刷新
- **WHEN** 客户端 socket token 过期或即将过期
- **THEN** 客户端 MUST 通过登录云函数或凭证刷新接口获取新 token
- **AND** 客户端 MUST NOT 使用过期 token 继续建立新的 socket 连接

