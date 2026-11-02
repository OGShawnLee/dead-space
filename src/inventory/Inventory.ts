import { ITEMS, type ItemId, type ItemUseContext } from './ItemDefs';

/**
 * Inventory model (pure: no DOM, no Three.js).
 * Single source of truth for everything Isaac carries. Gameplay code and the
 * holographic inventory UI read and mutate it only through this API.
 */

export interface InventorySlot {
  itemId: ItemId;
  count: number;
}

export type InventoryListener = (inv: Inventory) => void;

export class Inventory {
  readonly cols: number;
  readonly rows: number;
  /** Grid slots, row-major. `null` = empty. */
  readonly slots: (InventorySlot | null)[];
  /** Weapon ring (equipped weapons, outside the grid). */
  readonly weapons: ItemId[] = [];
  nodes = 0;
  credits = 0;

  private listeners = new Set<InventoryListener>();

  constructor(cols = 5, rows = 3) {
    this.cols = cols;
    this.rows = rows;
    this.slots = new Array(cols * rows).fill(null);
  }

  // ───────────────────────────── Queries ─────────────────────────────

  count(id: ItemId): number {
    if (ITEMS[id].category === 'weapon') return this.weapons.includes(id) ? 1 : 0;
    return this.slots.reduce((sum, s) => sum + (s && s.itemId === id ? s.count : 0), 0);
  }

  has(id: ItemId, amount = 1): boolean {
    return this.count(id) >= amount;
  }

  /** How many more units of `id` fit (free stack space + empty slots). */
  spaceFor(id: ItemId): number {
    const def = ITEMS[id];
    if (def.category === 'weapon') return this.weapons.includes(id) ? 0 : 1;
    let space = 0;
    for (const s of this.slots) {
      if (!s) space += def.maxStack;
      else if (s.itemId === id) space += def.maxStack - s.count;
    }
    return space;
  }

  // ───────────────────────────── Mutations ─────────────────────────────

  /**
   * Adds up to `amount` units, topping up existing stacks first, then empty slots.
   * Returns the number actually added.
   */
  add(id: ItemId, amount: number): number {
    const def = ITEMS[id];
    if (amount <= 0) return 0;

    if (def.category === 'weapon') {
      if (this.weapons.includes(id)) return 0;
      this.weapons.push(id);
      this.emit();
      return 1;
    }

    let left = amount;
    for (const s of this.slots) {
      if (left <= 0) break;
      if (s && s.itemId === id && s.count < def.maxStack) {
        const n = Math.min(left, def.maxStack - s.count);
        s.count += n;
        left -= n;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(left, def.maxStack);
        this.slots[i] = { itemId: id, count: n };
        left -= n;
      }
    }

    const added = amount - left;
    if (added > 0) this.emit();
    return added;
  }

  /** Removes up to `amount` units, draining the last stacks first. Returns units removed. */
  remove(id: ItemId, amount: number): number {
    let left = amount;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.itemId === id) {
        const n = Math.min(left, s.count);
        s.count -= n;
        left -= n;
        if (s.count === 0) this.slots[i] = null;
      }
    }
    const removed = amount - left;
    if (removed > 0) this.emit();
    return removed;
  }

  canUseSlot(index: number, ctx: ItemUseContext): boolean {
    const s = this.slots[index];
    if (!s) return false;
    const def = ITEMS[s.itemId];
    return !!def.use && (def.canUse ? def.canUse(ctx) : true);
  }

  /** Uses one unit from a grid slot. Returns true if the item was consumed. */
  useSlot(index: number, ctx: ItemUseContext): boolean {
    const s = this.slots[index];
    if (!s || !this.canUseSlot(index, ctx)) return false;
    if (!ITEMS[s.itemId].use!(ctx)) return false;
    s.count--;
    if (s.count === 0) this.slots[index] = null;
    this.emit();
    return true;
  }

  /** Uses one unit of `id` from wherever it is stored. */
  useItem(id: ItemId, ctx: ItemUseContext): boolean {
    const index = this.slots.findIndex(s => s && s.itemId === id);
    return index >= 0 && this.useSlot(index, ctx);
  }

  // ───────────────────────────── Events ─────────────────────────────

  onChange(fn: InventoryListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach(fn => fn(this));
  }
}
