## Context

花牌固定为 8 句、每句 3 字、每字 6 张，共 24 种字和 144 张具体牌。现有规则表已经稳定记录每个字的 `key`、`text`、`phraseId`、`position`、`order`、颜色等信息。实时传输无需重复发送这些元数据。

## Goals / Non-Goals

**Goals:**

- 定义稳定 `symbolCode`、`cardCode`、`actionCode`。
- 在 WebSocket 传输边界支持短结构与现有对象互转。
- 保持渲染层和规则层可按需继续使用完整牌对象。

**Non-Goals:**

- 不改变牌局规则、牌序、发牌算法或计分。
- 不在本 change 中实现增量事件流。
- 不在本 change 中引入 protobuf 依赖。

## Decisions

### 决策 1：`symbolCode` 使用 0-based 顺序

`symbolCode` 按 `DEFAULT_RULES.cardSymbols` 顺序取 `0..23`，例如 `0=上`、`1=大`、`2=人`。0-based 与数组索引、protobuf `uint32` 和现有 `order` 更自然。

### 决策 2：`cardCode = symbolCode * copiesPerSymbol + copy`

每张具体牌可用 `0..143` 表示，能无损还原现有 `id: key-copy`。当消息只需要视觉等价的字时使用 `symbolCode`；当消息需要指定具体手牌移除、发牌或重连手牌时使用 `cardCode`。

### 决策 3：编码集中在传输边界

引擎内部仍可使用完整牌对象，避免一次性重构规则逻辑。socket 发送前编码，接收后在客户端恢复为渲染需要的对象或直接使用短结构。

### 决策 4：消息带 codec version

JSON envelope 或 payload 增加协议/codec 版本，方便后续 protobuf 或新动作字段灰度。

## Risks / Trade-offs

- [编码顺序变更会破坏兼容] → 以 `DEFAULT_RULES.cardSymbols` 固定顺序为协议契约，并加测试锁定。
- [同字不同 copy 视觉等价但手牌移除需要具体牌] → 传输规范明确 `symbolCode` 与 `cardCode` 的使用边界。
- [部分旧消息仍含完整牌对象] → 初期允许兼容解码，但新增实时消息必须优先使用短结构。

## Migration Plan

1. 新增 codec 模块和映射测试。
2. 给 socket 消息增加 codec version。
3. 将实时 payload 中的牌字段逐步替换为 `symbolCode/cardCode`。
4. 保留兼容解码直到所有实时路径迁移完成。

## Open Questions

- 是否需要把 `phraseCode` 作为独立编码加入首版 codec；当前建议加入，值为 `0..7`。
