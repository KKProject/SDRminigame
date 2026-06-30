## ADDED Requirements

### Requirement: socket 鉴权刷新重连
实时同步客户端 SHALL 在在线牌桌断线重连时自动维护可用的 socket 鉴权信息。若 socket auth 缺失、已过期、即将过期或服务端拒绝连接并返回鉴权相关错误，客户端 MUST 通过既有登录接口刷新 socket auth，然后继续使用 WebSocket 重新连接并订阅原房间。刷新 socket auth MUST NOT 恢复 HTTPS 游戏 API、云函数 `pull`、`op`、`ackAnimation`、`heartbeat` 或 `roomStates.watch()` 作为牌桌实时兜底。

#### Scenario: 重连前刷新过期 token
- **WHEN** 在线牌桌客户端准备重连且本地 socket token 已过期或即将过期
- **THEN** 客户端 MUST 先刷新 socket auth
- **AND** 客户端 MUST 使用刷新后的 socket token 重新建立 WebSocket 连接并订阅原房间

#### Scenario: 鉴权失败后刷新并重试
- **WHEN** WebSocket 连接或订阅因为 token 过期、token 无效或未授权被拒绝
- **THEN** 客户端 MUST 刷新 socket auth 并重试 WebSocket 连接
- **AND** 若刷新或重试仍失败，客户端 MUST 保留最后权威快照并继续等待重连

#### Scenario: 刷新 auth 不启用实时兜底
- **WHEN** 客户端正在刷新 socket auth 或等待刷新后重连
- **THEN** 客户端 MUST 暂停牌局操作并显示等待重连状态
- **AND** 客户端 MUST NOT 通过 HTTPS 游戏 API 或云函数路径拉取、推进或回执当前在线牌桌

#### Scenario: 重连恢复最新权威状态
- **WHEN** 客户端刷新 socket auth 后成功重新订阅原房间
- **THEN** 客户端 MUST 以订阅返回的最新权威快照恢复牌局显示
- **AND** 若自身仍需完成当前事件动画回执，客户端 MUST 按最新事件继续播放或回执
