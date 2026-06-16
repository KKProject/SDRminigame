## 1. 复现和定位

- [x] 1.1 构造“其他玩家打出牌 -> 本机有响应动作”的在线本地状态/事件场景
- [x] 1.2 验证当前可能同时启动 `online:<eventSeq>` 和 `state:discard:<seat>:<cardId>` 两个出现牌 plan
- [x] 1.3 确认该场景下重复播放来自状态补偿入口，而非静态 fallback 绘制

## 2. 阻止正常在线双播

- [x] 2.1 在渲染器调用 `StateAnimationController.observe()` 时，将 `state.animationWaiting` 纳入 blocked 条件
- [x] 2.2 确认 `playOnlineEvent()` 仍作为其他玩家出牌的唯一完整动画入口
- [x] 2.3 确认权威出牌动画完成后 `heldAppearance` 正常保留等待响应
- [x] 2.4 确认本机响应按钮展示不触发额外 `state:discard` 出现动画

## 3. 保留恢复能力

- [x] 3.1 验证布局变化后使用 `restoreHeldAppearance()` 恢复保留牌且不重播入场 pulse
- [x] 3.2 验证没有在线权威事件可播放的恢复场景仍可通过状态或静态路径显示正确牌面
- [x] 3.3 确认 `auto-discard`、`unclaimed` 和吃碰招踏胡后续动画不受阻塞条件影响

## 4. 自动检查与验收

- [x] 4.1 扩展动画自检，断言待响应出牌不会同时存在 `online:<eventSeq>` 与 `state:discard:<seat>:<cardId>` 两个出现牌动画
- [x] 4.2 扩展在线自检，覆盖其他玩家出牌且本机有响应动作时仅播放一次出现动画
- [x] 4.3 运行 `node scripts/run-animation-checks.mjs`
- [x] 4.4 运行 `node scripts/run-online-checks.mjs`
- [x] 4.5 运行 `openspec validate prevent-online-discard-appearance-double-play --strict`
- [x] 4.6 使用至少两个在线客户端真机验证：其他玩家出牌、本机有响应按钮时只播放一次出现动画
