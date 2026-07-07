## Context

当前 `StartMenu` 既承载启动页、在线大厅、房间创建设置、旧座位选择、等待房间，也承载大厅里的旧“局数 + 创建房间”快捷创建控件。`Main.mode` 也同时使用 `room-ui`、`waiting`、`online`、`lobby` 等状态。牌局结束时 `OnlineController.returnToLobby()` 会调用 `setLobbyState(IDLE)`，`Main.onLobby` 再调用 `menu.showLobby()`。因此服务端状态和控制器回调方向基本正确，但 `lobby idle` 的视觉内容仍是旧创建入口，造成“结束后回到老房间创建页面”的体验。

另外，已经归档的 `wire-room-creation-settings-flow` 仍保留了“创建成功进入选择座位页面”的阶段性设计。现在产品模型已经明确为四页：大厅、房间创建、等待页面、游戏页面，因此需要把旧 `seat-selection` 从主流程移除或隔离。

## Goals / Non-Goals

**Goals:**

- 建立单一页面状态模型：`hall`、`create-room`、`waiting-room`、`game-table`。
- 让 `returnToLobby()`、离开牌桌、拒绝续局、房主续局决策超时、房间关闭等路径都落到大厅。
- 大厅不再渲染旧局数选择和直接创建按钮；创建规则只在房间创建页选择。
- 创建成功后进入等待页面；创建失败留在房间创建页并可重试。
- 旧 `seat-selection` 不再参与主流程，不再作为创建成功或结束后的落点。
- 回归测试能直接断言菜单 screen 和 Main mode 的目标状态。

**Non-Goals:**

- 不改服务端房间生命周期和结算规则。
- 不重新设计大厅美术，只收敛页面职责和状态流转。
- 不实现真实座位选择、换座以外的新座位规则。
- 不改变当前房间设置字段含义。

## Decisions

### 1. 以四页模型作为唯一产品状态机

推荐将页面状态命名收敛为：

```text
hall -> create-room -> waiting-room -> game-table
  ^                                      |
  └──────────── end / leave / close ─────┘
```

实现上可以继续复用 `StartMenu.screen`，但必须让 screen 的可见值和产品页对应：大厅、创建、等待、游戏外部由 `Main.mode` 表达。旧 `lobby idle` 内的创建控件要迁移到 `create-room-settings`。

替代方案是保留当前 `lobby` 内嵌创建控件，只在结束时跳到 `start`。这个方案会继续让大厅和创建页边界含糊，后续还会在邀请入房、重连、续局等路径里重复踩坑。

### 2. 大厅只做入口，不做规则设置

大厅可显示玩家资料、进入创建房间按钮、加入/邀请相关入口或错误重试，但不得直接展示局数选择、规则选择或“创建房间”提交按钮。规则设置只允许在房间创建页发生。

这样结束回大厅时视觉语义稳定：玩家看到的是“我回到大厅了”，而不是“我又进入创建流程了”。

### 3. 创建成功直接进入等待页

创建接口成功后，客户端已经拿到等待房间快照，应进入 `room-waiting`。旧 `seat-selection` 原本只是占位，不应再被主流程引用。若未来要做座位关系选择，应作为新的明确 change 设计，不混入本次修复。

### 4. 回大厅路径必须清理创建页残留状态

`returnToLobby()` 触发 `onLobby` 后，`Main` 应无条件切到大厅 UI。此前 `if (this.mode === 'room-ui') return;` 这类 guard 会阻止控制器把 UI 从旧创建状态拉回大厅，应删除或改成只保护主动创建中状态，不影响结束回大厅。

### 5. 用测试锁住状态流转

新增回归测试不要只查源码字符串，应实例化或模拟 `Main`/`StartMenu` 的关键回调，断言：

- `returnToLobby()` 后 `mode` 是大厅，`menu.screen` 是大厅。
- 游戏页 `leaveTable()` 后回大厅。
- `requestRematch(false)` 或关闭结果后回大厅。
- 创建成功进入等待页。
- 创建失败仍停留创建页。
- `renderLobby()` 不再产生 `round` 和 `create-room` 旧按钮。

## Risks / Trade-offs

- [Risk] 移除大厅直接创建入口会改变老测试预期。→ Mitigation: 用新的四页契约更新测试，并保留大厅进入创建页按钮。
- [Risk] 有玩家从分享/邀请进入时不经过大厅。→ Mitigation: 邀请入房仍可直接进入等待页或游戏页，四页模型允许外部入口跳转到合法页面。
- [Risk] 旧 `seat-selection` 还有未发现引用。→ Mitigation: 使用 `rg` 和回归测试断言创建成功不进入该页面；必要时保留函数但不让主流程调用。
- [Risk] `Main.mode` 和 `StartMenu.screen` 双状态继续漂移。→ Mitigation: 在实现中建立小型页面切换辅助方法或集中常量，避免分散赋值。

## Migration Plan

1. 收敛 `StartMenu` 的大厅渲染与触摸分支，移除旧大厅内嵌创建控件。
2. 调整 `Main` 的在线回调与创建结果处理，保证结束回大厅、创建成功进等待。
3. 隔离或删除 `seat-selection` 主流程入口。
4. 补充页面状态流转测试。
5. 运行 `node scripts/run-online-checks.mjs`，必要时再跑后端回归。

回滚策略：若发布后大厅入口异常，可恢复上一个小游戏版本；服务端不涉及数据迁移。

## Open Questions

- 大厅除了“创建房间”以外是否还要保留“加入房间码”入口？如果需要，应作为大厅入口而不是旧创建控件的一部分。
- 旧 `seat-selection` 代码是直接删除，还是暂时保留为未引用函数以降低改动面？
