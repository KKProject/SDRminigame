## 1. 结果增量回归基线

- [x] 1.1 在 `scripts/run-online-checks.mjs` 增加 `hu` delta 回归场景，验证事件完成前显示状态不进入 `result`、权威状态已保存胡牌结果、完成后提交正确结算。
- [x] 1.2 增加 `circle-loss`、`draw-round` 和显式 `result.type=draw` 的 delta 场景，覆盖正常完成、快进或跳过后的结果提交。
- [x] 1.3 增加缺失或未知 `result.type` 的渲染回归，验证客户端不得显示“荒庄”及“牌堆摸完，无人胡牌”。

## 2. 增量显示状态闸门

- [x] 2.1 重构客户端增量补丁应用入口，使同一套座位旋转、弃牌、副露、公共字段和私密动作逻辑可以应用到指定的权威候选状态，且现有非结果 delta 行为保持不变。
- [x] 2.2 在 `applySocketDelta()` 中识别 `hu`、`circle-loss` 和 `draw-round` 结果事件，从事件结果构建完整权威候选状态并更新 `authoritativeState`。
- [x] 2.3 对结果 delta 保留此前稳定显示状态，把完整候选状态作为时间线 `displayCommit` 入队，并确保完成、快进、跳过、`selfAcked` 和已消费分支均能正确提交。
- [x] 2.4 当结果 delta 缺失有效结果数据或无法构建 checkpoint 时触发既有重新订阅/快照恢复，不得提交猜测结果。
- [x] 2.5 核对服务端四类结果路径均在公开事件中携带完整 `event.result`；仅在现有载荷不足时为增量协议补充兼容结果字段及对应服务端测试。

## 3. 结果渲染防御

- [x] 3.1 收紧结果面板渲染条件，只允许 `win`、`circle-loss`、`draw-round` 和 `draw` 进入对应结果文案分支。
- [x] 3.2 将“荒庄”限定为显式 `result.type=draw`，缺失或未知类型时保持稳定画面并等待权威恢复。
- [x] 3.3 验证结果按钮、结算积分和面板内容与结果 checkpoint 同步提交，不在胡牌动画之前出现。

## 4. 验证与交付

- [x] 4.1 运行 `node scripts/run-online-checks.mjs` 和 `node scripts/run-animation-checks.mjs`，确认 snapshot、delta、时间线 ACK 及已有动画行为通过。
- [x] 4.2 运行 `node scripts/run-server-core-checks.mjs` 和 `node scripts/run-backend-checks.mjs`；若修改了服务端增量载荷，补跑 socket/协议相关检查。
- [x] 4.3 运行 `openspec validate --change fix-result-delta-display-gate`，确认 proposal、design、specs 和任务状态有效。
- [x] 4.4 上传微信小游戏测试版本，确认 CI 编译与上传成功。
- [x] 4.5 在双真人与 AI 混合房间真机复测胡牌、进圈、低牌堆流局和牌堆耗尽荒庄，确认胡牌前不再闪现荒庄。
