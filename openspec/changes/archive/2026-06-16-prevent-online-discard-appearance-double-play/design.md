## Context

在线客户端应用服务端快照时会把公共状态写入 `DataBus`，其中包括 `recentDiscard`、`playerActions` 和 `animationWaiting`。同一快照也会携带 `animation.currentEvent`，在线控制器随后将该权威事件提交给 `TableAnimationController.playOnlineEvent()`。

目前出现牌有两条可能入口：

```
权威事件入口：
animation.currentEvent(discard, eventSeq)
  -> playOnlineEvent()
  -> plan.id = online:<eventSeq>

状态补偿入口：
state.recentDiscard
  -> StateAnimationController.observe()
  -> plan.id = state:discard:<seat>:<cardId>
```

当其他玩家出牌且本机需要响应时，`recentDiscard` 会在响应窗口中保留，`playerActions` 会显示响应按钮，权威事件也会要求客户端播放并回执。由于两个入口使用不同 id，动画管理器不会自动去重。

## Goals

- 同一次在线权威出牌在同一客户端最多播放一次出现动画。
- 正常在线响应窗口中，权威事件负责出牌出现动画；状态观察器只做兜底，不抢播。
- 布局变化或重连恢复时可以恢复保留牌，但不得重新播放入场 pulse。

## Non-Goals

- 不改变服务端 `publicEvent`、`animationBarrier` 或回执协议。
- 不改变出牌、吃碰招踏胡的规则裁决。
- 不取消状态观察器的断线恢复价值。

## Decisions

### 1. 在线动画等待状态阻塞状态补偿

渲染器调用 `StateAnimationController.observe()` 时，blocked 条件应同时包含：

```
animationController.isBlockingStateAnimation()
OR state.animationWaiting
```

其中 `state.animationWaiting` 表示服务端当前存在动画屏障/权威事件等待客户端播放或回执。此时同一 `recentDiscard` 的正常动画所有权属于在线事件入口。

### 2. 恢复只恢复视觉，不重播入场

如果客户端已经回执或布局变化导致 `heldAppearance` 丢失，恢复路径应使用现有 `restoreHeldAppearance()` 语义：创建正常大小的保留牌、无 steps、不播放 `80% -> 120% -> 100%` 入场动画。

### 3. 保留事件缺失兜底

只有在没有在线动画等待、没有在线播放/本地预演阻塞、且状态中仍保留需要展示的 `recentDiscard` 时，状态观察器才可以作为补偿入口播放 retained 动画。这覆盖断线恢复、旧房间兼容或临时缺失事件的场景。

## Risks / Trade-offs

- 如果 `animationWaiting` 被错误地长期置真，状态补偿会被延后。权威事件入口仍应负责播放和回执，且超时屏障会在服务端推进。
- 如果某些旧快照只有 `recentDiscard` 而没有 `animation.currentEvent`，但仍标记 `animationWaiting`，可能会暂时不补播。自检应覆盖正常在线事件和无事件恢复两类路径，避免误杀恢复能力。
