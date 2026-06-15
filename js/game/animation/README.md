# 客户端动画模块

`AnimationManager` 是客户端唯一的补间生命周期管理入口，使用项目内固定的 Tween.js `Group`，并由 `js/main.js` 的游戏主循环调用 `update(time)`。

- `manager.js`：播放、串并行步骤、取消、完成通知和本地预演对账。
- `presets.js`：把牌局事件转换为声明式动画方案。
- `targets.js`：根据牌桌布局解析四个座位的动画目标。

网络控制器只负责提交权威事件和接收完成通知；渲染器只读取 `getVisualState()` 并绘制。不要在动画模块中调用云函数、修改牌局裁决状态或创建新的 `requestAnimationFrame`。

Tween.js 25.0.0 发布文件与 MIT 许可证位于 `js/vendor/tween/`。
