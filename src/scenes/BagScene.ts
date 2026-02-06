import { Container, Graphics } from 'pixi.js';
import type GameApp from '../core/GameApp';
import BaseScene from './BaseScene';
import { ECONOMY } from '../game/config';
import { HERO_CLASS_LABEL, HERO_MAP } from '../game/data';
import { createText, formatNumber, roundedRect, drawPanel } from '../ui/uiFactory';
import UIButton from '../ui/components/UIButton';
import VirtualList from '../ui/VirtualList';

export default class BagScene extends BaseScene {
  private readonly game: GameApp;
  private readonly title;
  private readonly panel: Graphics;
  private readonly list: Container;
  private unsubs: Array<() => void> = [];
  private heroSelectList: VirtualList<Container> | null = null;
  private heroSelectWheelUnbind: (() => void) | null = null;

  // Prevent double-tap opening multiple chests in one moment.
  private chestOpenLock: Record<string, boolean> = {};

  constructor(game: GameApp) {
    super('bag');
    this.game = game;

    this.title = createText('背包', 44, 0xffffff, '900');
    this.title.anchor.set(0.5);
    this.root.addChild(this.title);

    this.panel = drawPanel(680, 920, 0.96);
    this.root.addChild(this.panel);

    this.list = new Container();
    this.panel.addChild(this.list);
    // Data-driven: redraw when inventory changes.
    this.unsubs.push(this.game.state.on('inventoryChanged', () => this.drawList()));
    this.drawList();
  }

  public override onExit(): void {
    this.unsubs.forEach((u) => {
      try { u(); } catch (_) {}
    });
    this.unsubs = [];
    this.heroSelectWheelUnbind?.();
    this.heroSelectWheelUnbind = null;
    this.heroSelectList = null;
  }

  public override onResize(w: number, _h: number): void {
    if (!this.title || (this.title as any).destroyed) return;
    this.title.position.set(w / 2, 170);
    this.panel.position.set((w - 680) / 2, 260);
    this.list.position.set(46, 70);
    this.drawList();
  }

  public override onUpdate(dt: number): void {
    this.heroSelectList?.update(dt);
  }


  private isChestKey(key: string): boolean {
    return key === 'chest_c' || key === 'chest_b' || key === 'chest_a' || key === 'chest_s';
  }

  private randInt(min: number, max: number): number {
    const a = Math.min(min, max);
    const b = Math.max(min, max);
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  private getHeroXpNeed(level: number): number {
    const lv = Math.max(1, Math.floor(level || 1));
    const table = (ECONOMY as any).heroXpTable as number[] | undefined;
    const tableValue = Array.isArray(table) ? table[lv - 1] : undefined;
    if (typeof tableValue === 'number' && Number.isFinite(tableValue)) {
      return Math.max(1, Math.floor(tableValue));
    }
    const base = Math.max(1, Math.floor((ECONOMY as any).heroXpBase ?? 60));
    const growth = Math.max(0, Math.floor((ECONOMY as any).heroXpGrowth ?? 18));
    return Math.max(1, base + (lv - 1) * growth);
  }

  private openExpItemModal(): void {
    const modal = this.game.modal;
    modal.content.removeChildren();
    const panelW = modal.panel.width;
    const panelH = modal.panel.height;

    const title = createText('小经验药水', 36, 0xffffff, '900');
    title.anchor.set(0.5);
    title.position.set(panelW / 2, 90);

    const xpPer = Math.max(1, Math.floor((ECONOMY as any).heroXpPerItem ?? 40));
    const qty = this.game.state.getInventory('exp_small');
    const qtyText = createText(`当前数量：x${formatNumber(qty)}`, 22, 0xffe3a3, '800');
    qtyText.anchor.set(0.5);
    qtyText.position.set(panelW / 2, 150);

    const hint = createText(`每个道具提供经验：${xpPer}`, 20, 0xcfe3ff, '700');
    hint.anchor.set(0.5);
    hint.position.set(panelW / 2, 190);

    const btnW = 200;
    const btnH = 80;
    const gap = 18;
    const yBtn = panelH - 160;

    const btnUse1 = new UIButton('使用 x1', btnW, btnH);
    const btnUse10 = new UIButton('使用 x10', btnW, btnH);
    const btnUseAll = new UIButton('使用全部', btnW, btnH);

    const totalW = btnW * 3 + gap * 2;
    const startX = (panelW - totalW) / 2;
    btnUse1.position.set(startX, yBtn);
    btnUse10.position.set(startX + btnW + gap, yBtn);
    btnUseAll.position.set(startX + (btnW + gap) * 2, yBtn);

    const refresh = () => {
      const q = this.game.state.getInventory('exp_small');
      qtyText.text = `当前数量：x${formatNumber(q)}`;
      btnUse1.setDisabled(q < 1);
      btnUse10.setDisabled(q < 10);
      btnUseAll.setDisabled(q < 1);
    };

    const pickCount = (count: number) => {
      const q = this.game.state.getInventory('exp_small');
      if (count > q) {
        this.game.toast.show('数量不足。', 2);
        return;
      }
      const owned = this.game.state.getSnapshot().heroes;
      if (!owned || owned.length === 0) {
        this.game.toast.show('没有可使用经验的英雄，请先抽卡。', 2);
        return;
      }
      this.openExpHeroSelectModal(count);
    };

    btnUse1.on('pointertap', () => pickCount(1));
    btnUse10.on('pointertap', () => pickCount(10));
    btnUseAll.on('pointertap', () => pickCount(this.game.state.getInventory('exp_small')));

    const prevOnClose = modal.onClose;
    const unSub = this.game.state.on('inventoryChanged', () => refresh());
    modal.onClose = () => {
      try { unSub(); } catch (_) {}
      modal.onClose = prevOnClose;
      prevOnClose?.();
    };

    refresh();
    modal.content.addChild(title, qtyText, hint, btnUse1, btnUse10, btnUseAll);
    modal.open();
  }

  private openExpHeroSelectModal(count: number): void {
    const modal = this.game.modal;
    modal.content.removeChildren();
    const panelW = modal.panel.width;
    const panelH = modal.panel.height;

    const title = createText(`选择英雄（使用 ${count} 个）`, 32, 0xffffff, '900');
    title.anchor.set(0.5);
    title.position.set(panelW / 2, 80);

    const info = createText(`经验 +${count * Math.max(1, Math.floor((ECONOMY as any).heroXpPerItem ?? 40))}`, 20, 0xcfe3ff, '700');
    info.anchor.set(0.5);
    info.position.set(panelW / 2, 120);

    const maxLevel = Math.max(1, Math.floor((ECONOMY as any).heroMaxLevel ?? ECONOMY.levelCap ?? 100));
    const owned = [...this.game.state.getSnapshot().heroes];
    owned.sort((a, b) => (b.level || 1) - (a.level || 1));
    this.heroSelectWheelUnbind?.();
    this.heroSelectWheelUnbind = null;

    const viewW = panelW - 140;
    const viewH = panelH - 320;
    const rowH = 76;
    const gapY = 10;
    const list = new VirtualList<Container>({
      width: viewW,
      height: viewH,
      itemWidth: viewW,
      itemHeight: rowH,
      gapX: 0,
      gapY,
      columns: 1,
      overscanRows: 2,
      createItem: () => {
        const row = new Container();
        const bg = new Graphics();
        bg.beginFill(0x000000, 0.25);
        roundedRect(bg, 0, 0, viewW, rowH, 14);
        bg.endFill();
        row.addChild(bg);

        const label = createText('', 20, 0xffffff, '800');
        label.anchor.set(0, 0.5);
        label.position.set(16, rowH / 2);
        row.addChild(label);

        const meta = createText('', 18, 0xd7e6ff, '700');
        meta.anchor.set(0, 0.5);
        meta.position.set(200, rowH / 2);
        row.addChild(meta);

        const xpLine = createText('', 18, 0xffe3a3, '800');
        xpLine.anchor.set(0, 0.5);
        xpLine.position.set(360, rowH / 2);
        row.addChild(xpLine);

        const btn = new UIButton('使用', 120, 56);
        btn.position.set(viewW - 16 - 120, 10);
        btn.on('pointertap', () => {
          const index = (row as any).__index as number | undefined;
          if (index == null) return;
          const hero = owned[index];
          if (!hero) return;
          const now = this.game.state.getOwnedHero(hero.heroId);
          if (!now) {
            this.game.toast.show('英雄不存在。', 2);
            return;
          }
          if (now.level >= maxLevel) {
            this.game.toast.show('已达等级上限。', 2);
            return;
          }
          if (!this.game.state.canConsumeInventory('exp_small', count)) {
            this.game.toast.show('数量不足。', 2);
            return;
          }
          this.game.state.consumeInventory('exp_small', count);
          const xpGain = count * Math.max(1, Math.floor((ECONOMY as any).heroXpPerItem ?? 40));
          const res = this.game.state.addHeroXp(hero.heroId, xpGain);
          if (!res.ok) {
            this.game.toast.show(res.reason || '使用失败。', 2);
            return;
          }
          if (res.levelAfter && res.levelBefore && res.levelAfter > res.levelBefore) {
            this.game.toast.show(`升级成功：Lv.${res.levelBefore}→Lv.${res.levelAfter}`, 2);
          } else {
            this.game.toast.show('经验已增加。', 2);
          }
          this.openExpHeroSelectModal(count);
        });
        row.addChild(btn);

        (row as any).__label = label;
        (row as any).__meta = meta;
        (row as any).__xp = xpLine;
        (row as any).__btn = btn;
        return row;
      },
      updateItem: (row, index) => {
        const hero = owned[index];
        if (!hero) {
          row.visible = false;
          return;
        }
        row.visible = true;
        (row as any).__index = index;
        const heroDef = HERO_MAP[hero.heroId];
        const classLabel = heroDef?.class ? HERO_CLASS_LABEL[heroDef.class] ?? heroDef.class : '';
        (row as any).__label.text = heroDef?.name ?? hero.heroId;
        (row as any).__meta.text = `Lv.${hero.level} · ${Math.max(1, hero.stars || 1)}★ · ${classLabel}`;
        const need = this.getHeroXpNeed(hero.level);
        const xp = Math.max(0, Math.floor(hero.xp || 0));
        (row as any).__xp.text = hero.level >= maxLevel ? '已满级' : `经验 ${xp}/${need}`;
        const btn = (row as any).__btn as UIButton;
        btn.setLabel(hero.level >= maxLevel ? '满级' : '使用');
        btn.setDisabled(hero.level >= maxLevel);
      },
    });
    list.position.set(70, 170);
    modal.content.addChild(list);
    this.heroSelectList = list;
    list.setItemCount(owned.length);
    list.refresh(true);
    this.heroSelectWheelUnbind = list.bindWheel(this.game.pixi.view);

    const btnBack = new UIButton('返回', 200, 72);
    btnBack.position.set((panelW - 200) / 2, panelH - 140);
    btnBack.on('pointertap', () => this.openExpItemModal());

    modal.content.addChild(title, info, btnBack);
    const prevOnClose = modal.onClose;
    modal.onClose = () => {
      this.heroSelectWheelUnbind?.();
      this.heroSelectWheelUnbind = null;
      this.heroSelectList = null;
      modal.onClose = prevOnClose;
      prevOnClose?.();
    };
    modal.open();
  }

  private openChestModal(chestKey: string, chestName: string): void {
    const modal = this.game.modal;
    modal.content.removeChildren();
    const panelW = modal.panel.width;
    const panelH = modal.panel.height;

    const title = createText(chestName, 36, 0xffffff, '900');
    title.anchor.set(0.5);
    title.position.set(panelW / 2, 90);

    const hint = createText('开启后随机获得：钻石 + 万能碎片 + 金币', 20, 0xcfe3ff, '700');
    hint.anchor.set(0.5);
    hint.position.set(panelW / 2, 150);

    const qty = this.game.state.getInventory(chestKey);
    const qtyText = createText(`当前数量：x${formatNumber(qty)}`, 22, 0xffe3a3, '800');
    qtyText.anchor.set(0.5);
    qtyText.position.set(panelW / 2, 210);

    const btnW = 240;
    const btnH = 80;
    const gap = 24;
    const bottomPad = 44;

    const yBtn = Math.max(260, panelH - bottomPad - btnH);
    const xLeft = panelW / 2 - gap / 2 - btnW;
    const xRight = panelW / 2 + gap / 2;

    const btnOpen10 = new UIButton('开启 x10', btnW, btnH);
    btnOpen10.position.set(xLeft, yBtn);

    const btnOpen1 = new UIButton('开启 x1', btnW, btnH);
    btnOpen1.position.set(xRight, yBtn);

    const refreshDisabled = () => {
      const q = this.game.state.getInventory(chestKey);
      const locked = !!this.chestOpenLock[chestKey];
      btnOpen1.setDisabled(q <= 0 || locked);
      btnOpen10.setDisabled(q < 10 || locked);
    };

    refreshDisabled();

    btnOpen1.on('pointertap', () => this.openChestMany(chestKey, chestName, 1, refreshDisabled));
    btnOpen10.on('pointertap', () => this.openChestMany(chestKey, chestName, 10, refreshDisabled));

    // Live refresh while modal is open.
    const prevOnClose = modal.onClose;
    const unSub = this.game.state.on('inventoryChanged', () => {
      const q = this.game.state.getInventory(chestKey);
      qtyText.text = `当前数量：x${formatNumber(q)}`;
      refreshDisabled();
    });
    modal.onClose = () => {
      try { unSub(); } catch (_) {}
      modal.onClose = prevOnClose;
      prevOnClose?.();
    };

    modal.content.addChild(title, hint, qtyText, btnOpen10, btnOpen1);
    modal.open();
  }

  private openChestMany(
    chestKey: string,
    chestName: string,
    count: number,
    refreshDisabled?: () => void,
  ): void {
    const qNow = this.game.state.getInventory(chestKey);
    if (qNow <= 0 || count <= 0) {
      this.game.toast.show('数量不足。', 2);
      return;
    }
    if (count > qNow) {
      this.game.toast.show('数量不足。', 2);
      return;
    }
    if (this.chestOpenLock[chestKey]) return;

    this.chestOpenLock[chestKey] = true;
    refreshDisabled?.();

    try {
      // Consume first to guarantee atomicity.
      if (!this.game.state.tryConsumeInventory(chestKey, count)) {
        this.game.toast.show('数量不足。', 2);
        return;
      }

      const shardKey = ECONOMY.dupeShardKey;

      let dMin = 0, dMax = 0, sMin = 0, sMax = 0, gMin = 0, gMax = 0;
      switch (chestKey) {
        case 'chest_c':
          dMin = 3; dMax = 6; sMin = 8; sMax = 15; gMin = 50; gMax = 120;
          break;
        case 'chest_b':
          dMin = 8; dMax = 15; sMin = 18; sMax = 35; gMin = 120; gMax = 260;
          break;
        case 'chest_a':
          dMin = 18; dMax = 35; sMin = 40; sMax = 80; gMin = 260; gMax = 600;
          break;
        case 'chest_s':
          dMin = 40; dMax = 80; sMin = 90; sMax = 160; gMin = 600; gMax = 1500;
          break;
        default:
          this.game.toast.show('未知宝箱。', 2);
          return;
      }

      let diamonds = 0;
      let shards = 0;
      let gold = 0;

      for (let i = 0; i < count; i++) {
        diamonds += this.randInt(dMin, dMax);
        shards += this.randInt(sMin, sMax);
        gold += this.randInt(gMin, gMax);
      }

      this.game.state.addDiamonds(diamonds);
      this.game.state.addInventory(shardKey, shards);
      this.game.state.addGold(gold);

      // Result popup
      const modal = this.game.modal;
      modal.content.removeChildren();
      const panelW = modal.panel.width;
      const panelH = modal.panel.height;

      const title = createText(`开启：${chestName} x${count}`, 34, 0xffffff, '900');
      title.anchor.set(0.5);
      title.position.set(panelW / 2, 90);

      const line = createText(
        `获得：💎 +${formatNumber(diamonds)}  🧩 +${formatNumber(shards)}  🪙 +${formatNumber(gold)}`,
        22,
        0xd7e6ff,
        '800',
      );
      line.anchor.set(0.5);
      line.position.set(panelW / 2, 170);
      line.style.align = 'center';
      line.style.wordWrap = true;
      line.style.wordWrapWidth = panelW - 90;

      const btnOk = new UIButton('确定', 240, 80);
      btnOk.position.set((panelW - 240) / 2, panelH - 140);
      btnOk.on('pointertap', () => modal.close());

      modal.content.addChild(title, line, btnOk);
      modal.open();

      this.game.toast.show('开启成功！', 2);
    } finally {
      // Release lock shortly after (inventoryChanged redraw will also refresh UI).
      setTimeout(() => {
        this.chestOpenLock[chestKey] = false;
        refreshDisabled?.();
      }, 450);
    }
  }

  private openChestOnce(chestKey: string, chestName: string): void {
    // Keep backward compatibility for inline open button.
    this.openChestMany(chestKey, chestName, 1);
  }

  private drawList(): void {
    this.list.removeChildren();
    const s = this.game.state.getSnapshot();

    const header = createText('资源与道具', 28, 0xffffff, '900');
    header.position.set(0, 0);
    this.list.addChild(header);

    const items = [
      { key: ECONOMY.summonTicketKey, name: ECONOMY.summonTicketName, icon: '🎫' },
      { key: 'exp_small', name: '小经验药水', icon: '🧪' },
      { key: ECONOMY.dupeShardKey, name: '万能碎片', icon: '🧩' },

      // Boss chests
      { key: 'chest_c', name: (ECONOMY as any).chest_cName ?? '普通宝箱', icon: '📦' },
      { key: 'chest_b', name: (ECONOMY as any).chest_bName ?? '高级宝箱', icon: '🎁' },
      { key: 'chest_a', name: (ECONOMY as any).chest_aName ?? '史诗宝箱', icon: '🟣' },
      { key: 'chest_s', name: (ECONOMY as any).chest_sName ?? '传说宝箱', icon: '🟡' },
    ];

    let y = 60;
    for (const it of items) {
      const row = new Container();
      const bg = new Graphics();
      bg.beginFill(0x000000, 0.2);
      roundedRect(bg, 0, 0, 588, 84, 18);
      bg.endFill();
      row.addChild(bg);

      const t = createText(`${it.icon}  ${it.name}`, 24, 0xd7e6ff, '800');
      t.anchor.set(0, 0.5);
      t.position.set(18, 42);
      row.addChild(t);

      const v = createText('x' + formatNumber(s.inventory[it.key] || 0), 26, 0xffffff, '900');
      v.anchor.set(1, 0.5);
      v.position.set(410, 42);
      row.addChild(v);

      // Inline open button (visible entry)
      let btnInline: UIButton | null = null;
      if (this.isChestKey(it.key)) {
        btnInline = new UIButton('开启', 120, 60);
        btnInline.position.set(588 - 18 - 120, 12);
        const qInline = s.inventory[it.key] || 0;
        btnInline.setDisabled(qInline <= 0 || !!this.chestOpenLock[it.key]);
        btnInline.on('pointertap', (ev: any) => {
          try { ev?.stopPropagation?.(); } catch (_) {}
          const refresh = () => {
            const q = this.game.state.getInventory(it.key);
            btnInline!.setDisabled(q <= 0 || !!this.chestOpenLock[it.key]);
          };
          this.openChestMany(it.key, it.name, 1, refresh);
        });
        row.addChild(btnInline);
      }

      row.position.set(0, y);
      // Chest open entry (tap row to open modal)
      if (this.isChestKey(it.key)) {
        const q = s.inventory[it.key] || 0;
        row.interactive = q > 0;
        row.cursor = q > 0 ? 'pointer' : 'default';
        row.alpha = q > 0 ? 1 : 0.65;
        if (q > 0) row.on('pointertap', () => this.openChestModal(it.key, it.name));
      } else if (it.key === 'exp_small') {
        const q = s.inventory[it.key] || 0;
        row.interactive = q > 0;
        row.cursor = q > 0 ? 'pointer' : 'default';
        row.alpha = q > 0 ? 1 : 0.7;
        if (q > 0) row.on('pointertap', () => this.openExpItemModal());
        if (!btnInline) {
          btnInline = new UIButton('使用', 120, 60);
          btnInline.position.set(588 - 18 - 120, 12);
          btnInline.setDisabled(q <= 0);
          btnInline.on('pointertap', (ev: any) => {
            try { ev?.stopPropagation?.(); } catch (_) {}
            this.openExpItemModal();
          });
          row.addChild(btnInline);
        }
      }
      this.list.addChild(row);
      y += 98;
    }

    const tip = createText('抽卡优先消耗召唤券；重复英雄会转化为万能碎片。Boss关胜利会掉落宝箱，可在背包中开启。经验药水可用于英雄升级。', 18, 0xcfe3ff, '700');
    tip.position.set(0, y + 20);
    tip.style.wordWrap = true;
    tip.style.wordWrapWidth = 588;
    this.list.addChild(tip);
  }

  // Phase 2: this scene is fully data-driven via subscriptions.
}
