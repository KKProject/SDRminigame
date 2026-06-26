## 1. 自有后端服务

- [x] 1.1 创建 `services/backend` 服务目录、启动脚本、配置读取和健康检查。
- [x] 1.2 迁移 token 能力，支持应用访问 token 与短期 socket token 的签发和校验。
- [x] 1.3 实现微信 `jscode2session` 登录 API，并在自有数据库中维护 `users` 记录。
- [x] 1.4 实现文档数据库适配器，覆盖房间逻辑所需的 `collection/doc/get/set/update/remove/where/orderBy/limit` 能力。
- [x] 1.5 复用游戏核心和房间 handler，实现本地 `GameService`，替代 `GAME_FUNCTION_URL` 云函数代理。
- [x] 1.6 整合 WebSocket server，使 `subscribe/op/heartbeat/ackAnimation` 在同进程内直接裁决和广播。
- [x] 1.7 暴露 `/api/game`，承接 `activeRoom/createRoom/joinRoom/roomInfo/setReady/startRound/pull` 等 HTTPS 游戏动作。

## 2. 客户端迁移

- [x] 2.1 将 `js/net/cloud.js` 改为自有后端 API 客户端，移除 `wx.cloud.init/callFunction` 依赖。
- [x] 2.2 将登录流程改为 `wx.login` code + `/api/auth/login`，保存访问 token 和 socket auth。
- [x] 2.3 将 `js/net/socket.js` 改为普通 `wx.connectSocket` WSS 连接，不再使用 `wx.cloud.connectContainer`。
- [x] 2.4 调整 `js/net/online.js` 的大厅、等待房和实时错误提示，确保等待房走 HTTPS API、牌桌实时只走 WSS。

## 3. 配置与文档

- [x] 3.1 增加自有服务环境变量示例，覆盖微信 AppID/AppSecret、API/WSS 域名、token 密钥和数据库连接。
- [x] 3.2 更新部署文档，说明普通服务器部署、微信合法域名配置和云函数下线后的调用路径。

## 4. 验证

- [x] 4.1 更新或新增后端检查脚本，覆盖 token、数据库适配器、登录 API 和本地 GameService。
- [x] 4.2 运行 OpenSpec 校验和现有在线/socket 检查，修复迁移引入的回归。
