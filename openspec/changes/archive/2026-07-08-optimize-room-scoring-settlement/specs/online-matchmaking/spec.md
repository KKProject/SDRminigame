## ADDED Requirements

### Requirement: 创建房间结算配置
系统 SHALL 在创建好友房间时支持配置结算规则。服务端 MUST 校验并保存 `settings.repeatRound` 和 `settings.payType`，其中 `payType` 只允许 `pihu`、`jiahu`、`changhu`；旧客户端或非法配置 MUST 归一化为默认值 `pihu`。

#### Scenario: 创建带结算配置的房间
- **WHEN** 玩家创建好友房间并传入 `settings.repeatRound = true` 和 `settings.payType = "jiahu"`
- **THEN** 服务端 MUST 创建房间并保存这些结算配置
- **AND** 等待页、牌桌快照和重连查询 MUST 返回归一化后的结算配置

#### Scenario: 非法进圈赔付配置归一化
- **WHEN** 玩家创建好友房间时传入不受支持的 `settings.payType`
- **THEN** 服务端 MUST 使用默认值 `pihu`
- **AND** 服务端 MUST NOT 保存不受支持的进圈赔付类型

#### Scenario: 旧客户端创建房间使用默认结算
- **WHEN** 创建房间请求未传入 `repeatRound` 或 `payType`
- **THEN** 服务端 MUST 使用 `repeatRound = false`
- **AND** 服务端 MUST 使用 `payType = "pihu"`

### Requirement: 房间累计积分
系统 SHALL 在一张好友房间的配置局数范围内维护四个座位的累计积分。每次胡牌或进圈结算产生的单局分数变化 MUST 累加到房间累计积分；普通下一局开始、重连和广播快照 MUST 保留累计积分；当前房间最大局数后重开 MUST 清零累计积分。

#### Scenario: 胡牌后累计积分进入下一局
- **WHEN** 第 1 局胡牌结算产生支付明细
- **THEN** 服务端 MUST 根据支付明细计算四个座位的单局分数变化
- **AND** 服务端 MUST 将单局分数变化累加到房间累计积分
- **AND** 第 2 局开局快照 MUST 继续下发第 1 局后的累计积分

#### Scenario: 进圈后累计积分进入下一局
- **WHEN** 第 1 局进圈结算产生支付明细
- **THEN** 服务端 MUST 将进圈玩家的扣分和其他三家的得分累加到房间累计积分
- **AND** 下一局开局快照 MUST 保留该累计积分

#### Scenario: 重连恢复累计积分
- **WHEN** 玩家在房间未关闭时重新进入等待页、牌桌页或最终结果页
- **THEN** 服务端 MUST 返回当前房间累计积分
- **AND** 客户端 MUST 能用该累计积分恢复头像积分显示

#### Scenario: 当前房间重开清零累计积分
- **WHEN** 牌桌达到最大局数后所有保留玩家同意在当前房间重开
- **THEN** 服务端 MUST 清零已打局数
- **AND** 服务端 MUST 清零房间累计积分
