import type { Inventory } from '../Inventory';
import type { Player } from '../../entities/Player';
import type { SoundSystem } from '../../core/SoundSystem';

/**
 * Contract between the HoloInventory shell and its tabs.
 * A new tab (Mission, Logs, Map, Schematics...) is one class implementing this
 * interface plus one `register()` call; the shell never changes.
 */

export interface TabContext {
  inventory: Inventory;
  player: Player;
  sound: SoundSystem;
  /** Short on-screen message (same toast used for pickups). */
  notify(msg: string): void;
}

export interface Hint {
  keys: string[];
  label: string;
}

export type NavDir = 'up' | 'down' | 'left' | 'right';

export interface HoloTab {
  id: string;
  /** Header text, e.g. "INVENTARIO". */
  title: string;
  /** Inline SVG markup for the tab bar (uses `currentColor`). */
  icon: string;
  /** Builds the tab DOM once, inside `root`. */
  mount(root: HTMLElement, ctx: TabContext): void;
  /** Called every time the tab becomes visible. */
  onShow(): void;
  /** Re-reads game state (also called periodically while open). */
  refresh(): void;
  onNav(dir: NavDir): void;
  onConfirm(): void;
  footerHints(): Hint[];
}
