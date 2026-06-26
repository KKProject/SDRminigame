# 上大人花牌小游戏

这是一个横屏微信小游戏 Canvas 项目，当前已从官方射击模板改造成在线上大人花牌游戏。玩法采用可配置规则：四方座位、真人玩家与服务端托管 AI、8 句话共 24 个牌字，每字 6 张，共 144 张牌；流程包含滑庄、接庄、摸牌、出牌、吃、碰、招、踏、胡、进圈、流局和重新开局。

## 当前玩法

- 玩家位于下方，点击手牌选中，再次点击同一张牌即可打出。
- 当出现接庄、吃、碰、招、踏、胡机会时，牌桌下方会显示对应按钮。
- 开局庄家 23 张、闲家 22 张，庄家最后一张为将牌；同一句话三张均按将牌处理。
- 庄家无刻子会滑庄，闲家有刻子时可接庄；接庄后三次凑牌内未听牌会进圈。
- 在线空座、断线或超时席位由服务端 AI 托管，并保留短暂思考提示。
- 胜利、进圈、流局和荒庄后会显示结果面板，可直接重新开始。
- 游戏默认横屏运行，手牌、弃牌区和门前区域会优先使用宽屏空间展示更多牌。
- 默认背景图为 `images/background.jpg`，默认背景音乐为 `audio/bgmusic.mp3`。
- 音频和图片通过资源清单加载；资源缺失时会使用 Canvas 绘制或静音兜底，不影响行牌。

## 源码目录

```
├── audio                         // 本地音频资源
├── images                        // 本地图片资源
├── js
│   ├── game
│   │   ├── assets.js             // 图片/音频资源清单与图片加载
│   │   ├── cards.js              // 牌堆、洗牌、排序、座位工具
│   │   ├── evaluator.js          // 吃碰招踏、八门胡牌、进圈判断
│   │   ├── layout.js             // 响应式牌桌布局
│   │   ├── renderer.js           // Canvas 牌桌渲染
│   │   ├── animation             // Tween.js 动画编排、预设与目标解析
│   │   ├── rules.js              // 默认规则配置
│   │   └── self-check.js         // 规则自检入口
│   ├── runtime
│   │   └── music.js              // 音频管理
│   ├── net                       // 在线登录、同步与输入意图
│   ├── databus.js                // 全局牌局状态
│   ├── main.js                   // 游戏入口主循环
│   └── render.js                 // Canvas 初始化和屏幕尺寸
├── services
│   └── backend                   // 自有 HTTPS API 与 WebSocket 后端
├── scripts                       // 本地验证脚本
│   └── run-huapai-checks.mjs     // 共享规则/布局验证脚本
├── game.js                       // 小游戏入口
├── game.json                     // 小游戏运行配置，默认 landscape
├── project.config.json           // 微信开发者工具项目配置
└── project.private.config.json   // 本地个人配置
```

## 规则说明

- 8 句话为：上大人、孔乙己、化三千、七十土、尔小生、福禄寿、佳作仁、八九子。
- 每句话第一个字为红色，中间字为绿色，最后一个字为黑色。
- 操作优先级为：踏、招、碰、吃；胡牌仍可直接结束本局。
- 胡牌采用八门牌：门型可为 `xxx`、`xyz`、`xxxx`、`xxxxx`、`xxxxxx`、`xx`、`xy`，且必须有且只有一个 `xy` 门。
- `xxxx` 需要 1 个对子支持，`xxxxx` 需要 2 个不同字对子支持，`xxxxxx` 需要 3 个不同字对子支持。
- 当前代码把“听牌”解释为：距离合法八门胡牌只差一张可进张。

上大人花牌存在地方规则差异。当前实现把牌字、牌数、将牌、接庄、吃碰招踏、出牌限制和八门胡牌常量集中在 `js/game/rules.js` 与 `js/game/evaluator.js`，后续可以按实际地方玩法调整。

## 本地检查

```bash
node scripts/run-huapai-checks.mjs
node scripts/run-animation-checks.mjs
node scripts/run-online-checks.mjs
node scripts/run-backend-checks.mjs
node scripts/run-server-core-checks.mjs
npx --yes esbuild game.js --bundle --format=iife --platform=browser --outfile=/tmp/sdrminigame-rules-bundle.js
```

客户端动画统一由 `js/main.js` 的帧循环更新时间。项目内固定使用 Tween.js 25.0.0 的 ESM 发布文件，位于 `js/vendor/tween/`，许可证为 MIT；动画维护边界见 `js/game/animation/README.md`。
