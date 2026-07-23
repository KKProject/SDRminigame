## Context

客户端已经有权威状态镜像、在线事件时间线和结果显示 checkpoint。全量快照入口 `applyServerSnapshot()` 会在收到 `phase=result` 与结果事件时保留旧显示状态，并把完整结果绑定到时间线完成点；但增量入口 `applySocketDelta()` 仍直接通过 `applyPublicDelta()` 修改渲染使用的 `databus`。

服务端结果事件已经携带 `event.result`，增量 `publicPatch` 也会携带新的 `phase`。当前组合会先把可见状态改成 `phase=result`，而 `databus.result` 仍为空；结果渲染器又把所有非 `win`、`circle-loss`、`draw-round` 类型兜底为“荒庄”，因此在 ACK 返回完整快照前出现错误提示。

## Goals / Non-Goals

**Goals:**

- 让 snapshot 和 delta 两条入口对结果类事件执行相同的显示状态闸门。
- 在收到结果 delta 时立即维护完整权威结果，但仅在结果事件完成、快进或跳过后提交可见结果状态。
- 只有显式 `result.type=draw` 才允许显示“荒庄”，缺失或未知类型不得伪装成合法结果。
- 用回归测试覆盖胡牌、进圈、流局、荒庄以及动画正常完成和跳过路径。

**Non-Goals:**

- 不修改服务端胡牌、进圈、流局和荒庄的裁决条件或计分。
- 不重写整个在线时间线，也不改变事件 ACK 协议。
- 不调整结果面板视觉样式、文案设计或动画时长。
- 不把当前进行中的 retained 出现牌生命周期变更合并进本变更。

## Decisions

### Decision 1: delta 先构建权威候选状态，再决定是否提交到显示状态

结果事件到达时，客户端基于当前权威镜像或当前稳定显示状态构建候选状态，应用旋转后的 `publicPatch`、私密补丁和事件携带的 `result`，并把它保存为最新权威状态。若候选状态为 `phase=result` 且事件属于 `hu`、`circle-loss` 或 `draw-round`，客户端保留当前可见牌桌状态，把候选状态作为该事件的 `displayCommit` 入队。

这样可复用 snapshot 已有的时间线完成语义：

```text
result delta
    │
    ├─ candidate/authoritativeState = phase=result + complete result
    ├─ databus/displayState         = previous stable table
    └─ timeline.displayCommit       = candidate
                                      │
                         complete / fast-forward / skip
                                      ▼
                              commit phase=result
```

替代方案是在渲染器中使用 `animationWaiting` 隐藏结果面板。它能遮住当前症状，但会让网络时间线规则泄漏到渲染层，并且不能保证结果按钮、积分和面板在同一 checkpoint 提交，因此不采用为主方案。

### Decision 2: 复用结果事件的 `event.result`，仅在必要时扩展 publicPatch

现有 `hu`、`circle-loss` 和 `draw-round` 公开事件均携带服务端权威 `result`。客户端应把旋转后的 `event.result` 写入权威候选状态，用它生成完整 checkpoint；只有测试证明某条结果事件缺少该字段时，才在服务端增量 `publicPatch` 中显式增加 `result`。

这避免重复扩大 WebSocket 载荷，也保持向后兼容。替代方案是所有 delta 都附带完整公共状态，虽然简单，但会削弱增量传输的意义。

### Decision 3: 将结果类型校验作为渲染层防御

结果面板只识别 `win`、`circle-loss`、`draw-round` 和 `draw`。其中只有显式 `draw` 表示荒庄；当 `phase=result` 但 `result` 缺失或类型未知时，渲染器不得绘制荒庄标题和“牌堆摸完”说明。客户端应等待有效 checkpoint，无法恢复时走既有重新订阅/快照恢复机制。

该保护不能替代时间线闸门，但能防止将来其他入口出现半成品结果时再次向玩家展示错误业务结论。

### Decision 4: 回归测试必须分别覆盖 snapshot 与 delta

保留现有 snapshot 胡牌闸门用例，并新增真实 delta 形状的测试。每个结果 delta 至少验证：

- 事件完成前可见 `phase` 仍为稳定牌桌阶段且不出现结果面板。
- 权威候选状态已经保存正确的 `result.type`。
- 正常完成、快进或跳过后一次性提交正确结果。
- `draw` 只有在显式结果类型存在时才显示荒庄。
- ACK 返回完整快照不会重复播放或短暂覆盖成其他结果。

## Risks / Trade-offs

- [Risk] 将 delta 应用到候选状态时可能漏掉当前 `applyPublicDelta()` 的弃牌、副露或私密动作旋转逻辑。→ 将补丁应用逻辑抽成可指定目标状态的单一入口，避免复制两套字段处理，并用现有 delta 回归覆盖非结果事件。
- [Risk] 结果事件在本地已完成或重连时被直接跳过，checkpoint 可能没有提交。→ 所有 `completed`、`fast-forward`、`skip`、`selfAcked` 和已消费分支统一调用现有 `commitTimelineDisplayState()`。
- [Risk] 仅从 `event.result` 构建状态可能遇到旧服务端或异常载荷缺失结果。→ 不显示猜测结果，触发快照恢复；必要时再向 `publicPatch` 增加兼容字段。
- [Risk] 渲染器隐藏无效结果后可能短暂保留旧牌桌。→ 这是比展示错误荒庄更安全的退化行为，并由重新订阅恢复最终状态。

## Migration Plan

1. 先补充 delta 结果闸门测试，复现 `phase=result + result=null` 的错误过渡。
2. 重构增量补丁应用以支持权威候选状态和延迟显示提交。
3. 增加结果渲染类型防御，运行在线、动画、服务端核心和后端回归。
4. 若服务端协议无需变化，只上传新的微信小游戏测试版本；若补充了服务端字段，则先部署后端并验证健康检查，再上传客户端。
5. 在双真人与 AI 混合房间真机验证胡牌、进圈、流局和牌堆耗尽荒庄。

回滚时可回退客户端结果 delta 闸门改动；若服务端只新增兼容字段则可保留。不得回退为把缺失结果默认显示成荒庄。

## Open Questions

- 当前事件载荷已足以构建所有结果 checkpoint，预计无需修改服务端 `publicPatch`；实现时需用测试确认 `hu`、`circle-loss`、低牌堆流局和牌堆耗尽荒庄四条路径均携带完整 `event.result`。
