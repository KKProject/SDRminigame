## 1. 引擎历史记录

- [x] 1.1 确认 `discardCard` 写入 `actionHistory` 时使用 `type: 'discard'` 且包含 `key`
- [x] 1.2 确认 `settleUnclaimedDraw` 写入 `type: 'auto-discard-draw'`，不污染手牌主动打出记录
- [x] 1.3 在 `applyAction` 吃牌成功后将 incoming key 追加到 `seat.history.chiKeys`
- [x] 1.4 确认碰/招/踏成功时不写入 `chiKeys`

## 2. Evaluator 响应限制（进）

- [x] 2.1 抽取或复用共享守卫，基于 `hasManuallyDiscardedHandKey` 拦截响应
- [x] 2.2 在 `findPengActions` 中：已打过同 key 时不枚举碰动作
- [x] 2.3 在 `findZhaoActions` 中：已打过同 key 时不枚举招动作
- [x] 2.4 在 `findTaActions` 中：已打过同 key 时不枚举踏动作
- [x] 2.5 保持 `findChiActions` 与胡牌枚举的现有拦截逻辑，强制吃冲突仍走 `circle-loss`
- [x] 2.6 同步客户端 evaluator（若存在镜像）的响应枚举口径

## 3. Evaluator 出牌限制（出）

- [x] 3.1 确认 `isLegalDiscard` 检查 `history.chiKeys.includes(card.key)` 并返回明确 reason
- [x] 3.2 同步客户端 evaluator 的出牌合法性检查

## 4. 测试与验证

- [x] 4.1 增加测试：手牌主动打出 key `x` 后，同 key 不能吃/碰/招/踏/胡
- [x] 4.2 增加测试：手牌仍有同 key 牌时，打过仍不能碰/招
- [x] 4.3 增加测试：摸牌 `auto-discard-draw` 不污染打出记录，后续仍可响应
- [x] 4.4 增加测试：强制吃但 key 已打过 → 进圈
- [x] 4.5 增加测试：吃牌后 `chiKeys` 禁止再打出该 key
- [x] 4.6 增加测试：碰/招/踏不写入 `chiKeys`，该 key 仍可打出（若其他规则允许）
- [x] 4.7 运行 `node scripts/run-server-core-checks.mjs` 及相关规则回归
