## 1. 资源与映射确认

- [x] 1.1 检查 `images/actions.png` 与 `images/action_buttons_named_atlas.json` 可读取且包含索引 `1`、`4`、`13`、`47`、`36`、`51`、`27`、`58`
- [x] 1.2 在动作配置中建立八类动作到 `originalIndex` 和左旋标记的集中映射
- [x] 1.3 确认未映射的再来一局、静音等按钮继续使用原绘制方式

## 2. 动作 Atlas 加载

- [x] 2.1 在 `ASSET_MANIFEST.atlases` 中配置独立 `actions` atlas，复用 `images.button`
- [x] 2.2 在 AssetLoader 中建立 `originalIndex` 到 frame 名称的索引
- [x] 2.3 增加按动作类型获取动作 sprite 的接口，并正确返回 `rotateCcw` 标记
- [x] 2.4 确保 atlas、图片、索引或 frame 缺失时接口安全返回空结果

## 3. 动作按钮图片渲染

- [x] 3.1 修改动作按钮绘制流程，优先请求并绘制对应动作 sprite
- [x] 3.2 根据旋转后的图片宽高比计算 contain 矩形，居中绘制且不变形
- [x] 3.3 对接庄、不接庄、胡、招、碰图片执行逆时针旋转 90 度
- [x] 3.4 保留踏、吃、过图片原方向绘制
- [x] 3.5 保留现有按钮弹性入场、淡入、点击反馈和布局命中区域
- [x] 3.6 动作 sprite 不可用时回退到现有 Canvas 文字按钮
- [x] 3.7 移除可选动作出现时的弹窗背景、边框和说明文字绘制
- [x] 3.8 将图片动作按钮高度固定为 `50px`，按 atlas 旋转后宽高比计算按钮宽度

## 4. 自动检查

- [x] 4.1 增加 actions atlas 清单路径和八个指定 `originalIndex` 存在性检查
- [x] 4.2 增加动作到索引与旋转标记映射检查
- [x] 4.3 增加动作图片等比 contain、居中和不变形绘制检查
- [x] 4.4 增加图片按钮入场/点击反馈仍生效且命中区域不变检查
- [x] 4.5 增加单个动作图片缺失时文字回退且其他图片按钮正常显示检查
- [x] 4.6 增加动作按钮高度、atlas 比例和无说明文字检查

## 5. 验证

- [x] 5.1 运行 `node scripts/run-huapai-checks.mjs`
- [x] 5.2 运行 `openspec validate use-action-button-atlas-images --strict`
- [x] 5.3 运行 `openspec validate --all --strict`
