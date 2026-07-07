## Context

当前在线客户端的主要路径是：socket snapshot/delta 到达后，`OnlineController` 立即把服务端公共状态和私密状态写入 `databus`，随后调用 `consumeAnimationState()` 播放当前 `publicEvent`。渲染器每帧直接读取 `databus`，因此当同一个服务端响应同时包含“结果状态”和“结果事件”时，结算面板会先跟随 `phase=result` 出现，胡/进圈/流局等动画又随后启动，形成并发渲染。

服务端已经具备公开事件、`eventSeq`、动画屏障和 ACK 机制，但客户端还没有一个明确的“事件时间线执行器”。现有的 `isAnimating`、`lastPlayedEventSeq`、`releaseOnlineEvent`、`suppressNextResultEffect` 等逻辑是局部保护，可以避免部分重复播放，却不能保证状态落屏、动画播放和 ACK 的整体顺序。

本设计保留现有 WebSocket、服务端公开事件、Tween 动画管理器和动画屏障，新增一层客户端在线事件时间线，并调整服务端对离线玩家和事件类型的屏障策略。

## Goals / Non-Goals

**Goals:**

- 在线权威公开事件在每个客户端按 `eventSeq` 串行播放，同一时刻最多播放一个权威桌面事件。
- 客户端区分权威状态和显示状态，结果页、结算按钮等可见 UI 在对应动画完成或跳过后再落屏。
- 响应关键事件优先保持可操作性：`await-response` 出现牌完成入场后按钮可见并可点，不被后续非关键动画阻塞。
- 断线、重连、队列积压时自动加速或跳过非关键动画，避免非关键动画拖慢牌局。
- 服务端动画屏障不再被已经离线或非关键事件的非必要观看者长期阻塞。
- 增加可排查的队列诊断，覆盖入队、开始、完成、跳过、快进、显示状态提交和 ACK 重试。

**Non-Goals:**

- 不重写牌局规则、响应裁决、MongoDB 存储或 WebSocket 协议基础设施。
- 不重新设计美术表现或具体动画视觉样式，只调整播放顺序、时长策略和落态时机。
- 不支持补播断线期间所有历史动画；重连目标是恢复当前权威状态和当前仍需处理的事件。
- 不把响应按钮弹出/收起做成全房间公开动画屏障；按钮 UI 仍是本地交互状态。

## Decisions

### Decision 1: 引入 `OnlineAnimationTimeline` 作为唯一在线权威事件执行器

`OnlineController` 负责接收 socket 消息、维护权威镜像和提交操作；新增时间线执行器负责公开事件的入队、去重、排序、播放、完成、跳过和 ACK。正常在线路径中，`consumeAnimationState()` 不再直接决定是否立即播放，而是把可播放事件交给时间线。

推荐内部模型：

```text
socket snapshot/delta
        │
        ├─ update authoritativeState
        │
        ├─ enqueue timeline event
        │
        └─ maybe update private actions

timeline pump
        │
        ├─ dequeue next playable event
        ├─ apply pre-event display patch
        ├─ play/fast-forward/skip
        ├─ ack eventSeq
        └─ commit displayState checkpoint
```

替代方案是继续在 `OnlineController.consumeAnimationState()` 里堆条件判断。这个方案改动小，但会让状态落屏、补偿动画和 ACK 继续互相纠缠，难以保证胡牌到结算的顺序。

### Decision 2: 分离 `authoritativeState` 与 `displayState`

客户端需要立即保存服务端权威状态，用于版本号、响应按钮、重连恢复和操作合法性判断；但渲染器不应马上看到所有权威状态。时间线为每个事件保存一个 display checkpoint，只有当前事件完成、快进或跳过后，才把对应状态提交给 `databus`。

结果类状态尤其需要闸门：

```text
收到 phase=result + publicEvent=hu
        │
        ├─ authoritativeState.phase = result
        ├─ displayState 仍保持牌桌状态
        ├─ 播放 hu 事件
        └─ 完成后提交 displayState.phase = result
```

替代方案是在渲染器里特殊判断 `phase=result && isAnimating` 时隐藏结算页。这能解决单个症状，但会把网络时间线知识扩散到渲染层。

### Decision 3: 对事件分级，允许快进和跳过非关键事件

事件分为三类：

- 响应关键事件：`draw` / `discard` 且 `appearanceResolution=await-response`。必须保证入场、保留牌和响应按钮可用；不得因为队列积压直接丢失可操作窗口。
- 行为确认事件：`chi`、`peng`、`zhao`、`ta`、`hu`、`circle-loss`、`draw-round`。默认串行播放；在积压或离线降级时可缩短，但仍要保持最终静态交接正确。
- 收尾观赏事件：`pass`、`settlement`、`unclaimed`、普通 `auto-discard` 后续、已过期历史事件。可在重连、积压或降级时直接提交最终状态并 ACK 或等待服务端标记为非必需。

替代方案是全量保留动画。它视觉完整，但多人在线下容易因为某个客户端慢、切后台或断线导致整桌节奏变差。

### Decision 4: 服务端屏障按事件重要性和在线状态收敛必需回执名单

服务端继续拥有最终推进权。`requiredAnimationOpenids()` 应结合事件类型、响应窗口、当前在线状态和离线标记计算必需回执名单。已经断线的玩家不得进入新事件屏障；当前屏障中玩家断线或超时后应立即移出。非响应关键事件不应等待离线玩家观看。

对于仍需本人选择的响应窗口或手动决策，服务端保留现有托管或等待重连策略；本变更只调整“动画观看是否阻塞推进”，不改变规则裁决。

### Decision 5: 状态观察器只做恢复补偿，不参与正常在线事件流

`StateAnimationController` 仍可用于重连恢复、缺少当前事件但状态存在待显示牌的场景。但当 timeline 正在处理当前权威事件，或 display checkpoint 已覆盖对应静态变化时，状态观察器不得启动同一张牌或同一副露的补偿动画。

这能避免出现 `online:<eventSeq>` 和 `state:discard:<seat>:<cardId>` 同时存在的重复动画。

### Decision 6: ACK 与显示提交绑定到时间线完成点

时间线完成点表示当前事件已经完成必要视觉阶段或被策略明确跳过。只有这个完成点可以触发 `ackAnimation(eventSeq)` 和 display checkpoint 提交。本地预演完成、按钮点击、旧动画回调和渲染器特效完成都不能直接 ACK。

对于 `selfAcked` 或非必需事件，时间线应直接标记事件已消费并释放本地预演锁，不播放、不重复 ACK。

## Risks / Trade-offs

- [Risk] 分离权威状态和显示状态后，响应按钮需要读取权威私密动作，但牌桌画面读取显示状态，可能出现状态来源混乱。→ Mitigation: 明确 `databus` 字段归属，响应动作和窗口摘要允许即时更新，桌面牌面和结果面板通过 display checkpoint 提交。
- [Risk] 队列积压时跳过动画可能让玩家感觉状态跳变。→ Mitigation: 只跳过收尾观赏事件；行为确认事件使用短时长快进；响应关键事件保留完整入场和按钮可用性。
- [Risk] ACK 提交延后或跳过策略错误会阻塞服务端。→ Mitigation: 为每个事件记录状态机 `queued/playing/completed/skipped/acked`，并为 ACK 重试保留幂等逻辑和诊断日志。
- [Risk] 服务端屏障策略过度放松可能让某些玩家错过重要事件。→ Mitigation: 仅对离线玩家和非响应关键事件放松；在线且需要响应的玩家仍保留必需观看/操作流程。
- [Risk] 现有测试大量依赖 `applyServerSnapshot()` 立即改变 `databus`。→ Mitigation: 分阶段迁移测试，先引入时间线但默认同步提交，再逐步启用结果闸门和快进策略。

## Migration Plan

1. 增加时间线数据结构和诊断，但保持现有行为基本不变，先通过单元测试验证入队、去重、顺序和 ACK 幂等。
2. 将 `consumeAnimationState()` 改为向时间线提交事件，由时间线调用现有 `TableAnimationController.playOnlineEvent()`。
3. 引入 `authoritativeState` / display checkpoint，先覆盖结果类事件，解决 `hu` 与结算页并发。
4. 扩展事件分类和快进策略，覆盖队列积压、重连恢复、离线降级。
5. 调整状态观察器边界，禁止正常在线事件流下的重复补偿动画。
6. 调整服务端必需回执名单和超时/断线移除策略，并补充服务端核心测试。
7. 运行 `node scripts/run-online-checks.mjs`、`node scripts/run-server-core-checks.mjs`、`node scripts/run-backend-checks.mjs`。
8. 部署后端并上传小游戏；生产房间重点验证胡牌结算、多人响应、切后台恢复和断线玩家场景。

Rollback 策略：客户端时间线应保留一个短期兼容开关或清晰回退提交点。若生产出现严重阻塞，可回退到当前 `consumeAnimationState()` 直接播放逻辑，同时保留服务端屏障收敛修复中不改变客户端协议的部分。

## Open Questions

- 快进阈值初始值如何设定：队列长度超过 2 个事件，还是累计等待超过 1500ms？
- `settlement` 是否需要独立动画，还是只作为 `hu/circle-loss/draw-round` 完成后的 display checkpoint？
- 结果页展示前是否需要保留一个极短停顿，让玩家看清胡牌文字效果，推荐初始 300ms 以内。
- 断线玩家重连后，若当前事件仍在响应关键阶段，是否必须播放当前事件入场，还是可以恢复静态保留牌并直接显示按钮？
