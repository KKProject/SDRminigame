## 1. 资产层支持

- [x] 1.1 在 `AssetLoader` 中增加出现牌覆盖图语义映射，`play` 对应 `ui_left_play_panel_da`，`move` 对应 `ui_left_move_panel_ban`
- [x] 1.2 增加获取出现牌覆盖图 sprite 的方法，并复用现有 `cards` atlas / `getAtlasSprite()` 能力
- [x] 1.3 确认覆盖图资源缺失时返回空结果，不影响基础牌面绘制

## 2. 渲染层接入

- [x] 2.1 扩展牌面绘制选项，支持在基础牌面之后叠加 `appearanceOverlay`
- [x] 2.2 在 `drawManagedAnimations()` 中按 `visual.stage === 'discard'` 叠加 `play` 覆盖图
- [x] 2.3 在 `drawManagedAnimations()` 中按 `visual.stage === 'draw'` 叠加 `move` 覆盖图
- [x] 2.4 在 `drawHeldDiscardFallback()` 中为待响应出牌兜底显示叠加 `play` 覆盖图
- [x] 2.5 在 `drawHeldDrawFallback()` 中为待响应摸牌兜底显示叠加 `move` 覆盖图
- [x] 2.6 确认手牌、静态弃牌区 mini 牌、凑牌区牌组和普通静态牌不传入出现牌覆盖图选项
- [x] 2.7 出现牌绘制时关闭默认卡牌边框，并按 atlas 源尺寸比例放大、居中绘制覆盖图

## 3. 自动检查与验收

- [x] 3.1 扩展资源或渲染自检，断言 `play` / `move` 能映射到指定 atlas frame
- [x] 3.2 扩展动画或渲染自检，断言 `discard` 出现牌使用 `ui_left_play_panel_da`
- [x] 3.3 扩展动画或渲染自检，断言 `draw` 出现牌使用 `ui_left_move_panel_ban`
- [x] 3.4 扩展检查，断言非出现牌绘制不会叠加来源覆盖图
- [x] 3.5 扩展检查，断言出现牌不绘制默认边框且覆盖图按 atlas 源尺寸比例放大居中
- [x] 3.6 运行 `node scripts/run-animation-checks.mjs`
- [x] 3.7 运行相关在线/资源自检脚本
- [x] 3.8 运行 `openspec validate use-appearance-card-overlays --strict`
- [x] 3.9 真机验证：出牌出现牌叠加 `ui_left_play_panel_da`，摸牌出现牌叠加 `ui_left_move_panel_ban`
