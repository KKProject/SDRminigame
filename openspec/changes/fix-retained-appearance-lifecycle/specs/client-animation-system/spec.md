## MODIFIED Requirements

### Requirement: 出现牌复合动画
客户端动画系统 SHALL 将抓牌和出牌统一播放为出现牌复合动画，并 MUST 使用服务端公开的动画分支决定牌是保留等待响应还是自动归入弃牌区。客户端 MUST 让 retained 出现牌只在对应权威响应仍然有效时存在；无论后续权威事件被正常播放、免回执跳过、因重连或积压跳播，还是通过结果快照恢复，客户端都 MUST 应用该事件要求的出现牌收尾。

#### Scenario: 有响应机会时保留出现牌
- **WHEN** 客户端收到 `appearanceResolution` 为 `await-response` 的抓牌或出牌事件
- **THEN** 客户端 MUST 在出现位置将大牌按 `80% → 120% → 100%` 播放入场动画
- **AND** 入场动画完成后 MUST 以正常大小保留该大牌等待响应

#### Scenario: 初始无人响应时直接归位
- **WHEN** 客户端收到 `appearanceResolution` 为 `auto-discard` 的抓牌或出牌事件
- **THEN** 客户端 MUST 在完成 `80% → 120% → 100%` 入场动画后立即将大牌缩小并移动到最终弃牌槽位
- **AND** 动画到达时的尺寸和位置 MUST 与最终静态 mini 弃牌一致

#### Scenario: 消耗操作立即移除等待牌
- **WHEN** 吃、碰、招、踏或胡操作开始并消耗当前保留出现牌
- **THEN** 客户端 MUST 立即移除保留出现牌
- **AND** 客户端 MUST 随即开始对应动作动画

#### Scenario: 过操作保留等待牌
- **WHEN** 玩家对当前出现牌选择“过”且仍可能有其他玩家响应
- **THEN** 客户端 MUST 继续显示保留出现牌
- **AND** 客户端 MUST NOT 因单个玩家选择“过”而提前将牌移入弃牌区

#### Scenario: 结果事件结束等待牌
- **WHEN** 当前响应中的牌局直接进入进圈、流局或结算结果
- **THEN** 客户端 MUST 移除当前 retained 出现牌及其临时动画视觉
- **AND** 稳定结果画面 MUST NOT 继续显示该出现牌

#### Scenario: 跳过消费事件仍完成收尾
- **WHEN** 客户端因 `selfAcked`、重连、事件积压或已播放去重而不播放 `unclaimed`、吃、碰、招、踏或胡事件
- **THEN** 客户端 MUST 仍按该权威事件的消费或归位语义释放对应 retained 出现牌
- **AND** 客户端 MUST NOT 因执行收尾而补播动画、动作音效或重复完成通知

#### Scenario: 无事件快照保持权威一致
- **WHEN** 客户端收到没有当前公开事件的权威快照
- **THEN** 客户端 MUST 根据权威状态判断当前 held card 是否仍是活动响应牌
- **AND** 若活动响应仍然存在则 MUST 保留该牌
- **AND** 若权威状态已进入结果或不再包含该活动响应牌则 MUST 清理该牌
