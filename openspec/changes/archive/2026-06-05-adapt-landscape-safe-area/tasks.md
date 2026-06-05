## 1. 运行时安全区数据

- [x] 1.1 在 `js/render.js` 中读取 `wx.getWindowInfo()` 的 `safeArea`，计算逻辑像素下的 `SAFE_AREA_INSETS` 和 `SAFE_AREA_BOUNDS`。
- [x] 1.2 为安全区数据增加数值校验，遇到缺失、异常、负数或超出窗口范围时回退到零 inset 或现有保守 safe 值。
- [x] 1.3 确保 high-DPI backing store 仍按完整窗口宽高创建，不因安全区缩小 canvas。

## 2. 布局安全内容区域

- [x] 2.1 更新 `TableLayout`，让布局构建使用安全内容矩形约束可见/可交互元素。
- [x] 2.2 将头像、两行点数、弃牌/打牌区、凑牌区、手牌、动作弹窗、结果弹窗、提示和静音按钮限制在安全内容区域内。
- [x] 2.3 保持背景相关布局宽高仍为完整 canvas，避免背景被安全区裁剪。
- [x] 2.4 在安全区导致内容宽度减少时，保持手牌列居中、紧贴、底部对齐且可点击。
- [x] 2.5 保证没有安全区信息的开发者工具和旧设备仍使用当前布局效果。

## 3. 渲染与动画适配

- [x] 3.1 确认 `renderer` 背景绘制继续使用完整 canvas 宽高。
- [x] 3.2 确认头像、点数、mini 牌、手牌、弹窗和按钮按安全区后的 layout 区域绘制。
- [x] 3.3 更新出牌/摸牌动画起点和终点计算，使玩家前方停留点、弃牌区终点和凑牌区终点位于安全内容区域内。
- [x] 3.4 确认 `TableLayout.hit` 命中区域使用安全区后的最新布局，不需要额外坐标修正。

## 4. 验证

- [x] 4.1 更新 `scripts/run-huapai-checks.mjs`，模拟左侧大 inset、右侧大 inset、上下 inset 和无安全区数据场景。
- [x] 4.2 增加断言：背景 drawImage 仍覆盖完整 canvas，关键 UI 区域全部位于安全内容区域内。
- [x] 4.3 增加断言：动画终点和动作弹窗在安全内容区域内，手牌不进入底部系统手势区域。
- [x] 4.4 运行 `node scripts/run-huapai-checks.mjs` 并修复回归。
- [x] 4.5 运行 `openspec validate adapt-landscape-safe-area --strict` 确认变更有效。
