## 1. 规则算法

- [x] 1.1 梳理当前 `wouldBreakCompletePhrase()`、`isLegalDiscard()`、`discardPhraseCounts` 和 `actionHistory` 的调用链，确认云端与客户端同构入口
- [x] 1.2 设计并实现同句 counts 工具，能从当前手牌和历史已出牌推导候选出牌后的同句状态
- [x] 1.3 实现同句保门可达性判断，支持目标门 `xyz`、`xxx`、`yyy`、`zzz`，并支持未打满上限时提前停止
- [x] 1.4 用新可达性判断替换发牌锁定原句数的出牌限制，保留特殊搭子 `forcedDiscardCardId` 的优先约束
- [x] 1.5 明确 `xxyz`、`xxxyz`、`xxyyz`、`zzzxxy` 的合法出牌路径并固化为规则用例

## 2. 出过不吃与吃胡限制

- [x] 2.1 实现从 `seat.history.actionHistory` 判断玩家是否曾打出某 key 的纯函数，覆盖普通出牌和摸牌自动弃牌
- [x] 2.2 在吃牌动作枚举中接入历史 key 限制，确保曾打出 key 后不再生成该 key 的 chi 动作
- [x] 2.3 扩展胡牌评估或增加辅助判定，识别出现牌是否必须参与 `xy` 或 `xyz` 吃式门
- [x] 2.4 在响应动作枚举中接入吃胡限制，确保曾打出 key 后不再生成依赖该 key 吃式门的 hu 动作
- [x] 2.5 确认非吃式胡牌路径不被误伤，例如出现牌只参与 `xx` 或同字刻子门时仍可胡

## 3. 云端与客户端同步

- [x] 3.1 更新 `cloudfunctions/game/core/evaluator.js` 的权威规则实现
- [x] 3.2 更新 `cloudfunctions/game/core/ai.js` 的出牌候选选择，确保 AI 只优先选择新规则合法牌
- [x] 3.3 更新 `js/game/evaluator.js` 的客户端同构实现，保持本地提示与服务端一致
- [x] 3.4 检查 `engine.submitDiscard()`、`engine.enterDiscardPhase()` 和响应窗口路径，确保非法出牌/无合法出牌仍按现有反馈或进圈逻辑处理

## 4. 测试与验证

- [x] 4.1 扩展 `js/game/self-check.js`，覆盖 `xxyz` 只能打 `x`
- [x] 4.2 扩展自检，覆盖 `xxxyz` 可走 `xx` 留 `xyz` 和 `yz` 留 `xxx`
- [x] 4.3 扩展自检，覆盖 `xxyyz` 可走 `xy` 留 `xyz`，也可打 `z` 后禁止继续打同句
- [x] 4.4 扩展自检，覆盖 `zzzxxy` 可走 `xzz` 留 `xyz` 和 `xxy` 留 `zzz`
- [x] 4.5 扩展自检，覆盖玩家曾打出 key 后不生成该 key 的 chi 动作
- [x] 4.6 扩展自检，覆盖玩家曾打出 key 后不生成依赖该 key 吃式门的 hu 动作
- [x] 4.7 扩展自检，覆盖玩家曾打出 key 后仍可使用该 key 完成非吃式 hu
- [x] 4.8 运行现有花牌规则自检脚本，确认全部通过
- [x] 4.9 运行 `openspec validate optimize-phrase-discard-and-chi-rules --strict`
- [x] 4.10 运行 `openspec validate --all --strict`
