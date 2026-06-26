## MODIFIED Requirements

### Requirement: 受保护的数据库管理页面
系统 SHALL 在自有后端提供 `/admin` 管理页面。该页面 MUST 支持管理员账号密码登录；相关 API MUST 由管理员登录会话保护。

#### Scenario: 管理页面可访问
- **WHEN** 维护者访问 `/admin`
- **THEN** 后端 MUST 返回数据库管理页面
- **AND** 页面 MUST 在未登录时展示管理员登录表单

#### Scenario: 已登录管理员可使用管理页面
- **WHEN** 维护者使用有效管理员账号登录后台
- **THEN** 页面 MUST 能使用会话 token 调用管理 API
- **AND** 页面 MUST 展示房间数据管理和管理员维护入口

#### Scenario: 错误或缺失会话被拒绝
- **WHEN** 请求未携带后台会话 token 或 token 无效
- **THEN** 管理 API MUST 返回未授权
- **AND** 数据库内容 MUST NOT 被修改

### Requirement: 房间相关集合清理
系统 SHALL 允许已登录管理员查看并清空房间相关集合 `rooms`、`roomStates`、`matchQueue`。服务端 MUST 只允许操作白名单集合，并 MUST 要求删除请求包含确认文本。

#### Scenario: 查询集合计数
- **WHEN** 已登录管理员打开管理页面或刷新状态
- **THEN** 系统 MUST 返回白名单集合的当前文档数量
- **AND** 页面 MUST 展示每个集合的用途和数量

#### Scenario: 清空单个集合
- **WHEN** 已登录管理员选择某个白名单集合并提交确认文本 `CLEAR`
- **THEN** 服务端 MUST 删除该集合中的全部文档
- **AND** 响应 MUST 返回被删除的文档数量

#### Scenario: 清空全部房间相关集合
- **WHEN** 已登录管理员选择清空全部并提交确认文本 `CLEAR`
- **THEN** 服务端 MUST 清空 `rooms`、`roomStates`、`matchQueue`
- **AND** 响应 MUST 分别返回各集合删除数量

#### Scenario: 非白名单集合不可删除
- **WHEN** 请求尝试删除白名单之外的集合
- **THEN** 服务端 MUST 拒绝请求
- **AND** 数据库内容 MUST NOT 被修改
