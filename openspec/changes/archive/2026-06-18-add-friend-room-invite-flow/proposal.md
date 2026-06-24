## Why

当前好友房创建后仍偏向单人自测路径，创建者缺少等待房间、准备和邀请好友的体验，微信好友也无法通过分享卡片直接加入指定房间。需要补齐真人好友对战的最小闭环：房主创建房间后等待，好友通过微信分享进入并加入，真人准备后开局，空座继续由 AI 补位。

## What Changes

- 创建房间成功后进入等待房间，不再立即开局。
- 等待房间展示房间号、局数、玩家列表、准备状态、准备按钮和微信邀请按钮。
- 房主点击微信邀请时发起小游戏分享，分享参数携带房间号。
- 被邀请玩家从分享卡片进入小游戏后，登录并自动请求加入对应房间。
- 服务端继续作为座位分配权威，校验房间存在、未满、仍可加入，玩家不可重复占座。
- 玩家可在等待房间内点击准备；第一版支持“已有至少 2 名真人且房主准备后开局，空座由 AI 补位”的轻量规则。
- 加入/准备/开局期间等待房间需要刷新玩家列表和状态，并处理失败、房间已满、房间已开局等错误。
- 暂不实现完整 4 人必须满座、房间内聊天、踢人、转让房主、邀请海报或群排行榜。

## Capabilities

### New Capabilities
- `friend-room-invite`: 覆盖好友房等待房间、准备、微信邀请分享、分享参数入房和真人开局条件。

### Modified Capabilities
- `online-lobby`: 增加从分享参数进入指定房间的大厅/登录衔接流程，并让创建房间后进入等待房间。
- `online-matchmaking`: 扩展好友房生命周期，增加等待房间玩家状态、准备状态、分享加入与开局条件。

## Impact

- 客户端入口与生命周期：`game.js`、`js/main.js`、`js/ui/menu.js`、`js/net/online.js`。
- 微信小游戏分享能力：`wx.shareAppMessage`、`wx.onShareAppMessage`、`wx.getLaunchOptionsSync`、`wx.onShow`。
- 云函数房间编排：`cloudfunctions/game/index.js`、`cloudfunctions/game/room.js`。
- 房间数据模型：`rooms.players[].ready`、等待房间公共状态、分享加入参数、准备/开局状态。
- 检查脚本：`scripts/run-online-checks.mjs` 需要覆盖邀请参数、加入房间、准备和开局条件。
