## MODIFIED Requirements

### Requirement: WebSocket 连接与鉴权
系统 SHALL 为在线牌桌提供自有 WSS 主通信通道。客户端 MUST 使用自有服务签发的短期 socket token，通过 `wx.connectSocket` 连接配置的 `wss://` 域名；socket 服务 MUST 校验 token 的签名、过期时间和绑定用户身份，并将连接绑定到对应 OPENID。未鉴权或鉴权失败的连接 MUST 被拒绝，且 MUST NOT 订阅房间或提交牌局操作。

#### Scenario: 使用有效凭证连接
- **WHEN** 已登录玩家携带有效 socket token 建立 WebSocket 连接
- **THEN** socket 服务 MUST 接受连接并绑定该玩家 OPENID
- **AND** 客户端 MUST 能继续发送入房订阅或状态同步消息

#### Scenario: 无效凭证被拒绝
- **WHEN** 客户端使用缺失、过期、签名无效或用户不匹配的 token 连接
- **THEN** socket 服务 MUST 拒绝该连接
- **AND** 服务端 MUST NOT 暴露任何房间状态或玩家私密信息

#### Scenario: 不使用云托管连接
- **WHEN** 客户端建立在线牌桌 WebSocket 连接
- **THEN** 客户端 MUST 使用普通 `wx.connectSocket`
- **AND** 客户端 MUST NOT 使用 `wx.cloud.connectContainer`

### Requirement: 降级与恢复
系统 SHALL 在 WebSocket 不可用、连接失败、协议错误或连接中断时进入等待重连状态。客户端 MUST 保留最后一次权威快照并显示正在重连或等待重连提示；客户端 MUST NOT 使用 HTTPS 游戏 API、云函数 `pull`、`op`、`ackAnimation`、`heartbeat` 或 `roomStates.watch()` 作为牌桌实时兜底。WebSocket 重新连接并订阅成功后，客户端 MUST 以 socket 下发的最新权威快照恢复牌桌。

#### Scenario: 连接失败等待重连
- **WHEN** 客户端无法建立或恢复 WebSocket 连接
- **THEN** 客户端 MUST 显示等待重连状态并暂停牌局操作
- **AND** 客户端 MUST NOT 使用 HTTPS API 或云函数路径拉取或推进牌桌实时状态

#### Scenario: socket 恢复后回主通道
- **WHEN** 客户端重新建立并订阅 WebSocket 连接
- **THEN** 客户端 MUST 以 socket 下发的最新权威快照为准
- **AND** 后续操作和回执 MUST 通过 socket 发送

#### Scenario: 断线期间禁止实时兜底
- **WHEN** 客户端已进入在线牌桌且 socket 不可用
- **THEN** 客户端 MUST NOT 通过 HTTPS API 或云函数提交操作、动画回执或心跳
- **AND** 客户端 MUST 等待 socket 重连成功后再恢复实时交互
