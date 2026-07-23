## 1. 固化 retained 出现牌生命周期

- [x] 1.1 在动画控制器中增加幂等的权威事件语义收尾入口，区分保留、归位/消费和终局清场事件，并对携带 card id 的事件避免误删更新的 held 牌
- [x] 1.2 让正常播放的 `circle-loss`、`draw-round`、`settlement` 与现有 `unclaimed`、吃碰招踏、胡路径统一释放 retained 出现牌
- [x] 1.3 扩展状态动画结果处理，使胡牌、进圈、流局和结算状态都能清理活动动画视觉，同时保持有效响应窗口中的牌不被提前清除

## 2. 接入在线跳播与恢复路径

- [x] 2.1 在 `selfAcked` 分支应用权威事件语义收尾，确保另一真人跳过吃碰招踏动画时仍释放被消费的出现牌
- [x] 2.2 在重连/积压 `playback-mode-skip`、`already-played` 和事件对齐路径应用相同的幂等收尾，并保持事件记账、回执、音效和去重行为不变
- [x] 2.3 调整无当前事件快照的恢复逻辑，根据权威结果和活动响应牌身份清理或保留 held 视觉，避免回执完成但响应仍有效时提前消失

## 3. 回归测试与验证

- [x] 3.1 为动画控制器补充进圈、流局、结算释放以及 `pass` 保留的单元回归场景
- [x] 3.2 为在线控制器补充双真人两 AI 场景：真人 A 出牌、真人 B 吃牌，真人 A 以 `selfAcked` 跳过吃牌动画后不得残留旧牌
- [x] 3.3 补充重连积压跳过 `unclaimed`、重复/已播放消费事件、无当前事件结果快照的回归场景
- [x] 3.4 运行 `node scripts/run-animation-checks.mjs`、`node scripts/run-online-checks.mjs`、`node scripts/run-server-core-checks.mjs` 和 `node scripts/run-backend-checks.mjs`，确认全部通过
- [x] 3.5 上传微信小游戏测试版本
- [x] 3.6 在两真人两 AI 真机房间复测吃牌后出牌、进圈和流局路径
