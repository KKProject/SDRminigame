## Why

等待响应的抓牌或出牌动画会把大牌视觉以 retained 状态保留在桌面上，但当前清理逻辑没有覆盖进圈、流局、结算、重连跳播以及非必需回执客户端跳过凑牌事件等路径。结果是权威牌局已经推进、动画也已完成后，旧出现牌仍可能留在界面上，双真人与 AI 混合房间尤其容易触发。

## What Changes

- 为 retained 出现牌建立统一的语义释放规则：无人响应归位、吃、碰、招、踏、胡、进圈、流局和结算均必须结束对应出现牌的保留生命周期。
- 让跳播、`selfAcked`、重复/已播放事件和权威状态恢复路径执行与正常播放一致的必要视觉收尾，但不补播动画或重复音效。
- 结果状态清场覆盖胡牌、进圈与流局，并在进入结算或无法继续关联当前响应窗口时清理残留动画视觉。
- 保持“过”事件语义不变：单个玩家过牌且仍可能有其他响应时，不得提前释放出现牌。
- 增加双真人两 AI、终局转换、重连积压与跳播场景的客户端动画及在线同步回归测试。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `client-animation-system`: 补充 retained 出现牌在结果事件、跳过的消费事件和权威恢复路径中的完整释放要求。
- `realtime-state-sync`: 补充无需本客户端回执或因重连/积压跳播权威事件时，客户端仍必须应用事件语义收尾的同步要求。

## Impact

- 客户端动画控制器：`js/game/animation/controller.js`
- 客户端状态动画控制器：`js/game/animation/state-controller.js`
- 在线事件时间线与重连恢复：`js/net/online.js`
- 相关动画、在线同步和服务端核心回归脚本：`scripts/run-animation-checks.mjs`、`scripts/run-online-checks.mjs`、`scripts/run-server-core-checks.mjs`
- 不改变服务端游戏规则、公开事件协议或外部 API，不引入新依赖。
