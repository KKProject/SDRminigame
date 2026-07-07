## 1. 客户端时间线基础

- [x] 1.1 梳理 `js/net/online.js` 当前 snapshot、delta、ACK 响应和 `consumeAnimationState()` 的事件入口，记录哪些路径会直接修改 `databus`
- [x] 1.2 新增在线动画时间线数据结构，支持 `eventSeq` 入队、去重、排序、队列长度、当前事件状态和已消费事件记录
- [x] 1.3 将权威公开事件从 `applyServerSnapshot()` 和 `applySocketDelta()` 接入时间线队列，保留现有播放路径作为兼容兜底
- [x] 1.4 实现 timeline pump，保证同一时刻最多播放一个权威事件，并在完成后推进下一事件
- [x] 1.5 将 `finishAnimation()`、`sendAnimationAck()` 和 ACK 重试纳入时间线完成点，防止旧动画回调提交错误 ACK
- [x] 1.6 补充 `scripts/run-online-checks.mjs` 覆盖连续事件入队、重复事件去重、播放中收到新事件和 ACK 幂等

## 2. 显示状态闸门

- [x] 2.1 在 `OnlineController` 中拆分权威状态镜像与可渲染显示状态提交点，明确哪些字段可即时更新
- [x] 2.2 为 snapshot 和 delta 构建 display checkpoint，使事件完成后能提交对应桌面牌面、分数、阶段和结果状态
- [x] 2.3 实现结果类事件闸门：`hu`、`circle-loss`、`draw-round` 完成或跳过后才显示 `phase=result` 面板和结果按钮
- [x] 2.4 保持响应窗口私密动作即时可用，确保 `await-response` 入场动画期间或完成后响应按钮不被显示状态闸门永久阻塞
- [x] 2.5 补充回归测试覆盖胡牌动画先于结算面板、结果状态不抢占动画、响应按钮仍可点击

## 3. 动画快进、跳过和补偿边界

- [x] 3.1 定义客户端事件分类工具：响应关键事件、行为确认事件、收尾观赏事件和过期历史事件
- [x] 3.2 为 `TableAnimationController` 或时间线层增加可配置播放模式：完整播放、缩短播放、直接跳过并提交最终状态
- [x] 3.3 实现队列积压和重连恢复下的非关键事件快进/跳过策略，保留 `await-response` 事件的出现牌和按钮语义
- [x] 3.4 调整 `StateAnimationController` 和渲染器结果/副露差异特效，禁止正常在线事件流下抢播补偿动画
- [x] 3.5 补充测试覆盖积压快进、重连不补播旧动画、状态观察器不重复播放 `online` 事件对应动画

## 4. 服务端动画屏障收敛

- [x] 4.1 梳理 `services/backend/src/game/room.js` 中 `requiredAnimationOpenids()`、`syncAnimationBarrier()`、`advanceUnobservedEvents()` 和超时推进逻辑
- [x] 4.2 增加事件类型判断，确保非关键事件不会把已离线或无连接玩家加入必需回执名单
- [x] 4.3 在 socket 断开、心跳、订阅恢复和 ACK 处理路径刷新当前屏障在线集合，及时移除离线必需玩家
- [x] 4.4 保持响应关键事件和手动决策边界：离线移除只改变动画等待条件，不改变规则裁决和本人必须操作的业务约束
- [x] 4.5 增加服务端脱敏诊断，记录屏障创建、更新、离线移除、自动跳过、超时推进和等待席位
- [x] 4.6 补充 `scripts/run-server-core-checks.mjs` 覆盖离线玩家不阻塞非关键动画、在线响应玩家仍需要处理、自动跳过后结果落态一致

## 5. 端到端验证与发布

- [x] 5.1 运行 `node scripts/run-online-checks.mjs`，确认客户端时间线、显示闸门、快进和诊断测试通过
- [x] 5.2 运行 `node scripts/run-server-core-checks.mjs`，确认服务端动画屏障和离线边界测试通过
- [x] 5.3 运行 `node scripts/run-backend-checks.mjs`，确认后端 socket、HTTP、数据库和管理功能未回归
- [x] 5.4 在本地或测试房间复现连续胡牌到结算流程，确认胡动画与结算面板不再并发冲突
- [x] 5.5 部署后端：`bash scripts/deploy-backend.sh`
- [x] 5.6 上传微信小游戏：`/opt/homebrew/Cellar/node@20/20.19.4/bin/node scripts/upload.js`
- [x] 5.7 生产房间真机验证多人响应、胡牌结算、切后台恢复、玩家断线和重连恢复流程
