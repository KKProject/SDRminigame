## Context

当前在线牌桌已经要求实时同步只走 WebSocket，断线时客户端保留最后权威快照并等待重连。实际移动端会因为切后台、锁屏、网络切换、弱网、服务端重启等原因断开 socket。客户端已有定时 ping、房间 heartbeat 和重连循环；服务端也有连接超时关闭逻辑。但存在两个薄弱点：

- socket token 默认较短，连接建立后没问题，但长局中断线后若继续复用旧 token，重连可能因 token 过期失败。
- 服务端对 socket close/error/timeout 缺少结构化日志，线上只能看到服务启动记录，很难判断断连来源。

## Goals / Non-Goals

**Goals:**

- 断线重连时能识别 token 过期、鉴权失败或 token 即将过期，并自动刷新 socket auth。
- 刷新 auth 后仍通过 WebSocket 订阅原房间恢复最新权威快照，不引入 HTTPS 牌桌实时兜底。
- 服务端记录不含 token 的 socket 连接诊断日志，覆盖鉴权失败、连接关闭、错误和心跳超时。
- 保持已有等待重连 UI 与操作阻塞语义，避免弱网下误提交操作。

**Non-Goals:**

- 不改变在线牌桌实时同步只走 WebSocket 的架构。
- 不引入新的消息协议、Redis、队列或独立 socket 服务。
- 不实现复杂网络质量 UI；本次只做恢复能力和诊断信息。

## Decisions

### 1. 客户端重连前刷新即将过期的 socket auth

客户端保存登录返回的 `socket.expiresAt`。每次重连前，如果当前 socket auth 缺失、已过期或距离过期不足一个短缓冲窗口，则调用现有 `login(profile)` 刷新 app/socket token，再用新 socket token 连接并订阅原房间。

替代方案是把 socket token TTL 拉长到和 app token 一样长。实现最小，但削弱短期 token 的安全边界，也不能处理服务端显式返回 token 过期的情况。

### 2. 鉴权失败时只刷新一次再重连

如果连接或订阅失败原因是 `TOKEN_EXPIRED`、`TOKEN_SIGNATURE_INVALID`、`SOCKET_UNAUTHORIZED` 或同类鉴权失败，客户端应刷新 socket auth 后立即重试一次。若仍失败，进入现有重连循环并保留等待提示，避免无限快速登录。

替代方案是每次断连都重新登录。更简单但会增加微信登录和后端登录请求量，弱网下噪声更大。

### 3. 服务端 socket 日志只记录诊断字段，不记录 token

服务端为 upgrade 鉴权失败、connection close、connection error、heartbeat timeout 输出 `console.warn/info`。字段包含 connection id、openid（有则记录）、roomId、close code、reason、路径和错误码。不得输出 query token、Authorization header 或完整 URL。

替代方案是暂时只依赖客户端日志。问题是线上真机断连通常发生在用户端，服务端没有对应 close reason 会让排查很慢。

## Risks / Trade-offs

- [登录刷新失败] → 客户端继续保持等待重连状态，并按现有退避循环重试，不切到 HTTP 兜底。
- [弱网下重复刷新] → 通过“鉴权失败刷新一次”和“即将过期才预刷新”限制请求量。
- [日志过多] → 只记录 socket 生命周期关键节点，不记录普通 ping 成功。
- [敏感信息泄露] → 日志明确禁止输出 token、Authorization 和完整带 query 的 URL。

## Migration Plan

1. 客户端先支持 socket auth 过期判断和刷新后重连。
2. 服务端增加 socket close/error/timeout/鉴权失败日志。
3. 补充在线和后端 socket 测试。
4. 部署服务端后，客户端发布新版小程序。

回滚方式：客户端恢复旧重连逻辑，服务端日志新增代码可以保留；若日志异常影响服务，可回滚服务端到上一提交。

## Open Questions

- 是否需要在生产环境把 `SOCKET_TOKEN_TTL_MS` 从 10 分钟提高到 30 分钟，作为刷新逻辑之外的运营缓冲？
