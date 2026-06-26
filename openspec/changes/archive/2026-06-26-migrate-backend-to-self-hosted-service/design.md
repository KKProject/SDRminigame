## Context

当前在线后端由三部分组成：`cloudfunctions/login` 负责微信身份和 socket token，`cloudfunctions/game` 负责房间、匹配、牌局裁决和 CloudBase 数据库读写，`services/socket` 负责 WebSocket 连接、订阅和广播。`services/socket` 通过 `GAME_FUNCTION_URL` 调用 `game` 云函数，实时阶段每次操作和广播都跨一次服务边界。

目标部署环境是用户自己的服务器和域名，不使用腾讯云函数或云托管作为业务后端。因此后端需要统一为一个自有 Node 服务，对外提供 HTTPS API 和 WSS 入口，并直接操作自有数据库。

## Goals / Non-Goals

**Goals:**

- 用自有服务接管 `login`、`game` 云函数和 WebSocket 服务的在线能力。
- 客户端在线入口统一改为 `wx.request` + `wx.connectSocket`，不再依赖 `wx.cloud`。
- 服务端通过微信登录 code 换 OPENID，签发应用 token 和短期 socket token。
- WebSocket 在同进程内直接调用游戏服务和数据库适配层，去掉 `GAME_FUNCTION_URL` 代理。
- 保留现有游戏核心、房间状态结构、socket envelope 和在线断线重连行为。
- 提供可本地运行和可部署到普通服务器的服务目录、配置说明和健康检查。

**Non-Goals:**

- 不在本次迁移中实现生产数据从 CloudBase 到自有数据库的自动迁移脚本。
- 不改变花牌规则、动画协议、局数配置或好友房产品流程。
- 不实现多实例分布式广播和分布式房间锁；本次按单实例自有服务落地，后续可扩展 Redis/pubsub。
- 不继续维护云函数作为在线后端兜底路径。

## Decisions

### 1. 新增统一自有 Node 服务

创建 `services/backend`，由同一个 HTTP server 承载：

- `GET /healthz`
- `POST /api/auth/login`
- `POST /api/game`
- `GET /ws` WebSocket upgrade

这样可以复用现有 `services/socket` 的连接管理、协议封装和广播逻辑，同时让 socket 消息直接调用本地 `GameService`。

备选方案是继续保留 `services/socket`，另建 HTTP API 服务。该方案部署上仍然是两个进程，不能完全消除实时层和游戏层通信，因此不采用。

### 2. 使用自有 token 替代云函数上下文

登录 API 接收客户端 `wx.login` code，服务端调用微信 `jscode2session` 获取 OPENID。成功后：

- upsert `users` 文档；
- 签发较长生命周期的应用访问 token；
- 签发短期 socket token；
- 返回普通 WSS URL 和 HTTPS API 所需身份信息。

`/api/game` 使用 `Authorization: Bearer <token>` 鉴权并把 token 中的 OPENID 注入游戏上下文。`/ws` 继续使用 socket token 鉴权。

备选方案是客户端传 openid 给服务端，但这会让身份可伪造，不能保护私密手牌和房间操作，因此不采用。

### 3. 抽离 CloudBase 数据库依赖，优先保留文档模型

房间逻辑当前依赖 `db.collection(name).doc(id).get/set/update/remove`、`where().orderBy().limit().get()` 等文档数据库接口。为降低改动，将实现一个 MongoDB 文档适配器，暴露与现有 `room.js` 所需能力相近的接口。

服务端游戏逻辑通过 `ctx = { OPENID, db, _, core }` 继续调用房间 handler，后续如需迁移 PostgreSQL，可替换适配器而不是改动规则和房间编排。

备选方案是直接重写为 SQL schema。该方案长期结构清晰，但一次性改动大，且牌局状态是深层 JSON，短期迁移风险更高。

### 4. 复用并调整现有 WebSocket 协议

客户端不再使用 `wx.cloud.connectContainer`，只使用普通 `wx.connectSocket`。登录返回：

```json
{
  "apiBaseUrl": "https://api.example.com",
  "socket": {
    "url": "wss://api.example.com/ws",
    "token": "...",
    "expiresAt": 123
  }
}
```

socket envelope、`subscribe`、`op`、`heartbeat`、`ackAnimation` 不改变，避免触碰动画和重连协议。

### 5. 等待房和大厅改走 HTTPS API

`activeRoom`、`createRoom`、`joinRoom`、`roomInfo`、`setReady`、`startRound` 等等待房动作通过 `POST /api/game` 调用。牌桌进入 playing 后，实时推进仍只走 WSS；socket 不可用时客户端暂停操作并等待重连。

## Risks / Trade-offs

- [微信 AppSecret 泄露] → AppSecret 只允许配置在服务端环境变量，客户端只传 `wx.login` code。
- [单实例服务重启导致连接断开] → 客户端已有 socket 重连流程；服务重启后通过数据库恢复权威状态。
- [多实例部署时广播不完整] → 本次明确单实例；扩展多实例前需要 Redis/pubsub 和房间锁。
- [MongoDB 适配器语义与 CloudBase 差异] → 只实现当前房间逻辑用到的查询能力，并用现有 online/socket 检查覆盖核心行为。
- [微信合法域名配置遗漏] → 文档要求配置 HTTPS request 域名与 WSS socket 域名，客户端配置以环境常量集中管理。
- [旧云函数路径残留] → 客户端网络层集中替换，检查 `wx.cloud.callFunction` 和 `connectContainer` 引用。

## Migration Plan

1. 新增自有服务目录、配置、MongoDB 适配器、HTTP API 和 WSS 入口。
2. 迁移登录逻辑：`wx.login` code 到 `/api/auth/login`，服务端换 OPENID 并签 token。
3. 迁移游戏 API：把原 `game` action 通过 `/api/game` 进入同一套 room handlers。
4. 调整 socket server：注入本地 GameService，不再需要 `GAME_FUNCTION_URL` 和 `SOCKET_PROXY_SECRET`。
5. 调整客户端：`cloud.js` 变为自有后端 API 客户端，`socket.js` 只走普通 WSS，`online.js` 保持业务调用语义。
6. 运行本地检查，修复引用和协议回归。
7. 部署时先使用测试域名和测试数据库验证登录、创建房、加入房、开局和断线重连。

Rollback 策略：由于客户端移除云函数路径后无法无损回滚到旧后端，生产发布应通过小版本灰度或测试版先验证；如需回滚，需发布上一版客户端配置和旧云函数/云托管服务。

## Open Questions

- 生产数据库最终使用 MongoDB、MongoDB 兼容服务，还是后续再迁 PostgreSQL？
- 自有服务器是否只部署单实例，还是近期就需要多实例扩容？
- 线上域名是否使用同一个主机名承载 HTTPS API 和 WSS，还是拆分 `api` / `ws` 子域名？
