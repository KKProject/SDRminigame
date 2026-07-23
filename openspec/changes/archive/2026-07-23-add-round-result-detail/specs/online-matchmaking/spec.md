## ADDED Requirements

### Requirement: 单局结果全员确认继续
系统 SHALL 在未达到最大局数的 `finished` 房间中维护按当前局号绑定的继续确认状态。每名仍占用房间座位的真人 MUST 在查看单局结果后确认继续，AI MUST 自动视为无需确认；只有全部所需真人均已确认时，服务端才 MUST 原子地开始下一局。

#### Scenario: 单名真人确认后继续等待
- **WHEN** 当前局未达到最大局数且一名真人确认继续
- **AND** 房间内仍有其他真人未确认
- **THEN** 服务端 MUST 保持房间为当前局 `finished` 状态
- **AND** 服务端 MUST 向所有房间玩家广播最新确认摘要

#### Scenario: 最后一名真人确认后自动开局
- **WHEN** 当前局未达到最大局数且最后一名所需真人确认继续
- **THEN** 服务端 MUST 在同一房间自动开始下一局
- **AND** 房间号、座位和当前房间配置 MUST 保持不变
- **AND** 新局局号 MUST 正确递增

#### Scenario: AI 不阻塞下一局
- **WHEN** 房间包含一个或多个 AI 座位
- **THEN** AI 座位 MUST NOT 出现在所需确认集合中
- **AND** 所有真人确认后 MUST 能直接开始下一局

#### Scenario: 重复确认保持幂等
- **WHEN** 同一真人针对同一局重复提交继续确认
- **THEN** 服务端 MUST 只记录一次确认
- **AND** 服务端 MUST NOT 重复开局或重复递增局号

#### Scenario: 最终局禁止普通继续
- **WHEN** 当前局数已经达到房间最大局数
- **THEN** 服务端 MUST NOT 创建普通下一局确认状态
- **AND** 服务端 MUST 拒绝普通继续请求
- **AND** 客户端 MUST 只提供“查看战绩”入口
