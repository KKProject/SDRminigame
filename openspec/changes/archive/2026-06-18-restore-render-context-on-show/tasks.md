## 1. 扩展渲染指标管理器

- [x] 1.0 在 `js/render.js` 中将运行时竖屏宽高归一化为横屏逻辑宽高，并忽略竖屏来源安全区
- [x] 1.1 在 `js/render.js` 中为 `RenderMetricsManager` 增加前台恢复入口，用当前稳定指标强制重新解析并应用 Canvas backing store 和 2D context transform
- [x] 1.2 保证恢复入口在无稳定横屏指标时不创建正式布局，并返回可测试的状态结果
- [x] 1.3 保持普通 `consider()` 重复指标签名逻辑幂等，不因本次改动重复重置 Canvas 或通知布局监听者
- [x] 1.4 为恢复入口补充导出函数，供主程序生命周期调用

## 2. 区分前台恢复与窗口变化

- [x] 2.1 在 `js/main.js` 中拆分 `wx.onShow` 与 `wx.onWindowResize` 的处理路径
- [x] 2.2 `wx.onShow` 先调用渲染上下文恢复入口，再启动短时恢复窗口与窗口指标重读
- [x] 2.3 `wx.onWindowResize` 继续使用现有稳定确认流程处理真实尺寸、安全区或像素比变化
- [x] 2.4 确认普通重复相同指标不会调用 `TableRenderer.setViewport()`、`StartMenu.handleMetricsChange()` 或销毁原生授权按钮，竖屏过渡后的相同横屏指标会触发一次布局缓存刷新

## 3. 保护动画与交互状态

- [x] 3.1 确认前台恢复相同指标不会触发动画布局变化处理、取消活动 Tween 或重复音效
- [x] 3.2 确认前台恢复后如检测到新的稳定横屏指标，仍沿用现有布局变化动画恢复逻辑
- [x] 3.3 验证菜单按钮、牌桌触摸命中区域和在线输入状态在相同指标恢复后保持一致

## 4. 自动检查

- [x] 4.1 扩展 `scripts/run-huapai-checks.mjs`，模拟稳定指标已提交后 Canvas/context 被重置并通过前台恢复窗口重新应用
- [x] 4.2 增加断言：前台恢复相同指标会重新解析 2D context，并设置 Canvas backing store 和 2D context transform
- [x] 4.3 增加断言：前台恢复相同指标不会通知布局监听者、不会重建菜单按钮、不会取消当前动画
- [x] 4.4 保留并运行既有异常首帧、稳定后异常候选、重复普通通知、安全区变化和高像素比检查

## 5. 验证与验收

- [x] 5.1 运行 `node scripts/run-huapai-checks.mjs`
- [x] 5.2 运行 `node scripts/run-animation-checks.mjs`
- [x] 5.3 运行 `node scripts/run-online-checks.mjs`
- [x] 5.4 运行 `openspec validate restore-render-context-on-show --strict`
- [x] 5.5 在曾复现问题的真机上验证冷启动、退出小程序再进入、切后台恢复和横屏方向左右切换时页面布局不再乱
