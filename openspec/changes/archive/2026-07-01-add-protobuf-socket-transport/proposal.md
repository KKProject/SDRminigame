## Why

在统一 WebSocket 契约、紧凑编码和增量事件流之后，实时消息结构会变小且稳定。此时引入 protobuf 可以进一步降低传输体积、避免 JSON 解析开销，并为后续多版本协议演进提供明确 schema。

## What Changes

- 为 WebSocket 牌桌实时消息新增 protobuf schema。
- 支持二进制 socket frame 传输 protobuf 消息。
- 保留 JSON 协议作为开发、诊断或灰度回滚路径，直到 protobuf 稳定。
- 增加协议协商或版本字段，客户端和服务端可判断是否使用 protobuf。
- 不改变牌局语义；protobuf 只替换承载格式。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `websocket-transport`: 增加 protobuf 二进制传输能力与 JSON 兼容/回滚要求。

## Impact

- 新增依赖：protobuf 编解码库或构建产物。
- 客户端：小程序端需要能编码/解码 protobuf 二进制消息。
- 服务端：socket 收发支持 binary frame 与 JSON frame 双路径。
- 测试：需要覆盖 JSON/protobuf 同语义、版本不支持、灰度回滚。
