## Why

现有后台依赖 `ADMIN_TOKEN` 直接访问，适合临时清理数据，但不方便日常可视化管理，也无法在页面内维护新的管理员账号。维护者需要一个可通过地址访问、账号密码登录、默认可用且能继续扩展管理员的后台入口。

## What Changes

- 将 `/admin` 从 token 入口升级为可视化管理页面，支持账号密码登录和会话保存。
- 提供默认超级管理员账号 `wangyk` / `ww808123`，首次部署后即可登录。
- 新增管理员账号维护能力：超级管理员可以查看管理员列表、创建新管理员、禁用非默认管理员。
- 管理员登录后才能调用状态查询、房间数据删除和管理员维护 API。
- 保留房间数据白名单清理能力和 `CLEAR` 二次确认。
- **BREAKING**：管理 API 不再接受 `ADMIN_TOKEN` 作为唯一授权方式，改为后台登录会话授权；环境变量 `ADMIN_TOKEN` 仅作为旧配置废弃。

## Capabilities

### New Capabilities
- `backend-admin-accounts`: 后台管理员账号、登录会话、超级管理员创建和管理员维护能力。

### Modified Capabilities
- `backend-database-admin`: 数据库管理页面和清理 API 的授权要求从 `ADMIN_TOKEN` 改为管理员登录会话。

## Impact

- 后端 API：新增 `/api/admin/login`、`/api/admin/me`、`/api/admin/admins`、`/api/admin/logout`，调整 `/api/admin/status` 和 `/api/admin/clear` 的鉴权。
- 后端数据：新增管理员集合，用于保存手动/页面创建的管理员账号、密码摘要、角色和启用状态。
- 前端页面：重写 `services/backend/src/admin-page.js`，提供登录、数据清理、管理员维护的一体化管理界面。
- 测试：扩展 `scripts/run-backend-checks.mjs` 覆盖登录、默认超管、管理员创建、禁用和房间数据清理授权。
- 配置：更新 `.env.example`，说明默认超管和可选会话密钥。
