# backend-admin-accounts Specification

## Purpose
自有后端后台管理员账号、登录会话和管理员维护能力。

## Requirements

### Requirement: 管理员账号登录
系统 SHALL 在自有后端提供后台管理员账号密码登录能力。系统 MUST 提供默认超级管理员账号 `wangyk`，默认密码为 `ww808123`，并 MUST 在服务启动时确保该账号存在。

#### Scenario: 默认超级管理员首次可登录
- **WHEN** 服务启动且管理员集合中不存在 `wangyk`
- **THEN** 系统 MUST 创建启用状态的超级管理员 `wangyk`
- **AND** 维护者 MUST 能使用密码 `ww808123` 登录后台

#### Scenario: 已存在默认账号不被覆盖
- **WHEN** 服务启动且管理员集合中已存在 `wangyk`
- **THEN** 系统 MUST NOT 覆盖该账号的密码、角色或启用状态

#### Scenario: 管理员登录成功
- **WHEN** 启用状态的管理员提交正确用户名和密码
- **THEN** 系统 MUST 返回已签名的后台会话 token
- **AND** 响应 MUST 返回当前管理员的用户名和角色

#### Scenario: 登录失败
- **WHEN** 请求提交不存在的用户名、错误密码或已禁用账号
- **THEN** 系统 MUST 拒绝登录
- **AND** 系统 MUST NOT 返回后台会话 token

### Requirement: 后台会话授权
系统 SHALL 要求后台管理 API 使用管理员登录后获得的会话 token。系统 MUST 校验 token 签名、过期时间和账号启用状态。

#### Scenario: 有效会话可访问后台 API
- **WHEN** 请求携带有效后台会话 token
- **THEN** 系统 MUST 允许访问后台状态、房间数据清理和管理员信息 API

#### Scenario: 无效会话被拒绝
- **WHEN** 请求未携带 token、token 签名无效、token 已过期或账号已禁用
- **THEN** 系统 MUST 返回未授权
- **AND** 系统 MUST NOT 执行任何数据修改操作

#### Scenario: 查询当前管理员
- **WHEN** 已登录管理员请求当前身份信息
- **THEN** 系统 MUST 返回当前管理员的用户名和角色

### Requirement: 管理员账号维护
系统 SHALL 允许超级管理员在后台页面维护管理员账号。系统 MUST 只允许 `superadmin` 角色创建或禁用管理员。

#### Scenario: 超级管理员查看管理员列表
- **WHEN** 超级管理员打开后台工作台
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

#### Scenario: 禁用非默认管理员
- **WHEN** 超级管理员禁用非默认管理员
- **THEN** 系统 MUST 将该管理员标记为禁用
- **AND** 被禁用管理员 MUST NOT 能继续访问后台 API

#### Scenario: 默认超级管理员不能被禁用
- **WHEN** 请求尝试禁用 `wangyk`
- **THEN** 系统 MUST 拒绝请求
- **AND** `wangyk` MUST 保持启用状态
