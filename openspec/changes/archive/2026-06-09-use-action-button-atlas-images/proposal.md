## Why

当前动作按钮仍由 Canvas 绘制底色和文字，与项目已有的 `images/actions.png` 美术资源不一致。使用动作合集 atlas 中的指定切片替代文字按钮，可以让接庄、凑牌和响应操作具有统一且更清晰的视觉表现。

## What Changes

- 将 `images/actions.png` 与 `images/action_buttons_named_atlas.json` 配置为独立动作按钮 atlas。
- 按 atlas 帧的 `originalIndex` 建立动作映射：
  - `acceptTakeover` 接庄使用索引 `1`，绘制时左旋转 90 度。
  - `declineTakeover` 不接庄使用索引 `4`，绘制时左旋转 90 度。
  - `hu` 胡使用索引 `13`，绘制时左旋转 90 度。
  - `zhao` 招使用索引 `47`，绘制时左旋转 90 度。
  - `ta` 踏使用索引 `36`，不旋转。
  - `peng` 碰使用索引 `51`，绘制时左旋转 90 度。
  - `chi` 吃使用索引 `27`，不旋转。
  - `pass` 过使用索引 `58`，不旋转。
- 动作按钮优先绘制对应 atlas 图片，并在绘制时保持切片原始宽高比、居中适配按钮命中区域。
- 保留动作按钮现有入场、点击反馈和命中区域逻辑。
- atlas、图片或指定索引缺失时，继续使用现有 Canvas 文字按钮作为回退，不阻塞牌局操作。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `huapai-assets-audio`: 增加动作按钮 atlas 的清单配置、按 `originalIndex` 查找切片、旋转和资源缺失回退要求。
- `huapai-table-interaction`: 动作弹窗中的接庄、胡、招、踏、碰、吃、过按钮改为指定图片切片，同时保持按钮动画和命中区域行为。

## Impact

- 资源配置与加载：`js/game/assets.js`、`images/actions.png`、`images/action_buttons_named_atlas.json`。
- 动作按钮渲染：`js/game/renderer.js`。
- 动作按钮布局可能需要适配不同图片比例，但不得改变现有命中区域：`js/game/layout.js`。
- 自动检查：`js/game/self-check.js`、`scripts/run-huapai-checks.mjs`。
- 不修改游戏动作类型、动作优先级、规则判定或输入处理 API。
