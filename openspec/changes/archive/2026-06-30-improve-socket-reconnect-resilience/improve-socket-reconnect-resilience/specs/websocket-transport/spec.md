## ADDED Requirements

### Requirement: socket 断连诊断日志
WebSocket 服务 SHALL 为连接鉴权失败、连接关闭、连接错误和心跳超时输出可诊断日志。日志 MUST 包含足以定位问题的非敏感字段，如事件类型、connection id、openid、roomId、close code、close reason、错误码和路径；日志 MUST NOT 输出 socket token、Authorization header 或带 token query 的完整 URL。

#### Scenario: 鉴权失败记录原因
- **WHEN** WebSocket upgrade 因缺失、过期或无效 token 被拒绝
- **THEN** 服务端 MUST 记录一次鉴权失败日志
- **AND** 日志 MUST 包含拒绝原因和请求路径
- **AND** 日志 MUST NOT 包含 token 明文

#### Scenario: 连接关闭记录上下文
- **WHEN** 已建立的 WebSocket 连接关闭
- **THEN** 服务端 MUST 记录连接关闭日志
- **AND** 日志 MUST 包含 connection id、openid、roomId、close code 和 close reason

#### Scenario: 心跳超时记录上下文
- **WHEN** 服务端因连接超过心跳超时时间未活动而关闭 socket
- **THEN** 服务端 MUST 记录心跳超时日志
- **AND** 日志 MUST 包含 connection id、openid、roomId 和超时配置

#### Scenario: 普通心跳不产生噪声
- **WHEN** 客户端持续发送正常心跳并保持连接在线
- **THEN** 服务端 MUST NOT 为每次成功心跳输出日志
- **AND** 普通心跳 MUST 只更新连接活跃时间和玩家在线时间
