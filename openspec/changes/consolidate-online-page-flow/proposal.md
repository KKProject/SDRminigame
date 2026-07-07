## Why

当前客户端实际存在 `start`、`lobby`、`create-room-settings`、`seat-selection`、`room-waiting`、`online` 等多个菜单状态，和产品上期望的四页模型不一致。牌局结束后虽然调用了 `returnToLobby()`，但 `lobby` 里仍渲染旧的局数选择与创建房间入口，视觉上会像回到了旧房间创建页，需要收敛页面职责和结束后的落点。

## What Changes

- 明确在线流程只有四个一等页面：大厅、房间创建、等待页面、游戏页面。
- 大厅只负责展示登录后的主入口和进入房间创建，不再内嵌旧的局数选择与直接创建房间控件。
- 房间创建页成为唯一选择局数、规则并提交创建房间的入口。
- 等待页面成为创建成功、邀请加入、未开局房间恢复后的唯一落点。
- 游戏页面结束、退出、拒绝续局、续局超时、房间关闭后 MUST 回到大厅，而不是房间创建页、座位选择页或旧创建控件。
- 移除或隔离旧 `seat-selection` 占位流程，避免它继续作为创建成功后的落点。
- 增加客户端页面状态诊断和回归测试，覆盖结束回大厅、退出回大厅、创建失败留在创建页、创建成功进等待页。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `online-lobby`: 收敛在线页面状态机、明确四页流转契约、废止旧大厅内嵌创建控件和旧座位选择落点。

## Impact

- 客户端页面状态与渲染：`js/main.js`、`js/ui/menu.js`
- 在线控制器回大厅回调与房间创建结果处理：`js/net/online.js`
- 回归检查：`scripts/run-online-checks.mjs`
- OpenSpec 主能力：`openspec/specs/online-lobby/spec.md`
