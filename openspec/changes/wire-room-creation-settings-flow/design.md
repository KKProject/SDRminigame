## Context

当前启动页通过 canvas 绘制“开始”按钮，并叠加透明 `createUserInfoButton` 处理微信资料授权。点击开始后先进入创建房间设置页，设置页收集了 `maxRounds`、`repeatRound`、`washTwice`、`payType`，但确认动作尚未调用真实创建接口。在线身份由 `js/net/cloud.js` 的 `/api/auth/login` 完成：客户端调用 `wx.login` 取得 code，后端换取 openid，更新 `users` 集合并返回 user/token/socket。

这次调整要把资料授权和后端登录前移到启动页。已授权玩家进入启动页时应静默准备好资料和 token；未授权玩家必须先完成授权登录，开始按钮才可进入创建房间流程。创建页确认创建时只提交房间设置，不再重复登录。

## Goals / Non-Goals

**Goals:**

- 启动页根据微信资料授权状态显示“登录/开始”门禁。
- 已授权玩家启动页静默完成资料读取和后端登录，拿到 openid/user/token。
- 未授权玩家在启动页通过微信授权按钮完成资料授权和后端登录。
- 已登录后点击开始进入创建房间设置页。
- 创建页点击“确认创建”提交完整 `settings` 创建房间。
- 服务端保存 `maxRounds`、`repeatRound`、`washTwice`、`payType`，当前裁决仍只使用 `maxRounds`。
- 创建成功后进入选择座位关系页面，但不实现座位确认或关系绑定逻辑。

**Non-Goals:**

- 不新增独立的 openid 查询接口；继续复用 `/api/auth/login`。
- 不实现座位选择页的真实入座、换座、上家下家绑定。
- 不让 `repeatRound`、`washTwice`、`payType` 影响当前游戏裁决或计分。
- 不改微信开发者工具上传、发布流程。

## Decisions

### 1. 启动页预登录复用现有 `/api/auth/login`

已授权时，客户端调用 `getAuthorizedProfile()` 静默取微信资料，然后调用现有 `login(profile)` 完成后端登录。这样后端继续作为 openid 与用户资料的唯一来源，不新增只读 openid 接口。

备选方案是新增 `/api/auth/me` 或本地 token 复用。当前客户端 token 仅保存在内存中，先复用 `wx.login` 的轻量登录路径最稳，后续如需持久会话再单独设计。

### 2. StartMenu 管理“未登录 / 登录中 / 已登录”三个入口状态

启动页维护 `authState` 和 `startProfile`。未登录时显示登录提示并禁用开始流程；登录中禁用按钮；已登录时开始按钮进入创建房间设置页。

这样授权按钮仍由原生 `createUserInfoButton` 叠加在 canvas 上，符合小游戏头像昵称授权限制，也避免把授权逻辑藏到创建页之后。

### 3. Main 持有已登录 profile 并创建/复用 OnlineController

`Main` 接收启动页登录成功事件后初始化 `OnlineController` 并调用 `startLobby(profile)`，从而获得已有的 `lobbyProfile`、token、activeRoom 查询和邀请房处理能力。新创建流程使用同一个 controller，不再在确认创建时重新登录。

### 4. 创建请求使用 `settings` 对象，保留旧 `maxRounds` 兼容

客户端将 draft 归一化成：

```js
settings: {
  maxRounds,
  repeatRound,
  washTwice,
  payType
}
```

`createLobbyRoom` 接收对象参数并继续兼容数字参数。服务端 `normalizeRoomSettings()` 保存完整字段，缺省值分别为 `2`、`false`、`false`、`pihu`。

### 5. 创建成功进入座位选择页，不触碰座位页业务逻辑

创建成功后客户端只切到 `seat-selection`，并保留已创建的 `roomId` 在 controller/waitingRoom 中。`seat-confirm` 仍显示占位提示，后续 change 再决定座位关系如何写入服务端。

## Risks / Trade-offs

- 已授权静默登录失败 → 启动页保留登录提示和错误信息，允许用户重试。
- `startLobby()` 发现玩家已有未结束房间 → 继续沿用已有逻辑进入等待房或牌桌，不展示创建页，避免重复房间。
- 未授权时 canvas 按钮和原生授权按钮需要对齐 → 继续用现有透明按钮覆盖开始按钮区域。
- 预留字段入库后当前规则不消费 → 字段必须命名稳定，并在 tests 中验证保存和返回，避免后续接规则时数据缺失。
