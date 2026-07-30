## Why

对局结果页的四个玩家条目背景目前由 Canvas 自绘（圆角矩形 + 半透明填充 + 描边），与总结算页使用设计切图（`table_record_row.png` / `table_record_first_row.png`）的精致条目风格不一致。两张条目切图已在主包内并已注册进资源清单，直接复用即可在零新增包体积的前提下统一两个页面的视觉语言。

## What Changes

- 对局结果页玩家条目背景改为优先复用总结算页的条目切图：本局赢家使用金色 `table_record_first_row.png`，其余玩家使用米色 `table_record_row.png`。
- 条目切图采用九宫格方式绘制，保护四角纹饰与边框粗细，适配对局结果页高度独立 clamp、比例随屏幕浮动的行尺寸。
- 对局结果页行内 stats 列（胡数 + 分数）起点对齐切图内约 `78%` 处自带的竖分隔线，使分隔线自然成为"牌型区 | 数据区"的分界。
- 本家辨识方式调整：不再使用金色底填充或任何自绘行边框（金色底语义让位给赢家，与总结算页"金色 = 第一名"保持一致；切图自带边框，不再叠加自绘装饰），依靠既有"本家"角色标签辨识。
- 保留现有 Canvas 自绘逻辑作为切图缺失时的回退路径，与总结算页的回退模式对称。
- 不新增任何图片资源，不改动资源清单。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `huapai-table-interaction`: 对局结果页玩家条目背景新增复用总结算条目切图的展示要求（赢家金色行、其余米色行、九宫格适配、分隔线对齐、本家描边高亮、Canvas 回退）。

## Impact

- `js/game/renderer.js`：`drawRoundResultPage` 中行背景绘制逻辑改为切图优先 + 自绘回退；新增条目切图的九宫格源边距常量。
- `js/game/layout.js`：`createRoundResultLayout` 中 stats 列宽度计算改为按行宽 `78%` 分界对齐切图分隔线。
- 图片资源：无新增、无删除，包体积不变。
- 检查脚本：`scripts/run-huapai-checks.mjs` 现有断言不涉及行背景绘制，预期不需要调整；如布局断言受 stats 对齐影响则同步更新。
