## Why

当前 `websocket-transport` 与 `realtime-state-sync` 对断线后的实时兜底口径不一致：一个要求牌桌实时链路禁止 HTTPS/API 兜底，另一个仍保留允许 HTTPS 拉取或提交的旧表述。后续要做增量同步、紧凑编码和 protobuf 前，需要先把实时主通道、断线恢复、操作提交边界统一下来。

## What Changes

- 统一在线牌桌实时链路契约：牌桌进行中状态同步、操作提交、动画回执均以 WebSocket 为唯一实时主通道。
- 明确 HTTPS API 只用于登录、大厅、等待房、首次进入前的非实时操作，以及 WebSocket 恢复后必要的服务端业务入口，不作为牌桌进行中的实时兜底。
- 明确断线期间客户端保留最后权威画面、暂停交互、持续重连；重连订阅成功后以 WebSocket 下发快照恢复。
- 移除 `realtime-state-sync` 中“socket 暂不可用时可通过 HTTPS 兜底拉取/提交牌桌实时状态”的要求。
- **BREAKING**: 牌桌进行中 socket 不可用时，客户端不得通过 HTTPS `pull`、`op`、`ackAnimation` 或心跳推进实时牌局。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `websocket-transport`: 强化 WebSocket 主通道与断线恢复边界。
- `realtime-state-sync`: 移除 HTTPS 牌桌实时兜底表述，统一状态同步、操作提交和断线恢复要求。

## Impact

- 规格影响：`openspec/specs/websocket-transport/spec.md`、`openspec/specs/realtime-state-sync/spec.md`。
- 客户端影响：后续实现需清理牌桌进行中 `callFunction('game')` 实时兜底路径。
- 服务端影响：后续实现需保证重连订阅一定返回可恢复快照。
- 测试影响：需要覆盖 socket 断开时不提交操作、不提交动画回执、不通过 HTTPS 拉取牌桌实时状态。
