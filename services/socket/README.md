# WebSocket 服务

这是在线牌桌的常驻 WebSocket 同步服务。它负责连接鉴权、房间订阅、心跳、操作转发和权威状态广播；牌局裁决和数据库访问通过 `game` 云函数完成。

## 环境变量

- `PORT` 或 `SOCKET_PORT`: 服务监听端口，默认 `8080`
- `TCB_ENV` / `CLOUD_ENV` / `WX_CLOUD_ENV`: 云开发环境 ID
- `SOCKET_TOKEN_SECRET`: socket token 签名密钥，必须和 `login` 云函数一致
- `SOCKET_ALLOWED_ORIGINS`: 可选，逗号分隔的允许来源
- `SOCKET_HEARTBEAT_MS`: 心跳扫描间隔，默认 `20000`
- `SOCKET_CONNECTION_TIMEOUT_MS`: 连接超时时间，默认 `45000`
- `SOCKET_HANDLER_TIMEOUT_MS`: 单条 socket 消息处理超时，默认 `15000`
- `GAME_FUNCTION_URL` / `SOCKET_GAME_FUNCTION_URL`: `game` 云函数 HTTP 访问地址
- `SOCKET_PROXY_SECRET`: socket 服务调用 `game` 云函数代理接口的共享密钥；必须和 `game` 云函数一致
- `GAME_FUNCTION_TIMEOUT_MS`: 调用 `game` 云函数超时，默认 `15000`

## 本地启动

```bash
cd services/socket
npm install
SOCKET_TOKEN_SECRET=dev-secret SOCKET_PORT=8080 npm start
```

## 云托管部署

先从项目根目录生成部署目录：

```bash
node scripts/prepare-socket-deploy.mjs
```

然后在云托管中选择 `.tmp-socket-deploy` 作为代码目录，并使用其中的 `Dockerfile`。

云托管镜像默认监听 `80` 端口；本地启动仍可用 `SOCKET_PORT=8080`。

云托管服务环境变量：

```text
SOCKET_TOKEN_SECRET=和 login 云函数一致的密钥
SOCKET_PROXY_SECRET=一串只在服务端使用的密钥
GAME_FUNCTION_URL=game 云函数 HTTP 访问地址
```

`game` 云函数环境变量：

```text
SOCKET_PROXY_SECRET=和 socket 服务一致的密钥
```

socket 服务运行在云托管常驻 Node 服务中，只负责 WebSocket 连接、鉴权、订阅和广播；牌局读写通过 `GAME_FUNCTION_URL` 调用 `game` 云函数完成，数据库访问继续由云函数运行时负责。

推荐部署到微信云开发云托管，并让 `login` 云函数返回 `socket.env`、`socket.service`、`socket.path` 和 `socket.token`，客户端会通过 `wx.cloud.connectContainer({ config: { env }, service, path })` 建立 WebSocket。在线牌桌实时阶段没有云函数同步兜底，入口缺失时客户端会停留在等待重连状态。
