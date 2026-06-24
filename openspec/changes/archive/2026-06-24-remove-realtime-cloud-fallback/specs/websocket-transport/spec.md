## MODIFIED Requirements

### Requirement: 心跳与断线检测
系统 SHALL 在 WebSocket 通道上维护心跳。客户端 MUST 定期发送心跳或响应服务端 ping；socket 服务 MUST 根据连接心跳更新玩家在线状态。已订阅房间的连接断开或心跳超时后，socket 服务 MUST 将对应玩家标记为离线并广播该房间公共状态；普通心跳 MUST NOT 造成无意义的牌桌状态广播。

#### Scenario: 心跳保持在线
- **WHEN** 客户端在心跳间隔内持续发送有效心跳
- **THEN** socket 服务 MUST 保持该连接在线
- **AND** 服务端 MUST 更新该玩家最近在线时间

#### Scenario: 心跳超时
- **WHEN** 已订阅房间的连接超过超时时间没有心跳
- **THEN** socket 服务 MUST 将该连接视为断开
- **AND** 服务端 MUST 标记该玩家离线并广播最新公共状态

#### Scenario: socket 连接关闭
- **WHEN** 已订阅房间的玩家 WebSocket 连接关闭且没有同一玩家的其他有效房间连接
- **THEN** socket 服务 MUST 标记该玩家离线
- **AND** 同桌其他客户端 MUST 收到该席位离线的公共状态

### Requirement: 降级与恢复
系统 SHALL 在 WebSocket 不可用、连接失败、协议错误或连接中断时进入等待重连状态。客户端 MUST 保留最后一次权威快照并显示正在重连或等待重连提示；客户端 MUST NOT 使用云函数 `pull`、`op`、`ackAnimation`、`heartbeat` 或 `roomStates.watch()` 作为牌桌实时兜底。WebSocket 重新连接并订阅成功后，客户端 MUST 以 socket 下发的最新权威快照恢复牌桌。

#### Scenario: 连接失败等待重连
- **WHEN** 客户端无法建立或恢复 WebSocket 连接
- **THEN** 客户端 MUST 显示等待重连状态并暂停牌局操作
- **AND** 客户端 MUST NOT 使用云函数路径拉取或推进牌桌实时状态

#### Scenario: socket 恢复后回主通道
- **WHEN** 客户端重新建立并订阅 WebSocket 连接
- **THEN** 客户端 MUST 以 socket 下发的最新权威快照为准
- **AND** 后续操作和回执 MUST 通过 socket 发送

#### Scenario: 断线期间禁止实时兜底
- **WHEN** 客户端已进入在线牌桌且 socket 不可用
- **THEN** 客户端 MUST NOT 通过云函数提交操作、动画回执或心跳
- **AND** 客户端 MUST 等待 socket 重连成功后再恢复实时交互
