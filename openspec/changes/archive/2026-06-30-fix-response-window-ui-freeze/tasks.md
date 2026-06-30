## 1. 代码修改

- [x] 1.1 修改服务端 `buildPublicState()` 函数，移除响应窗口期间清空 `playerActions` 和 `pendingActions` 的逻辑
- [x] 1.2 在 `handleResponseWindow()` 函数中增加调试日志，记录响应窗口创建和状态变化
- [x] 1.3 在 `buildPublicState()` 函数中增加日志，记录响应窗口状态和动作选项内容
- [x] 1.4 修复前端 `animationWaiting`/动画回执竞态导致本机响应按钮被清空的问题
- [x] 1.5 修复普通 WebSocket close 立即标记真人离线，导致可响应动作被服务端自动 pass 的问题
- [x] 1.6 修复响应窗口初始化时把短暂 `online:false` 的真人候选自动 pass 的问题；真人候选统一等待，真正掉线由 heartbeat 超时托管推进
- [x] 1.7 修复 WS 异常断开期间响应按钮延迟出现的问题：重连期间每 2 秒通过 HTTPS `pull` 兜底同步，WS 不可用时操作提交通过 HTTPS `op` 兜底
- [x] 1.8 修复牌桌 active 状态下非实时操作仍依赖 WS 的问题：`requestRematch`/`startRound`/`setReady` 等通用请求在 WS 不可用或请求失败时通过 HTTPS 兜底
- [x] 1.9 修复 WS 异常断开后仅靠 HTTPS `pull` 保活时，已过期动画栅栏不会推进导致牌局卡住的问题；`pull()` 现在也会处理过期 `animationBarrier`

## 2. 本地测试

- [x] 2.1 运行后端单元测试：`node scripts/run-server-core-checks.mjs`
- [x] 2.2 运行在线对战测试：`node scripts/run-online-checks.mjs`
- [x] 2.3 运行后端集成测试：`node scripts/run-backend-checks.mjs`
- [x] 2.5 增加在线回归测试：服务端尚未确认动画回执时，本机私密响应按钮仍保持可见
- [x] 2.6 增加 socket 生命周期回归测试：普通 close 不立即置离线，heartbeat timeout 才置离线
- [x] 2.7 增加服务端回归测试：短暂离线标记的真人响应座位仍保持 pending，并且已离线 pending 座位达到 heartbeat 超时后可被托管推进
- [x] 2.8 增加在线回归测试：WS 断开时可通过 HTTPS 兜底提交实时操作，并且重连期间 HTTPS `pull` 能拉回 pending 响应按钮
- [x] 2.9 增加在线回归测试：WS 断开时点击“再来一局”可通过 HTTPS `requestRematch` 兜底提交
- [x] 2.10 增加在线回归测试：WS 断开且仅 HTTPS `pull` 活跃时，过期动画栅栏会由 `pull()` 推进
- [ ] 2.4 手动测试：创建两个AI+两个真人的对局，验证AI打出可响应牌时真人能正常看到响应选项（2026-06-30 生产手测失败四轮：第一轮为前端动画回执竞态导致提示清空；第二轮为普通 socket close 立即置离线导致服务端自动 pass；第三轮为 `kk` 出 `sheng-0` 时 `_kk` 候选被短暂 `online:false` 自动 pass；第四轮为 `_kk` WS 1006 异常断开后，`kk` 出 `jiu-4` 的碰按钮直到后续重连/拉取才出现。四项均已修复并发布，待重新复测）

## 3. 生产部署

- [x] 3.1 同步代码到生产服务器：
  ```bash
  rsync -az --delete --exclude node_modules --exclude .env --exclude '*.log' services/backend/ aliyun:/opt/huapai-backend/services/backend/
  ```
- [x] 3.2 在生产服务器上安装依赖并重启服务：
  ```bash
  ssh aliyun 'set -e; cd /opt/huapai-backend/services/backend; npm install --omit=dev; systemctl restart huapai-backend.service; sleep 2; systemctl status huapai-backend.service --no-pager -l | sed -n "1,80p"; curl -fsS http://127.0.0.1:8080/healthz'
  ```
- [x] 3.3 验证生产服务健康状态：`curl -fsS https://www.wangyouk.cn/healthz`
- [x] 3.4 上传微信小游戏前端版本：`/opt/homebrew/Cellar/node@20/20.19.4/bin/node scripts/upload.js`（2026-06-30 上传成功，版本 `1.0.0`，描述 `CI上传`）
- [x] 3.5 重新部署后端 socket 生命周期修复（2026-06-30 16:57:59 CST 重启成功，公网 `/healthz` 通过）
- [x] 3.6 重新部署后端真人响应窗口等待修复（2026-06-30 17:20:35 CST 重启成功，公网 `/healthz` 通过）
- [x] 3.7 重新上传微信小游戏前端 WS 断线兜底修复：`/opt/homebrew/Cellar/node@20/20.19.4/bin/node scripts/upload.js`（2026-06-30 17:29 CST 上传成功，版本 `1.0.0`，描述 `CI上传`，`__FULL__` 包约 3.12 MB）
- [x] 3.8 重新上传微信小游戏前端通用请求 HTTPS 兜底修复：`/opt/homebrew/Cellar/node@20/20.19.4/bin/node scripts/upload.js`（2026-06-30 17:40 CST 上传成功，版本 `1.0.0`，描述 `CI上传`，`__FULL__` 包约 3.12 MB）
- [x] 3.9 重新部署后端过期动画栅栏 `pull()` 推进修复（2026-06-30 17:56:01 CST 重启成功，公网 `/healthz` 通过）

## 4. 生产验证

- [x] 4.1 检查生产服务状态：`ssh aliyun 'systemctl status huapai-backend.service --no-pager -l'`
- [x] 4.2 监控错误日志：`ssh aliyun 'journalctl -u huapai-backend.service -n 100 --no-pager'`
- [ ] 4.3 进行实际对局测试，邀请真人玩家进行两个AI+两个真人的对局，验证修复效果（2026-06-30 五次生产验证失败，已追加前端提示保留、后端 socket close 修复、真人响应窗口等待修复、前端 WS 断线 HTTPS 兜底同步、前端通用请求 HTTPS 兜底、后端 `pull()` 推进过期动画栅栏，待再次复测）
- [ ] 4.4 收集用户反馈，确认问题是否彻底解决

## 5. 回滚准备

- [x] 5.1 记录当前commit的版本号，便于快速回滚
- [x] 5.2 准备回滚脚本，确保在发现问题时能快速恢复到修复前的状态
