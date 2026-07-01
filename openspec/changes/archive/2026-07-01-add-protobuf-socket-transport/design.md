## Context

protobuf 不应先于协议语义优化引入。只有当消息已经从全量快照收敛为短编码增量事件后，protobuf 才能取得最大收益，并避免 schema 在设计不稳定时频繁大改。

## Goals / Non-Goals

**Goals:**

- 用 `.proto` 固化 socket envelope、snapshot、event、delta、intent、ack 等消息。
- 支持 protobuf binary frame 与现有 JSON frame 并存。
- 保证相同业务消息在 JSON 与 protobuf 下语义一致。

**Non-Goals:**

- 不改变状态同步语义、动作优先级或动画规则。
- 不在本 change 中继续压缩字段语义。
- 不强制一次性移除 JSON。

## Decisions

### 决策 1：protobuf 作为传输格式，不作为业务模型

业务层仍使用前置 change 定义的消息语义。protobuf schema 只负责稳定字段编号、类型和嵌套结构。

### 决策 2：保留 JSON 兼容窗口

服务端根据客户端能力或消息首帧选择 JSON/protobuf。生产灰度期间可按配置回退 JSON，便于排查问题。

### 决策 3：schema 使用短编码字段

protobuf 字段直接承载 `symbolCode`、`cardCode`、`phraseCode`、动作编码、`version`、`eventSeq` 等短字段，不再包含完整牌对象。

### 决策 4：首版使用静态 envelope codec

首版新增 `.proto` 固定字段编号，并使用约 2KB 级别的静态 envelope 编解码器承载与 JSON 协议等价的 payload。这样小程序端不需要引入完整 protobuf runtime；服务端可按连接协商发送 binary frame。payload 内部后续可继续从 JSON 字符串迁移到纯 typed protobuf 字段，且 JSON 回滚路径保持可用。

## Risks / Trade-offs

- [小程序端 protobuf 包体增加] → 选择轻量 runtime 或预生成静态编码器，并检查小游戏包体。
- [二进制调试困难] → 保留 JSON 诊断模式和服务端脱敏日志摘要。
- [schema 演进错误] → 字段编号不可复用，新增字段保持向后兼容。

## Migration Plan

1. 新增 `.proto` 与生成/加载流程。
2. 服务端支持 protobuf 编解码和二进制 frame。
3. 客户端支持 protobuf 编解码和能力声明。
4. 增加 JSON/protobuf 同语义测试。
5. 灰度开启 protobuf，保留 JSON 回滚开关。

## Open Questions

- 小程序端采用静态生成代码还是轻量运行时库，需要在实现前用包体和性能快速验证。
