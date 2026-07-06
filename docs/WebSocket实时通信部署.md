# 自有服务器实时后端部署

在线对战后端已经迁移为自有 HTTPS API + WSS 服务。主链路为：

```text
客户端 wx.login 获取 code
客户端 POST /api/auth/login
自有服务调用微信 jscode2session 换 OPENID
自有服务签发应用 token 与 socket token
客户端 POST /api/game 处理大厅、好友房和等待房动作
客户端 wx.connectSocket(wss://你的域名/ws?token=...)
WebSocket 在同一服务进程内直接裁决牌局并读写数据库
```

## 必要配置

在 `services/backend` 中复制 `.env.example` 并配置：

```text
PORT=8080
PUBLIC_API_BASE_URL=https://api.example.com
PUBLIC_SOCKET_URL=wss://api.example.com/ws
WECHAT_APPID=你的小游戏 AppID
WECHAT_SECRET=你的小游戏 AppSecret
APP_TOKEN_SECRET=一串固定长密钥
SOCKET_TOKEN_SECRET=另一串固定长密钥
DATABASE_DRIVER=mongodb
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=huapai
```

生产服务默认使用 MongoDB。若未提供 `MONGODB_URI`，服务会启动失败，避免静默回退到文件数据库。

本地联调可临时配置：

```text
BACKEND_DEV_OPENID=dev-openid
```

该配置会跳过微信 `jscode2session`，仅用于本地开发。生产环境不要设置。

## 启动服务

```bash
cd services/backend
npm install
npm start
```

健康检查：

```bash
curl https://api.example.com/healthz
```

## 小游戏客户端配置

客户端 `js/net/cloud.js` 中的 `BACKEND_API_BASE_URL` 需要改为正式 HTTPS API 域名。登录接口会返回：

```json
{
  "token": "应用访问 token",
  "socket": {
    "url": "wss://api.example.com/ws",
    "token": "socket token",
    "expiresAt": 123456789
  }
}
```

小游戏后台需要把以下域名加入合法域名：

- request 合法域名：`https://api.example.com`
- socket 合法域名：`wss://api.example.com`

线上必须使用 HTTPS/WSS，不要使用普通 HTTP/WS。

## 断线策略

进入在线牌桌后，实时同步只走 WebSocket。连接失败、token 过期或协议异常时，客户端保留最后一次权威画面并显示等待重连，不会通过 HTTPS API 或云函数 `pull` / `op` / `ackAnimation` / `heartbeat` 继续兜底同步。

等待房间、登录、创建房间、加入房间和开局前动作通过 HTTPS API 调用。牌桌进行中需要优先保障 WSS 服务可用性，并监控连接断开、重连成功率和心跳超时。

## 旧 CloudBase 路径

新的在线后端不再使用：

- `wx.cloud.callFunction({ name: 'login' })`
- `wx.cloud.callFunction({ name: 'game' })`
- `wx.cloud.connectContainer(...)`
- `GAME_FUNCTION_URL`
- `SOCKET_PROXY_SECRET`

旧的 `cloudfunctions/login`、`cloudfunctions/game` 和独立 `services/socket` 服务已经移除；生产在线链路以 `services/backend` 为准。
