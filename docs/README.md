# 放置卡牌 RPG 原型（TypeScript 架构化版本）

这是基于你提供的 **PixiJS JS MVP** 进行“渐进式重构”的 **阶段 5** 交付。

本阶段目标：在已完成架构化（阶段 1）、数据驱动（阶段 2）、抽卡 UI 重做（阶段 3）、战斗框架（阶段 4）的基础上，
进行 **工程化加固（阶段 5）**：沉淀通用组件、加入可扩展的资源加载封装，并补齐架构说明文档。

- BattleEngine：负责节奏调度与事件转发
- BattleLogic：纯数值回合制自动战斗（事件输出）
- BattleView：纯表现层（进场/普攻特效/受击抖动/死亡淡出）
- BattleScene：主城入口 → 自动跑一场 3v3 占位战斗

- 抽卡页拆分为可复用模块：Header / Banner / ActionBar / CollapsibleInfoPanel
- 概率与奖池预览：可折叠 + 可滚动（移动端友好）
- 单抽 / 十连（占位规则：优先券，不足则用钻石直接支付）
- 结果弹窗始终在 PopupLayer 顶层 + 内置占位动效

## ✅ 已完成内容（阶段 5）

### 1) 工程化与核心架构（阶段 1 已完成）

- TypeScript + Vite 工程化
- 核心架构：
  - `GameApp`：初始化 Pixi、虚拟分辨率缩放、注册全局管理器
  - `SceneManager`：场景切换（当前版本以“无动画切换”为主，后续可扩展 push/pop 与过场）
  - `UIManager`：UI 分层（背景/场景/主 UI/弹窗/Toast），避免遮挡问题

### 2) 数据驱动 GameState（阶段 2 已完成）

- `GameState`：全局状态中心（gold/diamonds/heroes/inventory）
- 观察者/事件：`currencyChanged` / `inventoryChanged` / `heroesChanged` / `anyChanged`
- 持久化：GameState 内部统一 save/load/reset（外部不直接访问 localStorage）
- UI/Scene 订阅事件自动刷新：
  - TopBar 订阅 currencyChanged
  - 抽卡界面订阅 inventoryChanged + currencyChanged
  - 英雄列表订阅 heroesChanged
  - 背包订阅 inventoryChanged

### 3) 保持原 MVP 可运行

  - 主城 / 抽卡 / 英雄 / 背包
  - localStorage 存档
  - ⚙ 重置

### 4) 🎴 抽卡 UI 重做（阶段 3）

- 新布局：顶部卡池信息区 → 中部 Banner 展示区 → 单抽/十连主按钮 → 底部可折叠信息区
- 底部信息区：`概率 & 奖池预览` 支持 **展开/收起**，展开时可 **拖动滚动**
- 抽卡结果弹窗：
  - 单抽：大卡展示 + 轻量发光脉冲
  - 十连：滚动列表展示，每条结果标记 NEW/DUP
- 动效占位：点击召唤先播放 `SummonBanner.playSummonFx()`（闪光/光柱占位）再弹结果
- 遮挡问题：弹窗依旧走全局 `Modal`（UIManager 的 PopupLayer），保证永远在最上层

### 5) ⚔️ 战斗系统框架（阶段 4）

- 新增 `src/battle/*`：BattleEngine / BattleLogic / BattleView（事件驱动）
- 新增 `BattleScene`：从主城按钮进入，自动跑 3v3
- 表现占位：
  - 角色进场（位移 + 渐显）
  - 普攻特效（斜线闪光）
  - 受击抖动 + 飘字伤害
  - 死亡淡出

### 5.1) ✨ 通用特效与 Tween 抽离（阶段 5 追加）

- 新增 `src/fx/*`：
  - `Tween` / `TweenRunner`：轻量 tween 引擎
  - `FloatingText`：飘字（伤害/治疗/奖励通用）
  - `FlashLine`：斜线闪光（普攻/斩击通用）

战斗模块只负责“调用”，不再把 tween 逻辑写死在 BattleView 内。

### 5.2) 🧩 技能系统接口 & BUFF 扩展点（阶段 5 追加）

- 新增 `Skill/Trigger/Effect/Buff` 数据契约（`src/battle/SkillTypes.ts`）
- 新增 `SkillRegistry` / `BuffRegistry`：用注册表避免后续技能堆 if-else
- 新增 `SkillSystem` / `BuffSystem`：仅搭结构 + 运行时 API（dealDamage/heal/addBuff/removeBuff）
  - 当前 MVP 的“普攻”依然按原规则计算
  - Skill/BUFF 只留接口与事件扩展点，后续可以逐步加真实技能实现

### 6) 🧼 工程化加固（阶段 5）

- 新增 `AssetLoader`（`src/core/AssetLoader.ts`）：预留按场景 bundle 分包加载接口
- 新增 `ASSET_MANIFEST`（`src/game/assetManifest.ts`）：按场景定义 bundle（当前为空占位）
- 新增 `ToastManager`（`src/ui/components/ToastManager.ts`）：顶部通知/提示，挂在 UIManager.Toast 层，永远最上层
- 新增 `ARCHITECTURE.md`：简要架构说明与核心原则

## 📁 目录结构

```text
.
├─ ARCHITECTURE.md
├─ index.html
├─ index_no_rotate.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
└─ src
   ├─ main.ts
   ├─ core
   │  ├─ GameApp.ts
   │  ├─ AssetLoader.ts      # 阶段 5：资源加载封装（按 bundle）
   │  ├─ SceneManager.ts
   │  ├─ UIManager.ts
   │  ├─ GameState.ts        # 阶段 2：观察者模式 + 自动持久化 + 事件通知
   │  └─ types.ts
   ├─ game
   │  ├─ config.ts
   │  ├─ data.ts
   │  ├─ assetManifest.ts    # 阶段 5：Assets manifest（bundle 定义）
   │  └─ storage.ts
   ├─ battle
   │  ├─ BattleTypes.ts
   │  ├─ BattleLogic.ts
   │  ├─ BattleView.ts
   │  ├─ BattleEngine.ts
   │  ├─ SkillTypes.ts
   │  ├─ SkillRegistry.ts
   │  ├─ SkillSystem.ts
   │  └─ BuffSystem.ts
   ├─ fx
   │  ├─ Tween.ts
   │  ├─ FloatingText.ts
   │  └─ FlashLine.ts
   ├─ fx
   │  ├─ Tween.ts
   │  ├─ FloatingText.ts
   │  └─ FlashLine.ts
   ├─ scenes
   │  ├─ BaseScene.ts
   │  ├─ HomeScene.ts
   │  ├─ BattleScene.ts
   │  ├─ SummonScene.ts
   │  └─ summon
   │     ├─ SummonLayout.ts
   │     ├─ SummonHeader.ts
   │     ├─ SummonBanner.ts
   │     ├─ SummonActionBar.ts
   │     ├─ SummonInfoPanel.ts
   │     └─ SummonResultPopup.ts
   │  ├─ HeroesScene.ts
   │  └─ BagScene.ts
   └─ ui
      ├─ uiFactory.ts
      ├─ components
      │  ├─ UIButton.ts
      │  ├─ TopBar.ts
      │  ├─ BottomNav.ts
      │  ├─ Modal.ts
      │  ├─ ToastManager.ts  # 阶段 5：Toast 顶部通知
      │  ├─ HeroCard.ts
      │  └─ ScrollView.ts
      └─ legacy
         └─ (阶段 1 用到的少量过渡代码)
```

## ▶️ 本地运行

### 方式 A：PC（推荐）

1) 安装依赖

```bash
npm install
```

2) 启动开发服务器

```bash
npm run dev
```

然后浏览器打开命令行输出的地址（默认 `http://localhost:5173`）。

### 方式 B：Termux（安卓，推荐把项目放到 Termux Home 再装依赖）

1) 安装 Node.js

```bash
pkg update
pkg install nodejs -y
```

2) 把项目从 /sdcard 拷到 Termux Home（避免权限/软链导致 node_modules 不完整）

```bash
cp -r ~/storage/downloads/shininglike_ts ~/shininglike_ts
cd ~/shininglike_ts
```

3) 安装依赖

```bash
npm install
```

4) 运行

```bash
npm run dev
```

浏览器打开：`http://127.0.0.1:5173`

> 如果你希望继续用 `python -m http.server` 的方式，我们也可以在阶段 2/3 给你输出 `dist/` 静态包并写好一键脚本。

## 🔜 下一步建议

- 战斗技能系统：Skill/Trigger/Effect + BUFF 系统（先搭接口与事件，不堆 if else）
- 战斗录像/回放：记录 Logic 事件流，View 复播
- Assets 真分包：把真实贴图/序列帧放进 `assetManifest.ts` 对应 bundle，并在场景 onEnter 里加载
