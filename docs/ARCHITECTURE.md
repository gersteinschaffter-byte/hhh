# ShiningLike – Frontend Architecture (Stage 5)

目标：PixiJS + TypeScript 的卡牌放置项目，结构清晰、可扩展、可长期维护。

## 核心原则

1. 固定渲染层级：所有显示对象必须通过 `UIManager` 挂载。层级顺序：Background → Scene → UI → Popup → Toast。
2. 场景切换统一：只通过 `SceneManager.changeScene()` 切换。
3. 数据驱动：所有状态写入统一走 `GameState`，通过事件通知 UI 自动刷新。
4. 战斗强隔离：`BattleLogic` 只算数值，`BattleView` 只做表现，通过事件流连接。
