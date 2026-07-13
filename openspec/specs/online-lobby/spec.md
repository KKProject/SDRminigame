# online-lobby Specification

## Purpose
TBD - created by archiving change add-online-lobby-room-entry. Update Purpose after archive.
## Requirements
### Requirement: 登录后在线大厅
系统 SHALL 在玩家完成微信登录并同步资料后进入在线大厅。大厅 MUST 展示当前玩家的基础资料，并作为后续查询房间、重连房间和创建房间的统一入口。

#### Scenario: 登录成功后显示大厅
- **WHEN** 玩家从启动界面选择在线对战并完成微信登录
- **THEN** 客户端 MUST 显示在线大厅
- **AND** 大厅 MUST 展示玩家昵称与头像；资料缺失时 MUST 使用登录流程提供的默认资料

#### Scenario: 登录失败不进入大厅
- **WHEN** 微信登录或服务端身份同步失败
- **THEN** 客户端 MUST 保持在可重试的失败状态
- **AND** 客户端 MUST NOT 显示可创建房间的大厅入口

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

### Requirement: 分享邀请入口衔接
在线大厅 SHALL 处理微信分享参数中的好友房 `roomId`。当存在待加入邀请房间时，客户端 MUST 先满足启动页微信头像昵称门禁，登录成功后优先尝试加入该房间，而不是显示普通创建房间入口。

#### Scenario: 未登录分享进入先恢复后端资料
- **WHEN** 客户端启动或回前台时带有好友房 `roomId` 且本地没有微信头像昵称资料
- **THEN** 客户端 MUST 保存待加入的分享房间意图
- **AND** 客户端 MUST 先通过后端 code-only 登录尝试恢复用户资料
- **AND** 如果后端有资料，客户端 MUST 继续处理分享房间且 MUST NOT 请求微信资料授权
- **AND** 如果后端无资料，客户端 MUST 停留在启动页并提示玩家先微信登录后进入房间
- **AND** 客户端 MUST NOT 使用默认昵称直接加入分享房间

#### Scenario: 分享登录后处理邀请房间
- **WHEN** 玩家通过分享进入并完成微信资料授权和后端登录
- **THEN** 客户端 MUST 优先请求加入分享房间
- **AND** 房间存在且未开局时客户端 MUST 显示对应等待房间
- **AND** 房间存在且已开局且当前玩家属于该房间时客户端 MUST 进入游戏页面

#### Scenario: 分享房间不存在停留启动页
- **WHEN** 分享房间不存在、已结束或不可加入
- **THEN** 客户端 MUST 清理待加入分享意图
- **AND** 客户端 MUST 停留或回到启动页
- **AND** 客户端 MUST 使用 toast 提示房间不存在或已结束
- **AND** 客户端 MUST NOT 在开始按钮下方渲染同一错误文案

#### Scenario: 已有未结束房间时收到邀请
- **WHEN** 当前玩家已经参与其他未结束房间且又通过分享进入新房间
- **THEN** 客户端 MUST 优先遵守服务端返回的已有房间约束
- **AND** 客户端 MUST NOT 静默加入第二个未结束房间

### Requirement: 创建房间后进入等待房间
在线大厅 SHALL 在创建好友房成功后进入等待房间。客户端 MUST NOT 在创建成功后立即调用开局流程。

#### Scenario: 创建成功进入等待
- **WHEN** 玩家在大厅创建好友房成功
- **THEN** 客户端 MUST 显示该房间等待房间
- **AND** 客户端 MUST NOT 自动开始第一局

### Requirement: 启动页登录门禁
系统 SHALL 在启动页以微信头像昵称作为玩家身份初始化门禁。玩家本地未获取过微信头像昵称时，客户端 SHALL 先调用后端 code-only 登录尝试恢复数据库中已保存的头像昵称；后端已有资料时客户端 MUST 使用该资料完成门禁且 MUST NOT 重复请求微信资料；本地和后端都没有资料时，客户端 MUST NOT 进入创建房间或分享房间流程，直到玩家完成微信资料授权。

#### Scenario: 本地未获取资料进入首页先恢复后端资料
- **WHEN** 玩家进入启动页且本地没有微信头像昵称资料
- **THEN** 客户端 MUST 通过 `wx.login` 调用后端 code-only 登录
- **AND** 如果后端用户资料包含头像或昵称，启动页 MUST 进入已准备态
- **AND** 客户端 MUST NOT 请求微信头像昵称授权

#### Scenario: 本地和后端均无资料时提示登录
- **WHEN** 玩家进入启动页且本地和后端都没有微信头像昵称资料
- **THEN** 启动页 MUST 显示微信登录提示态
- **AND** 客户端 MUST 提供微信资料授权按钮
- **AND** 客户端 MUST NOT 使用默认昵称绕过微信资料授权进入创建房间或分享房间流程

#### Scenario: 点击开始先获取微信资料
- **WHEN** 本地没有微信头像昵称资料的玩家在启动页点击开始入口
- **THEN** 客户端 MUST 先通过微信资料授权获取头像昵称
- **AND** 授权成功后客户端 MUST 保存头像昵称并调用后端登录接口
- **AND** 后端登录成功后客户端 MUST 进入房间创建页

#### Scenario: 已有资料点击开始直接后端登录
- **WHEN** 玩家进入启动页且本地已经保存微信头像或昵称
- **THEN** 启动页 MUST 允许玩家点击开始入口
- **AND** 点击开始时客户端 MUST 直接调用后端登录接口
- **AND** 客户端 MUST NOT 再弹出或创建微信资料授权按钮
- **AND** 后端登录成功后客户端 MUST 进入房间创建页

#### Scenario: 登录失败可重试
- **WHEN** 微信资料授权失败、资料为空或后端登录失败
- **THEN** 客户端 MUST 留在启动页
- **AND** 客户端 MUST 显示可重试的登录提示或失败状态
- **AND** 客户端 MUST NOT 创建房间或加入分享房间

### Requirement: 后端用户资料合并
后端登录 SHALL 将数据库中已保存的微信头像昵称作为后续静默登录的资料来源。`login` 接口收到空 profile 时 MUST NOT 清空已有 `nickName` 或 `avatarUrl`；收到部分 profile 时 MUST 只更新非空字段。

#### Scenario: code-only 登录保留已有资料
- **WHEN** 已有用户记录包含 `nickName` 和 `avatarUrl`
- **AND** 客户端调用 `login` 时只传 `code` 且没有有效 profile
- **THEN** 后端 MUST 更新 `lastLoginAt`
- **AND** 后端 MUST 保留原有 `nickName` 和 `avatarUrl`
- **AND** 登录响应 MUST 返回保留后的用户资料

#### Scenario: 部分资料登录不清空另一项
- **WHEN** 已有用户记录包含 `nickName` 和 `avatarUrl`
- **AND** 客户端调用 `login` 时只传入新的非空 `nickName`
- **THEN** 后端 MUST 更新 `nickName`
- **AND** 后端 MUST 保留原有 `avatarUrl`

### Requirement: 创建页确认创建房间
系统 SHALL 在创建房间设置页提交玩家选择的房间配置并创建服务端房间。创建成功后客户端 MUST 进入选择座位关系页面。

#### Scenario: 提交完整房间设置
- **WHEN** 已登录玩家在创建房间设置页点击确认创建
- **THEN** 客户端 MUST 请求服务端创建房间
- **AND** 请求 MUST 携带 `settings.maxRounds`、`settings.repeatRound`、`settings.washTwice` 和 `settings.payType`
- **AND** 客户端 MUST 在创建中阻止重复提交

#### Scenario: 创建成功进入座位选择
- **WHEN** 服务端创建房间成功
- **THEN** 客户端 MUST 保存创建结果中的房间状态
- **AND** 客户端 MUST 显示选择座位关系页面
- **AND** 客户端 MUST NOT 在本次流程中执行座位确认逻辑

#### Scenario: 创建失败停留设置页
- **WHEN** 服务端创建房间失败
- **THEN** 客户端 MUST 停留在创建房间设置页
- **AND** 客户端 MUST 显示创建失败原因
- **AND** 客户端 MUST 允许玩家再次确认创建

### Requirement: 房间设置预留字段
系统 SHALL 保存创建房间时提交的完整规则设置。当前对局逻辑 MUST 只消费 `maxRounds`，其他字段作为预留字段保存并返回。

#### Scenario: 服务端保存预留字段
- **WHEN** 创建房间请求携带 `repeatRound`、`washTwice` 和 `payType`
- **THEN** 服务端 MUST 将这些字段保存到房间 `settings`
- **AND** 等待房间快照和创建响应 MUST 返回归一化后的完整 `settings`

#### Scenario: 旧客户端兼容
- **WHEN** 创建房间请求只携带旧的顶层 `maxRounds`
- **THEN** 服务端 MUST 使用默认值补齐预留字段
- **AND** 服务端 MUST 保持旧客户端创建房间成功

### Requirement: 在线四页状态模型
在线大厅系统 SHALL 将玩家可见在线流程收敛为四个一等页面：大厅、房间创建、等待页面和游戏页面。客户端 MUST NOT 在正常在线流程中暴露旧的座位选择占位页或大厅内嵌创建页作为独立落点。

#### Scenario: 大厅进入房间创建页
- **WHEN** 已登录玩家在大厅点击创建房间入口
- **THEN** 客户端 MUST 显示房间创建页
- **AND** 客户端 MUST NOT 在大厅直接提交创建房间请求

#### Scenario: 创建成功进入等待页面
- **WHEN** 已登录玩家在房间创建页确认创建且服务端返回等待房间快照
- **THEN** 客户端 MUST 保存房间状态并显示等待页面
- **AND** 客户端 MUST NOT 显示旧座位选择占位页

#### Scenario: 游戏开局进入游戏页面
- **WHEN** 等待页面中房间成功开局或玩家重连到已开始牌桌
- **THEN** 客户端 MUST 隐藏菜单并显示游戏页面
- **AND** 客户端 MUST 将触摸输入交给在线牌桌控制器

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

### Requirement: 大厅不承载规则创建控件
在线大厅系统 SHALL 将规则选择和创建提交限制在房间创建页。大厅页面 MAY 展示玩家资料、创建入口、加入入口、邀请入口或错误重试，但 MUST NOT 渲染局数选择、规则选项或直接创建房间提交按钮。

#### Scenario: 大厅空闲态只展示入口
- **WHEN** 已登录玩家处于大厅空闲态且没有未结束房间
- **THEN** 客户端 MUST 展示进入房间创建页的入口
- **AND** 客户端 MUST NOT 展示局数选择控件或直接创建房间按钮

#### Scenario: 创建失败停留创建页
- **WHEN** 玩家在房间创建页提交创建请求失败
- **THEN** 客户端 MUST 停留在房间创建页
- **AND** 客户端 MUST 显示失败原因并允许再次提交

### Requirement: 页面状态诊断
在线大厅系统 SHALL 在关键页面跳转处保留可测试、可诊断的页面状态。测试和诊断 MUST 能区分大厅、房间创建、等待页面和游戏页面。

#### Scenario: 回大厅状态可断言
- **WHEN** 客户端执行回大厅流程
- **THEN** 测试 MUST 能断言主页面状态为大厅
- **AND** 菜单渲染状态 MUST 与大厅一致

#### Scenario: 非法旧页面入口可检测
- **WHEN** 创建成功、游戏结束或退出牌桌流程完成
- **THEN** 测试 MUST 能确认客户端没有落到旧座位选择页或大厅内嵌创建控件

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

