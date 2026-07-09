## 1. 状态与数据建模

- [x] 1.1 梳理 `playerActions` → `layout.actionButtons` → `renderer.drawButtons` → `handleActionTap` 的现有调用链，确认招候选在 `playerActions` 中的字段（`type`、`card.id`、`zhaoSize`、`index`、`handKeyCount`、`label`）
- [x] 1.2 新增客户端瞬时 UI 状态 `zhaoSizePickerOpen`（建议放 `OnlineController`/`databus`），记录当前是否处于招张数子面板，以及对应的招候选组与出现牌 id
- [x] 1.3 定义折叠规则：把 `playerActions` 中 `type === 'zhao'` 且 `card.id` 匹配当前出现牌的 action 归为一组；组内数量为 1 → 直接执行；大于 1 → 展开子面板

## 2. 布局（layout.js）

- [x] 2.1 在 `createActionModal`/`actionButtons` 生成处，把同组多个 `zhao` action 折叠为单个"招"入口按钮（携带整组候选引用），不再为每个 `zhaoSize` 各出一个按钮
- [x] 2.2 当 `zhaoSizePickerOpen` 为真时，`actionButtons` 改为渲染招张数子面板：`招4 / 招5 / 招6`（按组内实际候选，纯文字 label）+ 一个"返回"按钮
- [x] 2.3 折叠后的"招"入口按钮宽度按 atlas 切片旋转后宽高比计算（与碰/吃一致），子面板文字按钮宽度按文字 label 计算
- [x] 2.4 确认子面板按钮命中区不覆盖手牌命中区

## 3. 渲染（renderer.js）

- [x] 3.1 调整 `drawButtons` 中 `actionSpriteType` 取值：折叠后的"招"入口用 `'zhao'`（不再因 `zhaoSize` 置 null），通过 `getActionSprite('zhao')` 绘制精灵
- [x] 3.2 验证招精灵绘制方向正确（atlas 帧顺时针 90° 存储，`rotateCcw: true` 已配置，字朝上、不变形）
- [x] 3.3 子面板 `招4/招5/招6` 按钮纯文字渲染，无精灵
- [x] 3.4 确认主动作面板与子面板切换时按钮面板签名/弹性反馈正常

## 4. 输入与提交（online.js）

- [x] 4.1 在 `handleActionTap` 处理折叠"招"入口：若组内候选为 1 → 直接走现有 `response` 提交；若大于 1 → 置 `zhaoSizePickerOpen` 并刷新布局，不提交
- [x] 4.2 子面板选项点击 → 取对应 action → 走现有 `response` 提交，`ref` 仍带 `{ index, type, zhaoSize, handKeyCount, responseWindowId }`
- [x] 4.3 子面板"返回" → 关闭 `zhaoSizePickerOpen` 回主面板，不提交、不过牌、不触发 `localActionPreview`
- [x] 4.4 监听响应窗口失效/`actionState` 不可用/`playerActions` 更新/`responseWindowId` 变化，自动关闭子面板并按最新权威状态渲染
- [x] 4.5 确认 `responseActionMatches` 与 `localActionPreview` 在折叠/子面板流程下仍按具体 `zhaoSize` 匹配，行为不变

## 5. 测试与验证

- [x] 5.1 增加客户端用例：手里同 key 3 张时，动作面板只出现单个"招"按钮，点击直接提交 `zhaoSize=4`，不弹子面板
- [x] 5.2 增加客户端用例：手里同 key 4 张时，点击"招"展开 `招4/招5` 子面板；选择后提交对应 `zhaoSize`
- [x] 5.3 增加客户端用例：手里同 key 5 张时，子面板为 `招4/招5/招6`
- [x] 5.4 增加用例：子面板"返回"回到主面板，期间无 `sendOp`、无 `localActionPreview`
- [x] 5.5 增加用例：子面板展开期间响应窗口被服务端裁决关闭，子面板关闭且后续点击不提交
- [x] 5.6 增加用例：`circleLossRisk` 过滤导致某张数被裁剪后，组内候选数量驱动单/多方案判定（如 `xxxx` 只剩 `招4` 时直接执行）
- [x] 5.7 运行 `node scripts/run-online-checks.mjs`，确认在线交互与布局自检通过
- [x] 5.8 运行 `node scripts/run-server-core-checks.mjs`，确认引擎/规则侧未受影响
- [x] 5.9 真机验证：`xxx/xxxx/xxxxx` 三种手牌下招按钮形态、子面板展开、返回、提交与服务端结算一致
- [x] 5.10 运行 `openspec validate collapse-zhao-into-single-button --strict` 与 `openspec validate --all --strict`
