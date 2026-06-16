## ADDED Requirements

### Requirement: 将牌覆盖图 Atlas 资源
系统 SHALL 从 `cards` atlas 中暴露将牌覆盖图资源，并 MUST 使用牌面尺寸语义映射到指定 atlas frame 名称：大牌使用 `icon_jiang_big`，小牌使用 `icon_jiang_small`，mini 牌使用 `icon_jian_mini_hr`。

#### Scenario: 大牌将牌覆盖图资源可用
- **WHEN** renderer 请求大牌将牌覆盖图
- **THEN** AssetLoader MUST 返回 `cards` atlas 中名为 `icon_jiang_big` 的 sprite

#### Scenario: 小牌将牌覆盖图资源可用
- **WHEN** renderer 请求小牌将牌覆盖图
- **THEN** AssetLoader MUST 返回 `cards` atlas 中名为 `icon_jiang_small` 的 sprite

#### Scenario: Mini 将牌覆盖图资源可用
- **WHEN** renderer 请求 mini 牌将牌覆盖图
- **THEN** AssetLoader MUST 返回 `cards` atlas 中名为 `icon_jian_mini_hr` 的 sprite
- **AND** 该 sprite MUST 标记为绘制时左旋 90 度

#### Scenario: 将牌覆盖图资源缺失
- **WHEN** `images/element.png`、`images/element.atlas.json` 或指定将牌覆盖图 frame 未加载成功
- **THEN** AssetLoader MUST 返回无图片结果
- **AND** renderer MUST 继续绘制基础牌面且不得抛出资源加载异常
