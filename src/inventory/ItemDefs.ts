import type { Player } from '../entities/Player';

/**
 * Item registry (data only).
 * Adding a new item = one entry here. The inventory, pickups and (later) the
 * holographic inventory UI all read from this table.
 */

export type ItemId = 'plasma_cutter' | 'plasma_energy' | 'med_small' | 'stasis_pack';

export type ItemCategory = 'weapon' | 'consumable' | 'ammo' | 'key' | 'log';

export interface ItemUseContext {
  player: Player;
}

export interface ItemDef {
  id: ItemId;
  name: string;
  description: string;
  category: ItemCategory;
  /** Units per grid slot. Weapons live in the weapon ring, not in the grid. */
  maxStack: number;
  /** Units granted by one world pickup. */
  pickupAmount: number;
  /** Applies the effect. The inventory removes one unit only if this returns true. */
  use?: (ctx: ItemUseContext) => boolean;
  /** Greys the item out in the UI and blocks `use` (e.g. med pack at full health). */
  canUse?: (ctx: ItemUseContext) => boolean;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  plasma_cutter: {
    id: 'plasma_cutter',
    name: 'Cortador de Plasma',
    description: 'Herramienta minera 211-V. Tres haces de plasma ideales para cortar extremidades.',
    category: 'weapon',
    maxStack: 1,
    pickupAmount: 1
  },
  plasma_energy: {
    id: 'plasma_energy',
    name: 'Energía de plasma',
    description: 'Células de plasma para el Cortador. Se consumen automáticamente al recargar.',
    category: 'ammo',
    maxStack: 25,
    pickupAmount: 15
  },
  med_small: {
    id: 'med_small',
    name: 'Botiquín pequeño',
    description: 'Paquete de gel médico que restaura 50 puntos de salud del RIG.',
    category: 'consumable',
    maxStack: 5,
    pickupAmount: 1,
    canUse: ({ player }) => !player.isDead && player.hp < player.maxHp,
    use: ({ player }) => player.applyHealing(50)
  },
  stasis_pack: {
    id: 'stasis_pack',
    name: 'Paquete de estasis',
    description: 'Batería C.E.C. que recarga por completo el módulo de estasis.',
    category: 'consumable',
    maxStack: 3,
    pickupAmount: 1,
    canUse: ({ player }) => !player.isDead && player.stasisCharges < player.maxStasisCharges,
    use: ({ player }) => {
      player.rechargeStasis(player.maxStasisCharges);
      return true;
    }
  }
};

export const getItem = (id: ItemId): ItemDef => ITEMS[id];
