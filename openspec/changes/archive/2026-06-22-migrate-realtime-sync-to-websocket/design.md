## Context

当前在线对战通信路径是：

```text
客户端操作 -> wx.cloud.callFunction('game') -> 云函数裁决 -> 写 rooms / roomStates
roomStates.watch() 通知客户端 -> 客户端 callFunction('game', { action: 'pull' }) -> 应用快照
```

这条路径简单、贴合云开发，但每次状态变化至少跨过云函数、数据库写入、实时监听和再次 `pull`。当玩家操作、公开事件、动画屏障和心跳叠在一起时，延迟会直接体现在牌桌动作确认和状态同步上。

微信云函数不适合承载常驻 socket 连接，因此 WebSocket 迁移需要新增一个可常驻运行的服务层。推荐部署形态是微信云托管或等价 Node.js 常驻服务，并通过 `wss` 域名提供 socket 入口。现有云函数继续承担登录、短期 socket 凭证签发、低频管理操作和失败兜底。

## Goals / Non-Goals

**Goals:**

- 将在线牌桌主通信路径改为 WebSocket，降低操作确认、状态广播和动画回执的往返延迟。
- 保持服务端权威裁决：客户端仍只提交操作意图，不能本地推进权威状态。
- 保持手牌保密：socket 服务按连接身份只向对应玩家发送本人私密视图。
- 保留断线重连和快照恢复：socket 断开后可重新鉴权、重新订阅房间，并按版本/事件序号补齐或对齐状态。
- 复用现有游戏核心逻辑和房间数据结构，减少规则双写。
- 保留云函数兜底，便于灰度和回滚。

**Non-Goals:**

- 不把牌局裁决下放到客户端。
- 不在本次迁移中改动花牌规则、计分规则或动画表现。
- 不要求完全移除云函数和 `roomStates`；它们在迁移期保留为登录、快照和降级通道。
- 不引入跨房间观战、聊天或排行榜推送等新玩法。

## Decisions

### 决策 1：新增常驻 WebSocket 服务，不在云函数里模拟 socket

云函数是请求/响应模型，适合短任务，不适合维护玩家长连接。新增 `services/socket` 或等价目录承载 Node.js WebSocket 服务，部署到云托管或其他常驻容器环境。客户端通过 `wx.connectSocket` 连接该服务。

备选方案：

- 继续优化 `watch + pull`：改动小，但仍依赖数据库监听和云函数拉取，无法解决主链路延迟。
- 在云函数中长轮询：会增加调用量和超时复杂度，也不是真正双向低延迟。
- 直接外部自建服务器：灵活，但运维、域名、证书和小程序合规配置更多。可作为云托管不可用时的等价部署。

### 决策 2：WebSocket 主通道 + 云函数兜底

进入在线牌桌后，客户端优先建立 socket。操作意图、动画回执、房间准备/开局、心跳和状态推送都走 socket；若连接不可用，客户端回退到现有 `callFunction` 路径并提示正在恢复。

这样可以灰度上线：先在开发/体验版开启 socket，稳定后再关闭 `roomStates.watch()` 主路径。云函数仍保留 `pull`，用于首次对齐、事件缺口恢复和 socket 不可用时的兼容。

### 决策 3：短期 socket 凭证，不使用裸 `openid`

客户端不能把 `openid` 当作可信登录凭证直接传给 socket 服务。登录云函数在确认微信身份后签发短期 socket token，token 至少包含 `openid`、过期时间和随机 nonce，并由服务端密钥签名。socket 服务只接受有效 token，连接建立后将连接绑定到 `openid`。

### 决策 4：统一消息 envelope

所有 socket 消息使用统一包裹格式：

```json
{
  "type": "op",
  "requestId": "client-generated-id",
  "roomId": "room-id",
  "version": 12,
  "payload": {}
}
```

服务端响应和推送同样带 `type`、`requestId`（如有）、`roomId`、`version`、`eventSeq`（如有）和 `payload`。客户端用 `requestId` 关联操作反馈，用 `version`/`eventSeq` 去重和发现缺口。

### 决策 5：复用现有房间裁决核心，抽出传输无关 handler

现有 `cloudfunctions/game/room.js` 同时包含房间裁决、数据库读写和云函数 handler 形状。迁移时应把可复用的房间业务逻辑抽成传输无关模块，例如 `server/game-room-service`，让云函数和 WebSocket 服务都调用同一套 `createRoom`、`joinRoom`、`op`、`pull`、`ackAnimation` 逻辑。

短期可以先让 socket 服务复用现有核心规则和同等数据结构；中期再整理云函数与 socket 服务之间的重复包装代码。

### 决策 6：状态推送分公共视图和私密视图

socket 服务在同一次权威状态更新后向房间内连接广播公共视图，并向每个真人玩家连接单独发送其私密视图。公共消息不得包含其他玩家手牌；私密消息只发给对应 `openid` 绑定的连接。

`rooms` 继续保存权威状态，`roomStates` 可继续写入公共快照用于调试、兼容和降级，但不再作为主实时推送来源。

## Risks / Trade-offs

- [新增部署复杂度] → 使用独立 `services/socket` 和清晰环境变量，保留云函数兜底，先灰度再全量。
- [鉴权实现不严导致冒用连接] → socket 必须使用短期签名 token，服务端校验过期时间和签名，连接身份只来自 token。
- [云函数和 socket 裁决逻辑分叉] → 抽出传输无关业务服务，测试同一组操作序列在两条入口下得到一致结果。
- [断线期间错过事件] → 客户端重连后发送最后已知 `version`/`eventSeq`，服务端能补发可用事件；补不齐时下发完整快照并清理过期动画。
- [多连接重复登录] → 服务端允许同一 `openid` 多连接，但按连接维持心跳；同一玩家回执和操作必须按 `openid + eventSeq/requestId` 幂等。
- [小程序 socket 域名配置缺失] → 在部署任务中明确配置 `wss` 域名和微信公众平台 socket 合法域名，否则客户端必须自动降级到云函数。

## Migration Plan

1. 新增 socket token 签发能力，登录后客户端可获取短期 WebSocket 凭证。
2. 新增 WebSocket 服务骨架，实现鉴权、连接表、心跳、入房订阅和基础消息 envelope。
3. 抽出或适配现有房间裁决逻辑，让 socket 服务能处理 `pull`、`op`、`ackAnimation`、`heartbeat` 等消息。
4. 客户端新增 socket transport，进入在线牌桌后优先连接 socket；连接成功后停用 `roomStates.watch()` 主路径。
5. 实现状态广播、私密视图下发、事件去重、断线重连和云函数降级。
6. 在开发环境跑协议和回归测试，再通过配置开关灰度到体验版。
7. 稳定后把 `roomStates.watch()` 降为兼容路径，并更新部署文档。

Rollback:

- 客户端保留云函数路径和 `pull`，可通过配置关闭 socket 主通道。
- 服务端 socket 服务可独立停止，不影响云函数登录和旧同步路径。

## Open Questions

- 最终部署目标是微信云托管，还是已有外部 Node.js 服务？
- socket 服务的公网 `wss` 域名和证书由谁配置？
- 是否需要在首版支持断线事件窗口补发，还是先只做重连后完整快照对齐？
- 是否允许同一玩家多设备/多窗口同时进入同一房间，还是新连接挤掉旧连接？
