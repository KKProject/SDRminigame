# Tasks

- [x] 1.1 在 `RenderMetricsManager` 中建模 canonical render viewport 与前台恢复保护窗口
- [x] 1.2 拒绝前台恢复期间相对 canonical 明显缩窄的横屏候选，保持 Canvas/context/layout 使用 canonical
- [x] 1.3 保持真实横屏尺寸、安全区或像素比变化仍可通过稳定确认提交
- [x] 1.4 扩展 `scripts/run-huapai-checks.mjs`，覆盖稳定后分享返回过窄横屏候选不得污染布局
- [x] 1.5 覆盖 canonical 恢复、context 替换和真实尺寸变化仍正常提交的自动检查
- [x] 1.6 运行 `node scripts/run-huapai-checks.mjs`
- [x] 1.7 运行 `node scripts/run-animation-checks.mjs`
- [x] 1.8 运行 `node scripts/run-online-checks.mjs`
- [x] 1.9 运行 `openspec validate stabilize-canonical-render-viewport --strict --no-interactive`
- [x] 1.10 将 canonical render viewport 优先改为由 `screenWidth/screenHeight` 归一化得出
- [x] 1.11 将 `windowWidth/windowHeight` 明显缩窄候选降级为观测信号，不允许覆盖 canonical
- [x] 1.12 扩展自检覆盖 screen 稳定但 window 短暂缩窄的分享返回场景
- [x] 1.13 增加客户端 render 诊断批量上报
- [x] 1.14 增加后端 `/api/client-log` 诊断日志接口并验证脱敏
- [x] 1.15 拒绝横屏下疑似竖屏/转置坐标系的 safeArea 并沿用 stable safeArea
- [x] 1.16 扩展自检覆盖分享返回后 safeArea 右侧 inset 异常巨大的污染场景
