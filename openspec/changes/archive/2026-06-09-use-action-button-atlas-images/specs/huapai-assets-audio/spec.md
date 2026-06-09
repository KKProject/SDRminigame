## ADDED Requirements

### Requirement: 动作按钮 Atlas 资源
系统 SHALL 将 `images/actions.png` 与 `images/action_buttons_named_atlas.json` 作为独立动作按钮 atlas 加载。系统 MUST 按 frame 的 `originalIndex` 查找动作图片，不得依赖 atlas 中可能不准确的语义名称、文字识别或分类字段。

#### Scenario: 动作按钮 Atlas 加载成功
- **WHEN** `images/actions.png` 与 `images/action_buttons_named_atlas.json` 均可用
- **THEN** AssetLoader MUST 暴露按 `originalIndex` 获取动作按钮 sprite 的能力

#### Scenario: 动作索引映射
- **WHEN** renderer 请求接庄、不接庄、胡、招、踏、碰、吃或过动作图片
- **THEN** 系统 MUST 分别使用 `originalIndex` 为 `1`、`4`、`13`、`47`、`36`、`51`、`27`、`58` 的 atlas frame

#### Scenario: 左旋动作资源
- **WHEN** renderer 请求接庄、不接庄、胡、招或碰动作图片
- **THEN** AssetLoader MUST 返回需要在绘制时逆时针旋转 90 度的 sprite

#### Scenario: 无旋转动作资源
- **WHEN** renderer 请求踏、吃或过动作图片
- **THEN** AssetLoader MUST 返回无需旋转的 sprite

#### Scenario: 动作按钮资源缺失
- **WHEN** actions 图片、atlas JSON、指定索引或 frame 数据缺失
- **THEN** 系统 MUST 返回无图片结果并允许 renderer 使用文字按钮回退
- **AND** 牌局 MUST 继续运行且不得抛出资源加载异常
