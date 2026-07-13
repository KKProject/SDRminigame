## Why

花牌规则要求对「进」与「出」分别做 key 级限制：玩家从手牌主动打出某字后，后续不能再对该字做吃/碰/招/踏/胡；玩家吃过某字后，后续不能再从手牌打出该字。当前实现只部分覆盖（吃、胡已拦截，碰/招/踏未拦截；`chiKeys` 出牌限制未完整落地），导致服务端裁决与规则口径不一致。

本次变更补齐双向 key 限制，统一服务端 evaluator 与引擎历史记录语义，避免玩家利用已打出或已吃过的字继续违规操作。

## What Changes

- 明确「手牌主动打出记录」仅统计玩家从手牌主动选择打出的牌（`discard`），不包含摸牌无人响应后的自动归位（`auto-discard-draw`）。
- 扩展响应限制：玩家曾主动打出某 key 后，本轮后续不能再对该 key 的 appearing card 执行吃、碰、招、踏、胡（即使手牌中仍持有同 key 牌）。
- 保留并落实强制吃冲突：必须吃某 key，但该 key 已在玩家手牌主动打出记录中，直接判定该玩家进圈。
- 新增「吃过 key 出牌限制」：玩家每次吃牌后，将 incoming card 的 key 记入 `chiKeys`；后续出牌时，若待打牌的 key 在 `chiKeys` 中，则禁止打出。
- 在 `applyAction` 成功吃牌时维护 `chiKeys`；碰/招/踏动作写入 `actionHistory` 仅作审计，不参与上述双向限制判定。
- 同步服务端与客户端 evaluator 的响应枚举、出牌合法性与测试用例。

## Capabilities

### New Capabilities

- `chi-key-discard-restriction`: 玩家吃过某字后，禁止再从手牌打出该 key 的出牌限制规则。

### Modified Capabilities

- `huapai-game-rules`: 扩展「手牌主动打出 key 响应限制」至碰/招/踏；明确记录来源与强制吃进圈；补充吃过 key 禁止再打出场景。
- `server-game-engine`: 引擎在吃牌成功时维护 `chiKeys`，并确保 `actionHistory` 中的 `discard` 记录作为响应限制唯一依据。

## Impact

- `services/backend/src/game/core/evaluator.js`：`findPengActions`、`findZhaoActions`、`findTaActions` 增加手牌主动打出 key 拦截；`isLegalDiscard` 落实 `chiKeys` 检查。
- `services/backend/src/game/core/engine.js`：吃牌成功时写入 `chiKeys`；确认出牌时 `actionHistory` 记录完整。
- 客户端共享 evaluator（若存在镜像）：与服务端保持同一口径。
- 规则测试：覆盖打出后禁碰招踏、吃过禁打出、强制吃进圈、摸牌自动归位不污染记录等场景。
