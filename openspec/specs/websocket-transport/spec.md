# websocket-transport Specification

## Purpose
TBD - created by archiving change migrate-realtime-sync-to-websocket. Update Purpose after archive.
## Requirements
### Requirement: WebSocket 连接与鉴权
系统 SHALL 为在线牌桌提供自有 WSS 主通信通道。客户端 MUST 使用自有服务签发的短期 socket token，通过 `wx.connectSocket` 连接配置的 `wss://` 域名；socket 服务 MUST 校验 token 的签名、过期时间和绑定用户身份，并将连接绑定到对应 OPENID。未鉴权或鉴权失败的连接 MUST 被拒绝，且 MUST NOT 订阅房间或提交牌局操作。

#### Scenario: 使用有效凭证连接
- **WHEN** 已登录玩家携带有效 socket token 建立 WebSocket 连接
- **THEN** socket 服务 MUST 接受连接并绑定该玩家 OPENID
- **AND** 客户端 MUST 能继续发送入房订阅或状态同步消息

#### Scenario: 无效凭证被拒绝
- **WHEN** 客户端使用缺失、过期、签名无效或用户不匹配的 token 连接
- **THEN** socket 服务 MUST 拒绝该连接
- **AND** 服务端 MUST NOT 暴露任何房间状态或玩家私密信息

#### Scenario: 不使用云托管连接
- **WHEN** 客户端建立在线牌桌 WebSocket 连接
- **THEN** 客户端 MUST 使用普通 `wx.connectSocket`
- **AND** 客户端 MUST NOT 使用 `wx.cloud.connectContainer`

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
系统 SHALL 允许已鉴权连接订阅自己所在的在线房间。socket 服务 MUST 校验连接用户属于目标房间后才允许订阅；订阅成功、首次进入、重连和恢复时服务端 MUST 向该连接发送当前权威快照。服务端权威状态变化后 SHOULD 通过 socket 向房间内已订阅连接推送权威事件或增量 delta，并仅在首次订阅、重连、事件缺口或无法安全增量表达时下发完整快照。公共消息不得包含其他玩家私密手牌；本人私密视图或私有增量补丁只发给对应玩家连接。

#### Scenario: 房间成员订阅成功
- **WHEN** 已鉴权玩家订阅自己所在的房间
- **THEN** socket 服务 MUST 记录该连接的房间订阅
- **AND** 服务端 MUST 向该连接发送当前权威快照

#### Scenario: 非成员订阅被拒绝
- **WHEN** 已鉴权玩家尝试订阅自己不属于的房间
- **THEN** socket 服务 MUST 拒绝订阅
- **AND** 服务端 MUST NOT 下发该房间的公共状态或私密状态

#### Scenario: 状态变化广播增量
- **WHEN** 服务端裁决导致房间权威状态变化且该变化可安全增量表达
- **THEN** socket 服务 SHOULD 向该房间所有已订阅连接推送权威事件或增量 delta
- **AND** socket 服务 MUST NOT 在正常路径为每个连接重新拉取并下发完整快照

#### Scenario: 增量私有补丁只发本人
- **WHEN** 增量 delta 需要携带响应窗口按钮、本人选择状态或其他私有字段
- **THEN** socket 服务 MUST 为每个连接生成只属于该连接玩家的私有补丁
- **AND** socket 服务 MUST NOT 在公共 delta 中广播任一玩家的完整候选动作列表

#### Scenario: 需要快照恢复
- **WHEN** 客户端首次订阅、重连、报告事件缺口、codec 不支持或增量无法应用
- **THEN** socket 服务 MUST 向该连接下发最新权威快照
- **AND** 快照 MUST 包含该连接玩家可见的公共状态和本人私密视图

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


### Requirement: 实时消息紧凑编码版本
系统 SHALL 为 WebSocket 牌桌实时消息提供稳定的 codec 版本。客户端和服务端 MUST 能识别当前实时消息使用的编码版本，并在不支持该版本时拒绝处理或请求完整快照恢复。

#### Scenario: 使用支持的 codec 版本
- **WHEN** 客户端收到带受支持 codec 版本的实时消息
- **THEN** 客户端 MUST 使用对应 codec 解码牌、动作和短字段
- **AND** 客户端 MUST 正常执行后续版本和事件序号校验

#### Scenario: 收到不支持的 codec 版本
- **WHEN** 客户端收到不支持的 codec 版本
- **THEN** 客户端 MUST 停止应用该增量消息
- **AND** 客户端 MUST 通过 socket 重新订阅或请求完整快照恢复

### Requirement: 牌与动作编码边界
WebSocket 实时消息 SHALL 优先使用紧凑的 `symbolCode`、`cardCode`、`phraseCode` 和动作编码传输牌局语义。实时消息 MUST NOT 重复携带可由固定规则表推导的牌面文字、句子文本、颜色、排序权重或完整牌对象，除非该消息明确声明为兼容旧格式或诊断输出。

#### Scenario: 传输具体手牌
- **WHEN** 服务端下发发牌、重连快照或其他需要精确手牌的私密数据
- **THEN** 消息 MUST 使用 `cardCode` 表示具体牌
- **AND** 客户端 MUST 能从 `cardCode` 还原现有渲染所需牌对象

#### Scenario: 传输公开动作字义
- **WHEN** 服务端下发碰、招、踏、弃牌等只需要字义和视觉表现的公开动作
- **THEN** 消息 MUST 使用 `symbolCode` 表示对应字
- **AND** 消息 MUST NOT 为该字重复发送文字、颜色或句子元数据

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
