import { ITEMS } from '../ItemDefs';
import { getItemIcon } from '../ItemIcons';
import type { Hint, HoloTab, NavDir, TabContext } from './HoloTab';

const WEAPON_RING_SLOTS = 4;
const KEY_ITEM_SLOTS = 6;

// TODO(proposal 002): read from the suit model once oxygen / armor exist
const SUIT_LEVEL = 1;
const SUIT_AIR_SECONDS = 70;
const SUIT_ARMOR_PCT = 0;

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Inventory tab: weapon ring, key items, the 5x3 grid, suit / nodes / credits and the
 * description bar, laid out like the original.
 */
export class InventoryTab implements HoloTab {
  id = 'inventory';
  title = 'INVENTARIO';
  icon = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="5" height="5"/><rect x="9.5" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="9.5" width="5" height="5"/><rect x="9.5" y="9.5" width="5" height="5"/><rect x="16" y="9.5" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><rect x="9.5" y="16" width="5" height="5"/><rect x="16" y="16" width="5" height="5"/></svg>';

  private ctx!: TabContext;
  private cells: HTMLElement[] = [];
  private weaponCells: HTMLElement[] = [];
  private nodesEl!: HTMLElement;
  private creditsEl!: HTMLElement;
  private descIcon!: HTMLImageElement;
  private descTitle!: HTMLElement;
  private descText!: HTMLElement;
  private descHint!: HTMLElement;
  private focus = 0;

  mount(root: HTMLElement, ctx: TabContext): void {
    this.ctx = ctx;
    const { cols, rows } = ctx.inventory;

    root.innerHTML = `
      <div class="hi-inv">
        <div class="hi-left">
          <div class="hi-label">ARMAS</div>
          <div class="hi-weapons">${'<div class="hi-hex"><img alt=""></div>'.repeat(WEAPON_RING_SLOTS)}</div>
          <div class="hi-label">OBJETOS CLAVE</div>
          <div class="hi-keyitems">${'<div class="hi-cell is-empty"></div>'.repeat(KEY_ITEM_SLOTS)}</div>
        </div>

        <div class="hi-grid" style="--cols:${cols};--rows:${rows}">
          ${Array.from({ length: cols * rows }, (_, i) =>
            `<div class="hi-cell" data-index="${i}"><img alt=""><span class="hi-count"></span></div>`
          ).join('')}
        </div>

        <div class="hi-right">
          <div class="hi-label">TRAJE</div>
          <div class="hi-suit">
            <div class="hi-suit-level">TRAJE NIVEL ${SUIT_LEVEL}</div>
            <div class="hi-stat"><span>AIRE</span><span>${SUIT_AIR_SECONDS}s</span></div>
            <div class="hi-stat"><span>ARMADURA</span><span>${SUIT_ARMOR_PCT}%</span></div>
          </div>
          <div class="hi-label">NODOS</div>
          <div class="hi-value hi-nodes">0</div>
          <div class="hi-label">CRÉDITOS</div>
          <div class="hi-value hi-credits">0</div>
        </div>

        <div class="hi-desc">
          <img class="hi-desc-icon" alt="">
          <div class="hi-desc-title"></div>
          <div class="hi-desc-text"></div>
          <div class="hi-desc-hint"></div>
        </div>
      </div>
    `;

    this.cells = Array.from(root.querySelectorAll<HTMLElement>('.hi-grid .hi-cell'));
    this.weaponCells = Array.from(root.querySelectorAll<HTMLElement>('.hi-hex'));
    this.nodesEl = root.querySelector('.hi-nodes') as HTMLElement;
    this.creditsEl = root.querySelector('.hi-credits') as HTMLElement;
    this.descIcon = root.querySelector('.hi-desc-icon') as HTMLImageElement;
    this.descTitle = root.querySelector('.hi-desc-title') as HTMLElement;
    this.descText = root.querySelector('.hi-desc-text') as HTMLElement;
    this.descHint = root.querySelector('.hi-desc-hint') as HTMLElement;

    this.cells.forEach((cell, i) => {
      cell.addEventListener('mouseenter', () => {
        if (this.focus !== i) {
          this.focus = i;
          this.ctx.sound.playUiMove();
          this.refresh();
        }
      });
      cell.addEventListener('click', () => {
        this.focus = i;
        this.onConfirm();
      });
    });
  }

  onShow(): void {
    this.focus = Math.max(0, this.cells.findIndex((_, i) => this.ctx.inventory.slots[i]));
    this.refresh();
  }

  refresh(): void {
    const inv = this.ctx.inventory;

    this.cells.forEach((cell, i) => {
      const slot = inv.slots[i];
      const img = cell.querySelector('img') as HTMLImageElement;
      const count = cell.querySelector('.hi-count') as HTMLElement;
      const def = slot ? ITEMS[slot.itemId] : null;

      cell.classList.toggle('is-empty', !slot);
      cell.classList.toggle('is-focused', i === this.focus);
      cell.classList.toggle('is-disabled', !!def?.use && !inv.canUseSlot(i, this.ctx));
      if (slot && def) {
        img.src = getItemIcon(slot.itemId);
        count.textContent = slot.count > 1 ? String(slot.count) : '';
      } else {
        img.removeAttribute('src');
        count.textContent = '';
      }
    });

    this.weaponCells.forEach((hex, i) => {
      const id = inv.weapons[i];
      const img = hex.querySelector('img') as HTMLImageElement;
      hex.classList.toggle('is-empty', !id);
      if (id) img.src = getItemIcon(id);
      else img.removeAttribute('src');
    });

    this.nodesEl.textContent = String(inv.nodes);
    this.creditsEl.textContent = inv.credits.toLocaleString('en-US');
    this.refreshDescription();
  }

  private refreshDescription(): void {
    const inv = this.ctx.inventory;
    const slot = inv.slots[this.focus];
    if (!slot) {
      this.descIcon.removeAttribute('src');
      this.descIcon.hidden = true;
      this.descTitle.textContent = 'ESPACIO VACÍO';
      this.descText.textContent = '';
      this.descHint.textContent = '';
      return;
    }

    const def = ITEMS[slot.itemId];
    this.descIcon.hidden = false;
    this.descIcon.src = getItemIcon(slot.itemId);
    this.descTitle.textContent = def.name.toUpperCase();
    this.descText.innerHTML = escapeHtml(def.description);
    this.descHint.textContent = !def.use
      ? ''
      : inv.canUseSlot(this.focus, this.ctx) ? '' : 'No disponible en este momento';
  }

  onNav(dir: NavDir): void {
    const { cols, rows } = this.ctx.inventory;
    let col = this.focus % cols;
    let row = Math.floor(this.focus / cols);
    if (dir === 'left') col = Math.max(0, col - 1);
    else if (dir === 'right') col = Math.min(cols - 1, col + 1);
    else if (dir === 'up') row = Math.max(0, row - 1);
    else row = Math.min(rows - 1, row + 1);

    const next = row * cols + col;
    if (next !== this.focus) {
      this.focus = next;
      this.ctx.sound.playUiMove();
      this.refresh();
    }
  }

  onConfirm(): void {
    const { inventory, player, sound, notify } = this.ctx;
    const slot = inventory.slots[this.focus];
    if (!slot) return;

    const def = ITEMS[slot.itemId];
    if (inventory.useSlot(this.focus, { player })) {
      sound.playUiSelect();
      notify(`${def.name} usado`);
      const cell = this.cells[this.focus];
      cell.classList.remove('is-pressed');
      void cell.offsetWidth;
      cell.classList.add('is-pressed');
    } else {
      sound.playUiBack();
    }
    this.refresh();
  }

  footerHints(): Hint[] {
    return [
      { keys: ['W', 'A', 'S', 'D'], label: 'NAVEGAR' },
      { keys: ['ENTER'], label: 'USAR' },
      { keys: ['TAB'], label: 'SALIR' }
    ];
  }
}
