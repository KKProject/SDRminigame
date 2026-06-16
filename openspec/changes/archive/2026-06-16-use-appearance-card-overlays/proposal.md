## Why

当前出现牌主要依赖通用牌面绘制和外层高亮/边框效果，不能体现“打出来”和“从牌堆摸出来”这两类来源差异。项目的 `images/element.atlas.json` 中已经包含可用于覆盖在牌面上的来源面板资源，应复用这些图片提升出现牌表现的一致性。

## What Changes

- 出现牌在绘制牌面图片后，根据来源叠加对应 atlas 覆盖图。
- 打出来的出现牌使用 `ui_left_play_panel_da` 覆盖在牌面上。
- 从牌堆摸出来的出现牌使用 `ui_left_move_panel_ban` 覆盖在牌面上。
- 覆盖图只用于出现牌相关视觉，不影响手牌、弃牌区 mini 牌、凑牌区牌组或普通静态牌面。
- 覆盖图缺失或图片未加载时，客户端必须继续显示基础牌面，不阻断牌局。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `huapai-assets-audio`: 资产加载器需要支持从现有 `cards` atlas 中按命名 frame 获取出现牌覆盖图资源。
- `client-animation-system`: 出现牌动画和待响应出现牌兜底显示需要根据牌来源叠加对应覆盖图。

## Impact

- 影响 `js/game/assets.js`：增加或复用通用 atlas sprite 获取能力，暴露 `ui_left_play_panel_da` 与 `ui_left_move_panel_ban`。
- 影响 `js/game/renderer.js`：在出现牌动画、待响应出牌兜底、待响应摸牌兜底绘制时叠加覆盖图。
- 影响 `scripts/run-animation-checks.mjs` 或相关渲染检查：增加来源覆盖图映射和不影响非出现牌的断言。
- 不改变服务端事件协议、牌局状态机、动画时序或响应逻辑。
