## MODIFIED Requirements

### Requirement: 降级与恢复
系统 SHALL 在 WebSocket 不可用、连接失败、协议错误或连接中断时进入等待重连状态。客户端 MUST 保留最后一次权威快照并显示正在重连或等待重连提示；客户端 MUST NOT 使用 HTTPS 游戏 API、云函数 `pull`、`op`、`ackAnimation`、`heartbeat` 或 `roomStates.watch()` 作为牌桌进行中的实时兜底。WebSocket 重新连接并订阅成功后，客户端 MUST 以 socket 下发的最新权威快照恢复牌桌，并且后续实时交互 MUST 回到 WebSocket 主通道。

#### Scenario: 连接失败等待重连
- **WHEN** 客户端无法建立或恢复 WebSocket 连接
- **THEN** 客户端 MUST 显示等待重连状态并暂停牌局操作
- **AND** 客户端 MUST NOT 使用 HTTPS API 或云函数路径拉取或推进牌桌实时状态

#### Scenario: socket 恢复后回主通道
- **WHEN** 客户端重新建立并订阅 WebSocket 连接
- **THEN** 客户端 MUST 以 socket 下发的最新权威快照为准
- **AND** 后续操作和回执 MUST 通过 socket 发送

#### Scenario: 断线期间禁止实时兜底
- **WHEN** 客户端已进入在线牌桌且 socket 不可用
- **THEN** 客户端 MUST NOT 通过 HTTPS API 或云函数提交操作、动画回执或心跳
- **AND** 客户端 MUST 等待 socket 重连成功后再恢复实时交互

#### Scenario: 非实时接口仍可使用 HTTPS
- **WHEN** 客户端处于登录、大厅、等待房、创建房间、加入房间或获取 socket token 流程
- **THEN** 客户端 MAY 使用 HTTPS API 完成这些非牌桌实时操作
- **AND** 这些接口 MUST NOT 被牌桌进行中的实时状态推进、操作裁决或动画回执兜底调用
