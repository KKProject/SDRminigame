## 1. 布局：数据区对齐切图分隔线

- [x] 1.1 在 `js/game/layout.js` 的 `createRoundResultLayout` 中，将 stats 列宽度计算改为对齐行宽 `78%`（`statsWidth = rowWidth - Math.round(rowWidth * 0.78)`），保持胡数/分数继续平分 stats 区，行内其余子区域（identity、cards）随之顺延

## 2. 渲染：条目切图九宫格绘制

- [x] 2.1 在 `js/game/renderer.js` 中新增条目切图九宫格源边距常量（参考 `ROUND_RESULT_PANEL_SOURCE_SLICES` 的模式，边距约 `30px`）
- [x] 2.2 修改 `drawRoundResultPage` 行绘制逻辑：赢家行取 `tableRecordFirstRow`、其余行取 `tableRecordRow`，用 `drawNineSliceImage` 绘制，目标边距按行高 clamp
- [x] 2.3 切图绘制成功时不再绘制任何自绘底色或行边框；本家依靠"本家"角色标签辨识（初版的本家金色描边方案经实机检视确认多余，已移除）
- [x] 2.4 保留现有三态自绘逻辑作为切图缺失/绘制失败时的回退分支（结构与总结算页 `rowImage ? 切图 : 自绘` 对称）

## 3. 验证

- [x] 3.1 运行 `node scripts/run-huapai-checks.mjs`，确认现有断言全部通过；如有布局断言受 stats 对齐影响则同步更新（断言未受影响，无需调整）
- [x] 3.2 运行 `node scripts/run-online-checks.mjs` 与 `node scripts/run-server-core-checks.mjs`，确认无回归
- [x] 3.3 在微信开发者工具横屏预览对局结果页：确认赢家金色行/其余米色行、四角纹饰无变形、分隔线与胡数分数列对齐、滚动与主操作按钮正常（用户真机测试通过，v1.0.11）
