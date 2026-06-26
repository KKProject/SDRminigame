## MODIFIED Requirements

### Requirement: 微信登录与服务端身份
系统 SHALL 在玩家进入在线对战前完成微信登录，使用 `wx.login` 获取临时 code，并由自有后端服务调用微信登录凭证校验接口换取稳定的用户标识（OPENID）作为唯一身份。系统 MUST 在自有数据库为每个 OPENID 维护一条用户记录；登录成功后 MUST 返回应用访问 token 和短期 socket token；登录失败时 MUST 阻止进入在线对战并给出可重试提示。

#### Scenario: 首次登录建立身份
- **WHEN** 玩家首次进入在线对战
- **THEN** 客户端 MUST 调用 `wx.login` 获取 code 并提交给自有登录 API
- **AND** 自有服务 MUST 换取 OPENID 并在 `users` 集合写入或更新该玩家记录
- **AND** 客户端 MUST 在拿到登录结果和访问 token 后才允许进入匹配流程

#### Scenario: 登录失败可重试
- **WHEN** 登录请求失败或超时
- **THEN** 系统 MUST 显示登录失败提示并提供重试入口
- **AND** 系统 MUST NOT 在未登录状态下进入在线牌局

#### Scenario: 老玩家再次登录
- **WHEN** 已有记录的玩家再次登录
- **THEN** 自有服务 MUST 复用同一 OPENID 对应的用户记录，而不是新建重复记录

### Requirement: WebSocket 短期连接凭证
系统 SHALL 在玩家完成微信登录后由自有服务签发用于 WebSocket 连接的短期凭证。凭证 MUST 绑定 OPENID、过期时间和随机标识，并 MUST 使用服务端密钥签名；客户端 MUST 使用该凭证建立 socket 连接，socket 服务 MUST 校验凭证后才允许订阅房间或提交操作。凭证过期、签名错误或绑定身份不一致时，系统 MUST 拒绝 socket 连接并允许客户端重新登录或刷新凭证。

#### Scenario: 登录后获取 socket 凭证
- **WHEN** 玩家完成微信登录并准备进入在线牌桌
- **THEN** 自有服务 MUST 返回或提供可刷新获取的短期 socket token
- **AND** 该 token MUST 绑定当前玩家 OPENID

#### Scenario: socket 服务校验凭证
- **WHEN** 客户端携带 socket token 建立连接
- **THEN** socket 服务 MUST 校验 token 签名、过期时间和绑定 OPENID
- **AND** 只有校验通过后才允许该连接订阅房间

#### Scenario: 凭证过期刷新
- **WHEN** 客户端 socket token 过期或即将过期
- **THEN** 客户端 MUST 通过自有登录 API 或凭证刷新接口获取新 token
- **AND** 客户端 MUST NOT 使用过期 token 继续建立新的 socket 连接
