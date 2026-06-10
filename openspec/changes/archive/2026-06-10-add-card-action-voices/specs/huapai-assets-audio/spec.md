## MODIFIED Requirements

### Requirement: Audio Cues
The system SHALL play local audio cues for key events when configured, including button tap and looping background music, and the default background music SHALL be loaded from `audio/bgmusic.mp3`. The system SHALL play card-name voice clips for draw and discard events, and action voice clips for chi, peng, zhao, ta, and hu actions.

#### Scenario: Audio is disabled or unavailable
- **WHEN** an audio file fails to load or playback is unavailable
- **THEN** the system MUST continue gameplay silently without throwing runtime errors

#### Scenario: Default background music exists
- **WHEN** `audio/bgmusic.mp3` is available and audio is not muted
- **THEN** the music manager MUST use it as the looping background music track

## ADDED Requirements

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
