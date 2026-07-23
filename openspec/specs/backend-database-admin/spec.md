# backend-database-admin Specification

## Purpose
定义独立后台管理 Web 应用的交付边界、管理员会话保护以及房间相关集合的状态查询和受控清理能力，确保前端解耦后数据库操作仍受白名单与确认机制约束。
## Requirements
### Requirement: 受保护的数据库管理页面
系统 SHALL 在 `/admin/` 提供独立构建的数据库管理 Web 应用。Web 服务器 MUST 交付管理端静态资源，Node 后端 MUST 只提供由管理员登录会话保护的管理 API，不再拼接或返回内嵌管理页面源码。

#### Scenario: 管理页面可访问
- **WHEN** 维护者访问 `/admin/`
- **THEN** Web 服务器 MUST 返回独立构建的管理端应用
- **AND** 应用 MUST 在未登录时展示管理员登录表单

#### Scenario: 无尾斜杠入口规范化
- **WHEN** 维护者访问 `/admin`
- **THEN** Web 服务器 MUST 将请求重定向到 `/admin/`
- **AND** 管理端静态资源 MUST 使用正确的 `/admin/` 基址加载

#### Scenario: 已登录管理员使用管理页面
- **WHEN** 维护者使用有效管理员账号登录管理端
- **THEN** 应用 MUST 能使用会话 token 调用管理 API
- **AND** 应用 MUST 展示房间数据管理入口
- **AND** 应用 MUST 根据管理员角色展示有权访问的管理员维护入口

#### Scenario: 错误或缺失会话被拒绝
- **WHEN** 请求未携带后台会话 token 或 token 无效
- **THEN** 管理 API MUST 返回未授权
- **AND** 数据库内容 MUST NOT 被修改

#### Scenario: Node 不再交付内嵌页面
- **WHEN** 请求直接到达 Node 后端的管理页面路径
- **THEN** Node 后端 MUST NOT 从源码中的 HTML 字符串生成管理页面
- **AND** 管理 API 与健康检查 MUST 继续正常工作

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
