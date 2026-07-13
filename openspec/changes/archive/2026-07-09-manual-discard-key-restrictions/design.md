## Context

花牌规则对 key 有两条独立约束：

1. **进（响应限制）**：玩家从手牌主动打出某 key 后，后续不能再对该 key 的 appearing card 做吃/碰/招/踏/胡。
2. **出（出牌限制）**：玩家吃过某 key 后，后续不能再从手牌打出该 key。

当前代码基础：

- `seat.history.actionHistory` 已在 `discardCard` 时写入 `{ type: 'discard', key }`。
- `hasManuallyDiscardedHandKey` 已在 `findChiActions` 和胡牌枚举中生效。
- `findPengActions` / `findZhaoActions` / `findTaActions` 尚未检查手牌主动打出记录。
- `seat.history.chiKeys` 字段已存在于 `createSeatHistory`，`isLegalDiscard` 已有检查逻辑，但引擎吃牌时尚未写入 `chiKeys`。

```
┌─────────────────────────────────────────────────────────────┐
│                    seat.history                             │
├──────────────────────────┬──────────────────────────────────┤
│ actionHistory            │ chiKeys                          │
│  - discard (主动出牌)     │  - 吃过的 incoming key           │
│  - auto-discard-draw     │                                  │
│    (不计入打出记录)       │                                  │
└────────────┬─────────────┴──────────────┬───────────────────┘
             │                            │
             ▼                            ▼
   hasManuallyDiscardedHandKey      isLegalDiscard
   → 禁吃碰招踏胡                    → 禁打出
```

## Goals / Non-Goals

**Goals:**

- 统一「手牌主动打出 key」语义：仅 `actionHistory` 中 `type === 'discard'` 的事件。
- 在碰/招/踏响应枚举中复用同一守卫逻辑，与吃/胡保持一致。
- 吃牌成功时在引擎层写入 `chiKeys`，使出牌限制可判定。
- 强制吃且 key 已打过 → 直接进圈（沿用现有 `circle-loss` forced 动作模式）。
- 服务端与客户端 evaluator 口径一致，并补充规则测试。

**Non-Goals:**

- 不改变响应优先级、胡牌门型、同句出牌可达性算法。
- 碰/招/踏吃过的 key 不纳入出牌限制（仅吃纳入 `chiKeys`）。
- 不重构 `actionHistory` 结构或回放协议。
- 不将摸牌自动归位 `auto-discard-draw` 视为手牌主动打出。

## Decisions

1. **复用 `hasManuallyDiscardedHandKey`，不新增平行字段**

   手牌主动打出记录继续从 `actionHistory` 派生，避免 `discard` 与 `manualHandDiscardKeys` 双写漂移。`auto-discard-draw` 通过 `isManualHandDiscardHistoryEntry` 显式排除。

2. **抽出共享响应守卫 `blockManualDiscardResponse`**

   在 `evaluator.js` 中集中处理「已打过 key」的响应拦截：
   - 普通动作：返回空数组（不枚举）
   - 强制吃：返回 `circle-loss` forced 动作（与现有 `findChiActions` 一致）
   - 碰/招/踏：仅普通禁止，不生成 forced 进圈（用户仅要求强制吃场景进圈）

3. **碰/招/踏按 incoming key 整 key 封禁**

   玩家打过 key `x` 后，即使手牌仍持有 2+ 张 `x`，也不提供碰/招/踏选项（规则 A）。不按手牌余量做例外。

4. **`chiKeys` 仅在吃牌成功时追加 incoming key**

   在 `engine.applyAction` 中，当 `action.type === 'chi'` 且 meld 成功创建后，执行 `seat.history.chiKeys.push(incoming.key)`。碰/招/踏不写入 `chiKeys`。

5. **引擎层与 evaluator 层职责分离**

   - 引擎：维护 `actionHistory`（出牌）、`chiKeys`（吃牌）
   - Evaluator：读取上述状态做合法性判定，不自行推断

## Risks / Trade-offs

- [Risk] 客户端 evaluator 若未同步，按钮展示与服务端不一致。  
  → Mitigation: 同步修改客户端镜像 evaluator 并跑共享规则测试。

- [Risk] 旧房间快照缺少 `chiKeys` 时出牌限制失效。  
  → Mitigation: `createSeatHistory` 已初始化空数组；`load` 时兼容缺字段。

- [Risk] 强制碰（特殊搭子）与已打过 key 冲突时行为未定义。  
  → Mitigation: 本次仅处理强制吃进圈；强制碰保持现有行为，列入 Open Questions。

## Migration Plan

- 纯规则逻辑变更，无需数据库迁移。
- 进行中的房间在下一局 `startRound` 时自然获得完整 `chiKeys` 状态。
- 部署后运行 `node scripts/run-server-core-checks.mjs` 验证。

## Open Questions

- 强制碰（特殊搭子 `peng` forced）若与已打过同 key 冲突，是否也应进圈？当前设计仅覆盖强制吃。
