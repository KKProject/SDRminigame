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
The system SHALL play local audio cues for key events when configured, including button tap and looping background music, and the default background music SHALL be loaded from `audio/bgmusic.mp3`. The system SHALL play card-name voice clips for draw and discard events, and action voice clips for chi, peng, zhao, ta, and hu actions.

#### Scenario: Audio is disabled or unavailable
- **WHEN** an audio file fails to load or playback is unavailable
- **THEN** the system MUST continue gameplay silently without throwing runtime errors

#### Scenario: Default background music exists
- **WHEN** `audio/bgmusic.mp3` is available and audio is not muted
- **THEN** the music manager MUST use it as the looping background music track

### Requirement: 牌面语音播报
系统 SHALL 在资源清单中按 card key 登记 24 张牌的牌面语音（如 `shang` → `audio/上.mp3`），并在牌被摸出亮牌或被打出时播放该牌对应的牌面语音。

#### Scenario: 摸牌亮牌播报
- **WHEN** 任意座位从牌堆摸出一张牌并亮牌展示
- **THEN** 系统 MUST 播放该牌对应的牌面语音

#### Scenario: 出牌播报
- **WHEN** 任意座位从手牌打出一张牌
- **THEN** 系统 MUST 播放该牌对应的牌面语音

#### Scenario: 摸牌无人响应自动入弃牌区
- **WHEN** 摸出的亮牌无人响应而自动进入弃牌区
- **THEN** 系统 MUST NOT 为同一张牌重复播放牌面语音

#### Scenario: 牌面语音资源缺失
- **WHEN** 某张牌对应的语音文件缺失或加载失败
- **THEN** 系统 MUST 静默跳过播放且牌局不受影响

#### Scenario: 静音状态下摸牌或出牌
- **WHEN** 静音开关处于开启状态且发生摸牌或出牌
- **THEN** 系统 MUST NOT 播放牌面语音

### Requirement: 动作语音播报
系统 SHALL 在资源清单中按动作类型登记动作语音（`chi` → `audio/吃.mp3`、`peng` → `audio/碰.mp3`、`zhao` → `audio/招.mp3`、`ta` → `audio/踏.mp3`、`hu` → `audio/胡.mp3`），并在任意玩家（含 AI 座位）执行对应动作时播放该动作语音。

#### Scenario: 吃碰招动作播报
- **WHEN** 任意座位执行吃、碰或招动作并完成组牌
- **THEN** 系统 MUST 播放对应的动作语音

#### Scenario: 踏动作播报
- **WHEN** 任意座位执行踏动作
- **THEN** 系统 MUST 播放 `audio/踏.mp3` 对应的动作语音

#### Scenario: 胡牌播报
- **WHEN** 任意座位胡牌并进入胡牌结算
- **THEN** 系统 MUST 播放 `audio/胡.mp3` 对应的动作语音

#### Scenario: 无语音资源的动作
- **WHEN** 玩家执行过、接庄、不接等未配置语音的动作
- **THEN** 系统 MUST NOT 播放动作语音且不得抛出错误

#### Scenario: 静音状态下执行动作
- **WHEN** 静音开关处于开启状态且任意座位执行吃、碰、招、踏或胡
- **THEN** 系统 MUST NOT 播放动作语音

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
