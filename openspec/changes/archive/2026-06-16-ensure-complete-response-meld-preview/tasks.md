## 1. 复现与定位

- [x] 1.1 构造“出现牌可响应 -> 点击吃/碰/招/踏”的本地响应预演场景
- [x] 1.2 复现 `previewMeld()` 返回 `null` 时 `eventPlan()` 退化为单张 `cardFlightPlan()` 的中间动画
- [x] 1.3 确认该中间动画来自 `local-preview:<type>:<cardId>`，而非 `state:discard` / `state:draw` 状态补偿

## 2. 调整本地响应预演

- [x] 2.1 在 `TableAnimationController.playLocalActionPreview()` 中禁止吃、碰、招、踏响应动作使用单张牌 fallback
- [x] 2.2 当吃、碰、招、踏无法构造完整 `localMeld` 时返回 `false`，不创建 `local-preview` plan
- [x] 2.3 保留可构造完整 `localMeld` 时的完整凑牌本地预演和 retained 视觉
- [x] 2.4 单独确认 `ta` 动作在已有招/踏牌组可用时仍可构造完整本地预演
- [x] 2.5 本机完整响应预演开始时释放同一张牌的状态补偿保留视觉，避免后续 claim resolve 重播
- [x] 2.6 权威待响应摸牌/出牌出现动画开始时释放同一张牌已启动的状态补偿出现动画
- [x] 2.7 在线动画等待期间同时隐藏 `pendingActions` 与 `playerActions`，避免渲染 fallback 参与待响应出现牌显示
- [x] 2.8 `currentEvent` 存在时强制视为动画等待，即使 `animation.waiting` 为 false 或缺失
- [x] 2.9 无事件快照到达但本地权威动画仍在播放时，不提前释放 online 动画
- [x] 2.10 权威摸牌/出牌事件缺少 `appearanceResolution` 但当前状态仍指向同一张待响应牌时，客户端推断为 `await-response` 并接管保留视觉

## 3. 权威事件接手与对账

- [x] 3.1 确认跳过本地预演后，匹配的权威吃/碰/招/踏事件会正常走 `playOnlineEvent()`
- [x] 3.2 确认已播放完整本地预演时，匹配权威事件仍通过 `confirmLocalActionPreview()` 对账且不重播
- [x] 3.3 确认跳过本地预演、权威事件播放完成后仍会发送一次动画完成回执
- [x] 3.4 确认操作被拒绝或网络失败时不会遗留 `pendingLocalAction` / `localActionPreviewType`

## 4. 自动检查与验收

- [x] 4.1 扩展动画自检，断言吃、碰、招、踏无法构造完整牌组时不会生成单张 card flight 本地预演
- [x] 4.2 扩展动画自检，断言可构造完整牌组时会生成完整 meld group 本地预演
- [x] 4.3 扩展在线自检，覆盖跳过本地预演后权威凑牌事件播放并回执
- [x] 4.4 扩展在线自检，覆盖完整本地预演与权威事件成功对账不重播
- [x] 4.5 扩展动画自检，覆盖本机完整响应预演接管状态补偿保留牌，且后续不再播放 claim resolve 飞入
- [x] 4.6 扩展动画自检，覆盖权威待响应摸牌/出牌出现动画接管已启动的状态补偿出现动画
- [x] 4.7 扩展在线自检，覆盖 animation waiting 期间 `pendingActions` / `playerActions` 不暴露给渲染层
- [x] 4.8 扩展在线自检，覆盖 `currentEvent` 存在但 `waiting` 为 false 时仍隐藏响应动作
- [x] 4.9 扩展在线自检，覆盖无事件快照不会取消本地仍在播放的权威出现动画
- [x] 4.10 运行 `node scripts/run-animation-checks.mjs`
- [x] 4.11 运行 `node scripts/run-online-checks.mjs`
- [x] 4.12 运行 `openspec validate ensure-complete-response-meld-preview --strict`
- [x] 4.13 扩展动画自检，覆盖缺少 `appearanceResolution` 的摸牌/出牌权威出现事件不会被状态补偿重播
- [ ] 4.14 真机验证目标路径稳定为：出现牌动画 -> 完整凑牌预演/权威凑牌动画 -> 玩家出牌动画
