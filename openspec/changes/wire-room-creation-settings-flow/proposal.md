## Why

房间设置 UI 已经完成，但当前点击确认仍没有真正创建服务端房间，玩家选择的局数、房间选项和进圈赔付方式也没有进入房间配置。同时启动页仍把微信授权和后端登录放在点击入口之后，导致开始流程里还会出现二次登录感。需要把登录准备前移到启动页，并把创建页从纯 UI 串接到真实创建流程。

## What Changes

- 启动页加载时 MUST 检查微信资料授权；已授权时静默获取资料并完成后端登录，拿到 openid/user/token。
- 未授权时启动页 MUST 直接提示登录，并显示微信授权按钮；登录完成前“开始”不可进入创建房间流程。
- 已登录后“开始”按钮进入创建房间设置页，后续流程不再重复执行登录。
- 创建房间设置页的主按钮从“下一步”调整为“确认创建”。
- 玩家点击确认创建后，客户端 MUST 提交当前设置并创建服务端房间。
- 创建请求 MUST 携带完整房间设置：`maxRounds`、`repeatRound`、`washTwice`、`payType`。
- 服务端 MUST 保存完整 `settings`，当前游戏逻辑仍只消费 `maxRounds`，其他字段作为预留配置返回给客户端。
- 创建成功后客户端进入现有“选择座位关系”页面。
- 本次不实现座位选择页面的确认逻辑、座位绑定规则或上家下家关系对服务端座位的影响。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `online-lobby`: 调整启动页登录门禁、创建房间入口的真实创建流程、创建参数提交和创建成功后的页面落点。

## Impact

- 客户端入口、登录与 UI：`js/ui/menu.js`、`js/main.js`、`js/net/profile.js`
- 在线控制器与后端登录请求契约：`js/net/online.js`、`js/net/cloud.js`
- 服务端房间配置归一化与保存：`services/backend/src/game/room.js`
- 回归检查：`scripts/run-online-checks.mjs`
