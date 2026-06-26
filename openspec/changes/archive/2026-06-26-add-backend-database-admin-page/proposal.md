## Why

现有自有后端已经把在线房间状态持久化到数据库，但清理房间数据需要手工连接数据库，容易误删或遗漏集合。增加一个受保护的管理页面，可以让维护者通过后端地址查看房间相关集合数量，并安全执行删除操作。

## What Changes

- 新增后端管理页面 `/admin`，用于查看房间相关集合状态。
- 新增管理 API，支持查询 `rooms`、`roomStates`、`matchQueue` 计数并清空这些集合。
- 通过 `ADMIN_TOKEN` 环境变量保护页面和 API；未配置时禁用管理能力。
- 删除操作要求页面二次确认，并且服务端只允许删除白名单集合。

## Capabilities

### New Capabilities
- `backend-database-admin`: 自有后端数据库管理页面和受保护的清理接口。

### Modified Capabilities

## Impact

- 后端 HTTP 路由：`services/backend/src/server.js`
- 后端配置：`services/backend/src/config.js`、`services/backend/.env.example`
- 数据库适配层：`services/backend/src/db.js`
- 静态管理页面：`services/backend/src/admin-page.js`
- 后端验证脚本：`scripts/run-backend-checks.mjs`
