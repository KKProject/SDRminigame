## ADDED Requirements

### Requirement: Protobuf 二进制实时传输
系统 SHALL 支持使用 protobuf 对 WebSocket 牌桌实时消息进行二进制编码。protobuf 消息 MUST 与 JSON 实时协议表达相同的业务语义，并 MUST 使用已定义的紧凑牌编码、动作编码、版本号和事件序号字段。

#### Scenario: protobuf 客户端收发实时消息
- **WHEN** 客户端声明支持 protobuf 实时协议且服务端启用 protobuf
- **THEN** 服务端 MAY 使用二进制 WebSocket frame 下发 protobuf 消息
- **AND** 客户端 MUST 正确解码并按与 JSON 相同的状态同步规则处理

#### Scenario: JSON 与 protobuf 语义一致
- **WHEN** 同一个牌桌事件分别通过 JSON 和 protobuf 表达
- **THEN** 客户端解码后的业务消息 MUST 等价
- **AND** 状态 reducer、动画逻辑和回执逻辑 MUST 得到相同结果

### Requirement: Protobuf 兼容与回滚
系统 SHALL 在 protobuf 灰度期间保留 JSON WebSocket 协议作为兼容和回滚路径。客户端和服务端 MUST 能识别对方是否支持 protobuf；任一端不支持或协商失败时 MUST 回退到 JSON 协议或拒绝连接并提示需要升级。

#### Scenario: 客户端不支持 protobuf
- **WHEN** 客户端未声明 protobuf 支持
- **THEN** 服务端 MUST 使用 JSON 协议与该客户端通信
- **AND** 服务端 MUST NOT 向该客户端发送无法解析的二进制实时消息

#### Scenario: protobuf 解码失败
- **WHEN** 客户端或服务端解码 protobuf 消息失败
- **THEN** 接收方 MUST 拒绝应用该消息
- **AND** 客户端 MUST 请求 socket 快照恢复或重新连接

#### Scenario: 生产回滚到 JSON
- **WHEN** 运行配置关闭 protobuf 实时协议
- **THEN** 服务端 MUST 使用 JSON 协议发送实时消息
- **AND** 客户端 MUST 仍能完成在线牌桌实时交互
