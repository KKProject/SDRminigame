## 1. 资源清单登记

- [x] 1.1 在 `js/game/assets.js` 的 `ASSET_MANIFEST.audio` 中新增 `cardVoices` 映射，按 card key 登记 24 个牌面语音路径（`shang` → `audio/上.mp3` 等，对照 `CARD_ATLAS_LABEL_KEYS` 的汉字与 key 对应关系）
- [x] 1.2 在 `ASSET_MANIFEST.audio` 中新增 `actionVoices` 映射（`chi`/`peng`/`zhao`/`ta`/`hu` → 对应 `audio/*.mp3`），并移除已废弃的空条目 `discard`、`meld`、`win`（保留 `bgm` 与 `tap`）

## 2. Music 管理器扩展

- [x] 2.1 在 `js/runtime/music.js` 构造函数中为 `cardVoices`、`actionVoices` 预创建 `InnerAudioContext`，分别存入 `cardVoiceCues` 与 `actionVoiceCues`，并兼容 `audio` 清单的新结构（`cues` 仅遍历字符串路径条目）
- [x] 2.2 实现 `playCardVoice(card)`：静音时直接返回，按 `card.key` 取音频，重置 `currentTime` 后经 `safePlay` 播放，音频缺失时静默返回
- [x] 2.3 实现 `playActionVoice(type)`：静音时直接返回，按动作类型取音频播放，未配置语音的动作类型（如 `pass`）静默返回

## 3. 引擎接入

- [x] 3.1 在 `js/game/engine.js` 的 `beginTurn` 中，设置 `state.drawnCard` 后调用 `this.music.playCardVoice(drawnCard)`，实现摸牌亮牌播报
- [x] 3.2 在 `discardCard` 中将 `playCue('discard')` 替换为 `playCardVoice(card)`，实现出牌播报；确认 `discardUnclaimedDraw` 不重复播报同一张牌
- [x] 3.3 在 `applyAction` 中将 `playCue('meld')` 替换为 `playActionVoice(action.type)`，在 `applyTa` 中替换为 `playActionVoice('ta')`，在胡牌结算处将 `playCue('win')` 替换为 `playActionVoice('hu')`

## 4. 验证

- [x] 4.1 运行 `node scripts/run-huapai-checks.mjs` 等现有自检，确认无回归
- [x] 4.2 在微信开发者工具中试玩：验证摸牌/出牌播报牌面语音、人类与 AI 的吃/碰/招/踏/胡播报动作语音、静音开关生效、删除某个 mp3 后游戏仍正常运行
