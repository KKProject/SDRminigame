## ADDED Requirements

### Requirement: 透明 PNG 无损优化
系统 SHALL 提供对 `images/*.png` 的批量无损优化能力。处理后的每张图片 MUST 保持原始宽高、有效 alpha 能力以及解码后的 RGBA 像素数据完全一致。

#### Scenario: 优化带透明通道的 PNG
- **WHEN** 开发者执行图片优化命令
- **THEN** 系统 MUST 仅使用不会改变解码 RGBA 像素的 PNG 优化方式
- **AND** 输出图片 MUST 保持原始宽高和 alpha 数据

#### Scenario: 优化 atlas 图片
- **WHEN** 被处理的 PNG 由 atlas JSON 通过坐标和尺寸引用
- **THEN** 优化过程 MUST 保持图片画布尺寸及每个像素的位置不变
- **AND** 既有 atlas JSON MUST 无需修改即可继续裁切相同内容

### Requirement: 安全替换与压缩报告
系统 SHALL 在替换源图片前验证优化结果，并 SHALL 输出逐文件和总体体积变化报告。只有通过完整性验证且文件更小时，优化结果 MUST 替换原文件。

#### Scenario: 优化结果更小且通过验证
- **WHEN** 临时输出的尺寸、alpha 和 RGBA 像素验证通过且字节数小于源文件
- **THEN** 系统 MUST 使用优化结果替换源文件
- **AND** 报告 MUST 记录原始大小、优化后大小和节省量

#### Scenario: 优化无收益或验证失败
- **WHEN** 临时输出不小于源文件或任一完整性验证失败
- **THEN** 系统 MUST 保留原始图片
- **AND** 报告 MUST 标明未替换原因

### Requirement: 可重复的资源完整性检查
系统 SHALL 提供可独立执行的 PNG 完整性检查，确保项目要求透明的资源仍具有 alpha 能力，并确保 atlas 图片尺寸与元数据声明兼容。

#### Scenario: 图片资源回归通过
- **WHEN** 开发者运行资源完整性检查
- **THEN** 检查 MUST 遍历资源清单引用的 PNG 并确认文件可解析
- **AND** 所有透明 PNG MUST 保持 alpha 能力
- **AND** atlas 图片实际尺寸 MUST 与 atlas 元数据兼容
