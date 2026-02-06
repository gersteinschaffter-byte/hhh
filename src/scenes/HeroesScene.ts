import { Container, Graphics } from 'pixi.js';
import type GameApp from '../core/GameApp';
import BaseScene from './BaseScene';
import { ECONOMY, RARITY } from '../game/config';
import { HERO_CLASS_LABEL, HEROES, HERO_MAP } from '../game/data';
import { GAME_VERSION, BUILD_TIME } from '../game/version';
import HeroCard from '../ui/components/HeroCard';
import UIButton from '../ui/components/UIButton';
import { clamp, createText, drawPanel, rarityLabel } from '../ui/uiFactory';
import VirtualList from '../ui/VirtualList';

export default class HeroesScene extends BaseScene {
  private _unsubHeroesChanged: (() => void) | null = null;
  private _unsubPartyChanged: (() => void) | null = null;
  private _onHeroesChanged = () => this.refresh();

  private readonly game: GameApp;
  private readonly title;
  private readonly partyText;
  private readonly partyBar: Container;
  private partySlotNodes: Array<{ box: Graphics; label: any; heroId: string | null }> = [];
  private selectingSlot: number | null = null;
  private readonly partyHint;
  private readonly panel: Graphics;
  private readonly heroList: VirtualList<HeroCard>;
  private heroListData: typeof HEROES = [];
  private wheelUnbind: (() => void) | null = null;

  constructor(game: GameApp) {
    super('heroes');
    this.game = game;

    this.title = createText('英雄', 44, 0xffffff, '900');
    this.title.anchor.set(0.5);
    this.root.addChild(this.title);
    this.partyText = createText('队伍：0/5', 26, 0xffffff, '700');
    this.partyText.anchor.set(0.5);
    this.root.addChild(this.partyText);

    this.partyBar = new Container();
    this.root.addChild(this.partyBar);

    // Quick guidance for players: how to deploy/undeploy heroes.
    this.partyHint = createText('提示：点英雄卡牌 → 弹窗上阵/下阵', 18, 0xcfe3ff, '700');
    this.partyHint.anchor.set(0.5);
    this.root.addChild(this.partyHint);


    this.panel = drawPanel(700, 980, 0.96);
    this.root.addChild(this.panel);

    const viewW = 700 - 32;
    const viewH = 980 - 32;
    const cols = 3;
    const cardW = 214;
    const cardH = 268;
    const rawGapX = Math.floor((viewW - cardW * cols) / (cols - 1));
    const gapX = clamp(rawGapX, 10, 18);
    const gapY = 18;
    const sample = HEROES[0] ?? HEROES[HEROES.length - 1]!;
    this.heroList = new VirtualList<HeroCard>({
      width: viewW,
      height: viewH,
      itemWidth: cardW,
      itemHeight: cardH,
      gapX,
      gapY,
      columns: cols,
      overscanRows: 2,
      createItem: () => {
        const card = new HeroCard(sample);
        card.on('pointertap', () => {
          const index = (card as any).__index as number | undefined;
          if (index == null) return;
          if (this.heroList.shouldBlockTap()) return;
          const hero = this.heroListData[index];
          if (!hero) return;
          if (this.tryAssignPartySlot(hero.id)) return;
          this.openHeroModal(hero.id);
        });
        return card;
      },
      updateItem: (card, index) => {
        const hero = this.heroListData[index];
        if (!hero) {
          card.visible = false;
          return;
        }
        card.visible = true;
        (card as any).__index = index;
        const owned = this.game.state.getOwnedHero(hero.id);
        card.setHero(hero, owned);
        card.setInParty(this.game.state.isInParty(hero.id));
      },
    });
    this.heroList.position.set(16, 16);
    this.panel.addChild(this.heroList);
    this.wheelUnbind = this.heroList.bindWheel(this.game.pixi.view);

    // Data-driven: refresh list when heroes change (gain/upgrade).
    this._unsubHeroesChanged?.();
    this._unsubHeroesChanged = this.game.state.on('heroesChanged', this._onHeroesChanged);

    this._unsubPartyChanged?.();
    this._unsubPartyChanged = this.game.state.on('partyChanged', () => this.refresh());

    this.refresh();
  }

  public override onEnter(): void {
    if (!this.wheelUnbind) this.wheelUnbind = this.heroList.bindWheel(this.game.pixi.view);
  }

  public override onResize(w: number, _h: number): void {
    if (!this.title || (this.title as any).destroyed) return;
    this.title.position.set(w / 2, 170);
    if (this.partyText && !(this.partyText as any).destroyed) {
      this.partyText.position.set(w / 2, 210);
    }
    if (this.partyBar && !(this.partyBar as any).destroyed) {
      this.partyBar.position.set(w / 2, 240);
    }
    if (this.partyHint && !(this.partyHint as any).destroyed) {
      this.partyHint.position.set(w / 2, 242);
    }
    this.layoutPanel(w);
    this.buildPartyBar();

    this.layoutGrid();
  }

  public override onUpdate(dt: number): void {
    this.heroList.update(dt);
  }

  private layoutPanel(w: number): void {
    this.panel.position.set((w - 700) / 2, 260);
    this.heroList.position.set(16, 16);
    this.heroList.resize(700 - 32, 980 - 32);
  }

  private layoutGrid(): void {
    const state = this.game.state.getSnapshot();
    const ownedMap = new Map(state.heroes.map((h) => [h.heroId, h] as const));
    const list = HEROES.slice();

    const rarityRank = (r: string) => (r === RARITY.SP ? 4 : r === RARITY.SSR ? 3 : r === RARITY.SR ? 2 : 1);
    list.sort((a, b) => {
      const ao = ownedMap.has(a.id) ? 1 : 0;
      const bo = ownedMap.has(b.id) ? 1 : 0;
      if (ao !== bo) return bo - ao;
      const ar = rarityRank(a.rarity),
        br = rarityRank(b.rarity);
      if (ar !== br) return br - ar;
      return a.name.localeCompare(b.name, 'zh');
    });

    this.heroListData = list;
    this.heroList.setItemCount(list.length);
    this.heroList.refresh(true);
  }

  private openHeroModal(heroId: string): void {
    if (!heroId) {
      this.game.toast.show('英雄ID缺失，无法打开详情。', 2);
      return;
    }
    const hero = HERO_MAP[heroId];
    if (!hero) {
      this.game.toast.show('英雄数据缺失，无法打开详情。', 2);
      return;
    }
    // Use live reference for display (will be rebuilt after upgrades).
    const owned = this.game.state.getOwnedHero(heroId);

    const modal = this.game.modal;
    modal.content.removeChildren();
    modal.content.sortableChildren = true;
    const panelW = modal.panel.width;
    const panelH = modal.panel.height;

    const title = createText(hero.name, 38, 0xffffff, '900');
    title.anchor.set(0.5);
    title.position.set(panelW / 2, 70);

    const card = new HeroCard(hero, owned);
    card.scale.set(1.35);
    card.position.set((panelW - card.w * 1.35) / 2, 140);

    // --- Card preview bottom layout (avoid overlap): name / element·rarity·stars / Lv ---
    const starsShow = owned ? Math.max(1, owned.stars || 0) : 1;
    const maxStars = Math.max(1, Math.floor((ECONOMY as any).starMax ?? 5));
    const maxLevel = Math.max(1, Math.floor((ECONOMY as any).heroMaxLevel ?? ECONOMY.levelCap ?? 100));
    const getStarCost = (stars: number) => {
      const table = (ECONOMY as any).starCost?.[hero.rarity] as number[] | undefined;
      return table?.[stars - 1] ?? 0;
    };

    // Cover original HeroCard bottom texts to prevent overlap when scaled in modal preview.
    const cover = new Graphics();
    cover.beginFill(0x0b1630, 0.78);
    cover.drawRoundedRect(8, card.h - 82, card.w - 16, 74, 12);
    cover.endFill();
    card.addChild(cover);

    const nameLine = createText(hero.name, 26, 0xffffff, '900');
    nameLine.anchor.set(0, 0);
    nameLine.position.set(18, card.h - 76);

    const classLabel = HERO_CLASS_LABEL[hero.class] ?? hero.class;
    const metaLine = createText(`${hero.element} · ${rarityLabel(hero.rarity)} · ${classLabel} · ${starsShow}★`, 20, 0xd7e6ff, '800');
    metaLine.anchor.set(0, 0);
    metaLine.position.set(18, card.h - 44);

    const lvLine = createText(owned ? `Lv.${owned.level}` : 'Lv.-', 22, 0xffe3a3, '900');
    lvLine.anchor.set(1, 0);
    lvLine.position.set(card.w - 18, card.h - 60);

    // Manual ellipsis for long names (Pixi Text doesn't auto-ellipsis).
    const maxNameW = card.w - 18 - 18 - 90; // leave room for Lv at right
    const fitName = (txt: any, maxW: number) => {
      const raw = String(txt.text ?? '');
      if (!raw) return;
      if (txt.width <= maxW) return;
      let t = raw;
      while (t.length > 1) {
        t = t.slice(0, -1);
        txt.text = t + '…';
        if (txt.width <= maxW) break;
      }
    };
    fitName(nameLine, maxNameW);

    card.addChild(nameLine, metaLine, lvLine);

    const desc = createText(
      owned
        ? `（占位描述）这是一名擅长${hero.element}系的英雄。`
        : '你尚未获得该英雄。',
      20,
      0xcfe3ff,
      '700',
    );
    desc.anchor.set(0.5, 0);
    desc.position.set(panelW / 2, 640);
    desc.style.align = 'center';
    desc.style.wordWrap = true;
    desc.style.wordWrapWidth = panelW - 90;

    const btnClose = new UIButton('关闭', 240, 80);
    btnClose.zIndex = 100;
    btnClose.position.set(80, panelH - 140);
    btnClose.on('pointertap', () => modal.close());

    const btnLevel = new UIButton('升级', 240, 80);
    btnLevel.zIndex = 101;
    btnLevel.position.set(panelW - 320, panelH - 140);
    btnLevel.on('pointertap', () => {
      if (!owned) {
        this.game.toast.show('未拥有该英雄，无法升级。', 2); // toast instead of native alert
        return;
      }

      const cost = ECONOMY.levelUpGoldBase + Math.floor((owned.level - 1) * 18);
      const res = this.game.state.tryLevelUpHero(heroId, cost, ECONOMY.levelCap);
      if (!res.ok) {
        this.game.toast.show(res.reason || '升级失败', 2); // toast instead of native alert
        return;
      }
      // Re-open to show updated level/cost
      this.openHeroModal(heroId);
    });

    // ---- Star upgrade (use dupe shards) ----
    const starsEff = starsShow;
    const shardKey = ECONOMY.dupeShardKey;
    const shardCount = this.game.state.getInventory(shardKey);
    const nextStarCost = owned ? getStarCost(starsEff) : 0;

    const btnParty = new UIButton(this.game.state.isInParty(heroId) ? "下阵" : "上阵", 240, 80);
    btnParty.zIndex = 102;
    btnParty.position.set(80, panelH - 240);
    btnParty.on("pointertap", () => {
      if (!owned) {
        this.game.toast.show("未拥有该英雄，无法上阵。", 2);
        return;
      }
      const res = this.game.state.toggleParty(heroId);
      if (!res.ok) {
        this.game.toast.show(res.reason ?? "操作失败", 2);
        return;
      }
      this.game.toast.show(this.game.state.isInParty(heroId) ? "已上阵" : "已下阵", 2);
      this.refresh();
      this.openHeroModal(heroId);
    });

    const btnStar = new UIButton(owned ? `升星 ${starsEff}★→${Math.min(maxStars, starsEff + 1)}★` : '升星', 240, 80);
    btnStar.zIndex = 102;
    btnStar.position.set(panelW - 320, panelH - 240);

    if (owned && starsEff >= maxStars) {
      btnStar.setLabel(`已满星（${maxStars}★）`);
      btnStar.setDisabled(true);
    } else {
      btnStar.on('pointertap', () => {
        if (!owned) {
          this.game.toast.show('未拥有该英雄，无法升星。', 2);
          return;
        }
        const res = this.game.state.upgradeStars(heroId);
        if (!res.ok) {
          this.game.toast.show(res.reason || '升星失败。', 2);
          return;
        }
        this.game.toast.show(`升星成功：${res.newStars ?? Math.min(maxStars, starsEff + 1)}★`, 2);
        this.openHeroModal(heroId);
      });
    }

    const starHint = owned
      ? createText(`消耗碎片：${starsEff >= maxStars ? '已满星' : nextStarCost}（拥有：${shardCount}）`, 18, 0xffe3a3, '800')
      : createText('获得后可升星（消耗万能碎片）', 18, 0xffe3a3, '800');
    starHint.anchor.set(0.5);
    starHint.position.set(panelW / 2, panelH - 268);

    const costHint = owned
      ? createText(`升级消耗：🪙 ${ECONOMY.levelUpGoldBase + Math.floor((owned.level - 1) * 18)}`, 18, 0xffe3a3, '800')
      : createText('获得后可升级（消耗金币）', 18, 0xffe3a3, '800');
    costHint.anchor.set(0.5);
    costHint.position.set(panelW / 2, panelH - 308);

    const xpHint = owned
      ? createText(
          owned.level >= maxLevel ? '经验：已满级' : `经验：${owned.xp ?? 0}/${this.getHeroXpNeed(owned.level)}`,
          18,
          0xffe3a3,
          '800',
        )
      : createText('获得后可使用经验道具升级', 18, 0xffe3a3, '800');
    xpHint.anchor.set(0.5);
    xpHint.position.set(panelW / 2, panelH - 348);

    // --- Live refresh for button disabled states (and prevent listener leaks) ---
    const refreshButtons = () => {
      const snapNow = this.game.state.getSnapshot();
      const ownedNow = snapNow.heroes.find((h) => h.heroId === heroId);
      const goldNow = snapNow.gold || 0;
      const shardsNow = snapNow.inventory[shardKey] || 0;

      // Party button (label + capacity guard)
      const inPartyNow = this.game.state.isInParty(heroId);
      const partyCountNow = (this.game.state.partyHeroIds ?? []).length;
      btnParty.setLabel(inPartyNow ? '下阵' : '上阵');
      if (!ownedNow) {
        // keep enabled so user gets the toast message on click
        btnParty.setDisabled(false);
      } else {
        // when not in party and party is full, disable "上阵"
        btnParty.setDisabled(!inPartyNow && partyCountNow >= 5);
      }

      // Level button disabled when not owned or gold不足
      if (!ownedNow) {
        btnLevel.setDisabled(true);
      } else {
        const lvlCost = ECONOMY.levelUpGoldBase + Math.floor((ownedNow.level - 1) * 18);
        btnLevel.setDisabled(goldNow < lvlCost);
      }

      // Star button disabled when not owned /满星/碎片不足
      if (!ownedNow) {
        btnStar.setDisabled(false); // allow click to show "未拥有..." toast
        starHint.text = '获得后可升星（消耗万能碎片）';
      } else {
        const curStarsNow = Math.max(1, ownedNow.stars || 0);
        if (curStarsNow >= maxStars) {
          btnStar.setLabel(`已满星（${maxStars}★）`);
          btnStar.setDisabled(true);
          starHint.text = `消耗碎片：已满星（拥有：${shardsNow}）`;
        } else {
          const need = getStarCost(curStarsNow);
          btnStar.setLabel(`升星 ${curStarsNow}★→${Math.min(maxStars, curStarsNow + 1)}★`);
          btnStar.setDisabled(need <= 0 || shardsNow < need);
          starHint.text = need <= 0 ? '升星配置异常' : `消耗碎片：${need}（拥有：${shardsNow}）`;
        }
      }

      // Keep upgrade cost hint updated
      if (!ownedNow) {
        costHint.text = '获得后可升级（消耗金币）';
        xpHint.text = '获得后可使用经验道具升级';
      } else {
        costHint.text = `升级消耗：🪙 ${ECONOMY.levelUpGoldBase + Math.floor((ownedNow.level - 1) * 18)}`;
        xpHint.text = ownedNow.level >= maxLevel ? '经验：已满级' : `经验：${ownedNow.xp ?? 0}/${this.getHeroXpNeed(ownedNow.level)}`;
      }
    };
    // Version/build marker (UI-only) for quick identification.
    const vMark = createText(`${GAME_VERSION} · build ${BUILD_TIME}`, 14, 0x8fb3ff, '700');
    vMark.anchor.set(0, 1);
    vMark.position.set(24, panelH - 18);


    const prevOnClose = modal.onClose;
    const unInv = this.game.state.on('inventoryChanged', () => refreshButtons());
    const unCur = this.game.state.on('currencyChanged', () => refreshButtons());
    modal.onClose = () => {
      try { unInv(); } catch (_) {}
      try { unCur(); } catch (_) {}
      modal.onClose = prevOnClose;
      prevOnClose?.();
    };

    // Initial state for disabled/buttons/hints.
    refreshButtons();

    modal.content.addChild(title, card, desc, costHint, xpHint, starHint, vMark, btnClose, btnParty, btnStar, btnLevel);
    modal.open();
  }

  // Phase 2: refreshed by subscriptions.

  private buildPartyBar(): void {
    // Render 5-slot party bar (visual only; persisted order = partyHeroIds[0..4])
    if (!this.partyBar || (this.partyBar as any).destroyed) return;
    this.partyBar.removeChildren();
    this.partySlotNodes = [];

    const ids = [...(this.game.state.partyHeroIds ?? [])].slice(0, 5);
    const slotW = 120;
    const slotH = 64;
    const gap = 12;
    const totalW = slotW * 5 + gap * 4;
    const startX = -totalW / 2;

    for (let i = 0; i < 5; i++) {
      const heroId = ids[i] || '';
      const slot = new Container();
      slot.position.set(startX + i * (slotW + gap), 0);
      slot.interactive = true;

      const box = new Graphics();
      box.beginFill(0x0b1630, 0.82);
      box.lineStyle(2, i === this.selectingSlot ? 0x5fa6ff : 0x2b3c6b, i === this.selectingSlot ? 1 : 0.75);
      box.drawRoundedRect(0, 0, slotW, slotH, 14);
      box.endFill();

      const labelTxt = heroId ? (HERO_MAP[heroId]?.name ?? heroId) : '+';
      const label = createText(labelTxt, heroId ? 20 : 28, heroId ? 0xffffff : 0x8fb3ff, '900');
      label.anchor.set(0.5);
      label.position.set(slotW / 2, slotH / 2 + 1);

      slot.addChild(box, label);

      slot.on('pointertap', () => {
        const cur = [...(this.game.state.partyHeroIds ?? [])].slice(0, 5);
        const curHero = cur[i] || '';
        if (curHero) {
          if (this.selectingSlot === i) {
            this.selectingSlot = null;
            this.game.state.removeFromParty(curHero);
            this.game.toast.show('已下阵', 2);
            return;
          }
          this.selectingSlot = i;
          this.game.toast.show('选择英雄替换该槽位（再次点该槽位可下阵）', 2);
          this.buildPartyBar();
          return;
        }
        this.selectingSlot = i;
        this.game.toast.show('选择英雄上阵到该槽位', 2);
        this.buildPartyBar();
      });

      this.partyBar.addChild(slot);
      this.partySlotNodes.push({ box, label, heroId: heroId || null });
    }

    const tip = createText('点槽位选英雄 / 再次点同槽位下阵', 18, 0xd7e6ff, '800');
    tip.anchor.set(0.5);
    tip.position.set(0, slotH + 18);
    this.partyBar.addChild(tip);

    if (ids.length === 0) {
      const btnAuto = new UIButton('自动上阵', 220, 64);
      btnAuto.position.set(-110, slotH + 46);
      btnAuto.on('pointertap', () => {
        const snap = this.game.state.getSnapshot();
        const owned = [...(snap.heroes ?? [])].filter((h) => !!h && !!HERO_MAP[h.heroId]);
        owned.sort((a, b) => (b.level || 1) - (a.level || 1) || String(a.heroId).localeCompare(String(b.heroId)));
        const pick = owned.slice(0, 5).map((h) => h.heroId);
        if (pick.length < 1) {
          this.game.toast.show('没有可上阵的英雄', 2);
          return;
        }
        this.selectingSlot = null;
        this.game.state.setPartyHeroIds(pick);
        this.game.toast.show('已自动上阵', 2);
      });
      this.partyBar.addChild(btnAuto);
    }
  }

  private tryAssignPartySlot(heroId: string): boolean {
    if (this.selectingSlot === null) return false;

    const slot = this.selectingSlot;
    const owned = this.game.state.getOwnedHero(heroId);
    if (!owned) {
      this.game.toast.show('未拥有该英雄，无法上阵。', 2);
      return true;
    }

    const cur = [...(this.game.state.partyHeroIds ?? [])].slice(0, 5);
    const alreadyIndex = cur.indexOf(heroId);

    if (alreadyIndex >= 0 && alreadyIndex !== slot) {
      this.game.toast.show('该英雄已在队伍中。', 2);
      return true;
    }

    if (slot >= cur.length) {
      cur.push(heroId);
    } else {
      cur[slot] = heroId;
    }

    // Remove duplicates if any
    const next = cur.filter((id, idx) => id && (id !== heroId || idx === slot));
    this.selectingSlot = null;
    this.game.state.setPartyHeroIds(next);
    this.game.toast.show('已上阵', 2);
    return true;
  }


  public refresh(): void {
    const partyCount = (this.game.state.partyHeroIds ?? []).length;
    if (this.partyText && !(this.partyText as any).destroyed) {
      this.partyText.text = `队伍：${partyCount}/5`;
    }

    this.buildPartyBar();

    this.layoutGrid();
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

  public override onExit(): void {
    // Unbind state subscriptions to avoid leaks / callbacks after scene removed.
    this._unsubHeroesChanged?.();
    this._unsubHeroesChanged = null;
    this._unsubPartyChanged?.();
    this._unsubPartyChanged = null;

    // Ensure any hero detail modal is closed when leaving the scene.
    // This prevents ticker/event callbacks from updating UI that is no longer relevant.
    try { this.game.modal.close(); } catch (_) {}
    this.wheelUnbind?.();
    this.wheelUnbind = null;
  }
}
