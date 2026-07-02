## Context

当前 `RenderMetricsManager` 已经会把竖屏指标归一化为横屏逻辑宽高，并通过两次候选确认避免启动首帧异常尺寸。它也支持前台恢复时重应用最后稳定的 Canvas backing store 和 2D context transform。

这次问题说明仍有一个更隐蔽的边界：前台恢复期间，微信可能返回一个宽度明显小于真实横屏画布、但仍满足 `width > height` 和最小尺寸阈值的候选。该候选会通过现有合法性校验并在连续两次读取后被提交，进而污染大厅和牌桌共同使用的布局指标。

## Goals / Non-Goals

**Goals:**

- 将游戏布局权威从瞬时窗口指标迁移到基于设备 `screenWidth/screenHeight` 的 canonical render viewport。
- 前台恢复时，短暂缩窄的横屏候选不得覆盖已稳定的 canonical viewport。
- Canvas backing store、2D context transform、菜单布局、牌桌布局和触摸命中区域使用同一 canonical 视口。
- 真实设备级尺寸变化、安全区变化和像素比变化仍可通过稳定确认提交。
- 自动检查覆盖恢复期间的过窄横屏候选和真实尺寸变化。

**Non-Goals:**

- 不实现纵屏布局。
- 不改变游戏规则、在线同步、服务端协议或云端部署。
- 不通过设备型号、微信版本或固定屏幕尺寸白名单判断。
- 不在每次前台恢复时无条件重建动画或手牌列。

## Decisions

### 1. 建立 canonical render viewport

渲染管理器维护 `stableMetrics` 作为 canonical render viewport。所有正式布局、Canvas backing store、context transform 和触摸命中均从该对象派生。`screenWidth/screenHeight` 归一化后的横屏尺寸优先作为设备级布局来源，`windowWidth/windowHeight` 只作为观测输入，不能绕过确认流程直接改变布局。

启动阶段如果尚无 canonical viewport，系统仍通过现有两次确认流程提交首个有效横屏指标。若启动时只有无效或过小指标，则不创建正式交互布局。

### 2. 前台恢复期间保护 canonical 尺寸

`wx.onShow` 后的恢复窗口中，管理器优先重应用当前 canonical Canvas/context。若运行时报告的 `windowWidth/windowHeight` 明显缩窄但 `screenWidth/screenHeight` 仍与 canonical 一致，则保持 duplicate，不触发布局变化。若某些环境没有可靠 screen 字段，而候选指标相对 canonical 宽度明显缩窄、高度接近或未表现出真实设备级变化，则视为恢复过渡候选：

- 不更新 `stableMetrics`
- 不设置 Canvas backing store 为候选尺寸
- 不通知菜单或牌桌重布局
- 保持继续观察后续窗口指标

该规则不是按某个设备尺寸硬编码，而是基于“已有 canonical 视口”和“候选只缩窄窗口宽度”的关系判断，不依赖异常读数是否刚好落在固定恢复帧内。

### 3. 真实变化仍允许提交

如果候选指标与 canonical 的差异通过连续确认并表现为真实尺寸变化，例如横屏方向切换后的安全区变化、开发工具窗口真实调整、设备级逻辑尺寸变化或像素比变化，则仍提交新的 canonical viewport。

安全区变化可在宽高不变时单独触发布局刷新；但安全区必须与 canonical 尺寸一致且边界有效，不能用恢复期间的竖屏或过窄候选安全区污染正式布局。

分享返回日志显示，微信可能在 `screenWidth/windowWidth` 均为正常横屏尺寸时，短暂返回竖屏/转置坐标系的 `safeArea`，例如 `right` 接近横屏高度，导致横屏右侧 inset 被计算为半屏以上。横屏 safeArea 必须额外校验：若水平 inset 比例异常、内容宽度接近竖屏高度、`safeArea.right` 接近横屏高度或顶部 inset 与巨大右侧 inset 同时出现，则拒绝该候选 safeArea，并沿用上一份稳定 safeArea；没有稳定 safeArea 时回退为全屏安全区。

### 4. 前台恢复不是动画尺寸变化

重应用 canonical Canvas/context 不代表逻辑布局坐标改变。动画控制器只有在 canonical 指标签名真实变化时才执行 layout-change 清理或恢复。相同 canonical 视口恢复只保证后续帧在正确 backing store 和 transform 下重绘。

### 5. 测试优先覆盖恢复窗口

新增自动检查应模拟：

- 已稳定 `844x390` 后，分享返回报告 `windowWidth=520/windowHeight=390` 但 `screenWidth=844/screenHeight=390`，不得触发布局变化。
- 已稳定 `844x390` 后，缺失 screen 字段时连续报告 `520x390`，不得提交为 stable。
- 已稳定横屏 safeArea 后，分享返回报告竖屏/转置 safeArea，不能提交为新的安全区。
- 随后恢复 `844x390` 时，应保持 canonical 并触发必要的稳定布局刷新。
- 前台恢复期间 Canvas/context 被替换，仍能重应用 canonical backing store 和 transform。
- 若确实连续出现新的真实横屏尺寸并结束恢复保护，应按稳定确认提交。

### 6. 增加真机诊断闭环

客户端在 `wx.onShow`、`wx.onHide`、`wx.onWindowResize`、canonical 恢复、候选提交、候选拒绝和布局刷新时采集诊断事件，并批量上报到后端 `/api/client-log`。后端只对诊断内容做裁剪和脱敏后写入服务日志，不落数据库，不要求玩家登录 token，便于启动和分享返回早期问题也能被记录。

诊断日志必须包含同一 sessionId、事件序号、`wx.getWindowInfo()` 观测值、canonical metrics、Canvas backing store 尺寸、候选状态和恢复窗口状态。后端必须避免记录 token、secret、authorization、password 等敏感字段。

## Risks / Trade-offs

- 恢复窗口内如果用户真的触发了横屏窗口大幅变窄，可能会延迟几帧才提交新尺寸；小游戏真机通常没有这种交互式窗口调整，风险可接受。
- 如果微信长期只返回过窄候选，系统会保留旧 canonical 布局；这比提交错误半宽布局更安全，后续可通过窗口恢复或重进获得正确观测。
- 增加 canonical 规则后，测试需要明确区分“重应用 context”和“提交新布局”。

## Migration Plan

1. 在 `RenderMetricsManager` 中加入前台恢复状态和候选与 canonical 的关系判断。
2. 调整 `consider()`，让恢复窗口内的过窄横屏候选保持为 transient，不进入 candidate/commit。
3. 保持现有 `restoreStableContext()` 作为 canonical Canvas/context 重应用入口。
4. 扩展 `scripts/run-huapai-checks.mjs` 覆盖恢复期间过窄候选、恢复到 canonical 和真实尺寸变化。
5. 增加客户端诊断上报和后端日志接口，便于真机复现后定位实际运行时指标。
6. 运行渲染、动画、在线和后端回归检查，并验证 OpenSpec delta spec。

## Open Questions

无。恢复窗口和候选确认阈值在实现时应保持保守、关系驱动，并由自动检查固定行为。
