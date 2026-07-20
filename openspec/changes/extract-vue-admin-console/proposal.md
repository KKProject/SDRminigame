## Why

当前后台管理页面以 HTML、CSS 和原生 JavaScript 字符串内嵌在 Node 后端中，界面扩展、前端测试和独立部署都较困难；同时默认管理员凭据被硬编码并展示在页面与配置说明中，存在明显的凭据泄露和长期弱口令风险。现在需要将管理端升级为独立 Vue 应用，并同步建立安全的管理员初始化机制。

## What Changes

- 在 `services/backend` 同级新增 `services/admin-web`，使用 Vue 3、Vite 和 TypeScript 构建独立管理端。
- 重构登录、数据概览、集合清理和管理员账号维护界面，补齐响应式布局、加载/空/错误状态、键盘焦点以及危险操作确认对话框。
- 生产环境由 Nginx 在 `/admin/` 下托管管理端静态产物，并继续将 `/api/admin/*` 反向代理到 Node 后端；开发环境通过 Vite proxy 访问后端 API。
- 删除后端内嵌的 `admin-page.js` 页面实现和 `/admin` HTML 字符串响应职责，保留现有管理 API 的路径、授权与业务语义。
- 增加独立的管理端构建、测试、部署与公网冒烟检查流程。
- **BREAKING**：不再提供硬编码的默认管理员密码，也不在页面、源码、文档或测试中展示可用的默认凭据。
- **BREAKING**：首次初始化管理员集合时，后端必须从受保护的环境变量读取初始超级管理员用户名和密码；缺少合法配置时必须拒绝自动创建默认账号并给出不包含凭据的明确启动错误。
- 已存在管理员集合时不重复初始化或覆盖现有账号，避免部署配置变化意外重置凭据。

## Capabilities

### New Capabilities

- `admin-web-console`: 独立 Vue 管理端的路由、会话交互、数据管理界面、权限可见性、交互反馈和响应式体验。

### Modified Capabilities

- `backend-admin-accounts`: 将硬编码默认超级管理员改为环境变量驱动的一次性安全初始化，并禁止暴露默认凭据。
- `backend-database-admin`: 将 `/admin/` 管理页面的交付主体从 Node 内嵌 HTML 改为独立构建和部署的 Vue 应用，同时保持受保护的管理 API 能力。

## Impact

- 新增 `services/admin-web` 及其 Node 前端依赖、构建产物约定和前端测试。
- 修改 `services/backend/src/admin-service.js`、`config.js`、`server.js`、`.env.example` 及相关后端回归测试；移除 `admin-page.js`。
- 修改 Nginx 配置和部署脚本，使管理端静态资源与后端服务可以分别部署并共同完成健康检查。
- 更新 OpenSpec 项目运维说明、管理员账号规范和数据库管理规范。
- 现有 `/api/admin/*` 调用方无需修改接口路径；生产访问入口规范化为 `/admin/`。
