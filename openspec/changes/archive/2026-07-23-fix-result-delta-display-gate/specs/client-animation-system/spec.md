## MODIFIED Requirements

### Requirement: 显示状态闸门
客户端动画系统 SHALL 区分权威状态镜像和用于渲染的显示状态。无论权威状态来自 snapshot 还是 delta，桌面牌面、结果面板、结果按钮和结算信息 MUST 只在时间线允许的显示状态提交点进入渲染状态；响应按钮和必要的本人操作状态 MAY 在权威状态到达后即时更新。结果面板 MUST 只根据显式、受支持的 `result.type` 显示业务结论，缺失或未知类型 MUST NOT 被解释为荒庄。

#### Scenario: 胡牌动画先于结算面板
- **WHEN** 客户端收到包含 `publicEvent.type=hu` 且权威 `phase=result` 的快照
- **THEN** 客户端 MUST 先播放、快进或跳过 `hu` 事件
- **AND** 客户端 MUST 在该事件完成提交点之后才显示结算面板和结果按钮

#### Scenario: 胡牌增量事件先于结算面板
- **WHEN** 客户端收到包含 `event.type=hu`、权威 `phase=result` 和胡牌结果的 WebSocket delta
- **THEN** 客户端 MUST 保持此前稳定显示状态并处理 `hu` 事件
- **AND** 客户端 MUST 在该事件完成、快进或跳过的提交点一次性显示胡牌结算和结果按钮
- **AND** 客户端 MUST NOT 在过渡期间显示荒庄、流局或其他结果

#### Scenario: 响应按钮即时可用
- **WHEN** 客户端收到当前玩家可响应的私密动作且当前显示状态仍在播放等待响应出现牌动画
- **THEN** 客户端 MUST 在不破坏出现牌动画的前提下保持响应按钮可见或在入场完成后立即可见
- **AND** 响应按钮点击 MUST 不被仅用于桌面动画的显示状态闸门永久阻塞

#### Scenario: 结果状态不抢占动画
- **WHEN** 权威状态已经进入 `phase=result` 但时间线仍在播放导致结果的公开事件
- **THEN** 渲染器 MUST 继续使用时间线允许的显示状态绘制牌桌
- **AND** 渲染器 MUST NOT 因权威镜像已为 `phase=result` 而提前绘制结果面板

#### Scenario: 缺失结果类型不冒充荒庄
- **WHEN** 渲染状态暂时处于 `phase=result` 但 `result` 缺失或 `result.type` 不受支持
- **THEN** 渲染器 MUST NOT 显示“荒庄”或“牌堆摸完，无人胡牌”
- **AND** 客户端 MUST 等待有效显示 checkpoint 或通过权威快照恢复

#### Scenario: 显式荒庄结果
- **WHEN** 时间线提交 `result.type=draw` 的有效结果状态
- **THEN** 渲染器 MUST 显示荒庄结果
- **AND** 渲染器 MUST NOT 将该结果显示为胡牌、进圈或普通流局
