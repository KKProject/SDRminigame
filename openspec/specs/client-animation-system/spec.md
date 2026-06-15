# client-animation-system Specification

## Purpose
TBD - created by archiving change refactor-tween-animation-system. Update Purpose after archive.
## Requirements
### Requirement: 单一动画更新循环
客户端动画系统 SHALL 使用 Tween.js 进行数值补间，并 MUST 由游戏现有的 `requestAnimationFrame` 主循环传入统一时间戳更新；动画系统 MUST NOT 创建独立的持续帧循环。

#### Scenario: 主循环驱动动画
- **WHEN** 游戏主循环产生新一帧并传入时间戳
- **THEN** 动画系统 MUST 使用该时间戳更新所有活动 Tween
- **AND** Canvas 渲染 MUST 使用更新后的视觉状态绘制当前帧

#### Scenario: 无活动动画
- **WHEN** 当前没有活动动画
- **THEN** 动画系统 MUST 保持可更新且不得启动额外帧循环
- **AND** 正常牌桌渲染 MUST 不受影响

### Requirement: 动画职责解耦
客户端 SHALL 将动画编排、游戏事件映射和 Canvas 绘制分离。动画管理器 MUST NOT 访问网络、云函数、牌局裁决或 Canvas 上下文；渲染器 MUST NOT 管理 Tween 生命周期、在线事件序号或动画完成回执。

#### Scenario: 渲染动画视觉状态
- **WHEN** 动画管理器输出一张动画牌及其位置、缩放和透明度
- **THEN** 渲染器 MUST 按视觉状态绘制该牌
- **AND** 渲染器 MUST NOT 自行计算该动画的时间进度或完成时机

#### Scenario: 游戏事件映射为动画方案
- **WHEN** 客户端需要播放抓牌、出牌、弃牌归位、吃、碰、招、踏、胡或结算事件
- **THEN** 独立动画预设层 MUST 将事件转换为声明式动画方案
- **AND** 网络控制器和渲染器 MUST NOT 分别实现同一事件的动画流程

### Requirement: 可编排动画生命周期
动画管理器 SHALL 支持动画步骤的串行、并行、停留、取消和完成通知。每次动画播放的完成通知 MUST 恰好触发一次，已取消或被替换动画的完成通知 MUST NOT 影响后续动画。

#### Scenario: 串行动画
- **WHEN** 动画方案要求牌先移动到玩家前方并等待响应，再移动到弃牌区
- **THEN** 动画管理器 MUST 按方案顺序执行各阶段
- **AND** 后一阶段 MUST NOT 在前一阶段完成或被明确释放前开始

#### Scenario: 并行动画
- **WHEN** 动画方案包含同时发生的牌移动和动作效果
- **THEN** 动画管理器 MUST 并行更新这些步骤
- **AND** 方案完成通知 MUST 在所有必需并行步骤完成后触发

#### Scenario: 动画被取消
- **WHEN** 活动动画因状态恢复、权威事件不匹配或场景退出被取消
- **THEN** 动画管理器 MUST 清理对应 Tween 和临时视觉状态
- **AND** 被取消动画的旧完成回调 MUST NOT 在之后触发

### Requirement: 统一播放入口
客户端 SHALL 让在线权威事件、本地操作预演和单机状态变化通过同一动画管理器播放。相同牌局事件 MUST NOT 因多个入口或重复状态更新而重复播放。

#### Scenario: 在线权威事件播放
- **WHEN** 在线控制器提交一个尚未播放的权威公开事件
- **THEN** 动画管理器 MUST 使用对应预设播放该事件
- **AND** 动画完成后 MUST 向调用方返回唯一完成通知

#### Scenario: 单机状态变化播放
- **WHEN** 单机牌局产生需要展示的状态变化
- **THEN** 客户端 MUST 将状态变化转换为统一动画事件或方案后交给动画管理器
- **AND** 单机模式 MUST NOT 继续维护独立的手写补间引擎

#### Scenario: 重复事件被忽略
- **WHEN** 同一事件因重复快照、重复调用或重连恢复再次提交
- **THEN** 动画管理器或其调用方 MUST 根据稳定事件标识忽略重复播放
- **AND** 已完成事件的视觉效果和完成通知 MUST NOT 再次触发

### Requirement: 本地预演对账
动画管理器 SHALL 支持本地操作预演的确认与取消。匹配的权威事件 MUST 复用本地预演并继续完成，不得从头重播；不匹配或被拒绝的预演 MUST 被取消并恢复到权威状态。

#### Scenario: 本地预演被权威事件确认
- **WHEN** 玩家操作已开始本地预演，随后收到类型和来源匹配的权威事件
- **THEN** 动画管理器 MUST 将预演对账为该权威事件并继续必要的剩余阶段
- **AND** 已经播放的动画与音效 MUST NOT 重复播放

#### Scenario: 本地预演被拒绝或不匹配
- **WHEN** 服务端拒绝本地操作或返回不匹配的权威事件
- **THEN** 动画管理器 MUST 取消预演并清理临时视觉状态
- **AND** 客户端 MUST 根据最新权威快照和事件恢复画面

### Requirement: 动画表现兼容
迁移到 Tween.js 后，客户端 MUST 保持现有牌图比例、四座位动画目标、安全区域适配、动作音效触发和关键动画阶段语义。

#### Scenario: 不同座位播放牌动画
- **WHEN** 任一座位执行抓牌、出牌、弃牌归位或凑牌动作
- **THEN** 动画 MUST 从该座位对应位置移动到正确的桌前、弃牌区或凑牌区
- **AND** 动画牌 MUST 按资源比例显示且不得被全面屏安全区域遮挡

#### Scenario: 迁移后动作音效
- **WHEN** 一个未重复的牌或动作事件首次开始播放
- **THEN** 客户端 MUST 播放对应音效
- **AND** 动画确认、重复快照或回执重试 MUST NOT 导致音效重复

