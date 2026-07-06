## ADDED Requirements

### Requirement: 响应 UI 由私密窗口协议驱动
客户端动画系统 SHALL 将响应按钮的弹出、等待、失效和收起视为本地 UI 生命周期，并 MUST 由服务端下发的私密响应动作和窗口状态驱动。客户端 MUST NOT 根据本地规则、公共响应候选或零散 `pendingActions` 推导可点击响应按钮；客户端 MAY 播放按钮弹出或收起过渡，但这些过渡 MUST NOT 触发公开动画回执。

#### Scenario: 私密动作可用时弹出按钮
- **WHEN** 客户端收到当前 `responseWindowId` 的私密 `playerActions`
- **AND** 私密动作列表不为空
- **THEN** 客户端 MUST 展示本机响应按钮
- **AND** 客户端 MAY 播放本地按钮弹出动画

#### Scenario: 私密动作清空时收起按钮
- **WHEN** 客户端收到当前响应窗口的空 `playerActions` 或 `actionState` 表示不可操作
- **THEN** 客户端 MUST 收起本机响应按钮
- **AND** 客户端 MUST NOT 再允许点击该窗口的旧按钮

#### Scenario: 按钮 UI 不提交动画回执
- **WHEN** 响应按钮弹出、进入等待态、失效或收起动画完成
- **THEN** 客户端 MUST NOT 将该 UI 过渡作为公开事件动画完成
- **AND** 客户端 MUST NOT 因按钮 UI 变化提交 `eventSeq` 回执

#### Scenario: 不从公共摘要构造按钮
- **WHEN** 公共响应窗口摘要显示某些席位正在等待响应
- **THEN** 客户端 MUST 只将该摘要用于公共提示或等待状态
- **AND** 客户端 MUST NOT 根据公共摘要构造具体吃、碰、招、踏、胡或过按钮

### Requirement: 出现牌保留与响应窗口衔接
客户端动画系统 SHALL 使用权威出现牌公开事件控制出现牌保留、归位和释放。`await-response` 出现牌入场完成后 MUST 保留在来源席位前方等待响应窗口；响应按钮变化 MUST NOT 移除该保留牌；只有权威 `unclaimed`、吃、碰、招、踏或胡公开事件才能释放或消耗该保留牌。

#### Scenario: 等待响应出现牌保留到窗口结果
- **WHEN** 客户端完成 `appearanceResolution=await-response` 的抓牌或出牌入场动画
- **THEN** 客户端 MUST 保留该出现牌视觉
- **AND** 客户端 MUST 在响应窗口打开、按钮变化或玩家过牌时继续保留该牌

#### Scenario: 无人响应事件释放保留牌
- **WHEN** 客户端收到与当前保留牌匹配的 `unclaimed` 权威公开事件
- **THEN** 客户端 MUST 从保留位置开始播放归位到弃牌区的动画
- **AND** 动画完成后 MUST 移除保留视觉并显示最终静态弃牌

#### Scenario: 响应动作事件消耗保留牌
- **WHEN** 客户端收到与当前保留牌匹配的吃、碰、招、踏或胡权威公开事件
- **THEN** 客户端 MUST 在该动作动画开始前释放当前保留出现牌
- **AND** 客户端 MUST 使用权威事件播放对应动作动画

#### Scenario: 过牌不释放保留牌
- **WHEN** 本机玩家提交过牌且响应窗口仍可能等待其他玩家
- **THEN** 客户端 MUST 收起或置灰本机按钮
- **AND** 客户端 MUST 继续显示当前保留出现牌直到收到窗口结果公开事件

### Requirement: 响应窗口恢复清理
客户端动画系统 SHALL 在快照恢复、断线重连和窗口切换时清理过期响应 UI 与 pending intent。客户端 MUST 使用 `responseWindowId` 区分当前窗口和旧窗口；当快照或增量不再包含旧窗口私密动作时，客户端 MUST 清理旧按钮、等待态和本地待提交意图。

#### Scenario: 新窗口替换旧窗口
- **WHEN** 客户端收到不同于本地记录的 `responseWindowId`
- **THEN** 客户端 MUST 清理旧窗口按钮和 pending intent
- **AND** 客户端 MUST 按新窗口私密动作重新渲染响应 UI

#### Scenario: 快照显示无 active 窗口
- **WHEN** 客户端恢复快照且公共响应窗口摘要为空
- **THEN** 客户端 MUST 清理所有响应按钮和 pending response intent
- **AND** 客户端 MUST 只根据当前公开事件或静态状态恢复桌面画面

#### Scenario: 响应提交后等待服务端裁决
- **WHEN** 本机玩家点击响应按钮并已提交响应意图
- **THEN** 客户端 MUST 防止该窗口重复点击
- **AND** 客户端 MUST 等待服务端私密补丁或公开结果事件决定按钮收起和桌面动画

### Requirement: 权威协议优先于状态补偿动画
客户端动画系统 SHALL 优先使用服务端公开事件和显式响应窗口协议驱动画面。状态观察补偿入口 MAY 仅在没有当前权威公开事件且无法从协议恢复视觉时使用；当 `publicEvent`、`responseSummary` 或私密 `playerActions` 已能表达当前流程时，客户端 MUST NOT 通过状态差异额外启动出现牌、无人响应或响应完成动画。

#### Scenario: 权威出现牌事件存在
- **WHEN** 客户端收到当前 `draw` 或 `discard` 权威公开事件
- **THEN** 客户端 MUST 使用该事件播放出现牌动画
- **AND** 状态补偿入口 MUST NOT 为同一 card id 启动第二个出现牌动画

#### Scenario: 响应结果事件存在
- **WHEN** 客户端收到 `unclaimed`、吃、碰、招、踏或胡权威公开事件
- **THEN** 客户端 MUST 使用该事件释放保留牌并播放结果动画
- **AND** 状态补偿入口 MUST NOT 根据弃牌区或凑牌区差异再播放同一结果动画

#### Scenario: 无权威事件时静态恢复
- **WHEN** 客户端重连后没有需要播放或回执的当前权威公开事件
- **THEN** 客户端 MUST 以快照静态状态恢复牌桌
- **AND** 客户端 MUST NOT 补播已经结束的响应窗口按钮动画
