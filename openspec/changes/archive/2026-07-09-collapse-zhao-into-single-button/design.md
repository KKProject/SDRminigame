## Context

`support-selectable-zhao-size` 已经让规则引擎在手里同 key 有 3/4/5 张时分别枚举 1/2/3 个招候选动作（`zhaoSize` 4/5/6），并把每个候选都下发到客户端 `playerActions`。当前 `layout.js` 直接把每个 `zhao` action 映射成一个按钮，因此 `xxxx + x` 会出现 `招4张2对 / 招5张3对` 两个按钮，`xxxxx + x` 会出现三个，与碰、过等按钮挤在同一面板。

`renderer.js:752` 当前对带 `zhaoSize` 的招按钮强制 `actionSpriteType = null`，所以现有招按钮是纯文字。但 `assets.js:73` 已有 `zhao: { originalIndex: 47, rotateCcw: true }`，`getActionSprite('zhao')` 可直接返回带逆时针旋转标记的招精灵（atlas 中该帧存储为顺时针旋转 90°，绘制时逆时针旋转 90° 还原），`actionSpriteBounds` 已处理旋转。也就是说"纯招按钮用精灵图"所需的资源与旋转逻辑都已就绪，无需新美术、无需新旋转代码。

## Goals / Non-Goals

**Goals:**

- 把同一出现牌的多个 `zhao` 候选折叠成单个"招"按钮，降低多招场景的动作面板按钮数量。
- 单一招方案（手里同 key 3 张）点击即执行，不弹子面板。
- 多个招方案（手里同 key 4 或 5 张）点击"招"后用张数子面板替换主动作面板，子选项为纯文字 `招4 / 招5 / 招6`。
- 招按钮使用 `actions` atlas 招精灵图，与碰/吃/踏/胡按钮视觉一致。
- 提交链路不变：仍按现有 `response` ref 携带 `zhaoSize`，服务端精确匹配。

**Non-Goals:**

- 不改规则引擎的招枚举、支持对子校验、`circleLossRisk` 过滤口径。
- 不改在线动作协议、AI 在多招张数间的选择逻辑。
- 不动碰、吃、踏、胡、过、接庄等其它动作的呈现。
- 不在子选项上展示"需 N 对"支持对子文字或风险标记（`circleLossRisk` 招候选已被 `filterHighestPriority` 过滤，到达玩家面前的招候选都是支持对子合法的，无需逐项提示风险）。

## Decisions

### 1. 折叠放在客户端呈现层，引擎与协议不动

招"有几种方案"是呈现问题。引擎继续枚举全部招候选是对的：AI 要在多张数间选择，`circleLossRisk` 过滤也要基于完整候选集。客户端把 `playerActions` 中所有 `type === 'zhao'` 且 `card.id` 匹配当前出现牌的 action 归为一组，折叠成单个"招"入口。提交时仍从该组里取出玩家选中的具体 action（带 `zhaoSize`）走原提交通道。`self-check.js` 中对 `xxx/xxxx/xxxxx` 枚举张数的断言继续成立。

### 2. 单/多方案判定基于"组内候选数量"而非手牌张数

判定直接执行还是展开子面板的依据是**折叠后该组的 action 数量**：为 1 → 直接执行；大于 1 → 展开子面板。这样能自然兼容 `circleLossRisk` 过滤导致候选被裁剪的情况（例如 `xxxx` 的 `招5` 被过滤后只剩 `招4`，则直接执行），无需客户端反向推断手牌张数。

### 3. 子面板形态：替换整个动作面板（方案 c）

点击"招"后，招张数子面板替换当前动作面板区域，展示 `招4 / 招5 / 招6`（按组内实际候选）+ 一个"返回"控件。返回后回到主动作面板（仍含碰、过等）。点"招"只是展开，不是承诺，因此必须有返回路径。子面板期间手牌仍不可点（与主动作面板一致）。

### 4. 招按钮用精灵图，子选项纯文字

- 折叠后的"招"入口在 `renderer` 中取 `actionSpriteType = 'zhao'`，用 `getActionSprite('zhao')`（`originalIndex: 47`，`rotateCcw` 已配置）绘制，宽高比按 atlas 切片旋转后计算，可见高度 50px，与其它动作按钮一致。
- 子面板的 `招4 / 招5 / 招6` 为纯文字按钮（无精灵），label 分别为 `招4`、`招5`、`招6`。
- 这同时让招按钮符合主 spec 中"动作区域优先使用 actions atlas 图片显示…招…"的要求（此前招按钮是纯文字，未遵守）。

### 5. 提交与状态

- 提交：子选项点击 → 取对应 action → 现有 `handleActionTap` 的 `response` 分支，`ref` 仍带 `{ index, type, zhaoSize, handKeyCount, responseWindowId }`。引擎侧 `zhaoSize` 精确匹配逻辑不变。
- 子面板展开状态为客户端瞬时 UI 状态（建议放在 `OnlineController` / `databus`，如 `zhaoSizePickerOpen`），在以下情况必须自动关闭并回主面板或关闭弹窗：响应窗口被服务端裁决关闭、`playerActions` 更新导致招候选变化、玩家点了返回、玩家提交了某张数、玩家点了其它动作（碰/过等）。
- `localActionPreview` 预览逻辑不变：提交后才触发预览，展开子面板不应触发预览。

## Interaction Flow

```
主动作面板 (c=5，含碰/招/过):
┌────┐ ┌────┐ ┌────┐
│ 碰 │ │ 招 │ │ 过 │   ← 招用精灵图
└────┘ └─┬──┘ └────┘
        │ 点击"招" (组内候选 >1)
        ▼
招张数子面板 (替换主动作面板):
┌────────────────────┐
│  招4   招5   招6    │   ← 纯文字
│       ← 返回        │
└────────────────────┘
  │点击某项         │点击返回
  ▼                 ▼
 提交 response      回主动作面板
 (带 zhaoSize)      (碰/招/过)

c=3 (组内候选 ==1):
┌────┐ ┌────┐ ┌────┐
│ 碰 │ │ 招 │ │ 过 │   ← 点击"招"直接提交招4，不弹子面板
└────┘ └────┘ └────┘
```

## Risks / Edge Cases

- **子面板期间响应窗口被裁决关闭**：必须监听 `responseWindowId` 失效或 `actionState` 变为不可用，关闭子面板，按 `Response is preempted by server裁决` 场景渲染最新权威状态，后续点击不得提交。
- **子面板期间 `playerActions` 更新**（如其他玩家响应导致候选变化、或重连下发新状态）：招候选组可能变化甚至消失，必须重置子面板状态，按最新 `playerActions` 重新渲染。
- **返回按钮与误触**：返回只是切回主面板，不提交、不过牌；需保证返回不触发 `localActionPreview` 或任何 `sendOp`。
- **招候选与碰并存**：c≥3 时碰与招同时存在，折叠后仍为 `[碰][招][过]`，碰按钮与行为不变。
- **命中区**：子面板按钮命中区不得覆盖手牌（沿用 `Prompt controls do not cover hand cards`）。
- ** atlas 旋转**：招精灵帧存储为顺时针 90°，`rotateCcw: true` 已配置，`actionSpriteBounds` 已按旋转后宽高比计算，无需新增旋转代码；实现时验证绘制方向正确（字朝上）。
