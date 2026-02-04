import { Container, Graphics } from 'pixi.js';
import { ResourceBar } from '../ui/ResourceBar';
import { FormationGrid } from '../ui/FormationGrid';
import { BottomMenu } from '../ui/BottomMenu';
import { Theme } from '../utils/theme';
import { LayoutSystem } from '../systems/LayoutSystem';
import { initialResources } from '../data/resources';

export class MainScene extends Container {
  private layoutSystem: LayoutSystem;
  private background: Graphics;
  private resourceBar: ResourceBar;
  private formationGrid: FormationGrid;
  private bottomMenu: BottomMenu;

  constructor(width: number, height: number) {
    super();

    this.layoutSystem = new LayoutSystem(width, height);

    this.background = new Graphics();
    this.addChild(this.background);

    this.resourceBar = new ResourceBar([
      { label: initialResources[0].label, value: initialResources[0].value, color: Theme.colors.gold },
      { label: initialResources[1].label, value: initialResources[1].value, color: Theme.colors.gem },
      { label: initialResources[2].label, value: initialResources[2].value, color: Theme.colors.energy },
    ]);

    this.formationGrid = new FormationGrid(6);
    this.bottomMenu = new BottomMenu();

    this.addChild(this.resourceBar, this.formationGrid, this.bottomMenu);
  }

  resize(width: number, height: number) {
    this.layoutSystem.update(width, height);
    const layout = this.layoutSystem.layout;

    this.background.clear();
    this.background.beginFill(Theme.colors.background).drawRect(0, 0, layout.width, layout.height).endFill();

    this.resourceBar.updateLayout(layout);
    this.formationGrid.updateLayout(layout);
    this.bottomMenu.updateLayout(layout);
  }
}
