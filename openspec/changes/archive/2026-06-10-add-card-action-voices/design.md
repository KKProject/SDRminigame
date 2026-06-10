# 设计：牌面语音与动作语音播报

## Context

- 现有音频链路：`ASSET_MANIFEST.audio`（`js/game/assets.js`）登记音频路径 → `Music` 单例（`js/runtime/music.js`）在构造时为每个条目预创建 `wx.createInnerAudioContext` → 引擎通过 `this.music.playCue(name)` 触发。当前 `discard` / `meld` / `win` / `tap` 路径为空字符串，实际无声。
- 牌数据：每张牌带 `key`（拼音，如 `shang`）与 `text`（单个汉字，如 `上`），见 `js/game/rules.js` 的 `cardSymbols`。
- 语音资源命名：牌面语音按汉字命名（`audio/上.mp3` … 共 24 个），动作语音为 `audio/吃.mp3`、`audio/碰.mp3`、`audio/招.mp3`、`audio/踏.mp3`、`audio/胡.mp3`。
- 引擎触发点：
  - 摸牌亮牌：`Engine.beginTurn`（`state.drawnCard = drawnCard` 处）。
  - 出牌：`Engine.discardCard`（现调 `playCue('discard')`）与 `Engine.discardUnclaimedDraw`（摸牌无人要自动入弃牌区）。
  - 动作：`Engine.applyAction`（吃/碰/招，现调 `playCue('meld')`）、`Engine.applyTa`（踏）、`finishWin`（胡，现调 `playCue('win')`）。

## Goals / Non-Goals

**Goals:**

- 任意座位摸牌亮牌、出牌时播放该牌的牌面语音。
- 任意玩家执行吃、碰、招、踏、胡时播放对应动作语音。
- 语音遵循现有静音开关；资源缺失或播放失败时静默降级。

**Non-Goals:**

- 不做多音轨混音管理、音量调节、语音排队等高级音频功能。
- 不为「过」「接庄」「不接」等无语音资源的动作添加语音。
- 不更换背景音乐与 `tap` 按键音逻辑。

## Decisions

1. **清单结构：在 `ASSET_MANIFEST.audio` 下新增 `cardVoices` 与 `actionVoices` 两个子映射**
   - `cardVoices`：以 card key 为键（`shang` → `audio/上.mp3` …），由 24 个牌面语音文件一一登记。键用 key 而非汉字，与引擎、atlas 映射（`CARD_ATLAS_LABEL_KEYS`）保持同一套标识。
   - `actionVoices`：以动作类型为键（`chi`/`peng`/`zhao`/`ta`/`hu` → 对应 mp3）。
   - 备选方案：按 `audio/<card.text>.mp3` 规则在运行时拼路径。否决：隐式约定不利于校验资源是否齐全，且清单显式登记与现有 `ASSET_MANIFEST` 风格一致。

2. **`Music` 新增 `playCardVoice(card)` 与 `playActionVoice(type)` 接口**
   - 构造时为 `cardVoices`、`actionVoices` 各预创建 `InnerAudioContext`（复用现有 `createAudio`，含 `onError` 吞错），存入独立的 `cardVoiceCues` / `actionVoiceCues` 映射，避免与现有 `cues`（`discard`/`meld`/`win`/`tap`）混淆。
   - `playCardVoice(card)` 按 `card.key` 取音频；`playActionVoice(type)` 按动作类型取音频。两者均检查 `muted`，找不到音频时直接返回，播放前重置 `currentTime`，复用 `safePlay`。
   - 备选方案：复用 `playCue` 并把语音平铺进 `cues`。否决：会让 29 个语音与事件提示音混在一个命名空间，语义不清。

3. **引擎接入点与新旧提示音关系**
   - 摸牌：`beginTurn` 在设置 `state.drawnCard` 后调用 `playCardVoice(drawnCard)`（无论后续是否被吃碰，摸出亮牌即播报）。
   - 出牌：`discardCard` 中将 `playCue('discard')` 替换为 `playCardVoice(card)`；`discardUnclaimedDraw` 不再播牌面语音（该牌在摸出时已播报过，避免同一张牌连播两次）。
   - 动作：`applyAction` 中将 `playCue('meld')` 替换为 `playActionVoice(action.type)`（覆盖 chi/peng/zhao）；`applyTa` 替换为 `playActionVoice('ta')`；`finishWin` 在原 `playCue('win')` 位置调用 `playActionVoice('hu')`。
   - `ASSET_MANIFEST.audio` 中的空条目 `discard`、`meld`、`win` 随之移除（保留 `tap` 供按键音占位）。
   - 备选方案：保留旧 cue 并叠加语音。否决：旧 cue 本就无资源，保留只增加无效代码路径。

4. **AI 与玩家共用同一链路**：所有触发点都在引擎层（座位无关），天然满足「任意玩家动作播放语音」的要求，不需要在 AI 调度处额外接线。

## Risks / Trade-offs

- [摸牌后立刻被吃/碰，牌面语音与动作语音几乎同时播放] → 两者使用不同 `InnerAudioContext`，可并行发声；且动作有 AI 调度延迟（`scheduleAI`），实际听感为先报牌后报动作，可接受。
- [同一语音短时间内连续触发（如连续打出同一张牌）] → 播放前重置 `currentTime = 0`，后触发覆盖前次，符合常见麻将类游戏行为。
- [29 个 `InnerAudioContext` 预创建的内存开销] → 微信小游戏对 InnerAudioContext 数量上限约为 10 个以上仍可用但有平台差异；若实测有问题，可退化为少量复用实例 + 切换 `src` 的方案。先按预创建实现，保持代码简单。
- [真机上 `audio/上.mp3` 等中文文件名路径兼容性] → 微信开发者工具与真机均支持 UTF-8 资源路径；若个别平台异常，再统一重命名为拼音文件名并更新清单。

## Open Questions

- 无。
