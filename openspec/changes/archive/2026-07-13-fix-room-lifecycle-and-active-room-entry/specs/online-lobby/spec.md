## MODIFIED Requirements

### Requirement: 大厅内自动查询未结束房间
在线大厅 SHALL 在显示后查询服务端是否存在当前玩家参与且可恢复的牌桌。可恢复状态 MUST 仅包括 `waiting`、`playing` 和 `finished`；`tableResult`、`closed` 或不存在的房间 MUST 作为无可恢复房间处理。查询期间大厅 MUST 显示加载状态，并 MUST NOT 允许玩家重复触发创建房间。

#### Scenario: 查询可恢复房间
- **WHEN** 在线大厅首次显示
- **THEN** 客户端 MUST 调用服务端查询当前玩家可恢复牌桌
- **AND** 大厅 MUST 显示正在检查房间的加载状态

#### Scenario: 查询失败可重试
- **WHEN** 查询可恢复房间失败
- **THEN** 大厅 MUST 显示查询失败状态
- **AND** 大厅 MUST 提供重试入口以重新查询可恢复房间

#### Scenario: 终局房间不作为当前房间
- **WHEN** 当前玩家只参与状态为 `tableResult` 或 `closed` 的房间
- **THEN** 服务端 MUST 返回没有可恢复房间
- **AND** 客户端 MUST 停留在大厅并显示创建房间入口

### Requirement: 大厅内进入已有房间
当服务端返回可恢复房间时，在线大厅 SHALL 根据房间状态进入对应页面。`waiting` MUST 进入等待页面，`playing` 和 `finished` MUST 进入游戏页面；客户端 MUST NOT 将 `tableResult` 自动恢复到游戏页面，也 MUST NOT 在恢复可用房间期间显示创建房间按钮。

#### Scenario: waiting 进入等待页面
- **WHEN** 服务端查询返回当前玩家存在 `waiting` 房间
- **THEN** 客户端 MUST 保存房间信息并进入等待页面
- **AND** 客户端 MUST 开始等待房状态刷新

#### Scenario: playing 进入游戏页面
- **WHEN** 服务端查询返回当前玩家存在 `playing` 房间
- **THEN** 客户端 MUST 建立 socket 连接并订阅该房间
- **AND** 客户端 MUST 使用权威快照进入游戏页面

#### Scenario: finished 进入游戏页面
- **WHEN** 服务端查询返回当前玩家存在 `finished` 房间
- **THEN** 客户端 MUST 进入游戏页面并恢复本局结果视图
- **AND** 客户端 MUST 保留继续下一局所需的房间号、座位和累计积分

#### Scenario: 进入已有房间失败
- **WHEN** 大厅尝试进入服务端返回的可恢复房间失败
- **THEN** 大厅 MUST 显示进入失败状态
- **AND** 大厅 MUST 允许玩家重试进入房间或重新查询可恢复房间

### Requirement: 无房间时主动创建房间
当服务端确认当前玩家没有 `waiting`、`playing` 或 `finished` 房间时，在线大厅 SHALL 显示创建房间入口。创建房间 MUST 由玩家主动触发，客户端 MUST NOT 在查询无房间后自动创建牌桌。

#### Scenario: 无可恢复房间显示创建入口
- **WHEN** 服务端查询确认当前玩家没有 `waiting`、`playing` 或 `finished` 房间
- **THEN** 大厅 MUST 显示创建房间按钮
- **AND** 大厅 MUST NOT 自动调用创建房间接口

#### Scenario: 创建时选择局数
- **WHEN** 玩家点击创建房间
- **THEN** 大厅 MUST 进入房间创建页面并提供最大局数选项 `1`、`2`、`4`、`6`
- **AND** 玩家确认设置后客户端 MUST 使用所选局数请求创建房间

#### Scenario: 创建中防止重复提交
- **WHEN** 客户端正在创建房间
- **THEN** 房间创建页面 MUST 显示创建中的加载状态
- **AND** 客户端 MUST 阻止玩家重复触发创建房间请求

### Requirement: 游戏结束统一回大厅
在线大厅系统 SHALL 在房间进入 `tableResult` 后玩家重新启动、玩家退出、房间关闭、拒绝续局或续局决策超时后统一回到大厅页面。单局结束但房间状态为 `finished` 时 MUST 进入游戏页面继续当前多局房。回大厅时客户端 MUST 清理当前牌桌会话和创建流程残留 UI。

#### Scenario: 最终结果后重新启动回大厅
- **WHEN** 玩家重新启动小游戏且旧房间已经处于 `tableResult`
- **THEN** 客户端 MUST 停留在大厅页面
- **AND** 客户端 MUST 显示创建房间入口且 MUST NOT 自动恢复最终结果牌桌

#### Scenario: 牌局结束后退出回大厅
- **WHEN** 玩家在最终结果页面选择离开牌桌或服务端返回房间已关闭状态
- **THEN** 客户端 MUST 回到大厅页面
- **AND** 客户端 MUST NOT 显示房间创建页、旧大厅内嵌创建控件或旧座位选择页

#### Scenario: 拒绝续局回大厅
- **WHEN** 玩家在最终结果或续局确认中拒绝继续当前房间
- **THEN** 客户端 MUST 回到大厅页面
- **AND** 客户端 MUST 清理当前房间号、动画状态和牌桌输入监听

#### Scenario: 房主续局决策超时回大厅
- **WHEN** 最终结果状态等待房主续局决策超时
- **THEN** 客户端 MUST 回到大厅页面
- **AND** 大厅 MUST 处于可重新进入创建房间流程的空闲状态

## ADDED Requirements

### Requirement: 创建房间冲突不得静默进入旧房间
玩家提交创建房间请求时，如果服务端发现其仍参与 `waiting`、`playing` 或 `finished` 房间，客户端 SHALL 将其作为创建冲突处理。客户端 MUST 停留在房间创建页面或显式返回大厅提示继续当前房间，MUST NOT 把本次创建操作静默转换为进入旧房间。

#### Scenario: 创建时发现进行中房间
- **WHEN** 玩家在房间创建页面确认创建且服务端返回已有可恢复房间冲突
- **THEN** 客户端 MUST 提示玩家已有进行中的房间
- **AND** 客户端 MUST NOT 自动调用旧房间进入流程
- **AND** 客户端 MUST NOT 创建第二张活动房间

#### Scenario: 冲突后主动继续当前房间
- **WHEN** 玩家在创建冲突提示后主动选择继续当前房间
- **THEN** 客户端 MUST 根据已有房间状态进入等待页面或游戏页面
- **AND** 本次页面跳转 MUST 来自玩家明确操作

### Requirement: 离桌结果与服务端一致
客户端 SHALL 以服务端离桌结果决定是否清理当前房间会话。服务端拒绝玩家离开 `waiting`、`playing` 或 `finished` 房间时，客户端 MUST NOT 假装离桌成功或显示可无冲突创建新房间的状态。

#### Scenario: 离桌成功回大厅
- **WHEN** 服务端确认玩家已经离开、房间已经关闭或玩家成员关系已经释放
- **THEN** 客户端 MUST 清理房间会话、socket、动画状态和牌桌输入
- **AND** 客户端 MUST 回到大厅

#### Scenario: 离桌被拒绝保留当前房间
- **WHEN** 服务端返回 `ROOM_NOT_FINISHED` 或其他未离房错误
- **THEN** 客户端 MUST 保留当前房间会话并显示明确提示
- **AND** 客户端 MUST 继续显示或重新恢复对应等待页面或游戏页面
