## ADDED Requirements

### Requirement: 对局结果透明切图资源
系统 SHALL 通过资源清单加载对局结果标题、白板面板、胜利状态、失败状态和继续游戏按钮的本地透明 PNG。用于发布的处理后切图 MUST 保留有效 alpha 通道，且资源加载失败 MUST 允许 renderer 对对应元素使用 Canvas 回退，不得阻塞结果页展示或交互。

#### Scenario: 结果页切图加载成功
- **WHEN** 对局结果标题、白板面板、状态或继续按钮切图成功加载
- **THEN** renderer MUST 使用对应语义资源绘制结果页元素
- **AND** 透明区域 MUST 正确透出底层牌桌背景

#### Scenario: 单个结果页切图缺失
- **WHEN** 任一结果页切图缺失、损坏或加载失败
- **THEN** renderer MUST 只对该元素使用 Canvas 回退
- **AND** 玩家牌况、结果列表滚动和主操作按钮 MUST 继续可用

#### Scenario: 处理后切图保留透明通道
- **WHEN** 原始透明 PNG 经尺寸或调色板优化后进入项目资源目录
- **THEN** 处理后文件 MUST 仍包含有效 alpha 通道
- **AND** 原本完全透明的外围区域 MUST NOT 被填充为不透明底色

### Requirement: 对局结果资源包体预算
系统 SHALL 复用已打包的牌桌背景并移除被结果页透明切图完全替代的整屏背景资源。包含新结果页资源的微信小游戏实际上传主包 MUST 小于 4 MiB，并 SHOULD 保留至少约 0.3 MiB 的后续发布余量。

#### Scenario: 新结果页资源完成集成
- **WHEN** 结果页透明切图、资源清单和绘制逻辑均已进入待发布版本
- **THEN** 项目 MUST NOT 同时打包已无使用方的旧整屏结果页背景
- **AND** 实际微信上传结果中的完整主包大小 MUST 小于 4 MiB

#### Scenario: 包体积超过目标余量
- **WHEN** 实际上传主包虽未达到 4 MiB 但剩余空间不足约 0.3 MiB
- **THEN** 实现 MUST 优先继续优化白板大图或清理被替代资源
- **AND** MUST NOT 通过移除透明通道或显著降低文字切图清晰度来达成目标
