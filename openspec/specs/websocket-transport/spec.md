# websocket-transport Specification

## Purpose
TBD - created by archiving change migrate-realtime-sync-to-websocket. Update Purpose after archive.
## Requirements
### Requirement: WebSocket 连接与鉴权
系统 SHALL 为在线牌桌提供 WebSocket 主通信通道。客户端 MUST 使用服务端签发的短期 socket token 建立连接；socket 服务 MUST 校验 token 的签名、过期时间和绑定用户身份，并将连接绑定到对应 OPENID。未鉴权或鉴权失败的连接 MUST 被拒绝，且 MUST NOT 订阅房间或提交牌局操作。

#### Scenario: 使用有效凭证连接
- **WHEN** 已登录玩家携带有效 socket token 建立 WebSocket 连接
- **THEN** socket 服务 MUST 接受连接并绑定该玩家 OPENID
- **AND** 客户端 MUST 能继续发送入房订阅或状态同步消息

#### Scenario: 无效凭证被拒绝
- **WHEN** 客户端使用缺失、过期、签名无效或用户不匹配的 token 连接
- **THEN** socket 服务 MUST 拒绝该连接
- **AND** 服务端 MUST NOT 暴露任何房间状态或玩家私密信息

### Requirement: Socket 消息协议
系统 SHALL 使用统一的 WebSocket 消息 envelope 传输在线牌桌消息。每条客户端请求 MUST 包含消息类型、请求 id、房间 id（如适用）、客户端已知版本和业务负载；每条服务端响应或推送 MUST 包含消息类型、房间 id（如适用）、权威版本、事件序号（如适用）和业务负载。客户端 MUST 使用请求 id、版本号和事件序号进行确认、去重和缺口检测。

#### Scenario: 操作请求关联响应
- **WHEN** 客户端通过 socket 提交带 `requestId` 的操作意图
- **THEN** 服务端 MUST 返回带同一 `requestId` 的操作结果或拒绝原因
- **AND** 客户端 MUST 能将该结果关联到本地待确认操作

#### Scenario: 重复推送去重
- **WHEN** 客户端重复收到相同版本和事件序号的权威状态推送
- **THEN** 客户端 MUST 忽略重复事件
- **AND** 客户端 MUST NOT 重复播放动作动画或重复提交有效回执

### Requirement: 房间订阅与状态广播
系统 SHALL 允许已鉴权连接订阅自己所在的在线房间。socket 服务 MUST 校验连接用户属于目标房间后才允许订阅；服务端权威状态变化后 MUST 通过 socket 向房间内已订阅连接推送公共状态、当前公开事件和动画等待状态，并向每个真人玩家连接单独下发本人私密视图。

#### Scenario: 房间成员订阅成功
- **WHEN** 已鉴权玩家订阅自己所在的房间
- **THEN** socket 服务 MUST 记录该连接的房间订阅
- **AND** 服务端 MUST 向该连接发送当前权威快照

#### Scenario: 非成员订阅被拒绝
- **WHEN** 已鉴权玩家尝试订阅自己不属于的房间
- **THEN** socket 服务 MUST 拒绝订阅
- **AND** 服务端 MUST NOT 下发该房间的公共状态或私密状态

#### Scenario: 状态变化广播
- **WHEN** 服务端裁决导致房间权威状态变化
- **THEN** socket 服务 MUST 向该房间所有已订阅连接推送最新公共状态
- **AND** socket 服务 MUST 仅向对应玩家连接推送该玩家自己的私密手牌视图

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

