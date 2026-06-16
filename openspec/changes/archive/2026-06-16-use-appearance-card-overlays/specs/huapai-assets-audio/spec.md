## ADDED Requirements

### Requirement: 出现牌覆盖图 Atlas 资源
系统 SHALL 从现有 `cards` atlas 中暴露出现牌来源覆盖图资源，并 MUST 使用语义类型映射到具体 atlas frame 名称。

#### Scenario: 出牌覆盖图资源可用
- **WHEN** renderer 请求出牌来源的出现牌覆盖图
- **THEN** AssetLoader MUST 返回 `cards` atlas 中名为 `ui_left_play_panel_da` 的 sprite

#### Scenario: 摸牌覆盖图资源可用
- **WHEN** renderer 请求摸牌来源的出现牌覆盖图
- **THEN** AssetLoader MUST 返回 `cards` atlas 中名为 `ui_left_move_panel_ban` 的 sprite

#### Scenario: 覆盖图资源缺失
- **WHEN** `images/element.png`、`images/element.atlas.json` 或指定覆盖图 frame 未加载成功
- **THEN** AssetLoader MUST 返回无图片结果
- **AND** renderer MUST 能继续绘制基础牌面且不得抛出资源加载异常
