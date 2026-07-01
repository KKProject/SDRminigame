# WebSocket 优化实施总任务列表

本文件用于按顺序推进 WebSocket 数据传输优化。每个阶段对应一个独立 OpenSpec change；实施时一次只进入一个 change，完成验证后再进入下一阶段。

## 0. 执行规则

- [ ] 0.1 每次只 apply 一个 change，避免协议、动画和传输格式同时改动
- [ ] 0.2 每个 change 开始前先阅读该 change 的 `proposal.md`、`design.md`、`specs/**/*.md`、`tasks.md`
- [ ] 0.3 每个 change 完成后运行对应 tasks 中列出的测试
- [ ] 0.4 每个 change 完成后执行 `openspec validate --changes <change-name>`
- [ ] 0.5 前一阶段未稳定前，不进入下一阶段

## 1. 统一实时链路契约

Change: `align-realtime-socket-contract`

入口文件：

- `openspec/changes/align-realtime-socket-contract/proposal.md`
- `openspec/changes/align-realtime-socket-contract/design.md`
- `openspec/changes/align-realtime-socket-contract/tasks.md`

目标：

- [x] 1.1 统一 WebSocket 是牌桌进行中唯一实时主通道
- [x] 1.2 移除或隔离 socket 断开时的 HTTPS 实时兜底
- [x] 1.3 确保断线期间冻结最后权威画面、禁用牌桌操作并等待重连
- [x] 1.4 确保重连订阅通过 socket 快照恢复牌桌

完成门槛：

- [x] 1.5 socket 断开后，客户端不会通过 HTTPS 提交 `op`
- [x] 1.6 socket 断开后，客户端不会通过 HTTPS 提交 `ackAnimation`
- [x] 1.7 socket 断开后，客户端不会通过 HTTPS 拉取牌桌实时快照作为兜底
- [x] 1.8 `node scripts/run-online-checks.mjs` 通过
- [x] 1.9 `node scripts/run-backend-checks.mjs` 通过

## 2. 引入紧凑牌与动作编码

Change: `add-compact-card-action-codec`

入口文件：

- `openspec/changes/add-compact-card-action-codec/proposal.md`
- `openspec/changes/add-compact-card-action-codec/design.md`
- `openspec/changes/add-compact-card-action-codec/tasks.md`

目标：

- [x] 2.1 定义 `symbolCode`，固定表示 24 种字
- [x] 2.2 定义 `cardCode`，固定表示 144 张具体牌
- [x] 2.3 定义 `phraseCode`，固定表示 8 句
- [x] 2.4 定义动作编码，覆盖出牌、吃、碰、招、踏、胡、过、接庄、不接庄和交牌
- [x] 2.5 在 socket 传输边界支持短编码与现有牌对象互转

完成门槛：

- [x] 2.6 24 种 `symbolCode` 映射测试通过
- [x] 2.7 144 张 `cardCode` 往返测试通过
- [x] 2.8 动作编码往返和未知编码拒绝测试通过
- [x] 2.9 `node scripts/run-online-checks.mjs` 通过
- [x] 2.10 `node scripts/run-server-core-checks.mjs` 通过

## 3. 权威凑牌事件驱动动画和本人手牌减少

Change: `use-authoritative-meld-events`

入口文件：

- `openspec/changes/use-authoritative-meld-events/proposal.md`
- `openspec/changes/use-authoritative-meld-events/design.md`
- `openspec/changes/use-authoritative-meld-events/tasks.md`

目标：

- [x] 3.1 点击吃、碰、招、踏时只提交意图并进入等待态
- [x] 3.2 服务端确认前不移除手牌、不追加 meld、不完成凑牌动画
- [x] 3.3 服务端广播权威凑牌事件，所有客户端用同一事件播放动画
- [x] 3.4 动作本人收到自己的权威事件后按事件语义移除手牌
- [x] 3.5 其他玩家收到权威事件后只追加公开凑牌区并播放回显动画

完成门槛：

- [x] 3.6 本人点击响应后，服务端确认前手牌不减少
- [x] 3.7 本人收到权威碰/吃/招事件后手牌正确减少
- [x] 3.8 其他玩家收到权威碰/吃/招事件后只更新公开区
- [x] 3.9 并发响应中低优先级 pending intent 被正确清理
- [x] 3.10 `node scripts/run-online-checks.mjs` 通过

## 4. 增量牌桌状态流

Change: `stream-incremental-table-deltas`

入口文件：

- `openspec/changes/stream-incremental-table-deltas/proposal.md`
- `openspec/changes/stream-incremental-table-deltas/design.md`
- `openspec/changes/stream-incremental-table-deltas/tasks.md`

目标：

- [x] 4.1 保留首次进入、发牌、断线重连和恢复用完整 `snapshot`
- [x] 4.2 正常牌局推进改用 `event/delta`
- [x] 4.3 公开 `melds` 通过 append/extend 增量更新
- [x] 4.4 公开 `discards` 通过 append 增量更新
- [x] 4.5 本机普通手牌减少由权威事件本地应用，不额外发私密 hand delta
- [x] 4.6 增量无法应用时通过 socket 请求完整快照恢复

完成门槛：

- [x] 4.7 普通出牌不再对每个连接广播完整 snapshot
- [x] 4.8 客户端 append discard / append meld reducer 测试通过
- [x] 4.9 本机手牌 remove 与失败恢复测试通过
- [x] 4.10 `eventSeq` 跳号触发快照恢复测试通过
- [x] 4.11 `node scripts/run-online-checks.mjs` 通过
- [x] 4.12 `node scripts/run-backend-checks.mjs` 通过

## 5. Protobuf 二进制传输

Change: `add-protobuf-socket-transport`

入口文件：

- `openspec/changes/add-protobuf-socket-transport/proposal.md`
- `openspec/changes/add-protobuf-socket-transport/design.md`
- `openspec/changes/add-protobuf-socket-transport/tasks.md`

目标：

- [x] 5.1 新增 socket 实时消息 `.proto`
- [x] 5.2 服务端支持 protobuf binary frame 收发
- [x] 5.3 客户端支持 protobuf 能力声明与二进制消息解码
- [x] 5.4 JSON 与 protobuf 语义保持一致
- [x] 5.5 保留 JSON 回滚开关

完成门槛：

- [x] 5.6 JSON/protobuf 同语义 fixtures 测试通过
- [x] 5.7 protobuf 解码失败不会应用状态
- [x] 5.8 配置关闭 protobuf 后 JSON 路径仍可用
- [x] 5.9 `node scripts/run-online-checks.mjs` 通过
- [x] 5.10 `node scripts/run-backend-checks.mjs` 通过

## 6. 最终验收

- [x] 6.1 五个 change 均完成 tasks
- [x] 6.2 五个 change 均通过 `openspec validate --changes <change-name>`
- [x] 6.3 完整运行 `node scripts/run-server-core-checks.mjs`
- [x] 6.4 完整运行 `node scripts/run-online-checks.mjs`
- [x] 6.5 完整运行 `node scripts/run-backend-checks.mjs`
- [ ] 6.6 真机或微信开发者工具验证在线对局：出牌、吃、碰、招、踏、过、断线重连
- [ ] 6.7 验证网络消息体积较全量 snapshot 主路径明显下降
