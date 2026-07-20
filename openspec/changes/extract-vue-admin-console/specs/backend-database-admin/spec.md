## MODIFIED Requirements

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

