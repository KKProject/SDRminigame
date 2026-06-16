## Context

现有牌面图片来自 `images/element.png` 与 `images/element.atlas.json`，`AssetLoader.getCardSprite()` 已能按 card key 和尺寸返回牌面 sprite。出现牌动画最终由 `renderer.drawManagedAnimations()` 绘制，待响应但没有 managed visual 时还有 `drawHeldDiscardFallback()` 与 `drawHeldDrawFallback()` 两个兜底绘制入口。

本次需求不是替换牌面本身，而是在出现牌牌面上叠加来源覆盖图：

- 出牌来源：`ui_left_play_panel_da`
- 摸牌来源：`ui_left_move_panel_ban`

这两个 frame 都在现有 `cards` atlas 中，尺寸接近当前大牌比例，适合作为牌面矩形上的覆盖层。

## Goals / Non-Goals

**Goals:**

- 出现牌动画中，出牌与摸牌来源使用不同覆盖图。
- 状态兜底显示的待响应出牌/摸牌也使用同样覆盖图。
- 覆盖图仅影响出现牌，不改变手牌、弃牌区、凑牌区和普通静态牌。
- 覆盖图缺失或图片未加载时，基础牌面仍正常显示，牌局不中断。

**Non-Goals:**

- 不改变出现牌动画时长、缩放曲线或保留/归位分支。
- 不改变服务端 `appearanceResolution`、`appearingCard`、`recentDiscard` 等协议。
- 不新增图片文件；只使用现有 `element.atlas.json` 中的 frame。
- 不重新设计牌面 atlas 命名规则。

## Decisions

### 1. 覆盖图作为牌面绘制选项

在 renderer 层扩展 `drawCard()` 或其附近的绘制辅助，让调用方可通过类似 `appearanceOverlay: 'play' | 'move'` 的选项叠加来源覆盖图。

这样动画 plan 仍只描述“有一张牌在动”，renderer 根据上下文决定怎样画这张牌：

```
visual.stage = discard  -> appearanceOverlay: play  -> ui_left_play_panel_da
visual.stage = draw     -> appearanceOverlay: move  -> ui_left_move_panel_ban
```

备选方案是在动画 visual 中塞具体 atlas frame 名。该方案会让动画预设层知道渲染资源细节，和当前动画/绘制职责分离方向不一致，不采用。

### 2. 覆盖图通过命名 frame 获取

资产层应提供一个明确入口获取出现牌覆盖图，例如按语义名 `play` / `move` 映射到 `ui_left_play_panel_da` / `ui_left_move_panel_ban`。内部可复用 `getAtlasSprite(frameName, 'cards')`，无需新增 manifest 图片。

备选方案是在 renderer 中直接写 frame name 并调用 `getAtlasSprite()`。这能工作，但资源语义散落在渲染逻辑中，后续替换资源名会更脆，不采用。

### 3. 覆盖图铺在当前绘制矩形上

覆盖图应画在基础牌面之后，并以当前牌面矩形中心为基准居中。覆盖图尺寸不直接铺满牌面，而是按 atlas JSON 中“覆盖图 frame 源尺寸 / 基础牌面 frame 源尺寸”的比例缩放；例如基础大牌源尺寸为 `88 x 307`，`ui_left_play_panel_da` 为 `123 x 343` 时，覆盖图在屏幕上的宽高也应分别是牌面绘制宽高的 `123 / 88` 和 `343 / 307`。

如果资源未来存在透明边距或需要微调，应通过统一 padding/fit 逻辑处理，而不是在每个调用点单独偏移。

### 4. 三个出现牌入口保持一致

需要覆盖的入口包括：

- `drawManagedAnimations()`：正常 online/state 出现牌动画。
- `drawHeldDiscardFallback()`：待响应出牌的兜底显示。
- `drawHeldDrawFallback()`：待响应摸牌的兜底显示。

普通手牌、mini 弃牌、凑牌区和结果面板里的牌不传 `appearanceOverlay`。

## Risks / Trade-offs

- [覆盖图遮挡牌面文字过多] → 首次实现按资源原图铺满；如果视觉效果不理想，再增加统一透明度或 padding 参数。
- [图片未加载导致空白覆盖层] → 覆盖图获取失败时跳过叠加，基础牌面继续显示。
- [非出现牌误叠覆盖图] → 只在 `visual.stage` 为 `draw` / `discard` 和两个 held fallback 中传入选项，并用自动检查覆盖。
- [atlas frame 名称变化] → 资源层集中维护语义映射，renderer 不直接依赖 frame 名。
