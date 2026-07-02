## Why

微信小游戏从分享面板或后台恢复到前台时，运行时可能短暂返回一个“看似合法但不是真实游戏画布”的横屏窗口尺寸。当前渲染层会把连续两次相同候选提交为正式布局，导致大厅和牌桌元素按过窄宽度排在左侧，右侧出现大片空白。

## What Changes

- 引入游戏级 canonical render viewport，作为大厅、牌桌、Canvas backing store、2D context transform 和触摸命中的唯一布局权威。
- 将 `wx.getWindowInfo()` / `wx.getSystemInfoSync()` 中的 `screenWidth/screenHeight` 归一化为设备级横屏 viewport，`windowWidth/windowHeight` 只作为候选观测值和恢复信号。
- 前台恢复期间优先重应用当前 canonical Canvas/context，不允许短暂缩窄的窗口候选覆盖已稳定的游戏视口。
- 横屏下拒绝疑似竖屏/转置坐标系的 `safeArea`，避免分享返回后错误右侧 inset 压缩大厅和牌桌布局。
- 允许真实尺寸、安全区或像素比变化通过稳定确认流程更新 canonical viewport。
- 增加客户端 render 诊断上报接口，记录分享/前后台恢复期间的窗口指标、canonical 指标、Canvas backing store 和渲染提交决策。
- 增加自动检查，覆盖分享返回时连续出现过窄横屏候选、恢复到原尺寸、真实横屏尺寸变化和 context 被替换等场景。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `huapai-table-interaction`: 渲染布局从直接信任窗口指标改为使用 canonical render viewport；前台恢复中的短暂候选不得覆盖稳定布局。
- `client-animation-system`: canonical 视口恢复不应被视为动画布局尺寸变化；只有 canonical 尺寸真实变化才触发布局变化动画恢复。

## Impact

- 影响 `js/render.js` 的渲染指标管理器、Canvas/context 恢复和稳定确认策略。
- 可能影响 `js/main.js` 的前台恢复与窗口变化调用边界，但不改变牌局状态、在线协议或服务端逻辑。
- 影响 `js/net/diagnostics.js` 与 `services/backend/src/server.js`，用于临时收集客户端渲染诊断日志。
- 影响 `scripts/run-huapai-checks.mjs` 的渲染恢复测试。
- 不引入新依赖，不改变小游戏配置、后端接口或上传流程。
