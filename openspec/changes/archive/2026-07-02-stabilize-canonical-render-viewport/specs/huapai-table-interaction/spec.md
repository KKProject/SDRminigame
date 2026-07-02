## MODIFIED Requirements

### Requirement: 运行时屏幕指标稳定与重布局
系统 SHALL 使用最新稳定的 canonical render viewport 作为菜单、牌桌布局、绘制和触摸命中的统一逻辑指标。系统 MUST 优先将运行时报告的设备 `screenWidth/screenHeight` 归一化为横屏逻辑宽高，并 MUST NOT 直接使用短暂变化的 `windowWidth/windowHeight` 覆盖正式布局。系统 MUST 将竖屏指标归一化为横屏逻辑宽高，并 MUST NOT 使用竖屏来源的安全区创建正式横屏内容区域。系统 MUST NOT 使用启动期间无效、未稳定、过小或前台恢复期间短暂缩窄的指标创建正式交互布局。系统 SHALL 在小程序从后台、退出状态或微信分享面板恢复到前台时，在短暂恢复窗口内持续重新解析当前 Canvas/2D context，并重新应用当前 canonical viewport 对应的 Canvas backing store 与 2D context 逻辑缩放，即使窗口指标签名未发生变化。

#### Scenario: 前台恢复短暂横屏缩窄不覆盖 canonical
- **WHEN** 系统已有稳定 canonical 横屏视口，且小程序从分享或后台恢复期间连续读到宽度明显小于 canonical、但仍满足横屏最小尺寸的候选窗口指标
- **THEN** 系统 MUST 将该候选视为恢复过渡指标
- **AND** 系统 MUST NOT 使用该候选更新 Canvas backing store、菜单布局、牌桌布局或触摸命中区域
- **AND** 系统 MUST 继续使用当前 canonical viewport 渲染后续帧

#### Scenario: screen 尺寸稳定而 window 短暂缩窄
- **WHEN** 系统已有稳定 canonical 横屏视口，且分享返回后运行时报告的 `screenWidth/screenHeight` 与 canonical 一致，但 `windowWidth/windowHeight` 短暂变窄
- **THEN** 系统 MUST 继续使用由 `screenWidth/screenHeight` 得出的 canonical viewport
- **AND** 系统 MUST NOT 将该 `windowWidth/windowHeight` 变化提交为布局尺寸变化

#### Scenario: 横屏 safeArea 转置污染不覆盖 stable safeArea
- **WHEN** 系统已有稳定 canonical 横屏视口和稳定横屏 safeArea，且分享返回后运行时报告的 `screenWidth/windowWidth` 仍为横屏尺寸，但 `safeArea.right` 接近横屏高度并导致右侧 inset 异常巨大
- **THEN** 系统 MUST 将该 safeArea 判定为恢复过渡污染
- **AND** 系统 MUST 沿用上一份稳定 safeArea 或回退到全屏安全区
- **AND** 系统 MUST NOT 使用该 safeArea 更新菜单布局、牌桌布局或触摸命中区域

#### Scenario: canonical 恢复后刷新布局缓存
- **WHEN** 前台恢复期间曾观察到被拒绝的过渡窗口指标，随后运行时再次报告与 canonical 一致的横屏指标
- **THEN** 系统 MUST 保持 canonical viewport 不变
- **AND** 系统 SHOULD 触发一次稳定布局缓存刷新，确保菜单按钮、牌桌布局和触摸命中区域与 canonical 一致

#### Scenario: 真实横屏尺寸变化提交 canonical
- **WHEN** 小程序不处于前台恢复保护窗口，或保护窗口结束后连续确认到新的有效横屏宽高、像素比或安全区指标
- **THEN** 系统 MUST 提交该指标为新的 canonical render viewport
- **AND** 系统 MUST 原子更新 Canvas backing store、2D context 逻辑缩放和交互布局

#### Scenario: 自动检查覆盖前台恢复过窄候选
- **WHEN** 运行布局与渲染自检脚本
- **THEN** 检查 MUST 模拟已有稳定 canonical 横屏视口后分享返回连续报告过窄横屏候选
- **AND** 检查 MUST 断言正式布局、Canvas backing store 和触摸指标仍使用 canonical viewport
- **AND** 检查 MUST 模拟 `screenWidth/screenHeight` 稳定但 `windowWidth/windowHeight` 过窄的真机返回场景
- **AND** 检查 MUST 模拟横屏尺寸稳定但 safeArea 为竖屏/转置坐标系的分享返回场景

## ADDED Requirements

### Requirement: 渲染恢复诊断日志
系统 SHALL 在小程序前后台切换、窗口尺寸变化、渲染指标候选提交、候选拒绝、canonical 恢复和布局刷新时采集客户端诊断事件。系统 SHALL 将诊断事件批量上报到后端日志接口，后端 MUST 对诊断内容做长度裁剪和敏感字段脱敏后写入服务日志。

#### Scenario: 分享返回诊断事件可被后端记录
- **WHEN** 小程序从分享或后台恢复并触发渲染指标检查
- **THEN** 客户端 SHOULD 上报包含 sessionId、事件序号、`wx.getWindowInfo()` 观测值、canonical metrics、Canvas backing store 尺寸和候选处理状态的诊断事件
- **AND** 后端 MUST NOT 在日志中输出 token、secret、authorization 或 password 字段原文
