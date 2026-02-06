import { Container, Graphics, Text } from 'pixi.js';
import type { HeroDef } from '../../game/data';
import type { OwnedHero } from '../../game/storage';
import { createText, elementColor, rarityColor, rarityLabel, roundedRect } from '../uiFactory';

/**
 * A reusable hero card.
 *
 * In phase 1 it is a pure Pixi component and uses only placeholder graphics.
 * Later phases can swap the portrait renderer (sprite/Spine/...)
 * without changing the scene logic.
 */
export default class HeroCard extends Container {
  public readonly w = 214;
  public readonly h = 268;
  public readonly hero: HeroDef;
  private owned: OwnedHero | undefined;
  private inParty = false;

  private readonly bg: Graphics;
  private readonly portrait: Container;
  private readonly nameTxt: Text;
  private readonly tagTxt: Text;
  private readonly levelTxt: Text;
  public readonly glow: Graphics;

  private readonly partyBadge: Container;
  private readonly partyBadgeBg: Graphics;
  private readonly partyBadgeTxt: Text;

  constructor(hero: HeroDef, owned?: OwnedHero) {
    super();
    this.hero = hero;
    this.owned = owned;

    this.bg = new Graphics();
    this.addChild(this.bg);

    this.portrait = new Container();
    this.addChild(this.portrait);

    this.nameTxt = createText(hero.name, 24, 0xffffff, '800');
    this.nameTxt.anchor.set(0.5);
    this.addChild(this.nameTxt);

    this.tagTxt = createText(`${hero.element} · ${rarityLabel(hero.rarity)}`, 18, 0xd7e6ff, '700');
    this.tagTxt.anchor.set(0.5);
    this.addChild(this.tagTxt);

    this.levelTxt = createText('', 20, 0xffffff, '800');
    this.levelTxt.anchor.set(1, 1);
    this.addChild(this.levelTxt);

    this.glow = new Graphics();
    this.addChild(this.glow);

    // "In party" badge (top-right). Hidden by default.
    this.partyBadge = new Container();
    this.partyBadge.zIndex = 50;
    this.partyBadgeBg = new Graphics();
    this.partyBadgeTxt = createText('上阵中', 16, 0xffffff, '900');
    this.partyBadgeTxt.anchor.set(0.5);
    this.partyBadge.addChild(this.partyBadgeBg, this.partyBadgeTxt);
    this.addChild(this.partyBadge);

    this.interactive = true;
    this.cursor = 'pointer';

    this.draw();
    this.refresh();
  }

  private draw(): void {
    const w = this.w,
      h = this.h;
    const rc = rarityColor(this.hero.rarity);

    this.bg.clear();
    this.bg.beginFill(0x0e1733, 0.98);
    this.bg.lineStyle(4, rc, 1);
    roundedRect(this.bg, 0, 0, w, h, 18);
    this.bg.endFill();

    // portrait placeholder
    this.portrait.removeChildren();
    const p = new Graphics();
    p.beginFill(0x000000, 0.25);
    roundedRect(p, 14, 14, w - 28, 150, 16);
    p.endFill();

    const ring = new Graphics();
    ring.lineStyle(6, elementColor(this.hero.element), 0.95);
    ring.beginFill(0xffffff, 0.08);
    ring.drawCircle(w / 2, 14 + 75, 50);
    ring.endFill();

    const letter = createText(this.hero.name.slice(0, 1), 54, 0xffffff, '900');
    letter.anchor.set(0.5);
    letter.position.set(w / 2, 14 + 75);

    this.portrait.addChild(p, ring, letter);

    this.nameTxt.position.set(w / 2, 196);
    this.tagTxt.position.set(w / 2, 226);
    this.levelTxt.position.set(w - 14, h - 12);

    // Party badge layout (avoid covering bottom texts).
    const bw = 74;
    const bh = 28;
    this.partyBadge.position.set(w - 14 - bw, 12);
    this.partyBadgeBg.clear();
    this.partyBadgeBg.beginFill(0x2bc26b, 0.95);
    roundedRect(this.partyBadgeBg, 0, 0, bw, bh, 10);
    this.partyBadgeBg.endFill();
    this.partyBadgeTxt.position.set(bw / 2, bh / 2 + 0.5);

    this.glow.clear();
    this.glow.beginFill(rc, 0.1);
    roundedRect(this.glow, 8, 8, w - 16, h - 16, 16);
    this.glow.endFill();
  }

  public setOwned(owned?: OwnedHero): void {
    this.owned = owned;
    this.refresh();
  }

  public setInParty(inParty: boolean): void {
    this.inParty = !!inParty;
    this.refresh();
  }

  public refresh(): void {
    if (this.owned) {
      this.levelTxt.text = 'Lv.' + (this.owned.level || 1);
      this.alpha = 1;
    } else {
      this.levelTxt.text = '';
      this.alpha = 0.6;
    }

    // Only show badge when hero is currently in party.
    this.partyBadge.visible = this.inParty;
  }
}
