## Why

微信小游戏从后台恢复到前台时，真机可能重置 Canvas backing store 或 2D context transform，但窗口宽高、安全区和像素比仍与恢复前相同。当前逻辑会把这类相同指标当作普通重复通知忽略，导致布局坐标仍按横屏计算，而实际画布或缩放状态已经失配，页面重新进入后出现元素错位或挤在一起。

## What Changes

- 区分普通窗口尺寸变化和小程序前台恢复事件。
- 前台恢复时，即使稳定窗口指标签名未变化，也要重新应用当前稳定的 Canvas backing store 和 2D context transform。
- 前台恢复后继续短时间重新读取窗口指标；如果微信随后报告新的有效横屏尺寸或安全区，再沿用现有稳定确认流程提交重布局。
- 普通重复尺寸通知仍保持幂等，不重复重建布局、不销毁菜单按钮、不取消当前动画。
- 前台恢复的上下文重应用不得改变牌局状态、手牌列顺序、在线房间状态或服务端协议。
- 自动检查增加“前台恢复但指标签名不变”的场景，断言 Canvas/context 会恢复，同时布局和动画不会被误重建。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `huapai-table-interaction`: 强化运行时屏幕指标稳定与重布局要求，增加前台恢复时对 Canvas backing store 和 2D context transform 的恢复行为。
- `client-animation-system`: 增加前台恢复时重复指标不得误取消动画或重复播放效果的要求。

## Impact

- 影响 `js/render.js` 的渲染指标管理器，需要支持在稳定指标签名不变时强制重新应用 Canvas/context。
- 影响 `js/main.js` 的 `wx.onShow` 与 `wx.onWindowResize` 生命周期处理，需要区分前台恢复和普通窗口变化。
- 影响 `TableRenderer`、`StartMenu` 和动画控制器的通知边界，确保恢复上下文不等同于重布局。
- 影响 `scripts/run-huapai-checks.mjs` 和相关自动检查，覆盖相同指标恢复、真实尺寸变化、重复普通通知和动画保持。
