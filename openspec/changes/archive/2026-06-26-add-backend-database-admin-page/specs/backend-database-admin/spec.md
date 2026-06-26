## ADDED Requirements

### Requirement: 受保护的数据库管理页面
系统 SHALL 在自有后端提供 `/admin` 管理页面。该页面和相关 API MUST 由 `ADMIN_TOKEN` 保护；当 `ADMIN_TOKEN` 未配置时，管理能力 MUST 被禁用。

#### Scenario: 管理页面可访问
- **WHEN** 维护者访问 `/admin?token=<ADMIN_TOKEN>`
- **THEN** 后端 MUST 返回数据库管理页面
- **AND** 页面 MUST 能使用该 token 调用管理 API

#### Scenario: 未配置管理 token
- **WHEN** 服务端未配置 `ADMIN_TOKEN`
- **THEN** `/admin` 和管理 API MUST 返回管理能力未启用
- **AND** 服务端 MUST NOT 执行任何删除操作

#### Scenario: 错误 token 被拒绝
- **WHEN** 请求未携带 token 或 token 与 `ADMIN_TOKEN` 不一致
- **THEN** 管理 API MUST 返回未授权
- **AND** 数据库内容 MUST NOT 被修改

### Requirement: 房间相关集合清理
系统 SHALL 允许维护者查看并清空房间相关集合 `rooms`、`roomStates`、`matchQueue`。服务端 MUST 只允许操作白名单集合，并 MUST 要求删除请求包含确认文本。

#### Scenario: 查询集合计数
- **WHEN** 授权维护者打开管理页面或刷新状态
- **THEN** 系统 MUST 返回白名单集合的当前文档数量
- **AND** 页面 MUST 展示每个集合的用途和数量

#### Scenario: 清空单个集合
- **WHEN** 授权维护者选择某个白名单集合并提交确认文本 `CLEAR`
- **THEN** 服务端 MUST 删除该集合中的全部文档
- **AND** 响应 MUST 返回被删除的文档数量

#### Scenario: 清空全部房间相关集合
- **WHEN** 授权维护者选择清空全部并提交确认文本 `CLEAR`
- **THEN** 服务端 MUST 清空 `rooms`、`roomStates`、`matchQueue`
- **AND** 响应 MUST 分别返回各集合删除数量

#### Scenario: 非白名单集合不可删除
- **WHEN** 请求尝试删除白名单之外的集合
- **THEN** 服务端 MUST 拒绝请求
- **AND** 数据库内容 MUST NOT 被修改
