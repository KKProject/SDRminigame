## 1. 服务端响应窗口协议

- [x] 1.1 在 `services/backend/src/game/core/engine.js` 中抽出 `buildResponseSummary(state)`，输出 `id`、`sourceSeat`、`sourceType`、`cardId`、`candidateSeats`、`waitingSeats`、`decidedSeats`、`blockingSeats`、`currentBest` 和 `active`。
- [x] 1.2 在服务端响应窗口决策逻辑中复用 `bestSelectedResponse()` 与 `unresolvedActionsThatBeat()`，确保 `blockingSeats` 只包含仍能击败当前最佳选择的未决席位。
- [x] 1.3 增加私密响应视图构建函数，按 seat 返回 `responseWindowId`、`playerActions` 和 `actionState`，并区分 `available`、`waiting`、`superseded`、`closed`。
- [x] 1.4 修改 `buildPublicState()`，让公共 `responseSummary` 使用新摘要字段，且不得向公共状态暴露其他玩家具体响应动作、胡牌结果或动作参数。
- [x] 1.5 修改 `buildPrivateView()`，只在本人仍可操作且仍可能影响裁决时下发响应按钮，否则清空 `playerActions` 并给出对应 `actionState`。
- [x] 1.6 在 `submitResponse()` 中校验当前窗口 id 或等价窗口状态，拒绝已关闭、已淘汰、已决策或旧窗口的响应意图。
- [x] 1.7 确认出牌和抓牌的 `appearanceResolution=await-response` 公开事件均在动画屏障解除后才调用响应窗口处理。
- [x] 1.8 确认 `appearanceResolution=auto-discard` 的出牌和抓牌不会额外生成初始无人响应 `unclaimed` 事件。
- [x] 1.9 确认所有候选最终过牌或托管过牌时，只生成一次 `unclaimed` 公开事件，并在该事件动画屏障解除后继续下一家抓牌。
- [x] 1.10 保留必要兼容字段时，确保新协议字段为主路径，旧 `pendingActions` / `playerActions` 不再作为公共泄密来源。

## 2. 房间层与 WebSocket 同步

- [x] 2.1 更新 `services/backend/src/game/room.js` 的快照返回，包含新的公共 `responseSummary` 和本人私密 `responseWindowId`、`playerActions`、`actionState`。
- [x] 2.2 更新 `services/backend/src/socket-server.js` 的 `publicPatch()`，通过增量下发新响应窗口摘要。
- [x] 2.3 更新 `services/backend/src/socket-server.js` 的 `privatePatch()`，按连接 seat 下发本人私密响应动作和 `actionState`，并在不可操作时清空。
- [x] 2.4 确保响应窗口打开、按钮可用性变化、玩家被当前最佳选择淘汰时可通过 socket 增量同步，而不创建新的公开动画事件。
- [x] 2.5 确保响应窗口裁决后的 `unclaimed`、吃、碰、招、踏、胡等结果事件仍进入动画屏障并要求必需客户端回执。
- [x] 2.6 更新 socket 操作意图处理，响应意图携带或匹配当前 `responseWindowId`，旧窗口响应返回可同步恢复的错误。
- [x] 2.7 验证断线、重连、首次订阅和增量无法应用恢复时，快照能重建当前公开事件、响应窗口摘要和本人私密按钮状态。

## 3. 客户端在线状态构建

- [x] 3.1 更新 `js/net/online.js` 的 `buildLocalState()`，优先使用私密 `playerActions`、`responseWindowId` 和 `actionState` 构建本机按钮状态。
- [x] 3.2 更新 `rotateResponseSummary()`，支持旋转 `candidateSeats`、`waitingSeats`、`decidedSeats`、`blockingSeats` 和 `currentBest.seat`。
- [x] 3.3 移除或降级公共 `pendingActions` 构造按钮的主路径，避免客户端从公共摘要推导具体吃、碰、招、踏、胡按钮。
- [x] 3.4 更新 socket delta 应用逻辑，使 `publicPatch.responseSummary` 和 `privatePatch.playerActions` / `responseWindowId` / `actionState` 能稳定更新 databus。
- [x] 3.5 在本机提交响应意图后记录当前 `responseWindowId`，防止同一窗口重复点击和重复提交。
- [x] 3.6 在收到新窗口、空窗口或窗口关闭状态时清理旧按钮、pending intent 和本地等待态。
- [x] 3.7 确保 socket 不可用或窗口失效时，客户端显示等待重连或动作失效反馈，不通过 HTTPS 兜底提交响应意图。

## 4. 客户端动画与渲染

- [x] 4.1 更新 `js/game/animation/controller.js`，让 `heldAppearance` 的创建、恢复、释放只跟随权威出现牌、`unclaimed` 和响应结果事件。
- [x] 4.2 收紧 `inferAppearanceResolution()` 或其调用路径，使新协议字段存在时不再依赖 `pendingActions` / `playerActions` 推断出现牌等待分支。
- [x] 4.3 更新 `js/game/animation/state-controller.js`，避免在当前权威公开事件或响应窗口协议已表达流程时启动同卡状态补偿动画。
- [x] 4.4 更新 `js/game/renderer.js` 和 `js/game/layout.js`，让响应按钮仅根据本机私密动作渲染，并支持 `available`、`waiting`、`superseded`、`closed` 的基本显示或收起策略。
- [x] 4.5 确认按钮弹出、等待和收起动画不调用公开事件动画回执，也不影响 `eventSeq` 播放状态。
- [x] 4.6 确认本机过牌后只收起或置灰按钮，保留出现牌继续显示，直到收到 `unclaimed` 或响应结果公开事件。
- [x] 4.7 确认收到 `unclaimed` 时，从当前保留牌位置播放归位动画并完成静态弃牌交接。
- [x] 4.8 确认收到吃、碰、招、踏或胡事件时，先释放匹配保留牌，再播放权威动作动画。

## 5. 服务端回归测试

- [x] 5.1 在服务端核心检查中新增多真人同时响应场景，验证当前最佳选择和 `blockingSeats` 计算正确。
- [x] 5.2 新增高优先级玩家已响应后低优先级玩家私密按钮清空的测试。
- [x] 5.3 新增仍可击败当前最佳选择的玩家继续收到私密按钮的测试。
- [x] 5.4 新增所有候选过牌后只生成一次 `unclaimed` 公开事件的测试。
- [x] 5.5 新增出牌和抓牌 `auto-discard` 不额外生成初始 `unclaimed` 的测试。
- [x] 5.6 新增旧 `responseWindowId` 或已关闭窗口响应意图被拒绝且不改变权威状态的测试。

## 6. 在线同步与客户端回归测试

- [x] 6.1 扩展 `scripts/run-online-checks.mjs`，验证快照和 delta 中公共响应摘要不包含其他玩家具体候选动作。
- [x] 6.2 扩展 socket 私密补丁测试，验证每个连接只收到本人合法响应按钮。
- [x] 6.3 增加响应窗口按钮可见性测试，覆盖可操作、已提交、被淘汰、窗口关闭四种状态。
- [x] 6.4 扩展动画检查，覆盖 `await-response` 出现牌保留、过牌不释放、`unclaimed` 释放、响应动作消耗保留牌。
- [x] 6.5 增加断线重连测试，覆盖窗口仍 active、窗口已关闭、当前公开事件仍待回执三种恢复路径。
- [x] 6.6 运行 `node scripts/run-server-core-checks.mjs && node scripts/run-online-checks.mjs && node scripts/run-backend-checks.mjs` 并修复发现的问题。

## 7. 验收与发布准备

- [x] 7.1 手工验证两人或多人在线牌局：出牌有人响应、出牌无人响应、抓牌有人响应、抓牌无人响应流程均符合设计。
- [x] 7.2 手工验证高优先级响应提交后，无法影响裁决的玩家按钮自动消失，仍可影响裁决的玩家按钮保留。
- [x] 7.3 手工验证所有人过牌后，所有客户端播放一次保留牌归位动画并继续下一家抓牌。
- [x] 7.4 手工验证断线重连后不会补播已关闭响应窗口按钮，也不会重复播放已消费的出现牌动画。
- [x] 7.5 后端部署前按项目要求完成本地回归；若需要部署，按现有后端部署流程同步 `services/backend` 并检查 `/healthz`。
