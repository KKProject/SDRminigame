## Context

当前华牌在线对战中存在一个严重的UI响应问题：当AI打出一张真人玩家可以响应的牌时，真人玩家的界面经常不显示相应的响应选项（如"碰"按钮），导致玩家无法操作，看起来像是界面"卡死"了。

**当前状态分析：**

通过代码分析发现，问题根源在于服务端和前端的双重清空机制：

1. **服务端问题：** 在 `services/backend/src/game/core/engine.js` 的 `buildPublicState()` 函数中，当检测到存在 `responseWindow` 时，会将 `playerActions` 和 `pendingActions` 设置为空数组：
   ```javascript
   playerActions: responseWindow ? [] : (state.playerActions || []),
   pendingActions: responseWindow ? [] : (state.pendingActions || []),
   ```

2. **前端问题：** 在 `js/net/online.js` 的 `applyServerSnapshot()` 函数中，当检测到 `animationWaiting` 为 true 时，也会清空本地状态中的动作选项。

**技术约束：**
- 必须保持现有的动画屏障机制不变，避免影响其他正常功能
- 修复方案需要向后兼容，不能破坏现有的在线对战流程
- 需要确保WebSocket实时通信的时序正确性

## Goals / Non-Goals

**Goals:**
- 修复响应窗口期间真人玩家无法看到响应选项的问题
- 确保在AI打出可响应牌时，真人玩家能够正常看到并操作"碰"、"吃"等选项
- 保持现有动画屏障机制的完整性
- 提供清晰的错误日志和调试信息，便于问题排查

**Non-Goals:**
- 重构整个动画屏障系统（超出本次修复范围）
- 修改前端动画渲染逻辑（保持现有实现）
- 改变响应窗口的超时机制（维持现有超时逻辑）
- 优化WebSocket通信性能（性能优化不在本次范围内）

## Decisions

### 决策1：修复服务端 buildPublicState() 函数

**选择：** 移除响应窗口期间对 `playerActions` 和 `pendingActions` 的清空逻辑

**理由：**
- 问题根源在于服务端错误地清空了动作选项
- 响应窗口的真正目的是等待玩家响应，而不是隐藏响应选项
- 前端的动画屏障机制已经足够处理UI同步问题
- 修改范围小，风险可控

**替代方案考虑：**
- **方案A：** 在前端增加响应窗口保护逻辑（被拒绝）
  - 优点：不需要修改服务端
  - 缺点：治标不治本，增加前端复杂度
- **方案B：** 同时修改前后端（被拒绝）
  - 优点：双重保险
  - 缺点：增加修改范围和测试复杂度，可能引入新的同步问题
- **方案C：** 重构状态同步机制（被拒绝）
  - 优点：彻底解决问题
  - 缺点：工程量巨大，风险高，超出本次修复范围

### 决策2：保持前端动画屏障机制不变

**选择：** 不修改前端的 `animationWaiting` 逻辑

**理由：**
- 前端的动画屏障机制本身是正确的，用于防止动画期间的误操作
- 问题是由服务端发送的错误状态引起的，修复服务端即可解决
- 避免引入新的前端复杂度和潜在bug

**技术细节：**
- 前端在 `animationWaiting` 期间清空动作选项是合理的防御性编程
- 只要服务端发送正确的状态，前端就能正确显示响应选项

### 决策3：增加调试日志

**选择：** 在关键位置增加日志输出，便于问题排查

**理由：**
- 响应窗口涉及复杂的状态转换，需要清晰的日志追踪
- 便于生产环境问题诊断和回归测试
- 对性能影响可以忽略不计

**日志位置：**
- `buildPublicState()` 函数：记录响应窗口状态和动作选项
- `handleResponseWindow()` 函数：记录响应窗口的创建和解析过程

## Risks / Trade-offs

### 风险1：可能影响现有的动画屏障机制

**描述：** 修改服务端状态构建逻辑可能间接影响前端的动画屏障机制。

**缓解措施：**
- 充分的单元测试和集成测试
- 在两个AI+两个真人的场景下进行回归测试
- 监控生产环境的错误日志和用户反馈

### 风险2：状态一致性问题

**描述：** 修改后可能导致服务端和前端状态不一致。

**缓解措施：**
- 确保WebSocket消息的时序正确性
- 增加状态验证逻辑
- 提供回滚方案，快速恢复到修复前的状态

### 风险3：性能影响

**描述：** 不再清空动作选项可能增加消息大小。

**缓解措施：**
- 评估消息大小变化
- 监控网络性能指标
- 必要时优化消息序列化

## Migration Plan

### 部署步骤

1. **代码修改**
   - 修改 `services/backend/src/game/core/engine.js` 中的 `buildPublicState()` 函数
   - 增加相关调试日志

2. **本地测试**
   - 运行后端单元测试：`node scripts/run-server-core-checks.mjs`
   - 运行在线对战测试：`node scripts/run-online-checks.mjs`
   - 运行后端集成测试：`node scripts/run-backend-checks.mjs`

3. **部署到生产环境**
   ```bash
   # 同步代码到生产服务器
   rsync -az --delete --exclude node_modules --exclude .env --exclude '*.log' services/backend/ aliyun:/opt/huapai-backend/services/backend/

   # 安装依赖并重启服务
   ssh aliyun 'set -e; cd /opt/huapai-backend/services/backend; npm install --omit=dev; systemctl restart huapai-backend.service; sleep 2; systemctl status huapai-backend.service --no-pager -l | sed -n "1,80p"; curl -fsS http://127.0.0.1:8080/healthz'
   ```

4. **生产环境验证**
   - 检查服务健康状态：`curl -fsS https://www.wangyouk.cn/healthz`
   - 监控错误日志：`ssh aliyun 'journalctl -u huapai-backend.service -n 100 --no-pager'`
   - 进行实际对局测试，验证修复效果

### 回滚策略

如果发现问题，立即执行以下回滚步骤：

1. **快速回滚**
   ```bash
   # 回滚到修复前的版本
   git checkout <修复前的commit>

   # 重新部署
   rsync -az --delete --exclude node_modules --exclude .env --exclude '*.log' services/backend/ aliyun:/opt/huapai-backend/services/backend/
   ssh aliyun 'set -e; cd /opt/huapai-backend/services/backend; npm install --omit=dev; systemctl restart huapai-backend.service'
   ```

2. **验证回滚**
   - 检查服务状态：`ssh aliyun 'systemctl status huapai-backend.service --no-pager -l'`
   - 确认健康检查通过：`curl -fsS https://www.wangyouk.cn/healthz`

## Open Questions

目前没有未解决的技术问题。所有关键决策都已确定，设计方案完整且可执行。

**待确认事项：**
- 需要在生产环境进行多轮对局测试，确认修复的有效性
- 需要收集用户反馈，确认问题是否彻底解决
