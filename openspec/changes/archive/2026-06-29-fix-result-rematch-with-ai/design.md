## Context

线上 2 真人 + 2 AI 牌桌出现结果页点击“再来一局”无反应。服务器房间文档显示存在 `status=playing` 但 `state.phase=result` 的漂移状态。前端普通本局结果页按钮会调用 `startRound`，而服务端当前只允许 `waiting` 或 `finished` 状态开局，因此漂移状态会被拒绝为 `ROOM_ALREADY_PLAYING`。

结果阶段可能由多条服务端路径触发：真人操作、AI 自动推进、动画回执解除屏障、掉线/重连导致的屏障推进。只有部分路径显式调用 `settleRoomStatus`，导致状态不一致。

## Goals / Non-Goals

**Goals:**
- 任意路径只要引擎进入 `phase=result`，房间持久化前都同步为 `finished` 或 `tableResult`。
- 已经在线上存在的 `playing + phase=result` 漂移房间，房主点击本局结果页“再来一局”时能恢复并进入下一局。
- 最大局数结束后仍进入 `tableResult` 并走房主发起、真人同意的重开流程。
- 增加覆盖 2 真人 + 2 AI 的回归测试，避免再次被 AI/动画推进路径遗漏。

**Non-Goals:**
- 不改变前端结果页按钮布局和交互文案。
- 不改变 AI 决策逻辑。
- 不改变最大局数结束后的重开规则。
- 不自动清理或关闭线上房间。

## Decisions

1. **集中修复房间状态落态**
   - 在统一写入函数 `writeRoomState` 中，在 `advanceUnobservedEvents` 之后调用状态同步逻辑。
   - 理由：动画屏障解除后可能继续推进多个无真人观察事件，结果可能在写入函数内部出现，必须在最终写库前统一收口。
   - 备选：只在 `op`、`ackAnimation`、`heartbeat`、`setPlayerConnection` 分别补调用。缺点是容易继续遗漏新路径。

2. **让 `startRound` 能恢复旧漂移状态**
   - 在 `startRound` 读取引擎后先同步房间状态；如果当前是非最终局 `result`，即使原房间状态仍是 `playing`，也允许房主继续下一局。
   - 理由：线上已有漂移房间不能只靠后续写入修复，否则玩家仍卡在当前结果页。

3. **保持最大局数优先级**
   - 同步逻辑仍使用现有 `reachedMaxRounds` 与 `normalizeRoomSettings` 判定，达到最大局数则进入 `tableResult`，未达最大局数则进入 `finished`。
   - 理由：修复单局继续问题时不能绕过最终牌桌结算和重开确认。

## Risks / Trade-offs

- [Risk] 旧漂移房间在修复部署后第一次点击仍依赖房主触发 `startRound` → Mitigation: `startRound` 自带恢复逻辑，不需要额外数据迁移。
- [Risk] 在动画结果事件尚未播放完时过早切状态 → Mitigation: `finished` 仅表示本局已结算，动画屏障仍由 `animationBarrier` 控制，不会跳过当前公开事件。
- [Risk] 最大局数状态误判 → Mitigation: 新增测试覆盖 `round < maxRounds` 和 `round >= maxRounds` 两种结果。

## Migration Plan

1. 本地修复并运行在线/后端核心检查。
2. 同步 OpenSpec 主规格并归档变更。
3. 提交本地 commit。
4. 同步后端源码到阿里云，备份当前服务目录，重启 `huapai-backend.service`。
5. 部署后验证 `/healthz`、当前线上漂移房间 `startRound` 恢复或至少状态可被后台/API 正确处理。
