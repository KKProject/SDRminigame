## MODIFIED Requirements

### Requirement: 启动页登录门禁
系统 SHALL 在启动页以微信头像昵称作为玩家身份初始化门禁。玩家本地未获取过微信头像昵称时，客户端 SHALL 先调用后端 code-only 登录尝试恢复数据库中已保存的头像昵称；后端已有资料时客户端 MUST 使用该资料完成门禁且 MUST NOT 重复请求微信资料；本地和后端都没有资料时，客户端 MUST NOT 进入创建房间或分享房间流程，直到玩家完成微信资料授权。

#### Scenario: 本地未获取资料进入首页先恢复后端资料
- **WHEN** 玩家进入启动页且本地没有微信头像昵称资料
- **THEN** 客户端 MUST 通过 `wx.login` 调用后端 code-only 登录
- **AND** 如果后端用户资料包含头像或昵称，启动页 MUST 进入已准备态
- **AND** 客户端 MUST NOT 请求微信头像昵称授权

#### Scenario: 本地和后端均无资料时提示登录
- **WHEN** 玩家进入启动页且本地和后端都没有微信头像昵称资料
- **THEN** 启动页 MUST 显示微信登录提示态
- **AND** 客户端 MUST 提供微信资料授权按钮
- **AND** 客户端 MUST NOT 使用默认昵称绕过微信资料授权进入创建房间或分享房间流程

#### Scenario: 点击开始先获取微信资料
- **WHEN** 本地没有微信头像昵称资料的玩家在启动页点击开始入口
- **THEN** 客户端 MUST 先通过微信资料授权获取头像昵称
- **AND** 授权成功后客户端 MUST 保存头像昵称并调用后端登录接口
- **AND** 后端登录成功后客户端 MUST 进入房间创建页

#### Scenario: 已有资料点击开始直接后端登录
- **WHEN** 玩家进入启动页且本地已经保存微信头像或昵称
- **THEN** 启动页 MUST 允许玩家点击开始入口
- **AND** 点击开始时客户端 MUST 直接调用后端登录接口
- **AND** 客户端 MUST NOT 再弹出或创建微信资料授权按钮
- **AND** 后端登录成功后客户端 MUST 进入房间创建页

#### Scenario: 登录失败可重试
- **WHEN** 微信资料授权失败、资料为空或后端登录失败
- **THEN** 客户端 MUST 留在启动页
- **AND** 客户端 MUST 显示可重试的登录提示或失败状态
- **AND** 客户端 MUST NOT 创建房间或加入分享房间

### Requirement: 分享邀请入口衔接
在线大厅 SHALL 处理微信分享参数中的好友房 `roomId`。当存在待加入邀请房间时，客户端 MUST 先满足启动页微信头像昵称门禁，登录成功后优先尝试加入该房间，而不是显示普通创建房间入口。

#### Scenario: 未登录分享进入先恢复后端资料
- **WHEN** 客户端启动或回前台时带有好友房 `roomId` 且本地没有微信头像昵称资料
- **THEN** 客户端 MUST 保存待加入的分享房间意图
- **AND** 客户端 MUST 先通过后端 code-only 登录尝试恢复用户资料
- **AND** 如果后端有资料，客户端 MUST 继续处理分享房间且 MUST NOT 请求微信资料授权
- **AND** 如果后端无资料，客户端 MUST 停留在启动页并提示玩家先微信登录后进入房间
- **AND** 客户端 MUST NOT 使用默认昵称直接加入分享房间

#### Scenario: 分享登录后处理邀请房间
- **WHEN** 玩家通过分享进入并完成微信资料授权和后端登录
- **THEN** 客户端 MUST 优先请求加入分享房间
- **AND** 房间存在且未开局时客户端 MUST 显示对应等待房间
- **AND** 房间存在且已开局且当前玩家属于该房间时客户端 MUST 进入游戏页面

#### Scenario: 分享房间不存在停留启动页
- **WHEN** 分享房间不存在、已结束或不可加入
- **THEN** 客户端 MUST 清理待加入分享意图
- **AND** 客户端 MUST 停留或回到启动页
- **AND** 客户端 MUST 使用 toast 提示房间不存在或已结束
- **AND** 客户端 MUST NOT 在开始按钮下方渲染同一错误文案

#### Scenario: 已有未结束房间时收到邀请
- **WHEN** 当前玩家已经参与其他未结束房间且又通过分享进入新房间
- **THEN** 客户端 MUST 优先遵守服务端返回的已有房间约束
- **AND** 客户端 MUST NOT 静默加入第二个未结束房间

### Requirement: 后端用户资料合并
后端登录 SHALL 将数据库中已保存的微信头像昵称作为后续静默登录的资料来源。`login` 接口收到空 profile 时 MUST NOT 清空已有 `nickName` 或 `avatarUrl`；收到部分 profile 时 MUST 只更新非空字段。

#### Scenario: code-only 登录保留已有资料
- **WHEN** 已有用户记录包含 `nickName` 和 `avatarUrl`
- **AND** 客户端调用 `login` 时只传 `code` 且没有有效 profile
- **THEN** 后端 MUST 更新 `lastLoginAt`
- **AND** 后端 MUST 保留原有 `nickName` 和 `avatarUrl`
- **AND** 登录响应 MUST 返回保留后的用户资料

#### Scenario: 部分资料登录不清空另一项
- **WHEN** 已有用户记录包含 `nickName` 和 `avatarUrl`
- **AND** 客户端调用 `login` 时只传入新的非空 `nickName`
- **THEN** 后端 MUST 更新 `nickName`
- **AND** 后端 MUST 保留原有 `avatarUrl`
