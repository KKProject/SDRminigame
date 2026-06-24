## 1. 服务端断线状态

- [x] 1.1 在 socket 房间服务中新增连接断开/重连时更新玩家在线状态的能力
- [x] 1.2 socket 服务在已订阅房间连接关闭或心跳超时时标记玩家离线并广播公共状态
- [x] 1.3 socket 服务在订阅成功后标记玩家在线并广播恢复状态
- [x] 1.4 确保同一 OPENID 多连接时不会因单个旧连接关闭误标离线

## 2. 客户端移除实时兜底

- [x] 2.1 移除在线牌桌 `roomStates.watch()` 兜底订阅路径
- [x] 2.2 WebSocket 断开后进入等待重连状态，不再执行 `pull` 云函数恢复实时牌桌
- [x] 2.3 socket 不可用时禁止 `op`、`ackAnimation`、`heartbeat` 云函数兜底
- [x] 2.4 断线期间保留最后权威快照，操作入口显示等待重连提示
- [x] 2.5 重连成功后只通过 socket 订阅恢复最新权威快照

## 3. 文档与测试

- [x] 3.1 更新 WebSocket 部署文档，移除实时云函数兜底描述
- [x] 3.2 更新 socket/online 测试，覆盖断线不调用云函数实时兜底
- [x] 3.3 运行 `node scripts/run-socket-checks.mjs` 和 `node scripts/run-online-checks.mjs`
- [x] 3.4 运行 `node scripts/run-server-core-checks.mjs` 和 `node scripts/run-animation-checks.mjs`
- [x] 3.5 增加 WebSocket 连接诊断并兼容缺失 Origin 的小程序握手
- [x] 3.6 支持微信云托管 `wx.cloud.connectContainer` 连接 WebSocket
- [x] 3.7 将部署说明收敛为微信云托管 WebSocket 官方接入方式
- [x] 3.8 增加云托管 Dockerfile 与部署说明
- [x] 3.9 增加 socket 云托管部署包生成脚本
- [x] 3.10 优化订阅首包返回，避免在线状态广播阻塞 WebSocket 订阅
- [x] 3.11 验证 socket 云托管服务直连 CloudBase 数据库的鉴权限制
- [x] 3.12 禁止客户端直连微信云托管默认域名，缺少 `SOCKET_SERVICE` 时给出明确诊断
- [x] 3.13 将 socket 服务的牌局读写改为通过 `game` 云函数代理访问数据库
