## Context

`migrate-realtime-sync-to-websocket` 已经把在线牌桌主链路迁移到 WebSocket，但为了灰度和兼容，客户端仍保留了云函数实时兜底：

```text
socket 断开
  -> scheduleReconnect()
  -> trySocketSubscribe()
  -> refresh() / roomStates.watch() / callFunction(op|ack|heartbeat)
```

这会让掉线玩家继续通过云函数拉取状态、提交操作或回执动画，其他玩家也不一定能明确看到该席位掉线。现在产品目标变为：实时牌桌只承认 WebSocket 连接状态，断开即进入等待重连，并把该玩家掉线状态展示给同桌玩家。

## Goals / Non-Goals

**Goals:**

- WebSocket 断开后，本机显示等待重连并暂停操作。
- WebSocket 断开或心跳超时后，服务端标记对应玩家离线并广播公共状态。
- WebSocket 重连成功后，服务端标记玩家在线并广播恢复状态。
- 牌桌实时阶段禁止使用云函数替代 socket 提交 `op`、`ackAnimation`、`heartbeat` 或订阅 `roomStates.watch()`。
- 保留云函数作为登录、token、创建/加入房间等非实时入口。

**Non-Goals:**

- 不移除云函数的管理入口和冷启动查询能力。
- 不改变掉线超时后的托管规则，只改变 socket 断开后的可见状态与实时兜底策略。
- 不新增聊天、观战或房间外在线状态系统。

## Decisions

### 决策 1：牌桌实时阶段 WebSocket-only

进入牌桌后，客户端所有实时消息都必须经 socket。socket 不可用时不调用 `pull`、`op`、`ackAnimation` 或 `heartbeat` 云函数兜底，而是进入 reconnecting 状态并等待 socket 恢复。

保留例外：登录、socket token 刷新、创建房间、加入房间、等待房间低频管理操作仍可使用云函数。

### 决策 2：服务端连接断开驱动在线状态

socket 服务在连接关闭或心跳超时时通知房间服务，将该 OPENID 在房间中的 `online` 标记为 false，并向房间连接广播最新公共状态。重连订阅成功时再标记为 true 并广播。

如果同一 OPENID 有多个 socket 连接，只有最后一个房间连接断开时才标记离线，避免多窗口或重连竞态导致误报。

### 决策 3：客户端保留最后权威画面并显示连接状态

断线玩家本机保留最后一次权威快照，不做云函数补拉。UI 状态提示为“网络已断开，等待重连…”或“正在重新连接…”。在 reconnecting 状态下，点击手牌和动作按钮只提示等待重连，不提交操作。

### 决策 4：重连只通过 socket 恢复

重连成功后客户端发送最后已知 `version` / `eventSeq` 订阅房间。服务端返回当前权威快照；如果期间玩家已被托管或状态推进，客户端以 socket 快照为准恢复。

## Risks / Trade-offs

- [短暂网络抖动导致掉线提示闪烁] → 服务端可保留较短连接超时/防抖配置，但客户端本机断开提示应立即出现。
- [socket 服务异常时牌桌无法继续实时操作] → 这是本次有意选择；运维层面需要监控 socket 服务可用性。
- [旧测试依赖云函数兜底] → 更新测试，使实时阶段断线不再调用云函数。
- [等待房间与牌桌阶段边界混淆] → 等待房间可继续低频云函数刷新；进入 playing/tableResult 的牌桌实时阶段必须 socket-only。

## Migration Plan

1. 更新规格，移除 WebSocket 断开后的云函数实时兜底要求。
2. 服务端新增 socket 断开/重连在线状态更新与广播。
3. 客户端移除牌桌阶段 `roomStates.watch()`、`pull`、`op`、`ackAnimation`、`heartbeat` 的 socket 断开兜底。
4. 客户端增加 reconnecting 状态判断，断线期间禁用操作并显示提示。
5. 更新测试与部署文档。
