## Context

当前在线牌桌已经迁移到自有 WSS 服务，但规格历史上经历过 `watch + pull`、WebSocket + HTTPS 兜底、WebSocket 唯一主通道几个阶段。现有最新 `websocket-transport` 已要求断线时不走 HTTPS 兜底，`realtime-state-sync` 仍有旧表述。若不先统一，后续增量事件流会很难定义缺口恢复和失败行为。

## Goals / Non-Goals

**Goals:**

- 统一“牌桌进行中实时链路只走 WebSocket”的契约。
- 让断线期间行为可测试：冻结最后权威画面、禁止操作、禁止回执、持续重连。
- 为后续增量同步和 protobuf 提供稳定前置条件。

**Non-Goals:**

- 不在本 change 中实现增量同步、牌编码或 protobuf。
- 不改大厅、等待房、登录、创建房间和加入房间的 HTTPS API 路径。
- 不改变服务端权威裁决规则。

## Decisions

### 决策 1：牌桌进行中不允许 HTTPS 实时兜底

原因：增量事件流依赖连续的 `version/eventSeq`。断线期间走 HTTPS `pull/op/ackAnimation` 会让客户端和 socket 流之间产生双入口状态，增加重复动画、漏回执、版本缺口和优先级裁决竞态。

备选方案：保留 HTTPS 短期兜底。它能提升弱网下的可见性，但会让后续协议优化必须同时维护两套实时链路，不利于测试。

### 决策 2：重连成功后统一用 socket 快照恢复

断线期间客户端只保留最后一次权威画面并显示等待重连。重连后客户端发送最后已知 `version/eventSeq`，服务端通过订阅响应返回当前权威快照。后续 change 可以在此基础上增加事件补发，但补发失败仍回到快照恢复。

### 决策 3：HTTP API 继续服务非实时边界

登录、socket token 签发、大厅、等待房、创建/加入房间等仍可走 HTTPS。这个 change 只约束“已进入牌桌且牌局实时交互中”的状态。

## Risks / Trade-offs

- [弱网时玩家看不到最新状态] → 明确等待重连提示，重连后立即以 socket 快照恢复。
- [现有代码仍有 HTTPS 兜底] → 后续实现任务需要先加测试锁住行为，再移除或隔离实时兜底路径。
- [调试时少一个手动恢复入口] → 可保留开发诊断接口，但不能被客户端在线牌桌实时流程调用。

## Migration Plan

1. 先更新规格并增加断线行为测试。
2. 移除客户端牌桌进行中的 HTTPS `pull/op/ackAnimation/heartbeat` 兜底。
3. 确认 socket 订阅重连可以返回完整快照。
4. 若需要回滚，只回滚客户端兜底删除逻辑；规格仍以 WebSocket 主通道为目标。

## Open Questions

无。
