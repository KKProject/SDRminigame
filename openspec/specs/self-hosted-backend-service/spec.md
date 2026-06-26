# self-hosted-backend-service Specification

## Purpose
TBD - created by archiving change migrate-backend-to-self-hosted-service. Update Purpose after archive.
## Requirements
### Requirement: 自有服务统一入口
系统 SHALL 提供部署在自有服务器和自有域名下的统一后端服务，承接在线对战登录、HTTP 游戏 API、WebSocket 实时通信和数据库访问。客户端 MUST 通过 HTTPS 调用普通 API，并通过 WSS 连接实时通道；在线后端业务 MUST NOT 依赖腾讯云函数或云托管作为运行入口。

#### Scenario: 健康检查可用
- **WHEN** 运维或部署平台请求 `GET /healthz`
- **THEN** 自有服务 MUST 返回成功状态
- **AND** 响应 MUST 能表明服务进程已启动并可接收请求

#### Scenario: 统一域名访问
- **WHEN** 客户端进入在线对战
- **THEN** 客户端 MUST 使用配置的 HTTPS API 域名和 WSS 域名访问自有服务
- **AND** 客户端 MUST NOT 调用 `wx.cloud.callFunction` 或 `wx.cloud.connectContainer` 完成在线后端业务

### Requirement: 自有服务身份鉴权
系统 SHALL 在自有服务内校验应用访问 token 和 socket token。HTTP 游戏 API MUST 使用应用访问 token 注入当前玩家 OPENID；WebSocket MUST 使用短期 socket token 绑定连接 OPENID。任何缺失、过期、签名无效或身份不匹配的请求 MUST 被拒绝。

#### Scenario: HTTP API 鉴权成功
- **WHEN** 客户端携带有效应用访问 token 调用游戏 API
- **THEN** 自有服务 MUST 从 token 中解析当前玩家 OPENID
- **AND** 游戏 handler MUST 使用该 OPENID 作为唯一身份来源

#### Scenario: HTTP API 鉴权失败
- **WHEN** 客户端缺失访问 token 或携带无效 token 调用游戏 API
- **THEN** 自有服务 MUST 拒绝请求
- **AND** 服务端 MUST NOT 读取或返回任何房间私密信息

### Requirement: 文档数据库适配
系统 SHALL 为自有服务提供文档数据库适配层，用于读写 `users`、`rooms`、`roomStates` 和 `matchQueue` 数据。适配层 MUST 支持房间编排所需的文档按 ID 读写、条件查询、排序、限制数量、更新和删除能力。

#### Scenario: 房间状态持久化
- **WHEN** 服务端创建房间、开局或裁决操作
- **THEN** 自有服务 MUST 将权威房间状态写入 `rooms`
- **AND** MUST 将脱敏公共状态写入 `roomStates` 或等价公共状态存储

#### Scenario: 查询当前玩家房间
- **WHEN** 服务端需要查询某玩家未结束牌桌
- **THEN** 数据库适配层 MUST 支持按玩家 OPENID 查询相关房间
- **AND** 返回结果 MUST 可按更新时间排序并限制数量

### Requirement: 本地游戏服务调用
WebSocket 服务 SHALL 在同一服务进程内直接调用本地游戏服务处理 `pull`、`op`、`heartbeat`、`setConnection`、`ackAnimation`、`setReady` 和 `startRound`。WebSocket 服务 MUST NOT 通过 `GAME_FUNCTION_URL` 或其他云函数代理路径访问游戏裁决逻辑。

#### Scenario: socket 操作直接裁决
- **WHEN** 客户端通过 WebSocket 提交牌局操作
- **THEN** 自有服务 MUST 在本进程内完成身份校验、版本校验、规则裁决和数据库写入
- **AND** 服务端 MUST 向订阅连接广播最新权威快照

#### Scenario: game 云函数代理缺失不影响服务
- **WHEN** 环境变量未配置 `GAME_FUNCTION_URL`
- **THEN** 自有 WebSocket 服务 MUST 仍可处理牌桌实时消息
- **AND** 服务端 MUST NOT 返回 `SOCKET_GAME_FUNCTION_URL_MISSING`

