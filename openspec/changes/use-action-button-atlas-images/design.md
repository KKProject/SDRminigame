## Context

项目已经将 `images/actions.png` 注册为普通图片资源，但没有加载对应的 `images/action_buttons_named_atlas.json`，动作弹窗仍通过 `drawButton` 绘制黄色圆角矩形和文字。动作 atlas 包含 61 个平铺切片，其语义名称和 `text` 字段存在识别误差，因此本次必须以用户确认的 `originalIndex` 作为动作映射依据。

现有 `AssetLoader` 已支持加载多个 atlas、按名称获取 frame 和返回带旋转标记的 sprite；现有 renderer 也已经具备 atlas 裁剪、顺时针/逆时针旋转和动作按钮缩放动画能力，可以复用这些机制。

## Goals / Non-Goals

**Goals:**

- 将接庄、不接庄、胡、招、踏、碰、吃、过八类动作按钮替换为指定 atlas 图片。
- 正确处理索引 `1`、`4`、`13`、`47`、`51` 对应图片的左旋转 90 度。
- 保持图片原始宽高比，居中适配既有按钮区域，不改变命中区域。
- 保留按钮弹性入场、点击反馈和输入动作行为。
- 资源缺失或映射失败时安全回退到现有文字按钮。

**Non-Goals:**

- 不修改动作类型、动作优先级、动作标签或游戏规则。
- 不修改“再来一局”、静音等未列入映射的按钮。
- 不重命名或重新裁切 `actions.png` 与 atlas JSON 中的帧。
- 不依赖 atlas 当前的语义名称、`text` 或 `category` 判断动作。

## Decisions

1. 新增独立 `actions` atlas 配置

在 `ASSET_MANIFEST.atlases` 中新增 `actions`，使用现有 `images.button` 图片和 `images/action_buttons_named_atlas.json`。这样动作图片与牌面 atlas 相互独立，也可以直接复用 `getAtlasSprite`。

替代方案是把动作帧复制到牌面 atlas，但会混合两个资源域并增加手工维护成本。

2. 以 `originalIndex` 建立稳定映射

新增动作配置表，将动作类型映射到 `{ originalIndex, rotateCcw }`。加载 atlas 时扫描顶层 frames，为每个 `originalIndex` 建立帧名索引，再通过动作类型获取 sprite。

不使用 `btn_vertical_kai_1`、`coin_chu_red` 等现有名称，因为 JSON 已明确说明部分语义识别置信度较低，且这些名称与用户确认的动作含义不同。

3. `l` 统一解释为绘制时逆时针旋转 90 度

索引 `1`、`4`、`13`、`47`、`51` 的 sprite 返回 `rotateCcw: true`；索引 `36`、`27`、`58` 不旋转。旋转逻辑复用现有 atlas sprite 绘制流程。

4. 图片在按钮命中区域内等比 contain

renderer 根据旋转后的可见宽高比计算 contain 矩形，将动作图片居中绘制在 `layout.actionButtons` 的区域内。按钮入场与点击反馈继续通过按钮中心的 Canvas transform 实现，布局和触摸命中区域保持不变。

5. 图片映射失败时回退到文字按钮

若 actions atlas、图片、指定 `originalIndex` 或 frame 数据缺失，`drawButton` 继续绘制现有底色和动作文字。单个动作帧失败不得影响其他按钮或牌局操作。

## Risks / Trade-offs

- [Risk] atlas 语义名称与实际动作不一致，后续重新生成 JSON 时索引可能变化 → Mitigation: 自动检查固定校验八个 `originalIndex` 均存在，并将索引表集中维护。
- [Risk] 不同切片比例差异较大，统一拉伸会变形 → Mitigation: 使用旋转后宽高比进行 contain 绘制，不拉伸铺满。
- [Risk] 图片边缘可能包含透明留白，视觉大小不完全一致 → Mitigation: 先保持原始切片比例；后续如需微调，仅在动作映射配置中增加单项 scale，不改命中区域。
- [Risk] 图片资源未及时加载导致按钮短暂回退为文字 → Mitigation: 保留文字回退，加载完成后的后续帧自动使用图片。
