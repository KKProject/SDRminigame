## Why

当前在线对战后端被拆在 `login` 云函数、`game` 云函数和独立 WebSocket 服务之间，WebSocket 在牌桌实时阶段仍要通过 HTTP 调用 `game` 云函数才能裁决和读写数据库。项目将部署到非腾讯自有服务器和域名后，云函数与云托管能力不再适合作为后端运行边界，需要把登录、房间、牌局裁决、实时同步和数据库访问统一迁移到自有服务。

## What Changes

- **BREAKING** 客户端不再依赖 `wx.cloud.init`、`wx.cloud.callFunction` 或 `wx.cloud.connectContainer` 访问在线后端。
- 新增自有 HTTPS API，用于登录、刷新凭证、查询/创建/加入房间、等待房准备与开局等原 `login`、`game` 云函数能力。
- 新增自有 WSS 入口，复用现有 socket 消息协议承载牌桌订阅、操作、心跳和动画回执。
- 服务端通过微信 `wx.login` code 换取 OPENID，并签发应用访问 token 与短期 socket token。
- WebSocket 服务不再通过 `GAME_FUNCTION_URL` 代理调用 `game` 云函数，而是在同一服务进程内直接调用游戏服务和数据库适配层。
- 现有云数据库访问抽象迁移为自有服务数据库适配器，优先保留 `users`、`rooms`、`roomStates`、`matchQueue` 的文档模型语义，降低游戏逻辑迁移风险。
- 保留在线牌桌“断线后等待 socket 重连，不走实时兜底”的产品行为，但兜底禁用对象从云函数路径扩展为所有非 WSS 实时推进路径。

## Capabilities

### New Capabilities

- `self-hosted-backend-service`: 自有服务器承接登录、HTTP 游戏 API、WebSocket 实时通道、数据库访问和部署配置的统一后端能力。

### Modified Capabilities

- `wechat-auth`: 微信登录从云函数 `wx-server-sdk` 上下文解析 OPENID 改为自有服务使用 `wx.login` code 换取 OPENID，并签发自有 token。
- `websocket-transport`: WebSocket 入口从 `wx.cloud.connectContainer` 云托管服务改为自有 `wss://` 域名，且服务端不再代理调用 `game` 云函数。
- `online-matchmaking`: 大厅、匹配、好友房和等待房 API 从 `game` 云函数 action 改为自有 HTTPS API。
- `realtime-state-sync`: 实时牌桌继续仅通过 WebSocket 推进，但状态裁决和私密快照由同一自有服务直接生成和广播。

## Impact

- 客户端网络层：`js/net/cloud.js`、`js/net/socket.js`、`js/net/online.js` 需要替换 CloudBase 调用路径。
- 服务端：新增或重构自有 Node 服务，接管 `cloudfunctions/login`、`cloudfunctions/game` 和 `services/socket` 的能力。
- 游戏核心：复用 `cloudfunctions/game/core/*` 与房间编排逻辑，抽离 CloudBase SDK 依赖。
- 数据库：需要提供自有服务数据库配置、集合/索引初始化和运行时适配层。
- 部署：需要文档化 `HTTPS_BASE_URL`、`WSS_URL`、微信 AppID/AppSecret、token 密钥、数据库连接串、合法域名配置和健康检查。
