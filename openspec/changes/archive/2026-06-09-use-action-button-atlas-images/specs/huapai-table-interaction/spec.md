## ADDED Requirements

### Requirement: 动作按钮图片化显示
系统 SHALL 在动作区域中优先使用 actions atlas 图片显示接庄、不接庄、胡、招、踏、碰、吃和过。动作区域 MUST 不绘制弹窗背景、边框或动作说明文字。图片按钮 MUST 使用 `50px` 可见高度，并根据 atlas JSON 中切片旋转后的宽高比计算宽度；按钮图片不得被压缩变形，且图片化不得改变按钮的命中区域、动作类型或执行行为。

#### Scenario: 动作弹窗显示图片按钮
- **WHEN** 接庄、不接庄、胡、招、踏、碰、吃或过动作出现在真人玩家动作弹窗中，且对应动作 sprite 可用
- **THEN** renderer MUST 使用对应 atlas 图片替代 Canvas 动作文字

#### Scenario: 动作图片保持比例
- **WHEN** 动作 sprite 绘制到动作按钮区域
- **THEN** renderer MUST 使用 `50px` 高度并按旋转后的图片宽高比计算按钮宽度
- **AND** 图片 MUST 在按钮区域内居中显示且不得拉伸变形

#### Scenario: 动作区域无弹窗装饰
- **WHEN** 真人玩家存在可选动作
- **THEN** renderer MUST NOT 绘制动作弹窗背景或边框
- **AND** renderer MUST NOT 绘制动作说明文字
- **AND** renderer MUST 只显示对应动作图片按钮

#### Scenario: 图片按钮保留视觉反馈
- **WHEN** 图片动作按钮出现或被点击
- **THEN** 图片按钮 MUST 保留现有弹性入场、淡入、点击缩小或变亮反馈

#### Scenario: 图片按钮保持命中区域
- **WHEN** 动作图片的可见边界小于或不同于按钮布局区域
- **THEN** 输入命中 MUST 继续使用既有 `layout.actionButtons` 区域
- **AND** 点击图片按钮 MUST 立即执行原有动作

#### Scenario: 未映射按钮保持原样
- **WHEN** 再来一局、静音或其他未列入动作图片映射的按钮显示
- **THEN** renderer MUST 继续使用现有按钮绘制方式

#### Scenario: 动作图片回退
- **WHEN** 某个动作 sprite 不可用
- **THEN** renderer MUST 使用该动作原有文字标签绘制可点击按钮
- **AND** 其他有可用 sprite 的动作按钮 MUST 继续使用图片显示
