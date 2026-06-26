## Context

当前后端只有 `/healthz`、`/api/auth/login` 和 `/api/game`，数据库适配层同时支持 MongoDB、文件数据库和内存数据库。房间清理涉及 `rooms`、`roomStates`、`matchQueue` 三个集合，不能开放给普通玩家 token，也不能允许任意集合名传入。

## Goals / Non-Goals

**Goals:**
- 通过 `/admin` 提供一个可浏览器访问的轻量管理页面。
- 通过 `ADMIN_TOKEN` 保护页面和 API；未配置 token 时所有管理入口返回不可用。
- 只允许查询和清空房间相关集合：`rooms`、`roomStates`、`matchQueue`。
- 删除前在页面要求输入固定确认文本，服务端再次校验 `confirm: "CLEAR"`。

**Non-Goals:**
- 不做用户管理、手牌查看、任意文档编辑或通用数据库控制台。
- 不引入新前端框架或构建链路。
- 不提供无 token 的公网管理入口。

## Decisions

1. 管理页面作为后端内联静态 HTML 返回。
   - 理由：现有项目没有独立 Web 管理前端，内联页面无需构建步骤，部署跟随后端服务。
   - 替代方案：新建 Vite/React 管理应用。当前功能很小，独立构建会增加部署和安全面。

2. 管理 token 使用 `ADMIN_TOKEN`，页面通过 `?token=` 或浏览器本地保存后转为 `Authorization: Bearer` 调 API。
   - 理由：便于临时访问和服务器配置，和现有 app/socket token 分离。
   - 替代方案：复用玩家登录 token。玩家 token 不应拥有数据库清理权限。

3. 数据库适配层新增 `countDocuments` 和 `deleteMany` 方法。
   - 理由：管理 API 需要跨 Mongo/File/Memory 后端一致工作，并能被测试覆盖。

## Risks / Trade-offs

- [Risk] 管理 token 泄漏会导致房间数据被清空。→ Mitigation：未配置即禁用、只允许白名单集合、删除要求二次确认，建议生产使用长随机 token 并限制访问域名/IP。
- [Risk] 清空房间时有玩家在线。→ Mitigation：页面清晰标记危险操作；该能力定位为维护操作，应在停服或低峰执行。
- [Risk] URL 查询参数中的 token 可能被浏览器历史记录保存。→ Mitigation：页面读取后用 `history.replaceState` 去掉地址栏 token，并保存到 localStorage。
