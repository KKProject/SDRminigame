## MODIFIED Requirements

### Requirement: 布局尺寸变化时动画安全恢复
客户端动画系统 SHALL 在稳定 canonical render viewport 变化时停止使用旧布局坐标，并 MUST 清理或恢复所有依赖旧动画目标的临时视觉状态。客户端动画系统 MUST NOT 将前台恢复时的相同 canonical 视口渲染上下文重应用、或被拒绝的恢复过渡候选视为布局尺寸变化。

#### Scenario: 被拒绝的恢复候选不取消动画
- **WHEN** 小程序前台恢复期间运行时报告的过窄横屏候选被渲染指标管理器拒绝
- **THEN** 动画管理器 MUST NOT 取消、重启或完成当前动画
- **AND** 动画目标 MUST 继续使用当前 canonical viewport 对应的布局坐标
