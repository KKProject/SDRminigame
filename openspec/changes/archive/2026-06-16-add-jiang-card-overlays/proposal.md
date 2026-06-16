## Why

开局发完牌后已经可以确定本局将牌，但当前牌桌上只有文字或局部提示，玩家在手牌、弃牌、凑牌和动画过程中很难持续识别哪些牌属于将牌。需要在整个牌局中为所有将牌增加统一图片覆盖标识，让将牌身份在任何展示形态下都清晰可见。

## What Changes

- 为所有属于本局将牌句子的牌面叠加将牌覆盖图，包括手牌、弃牌区 mini 牌、凑牌区 mini 牌、出现牌、摸/出/归位/凑牌动画牌，以及其他牌局内可见牌面。
- 按牌面尺寸使用不同 atlas 覆盖图：大牌使用 `icon_jiang_big`，小牌使用 `icon_jiang_small`，mini 牌使用 `icon_jian_mini_hr`。
- `icon_jian_mini_hr` 绘制时需要左旋 90 度使用。
- 覆盖图按 atlas JSON 中覆盖图源尺寸与基础牌面源尺寸的比例同比缩放，并以基础牌面中心对齐。
- 覆盖图资源缺失时保留基础牌面绘制，不能影响牌局运行。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `huapai-assets-audio`: 增加将牌覆盖图 atlas 资源语义映射和旋转要求。
- `huapai-table-interaction`: 增加牌桌静态牌面、手牌、弃牌区和凑牌区的将牌覆盖显示要求。
- `client-animation-system`: 增加动画牌和出现牌在动画过程中的将牌覆盖显示要求。

## Impact

- 影响 `js/game/assets.js` 的 atlas sprite 获取与将牌覆盖图语义映射。
- 影响 `js/game/renderer.js` 的统一牌面绘制入口、覆盖图缩放/旋转/叠加顺序，以及各类静态和动画牌面绘制路径。
- 影响现有资源自检、渲染自检和动画自检脚本，需覆盖大牌、小牌、mini 牌、旋转、同比缩放和非将牌不叠加场景。
