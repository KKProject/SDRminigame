## 1. 资源层支持

- [x] 1.1 确认 `images/element.atlas.json` 中存在 `icon_jiang_big`、`icon_jiang_small`、`icon_jian_mini_hr` 三个将牌覆盖图 frame
- [x] 1.2 如果 atlas 中资源名与需求不一致，补齐或修正 atlas frame 名称，确保实现使用需求指定名称
- [x] 1.3 在 `AssetLoader` 中增加将牌覆盖图语义映射：`big` → `icon_jiang_big`，`small` → `icon_jiang_small`，`mini` → `icon_jian_mini_hr`
- [x] 1.4 增加获取将牌覆盖图 sprite 的方法，并复用现有 `cards` atlas / `getAtlasSprite()` 能力
- [x] 1.5 确认 `icon_jian_mini_hr` 返回的 sprite 带有左旋 90 度绘制信息
- [x] 1.6 确认将牌覆盖图资源缺失时返回空结果，不影响基础牌面绘制

## 2. 渲染层接入

- [x] 2.1 在 renderer 中记录当前牌局 `jiangPhraseId`，并在每帧牌桌渲染开始时更新
- [x] 2.2 增加统一判断方法，判定正面牌是否属于当前将牌句子
- [x] 2.3 扩展统一 `drawCard()` 绘制入口，在基础牌面和出现牌来源覆盖图之后叠加将牌覆盖图
- [x] 2.4 复用或抽取覆盖图 bounds 计算，让将牌覆盖图按 atlas 源尺寸比例放大/缩小并居中
- [x] 2.5 确认手牌小牌中的将牌叠加 `icon_jiang_small`
- [x] 2.6 确认弃牌区、打牌区和凑牌区 mini 将牌叠加左旋后的 `icon_jian_mini_hr`
- [x] 2.7 确认出现牌、摸牌动画、出牌动画和凑牌动画中的将牌叠加 `icon_jiang_big` 或当前尺寸对应覆盖图
- [x] 2.8 确认非将牌、未确定 `jiangPhraseId` 的牌、背面牌不叠加将牌覆盖图
- [x] 2.9 确认出现牌同时存在来源覆盖图和将牌覆盖图时，将牌覆盖图绘制在来源覆盖图之后

## 3. 自动检查与验收

- [x] 3.1 扩展资源自检，断言 `big` / `small` / `mini` 能映射到指定将牌覆盖图 frame
- [x] 3.2 扩展资源自检，断言 `icon_jian_mini_hr` 以左旋 90 度方式绘制
- [x] 3.3 扩展渲染自检，断言将牌手牌、小牌和 mini 牌会请求对应覆盖图
- [x] 3.4 扩展渲染自检，断言将牌出现牌在来源覆盖图之后继续叠加将牌覆盖图
- [x] 3.5 扩展动画或渲染自检，断言摸牌、出牌和凑牌动画中的将牌会显示覆盖图
- [x] 3.6 扩展检查，断言非将牌、未确定将牌、背面牌不会显示将牌覆盖图
- [x] 3.7 扩展检查，断言将牌覆盖图绘制尺寸与基础牌面尺寸的比例等于 atlas JSON 中源尺寸比例
- [x] 3.8 运行 `node scripts/run-huapai-checks.mjs`
- [x] 3.9 运行 `node scripts/run-animation-checks.mjs`
- [x] 3.10 运行相关在线/资源自检脚本
- [x] 3.11 运行 `openspec validate add-jiang-card-overlays --strict`
- [x] 3.12 真机验证：开局后手牌、弃牌区、凑牌区、出现牌和动画牌中的将牌均显示对应覆盖图
