## ADDED Requirements

### Requirement: 分享邀请入口衔接
在线大厅 SHALL 处理微信分享参数中的好友房 `roomId`。当存在待加入邀请房间时，客户端 MUST 在登录后优先尝试加入该房间，而不是显示普通创建房间入口。

#### Scenario: 登录后处理邀请房间
- **WHEN** 客户端启动或回前台时带有好友房 `roomId`
- **THEN** 在线入口 MUST 在微信登录后请求加入该房间
- **AND** 加入成功后 MUST 显示对应等待房间

#### Scenario: 已有未结束房间时收到邀请
- **WHEN** 当前玩家已经参与其他未结束房间且又通过分享进入新房间
- **THEN** 客户端 MUST 优先遵守服务端返回的已有房间约束
- **AND** 客户端 MUST NOT 静默加入第二个未结束房间

### Requirement: 创建房间后进入等待房间
在线大厅 SHALL 在创建好友房成功后进入等待房间。客户端 MUST NOT 在创建成功后立即调用开局流程。

#### Scenario: 创建成功进入等待
- **WHEN** 玩家在大厅创建好友房成功
- **THEN** 客户端 MUST 显示该房间等待房间
- **AND** 客户端 MUST NOT 自动开始第一局
