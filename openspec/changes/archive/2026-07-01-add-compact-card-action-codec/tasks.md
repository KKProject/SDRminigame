## 1. Codec 定义

- [x] 1.1 新增共享或同构的牌编码表，固定 `symbolCode`、`phraseCode`、`cardCode` 映射
- [x] 1.2 新增动作编码表，覆盖出牌、吃、碰、招、踏、胡、过、接庄、不接庄和交牌
- [x] 1.3 为 socket 消息增加 codec/protocol version 字段或等价协商字段

## 2. 服务端编码边界

- [x] 2.1 在服务端 socket 发送边界增加完整牌对象到短编码的转换函数
- [x] 2.2 在服务端 socket 接收边界支持短编码 intent 解码
- [x] 2.3 保持引擎内部继续使用现有牌对象，避免规则逻辑大改

## 3. 客户端解码边界

- [x] 3.1 在客户端 socket 接收边界增加短编码到渲染牌对象的转换函数
- [x] 3.2 将实时消息处理路径改为优先读取 `symbolCode/cardCode/phraseCode/actionCode`
- [x] 3.3 对不支持 codec version 或未知编码的消息触发 socket 快照恢复

## 4. 测试

- [x] 4.1 增加 24 种 `symbolCode` 映射测试
- [x] 4.2 增加 144 张 `cardCode` 往返测试
- [x] 4.3 增加动作编码往返和未知编码拒绝测试
- [x] 4.4 运行 `node scripts/run-online-checks.mjs`
- [x] 4.5 运行 `node scripts/run-server-core-checks.mjs`
