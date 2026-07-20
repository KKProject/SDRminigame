## MODIFIED Requirements

### Requirement: 管理员账号登录
系统 SHALL 提供后台管理员账号密码登录能力。系统 MUST 在管理员集合为空时从受保护的运行环境配置创建一个初始超级管理员，并 MUST NOT 在源码、页面、构建产物、文档或日志中提供可用的默认密码。

#### Scenario: 空管理员集合安全初始化
- **WHEN** 服务启动且管理员集合中不存在任何管理员
- **AND** `INITIAL_ADMIN_USERNAME` 与 `INITIAL_ADMIN_PASSWORD` 均存在且合法
- **THEN** 系统 MUST 创建启用状态的初始超级管理员
- **AND** 系统 MUST 仅保存密码的 salt 和摘要
- **AND** 系统 MUST 将该账号标记为受保护的初始管理员

#### Scenario: 空管理员集合缺少初始化配置
- **WHEN** 服务启动且管理员集合中不存在任何管理员
- **AND** 初始化管理员用户名或密码缺失或不合法
- **THEN** 系统 MUST 拒绝完成服务启动
- **AND** 错误 MUST 指明缺失或非法的配置项
- **AND** 错误 MUST NOT 包含用户名、密码、摘要或 salt 的值

#### Scenario: 已有管理员不被初始化配置覆盖
- **WHEN** 服务启动且管理员集合中已存在至少一个管理员
- **THEN** 系统 MUST NOT 创建、覆盖或重置任何管理员账号
- **AND** 系统 MUST NOT 要求初始化密码继续可用

#### Scenario: 管理员登录成功
- **WHEN** 启用状态的管理员提交正确用户名和密码
- **THEN** 系统 MUST 返回已签名的后台会话 token
- **AND** 响应 MUST 返回当前管理员的用户名和角色
- **AND** 响应 MUST NOT 返回密码摘要、salt 或初始化密码

#### Scenario: 登录失败
- **WHEN** 请求提交不存在的用户名、错误密码或已禁用账号
- **THEN** 系统 MUST 拒绝登录
- **AND** 系统 MUST NOT 返回后台会话 token

### Requirement: 管理员账号维护
系统 SHALL 允许超级管理员维护管理员账号。系统 MUST 只允许 `superadmin` 角色创建或禁用管理员，并 MUST 保护初始管理员和当前操作账号不被禁用。

#### Scenario: 超级管理员查看管理员列表
- **WHEN** 超级管理员请求管理员列表
- **THEN** 系统 MUST 返回管理员列表
- **AND** 列表 MUST 包含用户名、角色、启用状态、创建时间和更新时间
- **AND** 列表 MUST NOT 返回密码摘要、salt 或明文密码

#### Scenario: 超级管理员创建管理员
- **WHEN** 超级管理员提交唯一用户名、合法密码和角色
- **THEN** 系统 MUST 创建启用状态的新管理员
- **AND** 新管理员 MUST 能使用提交的密码登录后台

#### Scenario: 非超级管理员不能维护账号
- **WHEN** 普通管理员请求创建或禁用管理员
- **THEN** 系统 MUST 拒绝请求
- **AND** 管理员集合 MUST NOT 被修改

#### Scenario: 重复用户名被拒绝
- **WHEN** 超级管理员创建已存在用户名
- **THEN** 系统 MUST 拒绝请求
- **AND** 系统 MUST NOT 覆盖既有管理员

#### Scenario: 禁用普通管理员
- **WHEN** 超级管理员禁用非初始且不是当前操作账号的管理员
- **THEN** 系统 MUST 将目标管理员标记为禁用
- **AND** 被禁用管理员 MUST NOT 能继续访问后台 API

#### Scenario: 初始超级管理员不能被禁用
- **WHEN** 请求尝试禁用带有初始管理员保护标记的账号
- **THEN** 系统 MUST 拒绝请求
- **AND** 该账号 MUST 保持启用状态

#### Scenario: 管理员不能禁用自己
- **WHEN** 超级管理员请求禁用当前操作账号
- **THEN** 系统 MUST 拒绝请求
- **AND** 当前操作账号 MUST 保持启用状态

