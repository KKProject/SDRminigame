## 1. 服务端房间生命周期

- [x] 1.1 在 `services/backend/src/game/room.js` 建立 `waiting/playing/finished` 可恢复状态白名单，并让当前房间查询、创建冲突和分享加入统一使用该分类
- [x] 1.2 实现幂等的 `tableResult` 玩家释放与房间关闭辅助流程，正确更新 `players`、`playerOpenids`、`rematch` 和公开房间状态
- [x] 1.3 调整 `activeRoom`：先同步权威引擎结果状态，再返回 `waiting/playing/finished`，对 `tableResult/closed` 返回无可恢复房间并完成终局释放
- [x] 1.4 调整 `createRoom`：先清理终局占用；存在可恢复房间时返回明确失败码和最小房间摘要，不再返回 `alreadyInRoom` 成功形态
- [x] 1.5 为同一玩家的重复/并发创建请求增加串行或原子保护，确保最多产生一张新的 `waiting` 房间
- [x] 1.6 校验 `joinRoom`、终局重开和退出路径使用最新成员集合，已回大厅的终局玩家不再阻塞或参与重开确认

## 2. 客户端页面路由与会话一致性

- [x] 2.1 调整 `js/net/online.js` 启动恢复逻辑，按 `waiting` 进入等待页面、按 `playing/finished` 进入游戏页面，并让 `tableResult/closed/无房间` 留在大厅
- [x] 2.2 调整 `js/main.js` 与菜单状态绑定，确保无可恢复房间时稳定显示大厅“创建房间”入口且不残留旧房间页面状态
- [x] 2.3 调整创建房间响应处理：活动房间冲突时停留创建页并提示继续当前房间，只有玩家明确选择后才进入旧房间
- [x] 2.4 调整 `leaveTable`，仅在服务端确认离房或房间关闭后清理本地会话；被拒绝时保留并恢复当前等待页/游戏页
- [x] 2.5 为未知房间状态、终局释放和创建冲突增加不含隐私数据的结构化诊断日志

## 3. 自动化回归测试

- [x] 3.1 更新 server core 测试，覆盖 `waiting/playing/finished` 可恢复、`tableResult/closed` 不返回以及结果状态漂移归一化
- [x] 3.2 增加终局成员释放测试，覆盖普通玩家、房主、人数不足、超时关闭和重复调用幂等性
- [x] 3.3 增加创建房间测试，覆盖活动房间明确冲突、终局房间释放后可创建和重复/并发请求不产生多房间
- [x] 3.4 更新 online 测试，覆盖启动时五类房间状态对应的大厅、等待页和游戏页路由
- [x] 3.5 增加客户端创建冲突与离桌失败测试，确认不会静默进入旧房间或发生本地假离房

## 4. 验证与交付

- [x] 4.1 运行 `node scripts/run-online-checks.mjs`、`node scripts/run-server-core-checks.mjs`、`node scripts/run-backend-checks.mjs` 和 `npm --prefix services/backend test`
- [x] 4.2 运行 `openspec validate fix-room-lifecycle-and-active-room-entry --type change --strict` 并修复所有 change 级校验问题
- [x] 4.3 真机验收启动恢复、终局回大厅、进行中房间恢复和创建冲突提示，确认后再按“后端优先、小游戏随后”的顺序部署
