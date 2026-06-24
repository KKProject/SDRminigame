## 1. 凭证与配置

- [x] 1.1 在登录/鉴权云函数中新增短期 socket token 签发能力，包含 OPENID、过期时间、nonce 和服务端签名
- [x] 1.2 增加 socket 服务端环境变量配置，包括 token 签名密钥、云开发环境、监听端口和允许的客户端来源
- [x] 1.3 更新客户端云能力封装，使登录结果可携带或刷新 socket token
- [x] 1.4 补充部署文档，记录 `wss` 域名、微信公众平台 socket 合法域名和本地调试配置

## 2. WebSocket 服务骨架

- [x] 2.1 新增常驻 WebSocket 服务目录和 package 配置
- [x] 2.2 实现 socket 连接鉴权、连接表、同一 OPENID 多连接管理和关闭清理
- [x] 2.3 实现统一消息 envelope 解析、序列化、错误响应和 `requestId` 回传
- [x] 2.4 实现心跳、超时检测和最近在线时间更新，避免普通心跳触发无意义状态广播
- [x] 2.5 实现房间订阅消息，校验连接用户属于目标房间后发送当前快照

## 3. 服务端裁决复用

- [x] 3.1 梳理 `cloudfunctions/game/room.js` 中与传输绑定的逻辑和可复用的房间业务逻辑
- [x] 3.2 抽出或适配传输无关的房间服务，使云函数和 socket 服务共用 `pull`、`op`、`ackAnimation`、`heartbeat` 等裁决路径
- [x] 3.3 在 socket 服务中接入玩家操作意图，保持版本校验、规则裁决和拒绝原因与云函数一致
- [x] 3.4 在 socket 服务中接入动画完成回执，保持 `eventSeq` 幂等和动画屏障推进逻辑一致
- [x] 3.5 实现权威状态变化后的 socket 广播，公共视图发给房间连接，私密手牌只发给对应玩家

## 4. 客户端 socket transport

- [x] 4.1 新增客户端 socket transport 模块，封装 `wx.connectSocket`、发送队列、消息分发、关闭和重连
- [x] 4.2 在在线牌桌进入流程中优先建立 socket 连接并订阅房间
- [x] 4.3 将 `sendOp` 优先切换为 socket 操作请求，保留云函数兜底路径
- [x] 4.4 将动画完成回执优先切换为 socket 消息，失败时重试或走云函数兜底
- [x] 4.5 将 socket 推送的权威快照接入现有 `applyServerSnapshot` 和动画消费流程
- [x] 4.6 socket 主通道连接成功后停用 `roomStates.watch()` 主路径，仅在降级时使用

## 5. 重连、缺口与降级

- [x] 5.1 客户端重连时上报最后已知 `version` 和 `eventSeq`
- [x] 5.2 服务端根据版本/事件序号返回可用补发事件或完整快照
- [x] 5.3 客户端发现事件缺口无法补齐时清理过期动画并对齐最新权威快照
- [x] 5.4 WebSocket 连接失败、鉴权失败或协议错误时自动降级到现有云函数 `pull` 路径
- [x] 5.5 socket 恢复并重新订阅成功后，从降级路径切回 socket 主通道

## 6. 测试与验证

- [x] 6.1 新增 socket token 签发与校验测试，覆盖过期、签名错误和身份不匹配
- [x] 6.2 新增 socket 消息协议测试，覆盖 `requestId` 响应、重复推送去重和错误 envelope
- [x] 6.3 新增服务端双入口一致性测试，验证 socket 入口和云函数入口对同一操作序列产生一致裁决
- [x] 6.4 扩展在线对战测试，覆盖 socket 操作、状态广播、私密手牌隔离、动画回执和重连恢复
- [x] 6.5 运行 `node scripts/run-server-core-checks.mjs`、`node scripts/run-online-checks.mjs` 和 `node scripts/run-animation-checks.mjs`
- [x] 6.6 使用开发者工具或真机体验验证 socket 连接、断网重连、降级恢复和端到端延迟改善
