# 提案：添加牌面语音与动作语音播报

## Why

`audio/` 目录中已经新增了 24 张牌的牌面语音（如 `audio/上.mp3`、`audio/福.mp3`）和 5 种动作语音（`audio/吃.mp3`、`audio/碰.mp3`、`audio/招.mp3`、`audio/踏.mp3`、`audio/胡.mp3`），但游戏目前只有背景音乐和空配置的提示音（`discard`、`meld`、`win`、`tap` 路径均为空），玩家无法通过声音感知牌局进程。需要把这些语音接入游戏，提升牌局的反馈感和氛围。

## What Changes

- 摸牌：任意座位从牌堆摸出一张牌（亮牌展示）时，播放该牌对应的牌面语音。
- 出牌：任意座位打出一张牌时，播放该牌对应的牌面语音。
- 动作：任意玩家执行吃、碰、招、踏、胡动作时，播放对应的动作语音（胡牌播放 `audio/胡.mp3`）。
- 资源清单 `ASSET_MANIFEST.audio` 扩展：登记 24 个牌面语音与 5 个动作语音的本地路径。
- `Music` 管理器扩展：支持按牌（card key 或牌面汉字）播放牌面语音、按动作类型播放动作语音；语音播放遵循现有静音开关，资源缺失或播放失败时静默降级，不影响牌局。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `huapai-assets-audio`：在「Audio Cues」能力上新增牌面语音与动作语音的需求——摸牌/出牌播放对应牌面语音，任意玩家吃、碰、招、踏、胡时播放对应动作语音，且全部受静音控制、缺失时静默降级。

## Impact

- `js/game/assets.js`：`ASSET_MANIFEST.audio` 增加牌面语音与动作语音条目（或语音目录映射规则）。
- `js/runtime/music.js`：`Music` 类新增牌面语音与动作语音的播放接口，预创建对应的 `InnerAudioContext`。
- `js/game/engine.js`：在摸牌（`beginTurn` 亮牌处）、出牌（`discardCard` / `discardUnclaimedDraw`）、动作结算（`applyAction` / `applyTa` / 胡牌结算）处接入语音调用，替换或补充现有 `discard` / `meld` / `win` 空提示音。
- 资源：复用已存在的 `audio/*.mp3` 文件，无新增依赖。
