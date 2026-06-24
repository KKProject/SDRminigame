# WebSocket 实时通信部署

在线牌桌迁移到 WebSocket 后，主链路变为：

```text
login 云函数签发 socket token
客户端 wx.cloud.connectContainer({ config: { env }, service, path })
socket 服务鉴权并订阅房间
socket 服务通过 game 云函数 HTTP 入口读写权威状态
玩家操作/动画回执通过 socket 发送
服务端裁决后向房间连接推送权威快照
```

## 必要配置

- 登录云函数与 socket 服务必须使用相同的 `SOCKET_TOKEN_SECRET`。
- 登录云函数配置 `SOCKET_ENV`、`SOCKET_SERVICE` 和 `SOCKET_PATH`，用于通过 `wx.cloud.connectContainer` 连接云托管 WebSocket。
- socket 服务需要配置 `GAME_FUNCTION_URL`，通过 `game` 云函数访问数据库。
- `game` 云函数和 socket 服务必须使用相同的 `SOCKET_PROXY_SECRET`，用于保护 socket 代理调用。
- 小游戏基础库版本需要满足云托管 WebSocket 能力要求。

## 云托管部署

`services/socket` 只负责 WebSocket 长连接，牌局裁决与数据库访问继续放在 `game` 云函数。先在项目根目录生成部署目录：

```bash
node scripts/prepare-socket-deploy.mjs
```

生成目录为 `.tmp-socket-deploy`。

1. 在微信开发者工具打开「云开发」。
2. 进入同一个云环境，选择「云托管」。
3. 新建服务，服务名建议使用 `huapai-socket`。
4. 选择自定义代码 / Dockerfile 部署。
5. 代码目录选择 `.tmp-socket-deploy`，Dockerfile 路径填写 `Dockerfile`。
6. 云托管容器默认监听 `80` 端口，健康检查路径填写 `/healthz`。
7. 环境变量填写：

```text
TCB_ENV=你的云环境ID
SOCKET_TOKEN_SECRET=一串固定密钥
SOCKET_PROXY_SECRET=一串只在服务端使用的密钥
GAME_FUNCTION_URL=game 云函数 HTTP 访问地址
```

可选：

```text
SOCKET_HANDLER_TIMEOUT_MS=15000
GAME_FUNCTION_TIMEOUT_MS=15000
```

`game` 云函数也需要配置同一个代理密钥：

```text
SOCKET_PROXY_SECRET=同一串只在服务端使用的密钥
```

开启 `game` 云函数 HTTP 访问后，把该 HTTP 地址填入 socket 云托管服务的 `GAME_FUNCTION_URL`。socket 服务不会直接访问云数据库，因此不需要在云托管中配置腾讯云 `SecretId` / `SecretKey`。

8. 发布新版本，等待健康检查通过。
9. 在 `login` 云函数环境变量中填写：

```text
SOCKET_ENV=你的云环境ID
SOCKET_SERVICE=huapai-socket
SOCKET_PATH=/
SOCKET_TOKEN_SECRET=同一串固定密钥
```

10. 重新部署 `login` 云函数。

使用微信云托管官方 WebSocket 接入时，`login` 云函数不要配置 `SOCKET_URL` / `WEBSOCKET_URL` 为云托管默认域名。客户端需要拿到 `socket.env` + `socket.service`，通过 `wx.cloud.connectContainer` 建立连接；直接连接 `wss://*.run.wxcloudrun.com` 容易在小游戏运行环境中握手失败。

## 断线策略

进入在线牌桌后，实时同步只走 WebSocket。`SOCKET_ENV`/`SOCKET_SERVICE` 为空、连接失败、token 过期或协议异常时，客户端会保留最后一次权威画面并显示等待重连，不会通过云函数 `pull` / `op` / `ackAnimation` / `heartbeat` 继续兜底同步。

等待房间、登录、创建房间、加入房间和 token 获取仍可使用云函数。牌桌进行中需要优先保障 socket 服务可用性，并监控连接断开、重连成功率和心跳超时。
