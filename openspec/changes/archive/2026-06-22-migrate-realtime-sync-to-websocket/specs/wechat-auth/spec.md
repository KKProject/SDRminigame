## ADDED Requirements

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
