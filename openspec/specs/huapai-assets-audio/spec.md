# huapai-assets-audio Specification

## Purpose
TBD - created by archiving change build-shangdaren-huapai-game. Update Purpose after archive.
## Requirements
### Requirement: Asset Manifest
The system SHALL load visual assets through a manifest that maps semantic names such as table background, card back, card front, action button, result panel, and card atlas metadata to local project paths. The default table background SHALL be mapped to `images/background.jpg`, and the default card atlas image SHALL be mapped to `images/element.png`.

#### Scenario: Manifest asset exists
- **WHEN** a mapped image path loads successfully
- **THEN** the renderer MUST use that image for the corresponding table element

#### Scenario: Manifest asset is missing
- **WHEN** a mapped image path is absent or fails to load
- **THEN** the renderer MUST draw a canvas fallback for that element without blocking gameplay

#### Scenario: Default background image exists
- **WHEN** `images/background.jpg` loads successfully
- **THEN** the renderer MUST use it as the table background

#### Scenario: Card atlas metadata exists
- **WHEN** the bundled atlas JSON for `images/element.png` is available
- **THEN** the asset loader MUST expose named frame metadata including frame coordinates, source size, rotation flag, category, confidence, label, and nested atlas size group where provided

#### Scenario: Nested card atlas groups exist
- **WHEN** the bundled atlas JSON contains `frames.big`, `frames.small`, or `frames.mini`
- **THEN** the asset loader MUST read card frames from those nested groups and associate each frame with its containing size group

#### Scenario: Card atlas metadata is missing
- **WHEN** the atlas JSON is absent, invalid, or lacks a requested frame
- **THEN** the renderer MUST continue using the existing canvas card fallback without throwing runtime errors

### Requirement: Card Face Rendering
The system SHALL render every configured card face with readable symbol text, color, and special-card indicators whether or not card-face images exist. The system SHALL scan `images/element.png` atlas frame names for configured card keys and size/orientation tokens, support nested `big`, `small`, and `mini` frame groups, render matched card faces by cropping the atlas image from those named frames, and preserve the card artwork aspect ratio when drawing visible card faces.

#### Scenario: Size-keyed card atlas face is available
- **WHEN** a nested atlas frame name contains a supported size token, a configured card key such as `ren`, and an orientation suffix
- **THEN** the asset loader MUST map that frame to the matching card key and size

#### Scenario: Big card atlas face is requested
- **WHEN** the renderer requests a normal non-hand card sprite for a card key
- **THEN** the asset loader MUST prefer the matching `big` atlas frame for that card key

#### Scenario: Human hand small card atlas face is requested
- **WHEN** the renderer draws a visible human hand card
- **THEN** the renderer MUST request the matching `small` atlas frame for that card key

#### Scenario: Small card atlas face is requested
- **WHEN** the renderer requests a compact table, discard, or meld sprite for a card key
- **THEN** the asset loader MUST prefer the matching `small` atlas frame for that card key

#### Scenario: Mini card atlas face is requested
- **WHEN** the renderer requests a mini sprite for a card key
- **THEN** the asset loader MUST prefer the matching `mini` atlas frame for that card key

#### Scenario: Horizontal-left card atlas face is available
- **WHEN** a matched atlas frame name uses the `hl` orientation suffix
- **THEN** the renderer MUST draw that frame rotated clockwise by 90 degrees into aspect-correct card bounds

#### Scenario: Horizontal-right card atlas face is available
- **WHEN** a matched atlas frame name uses the `hr` orientation suffix
- **THEN** the renderer MUST draw that frame rotated counterclockwise by 90 degrees into aspect-correct card bounds

#### Scenario: Vertical card atlas face is available
- **WHEN** a matched atlas frame name uses the `v` orientation suffix
- **THEN** the renderer MUST draw that frame without rotation into aspect-correct card bounds

#### Scenario: Requested size is missing
- **WHEN** the requested `big`, `small`, or `mini` frame is missing for a card key but another size exists for that card key
- **THEN** the asset loader MUST return an available fallback sprite for that card key before falling back to canvas text

#### Scenario: Legacy card atlas face is available
- **WHEN** the atlas does not provide usable size-keyed frame names but one of the first 24 distinct card-character atlas frames has a `label` containing the card's configured Chinese character
- **THEN** the renderer MUST draw the corresponding cropped region from `images/element.png` into card bounds that preserve the configured card aspect ratio

#### Scenario: Early non-card atlas frame is available
- **WHEN** an early atlas frame label or frame name does not identify a configured card character
- **THEN** the system MUST skip that frame and continue scanning usable card entries until all configured card-character frames are collected or no frames remain

#### Scenario: Card back atlas is available
- **WHEN** a hidden opponent card or card back is rendered and a configured back frame exists in a nested or flat atlas group
- **THEN** the renderer MUST draw the corresponding cropped card-back region from `images/element.png`

#### Scenario: No card atlas is available
- **WHEN** the card-face atlas is not configured
- **THEN** every card in the player hand, melds, and discard piles MUST still be identifiable from canvas-rendered text

#### Scenario: Specific card frame is missing
- **WHEN** the atlas exists but a configured card symbol cannot be matched to a usable frame by size-keyed name or legacy label matching
- **THEN** that card MUST fall back to canvas-rendered text while other cards with valid frames continue using atlas sprites

#### Scenario: Fallback card face is drawn
- **WHEN** a canvas-rendered fallback card is used for a hand card
- **THEN** the fallback card bounds MUST use the same aspect ratio as atlas-rendered hand cards

### Requirement: Audio Cues
The system SHALL play local audio cues for key events when configured, including discard, meld, win, draw result, button tap, and looping background music, and the default background music SHALL be loaded from `audio/bgmusic.mp3`.

#### Scenario: Audio is disabled or unavailable
- **WHEN** an audio file fails to load or playback is unavailable
- **THEN** the system MUST continue gameplay silently without throwing runtime errors

#### Scenario: Default background music exists
- **WHEN** `audio/bgmusic.mp3` is available and audio is not muted
- **THEN** the music manager MUST use it as the looping background music track

### Requirement: Audio Controls
The system SHALL expose an in-game mute state that applies to background music and sound effects.

#### Scenario: Player toggles mute
- **WHEN** the player taps the mute control
- **THEN** the system MUST update the mute state and stop or resume future audio playback accordingly

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

