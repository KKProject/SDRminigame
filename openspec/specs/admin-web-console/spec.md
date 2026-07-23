# admin-web-console Specification

## Purpose
TBD - created by archiving change extract-vue-admin-console. Update Purpose after archive.
## Requirements
### Requirement: 独立管理端应用
系统 SHALL 在 `services/admin-web` 提供独立构建的 Vue 管理端，并 MUST 在生产环境通过 `/admin/` 入口交付该应用。管理端源码、依赖和构建流程 MUST 与 `services/backend` 分离。

#### Scenario: 访问管理端入口
- **WHEN** 维护者访问 `/admin/`
- **THEN** Web 服务器 MUST 返回 Vue 管理端入口页面
- **AND** 页面静态资源 MUST 从 `/admin/` 基址正确加载

#### Scenario: 直接访问管理端子路由
- **WHEN** 维护者直接打开 `/admin/` 下的有效前端子路由
- **THEN** Web 服务器 MUST 回退到管理端入口页面
- **AND** Vue Router MUST 渲染对应页面

#### Scenario: 独立构建管理端
- **WHEN** 维护者在 `services/admin-web` 执行生产构建
- **THEN** 系统 MUST 生成可由静态 Web 服务器部署的产物
- **AND** 构建过程 MUST NOT 依赖运行中的后端服务

### Requirement: 管理端登录与会话恢复
管理端 SHALL 使用现有管理员登录 API 建立 bearer token 会话，并 MUST 集中处理身份恢复、未授权响应和退出登录。

#### Scenario: 登录成功进入工作台
- **WHEN** 启用状态的管理员提交正确用户名和密码
- **THEN** 管理端 MUST 保存本标签页会话所需的 token
- **AND** 管理端 MUST 进入数据概览页面并展示当前管理员身份

#### Scenario: 登录失败提供可恢复反馈
- **WHEN** 登录 API 拒绝提交的凭据
- **THEN** 管理端 MUST 在登录表单附近展示可被辅助技术感知的错误
- **AND** 管理端 MUST 保留用户名并允许重新提交

#### Scenario: 恢复有效会话
- **WHEN** 管理端启动且浏览器中存在会话 token
- **THEN** 管理端 MUST 请求 `/api/admin/me` 验证身份
- **AND** 验证成功后 MUST 恢复受保护页面

#### Scenario: 会话失效
- **WHEN** 任一管理 API 返回未授权
- **THEN** 管理端 MUST 清除本地会话 token
- **AND** 管理端 MUST 跳转登录页并提示会话已失效

### Requirement: 数据管理工作台
管理端 SHALL 展示白名单房间集合的用途和当前文档数量，并 MUST 支持刷新、清空单个集合和清空全部集合。

#### Scenario: 查看集合状态
- **WHEN** 已登录管理员进入数据概览或主动刷新
- **THEN** 管理端 MUST 展示 `rooms`、`roomStates`、`matchQueue` 的用途和当前数量
- **AND** 加载期间 MUST 提供明确的进行中反馈

#### Scenario: 清空单个集合
- **WHEN** 管理员打开某个集合的清空对话框并输入正确确认文本
- **THEN** 管理端 MUST 明确展示目标集合和不可逆提示
- **AND** 确认后 MUST 调用清空 API 并刷新集合状态

#### Scenario: 清空全部集合
- **WHEN** 管理员选择清空全部并输入正确确认文本
- **THEN** 管理端 MUST 展示全部受影响集合及其当前数量
- **AND** 确认后 MUST 调用清空全部 API 并展示各集合删除结果

#### Scenario: 防止重复危险请求
- **WHEN** 清空请求正在执行
- **THEN** 管理端 MUST 禁止再次提交同一操作
- **AND** 请求失败时 MUST 展示错误及重试入口

### Requirement: 基于角色的管理员维护界面
管理端 SHALL 只向 `superadmin` 提供管理员列表、创建和禁用界面，并 MUST 阻止普通管理员通过前端路由进入该页面。

#### Scenario: 超级管理员维护账号
- **WHEN** 当前身份角色为 `superadmin`
- **THEN** 管理端 MUST 展示管理员账号导航和页面
- **AND** 页面 MUST 支持查看列表、创建管理员和禁用允许禁用的管理员

#### Scenario: 普通管理员不可进入账号维护
- **WHEN** 当前身份角色不是 `superadmin`
- **THEN** 管理端 MUST 隐藏管理员账号导航
- **AND** 直接访问对应路由时 MUST 重定向到有权访问的页面

#### Scenario: 禁用管理员确认
- **WHEN** 超级管理员请求禁用允许禁用的管理员
- **THEN** 管理端 MUST 在对话框中展示目标用户名及影响
- **AND** 只有输入正确确认文本后才能提交请求

### Requirement: 专业且可访问的管理体验
管理端 SHALL 使用一致的 design tokens、组件状态和响应式布局，并 MUST 支持常见桌面与移动视口、键盘操作和辅助技术反馈。

#### Scenario: 响应式查看后台
- **WHEN** 维护者在 375px、768px、1024px 或 1440px 宽度的视口使用管理端
- **THEN** 页面 MUST 不产生整页非预期横向滚动
- **AND** 数据表 MUST 通过局部滚动或适合小屏的布局保持可操作

#### Scenario: 键盘操作
- **WHEN** 维护者只使用键盘浏览和操作页面
- **THEN** 所有交互控件 MUST 可获得可见焦点并按合理顺序访问
- **AND** 确认对话框 MUST 管理焦点并支持安全关闭

#### Scenario: 异步和错误反馈
- **WHEN** 页面加载数据、提交表单或发生请求错误
- **THEN** 管理端 MUST 提供对应的加载、成功或错误状态
- **AND** 错误信息 MUST 可被辅助技术感知且不能只依赖颜色表达

#### Scenario: 减少动态效果
- **WHEN** 操作系统启用 `prefers-reduced-motion`
- **THEN** 管理端 MUST 减少或关闭非必要动画

