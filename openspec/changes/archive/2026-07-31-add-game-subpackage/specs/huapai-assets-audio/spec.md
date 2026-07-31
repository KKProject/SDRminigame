## MODIFIED Requirements

### Requirement: Asset Manifest
The system SHALL load visual assets through a manifest that maps semantic names such as table background, card back, card front, action button, result panel, and card atlas metadata to local project paths. The manifest MAY be composed of a main-package-scoped registration available from app startup and a game-subpackage-scoped registration that only becomes available after the game subpackage has finished loading; the asset loader MUST expose a single lookup entry point regardless of which registration a given key belongs to. The default table background SHALL be mapped to `images/background.jpg`, and the default card atlas image SHALL be mapped to `images/element.png`, both within the game subpackage's resource scope.

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

#### Scenario: 游戏子包加载完成后注册子包资源清单
- **WHEN** 游戏子包加载完成
- **THEN** asset loader MUST 能够注册该子包范围内的资源清单条目
- **AND** 注册后的条目 MUST 可以通过既有的统一查询入口获取，无需调用方区分资源归属哪个包

#### Scenario: 请求尚未加载的子包专属资源
- **WHEN** 游戏子包尚未加载完成，代码请求一个仅存在于子包清单中的资源键
- **THEN** asset loader MUST 按"资源缺失"的既有处理方式返回未命中
- **AND** 调用方 MUST 走既有的 Canvas 回退路径，不得抛出异常

### Requirement: Audio Cues
The system SHALL play local audio cues for key events when configured, including button tap and looping background music, and the default background music SHALL be loaded from `audio/bgmusic.mp3` within the game subpackage's resource scope. Background music MUST NOT play during the hall, create-room, or waiting-room phases; it MUST only become audible once the player has entered the game table and the game subpackage's audio resources are available. The system SHALL play card-name voice clips for draw and discard events, and action voice clips for chi, peng, zhao, ta, and hu actions; these voice clips are likewise game-subpackage-scoped and only playable during active gameplay.

#### Scenario: Audio is disabled or unavailable
- **WHEN** an audio file fails to load or playback is unavailable
- **THEN** the system MUST continue gameplay silently without throwing runtime errors

#### Scenario: Default background music exists
- **WHEN** the player has entered the game table, `audio/bgmusic.mp3` has loaded as part of the game subpackage, and audio is not muted
- **THEN** the music manager MUST use it as the looping background music track

#### Scenario: 大厅与等待阶段没有背景音乐
- **WHEN** 玩家处于大厅、创建房间或等待界面
- **THEN** 系统 MUST NOT 播放背景音乐
- **AND** 系统 MUST NOT 因为背景音乐资源尚未加载而报错或阻塞界面

## REMOVED Requirements

### Requirement: 对局结果资源包体预算
**Reason**: 对局结果透明切图资源随本次分包改动迁移至游戏子包，不再计入主包体积；这条历史需求原本针对"新结果页资源整合进单一主包"这一已完成的迁移事件，迁移后其表述与新的分包结构不再一致。
**Migration**: 主包及子包的体积约束改由新增能力 `client-subpackaging` 的"包体预算"需求统一规定；本需求原本要求的行为（不重复打包已被替代的旧资源）继续通过该能力的相关场景覆盖。
