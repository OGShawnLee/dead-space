/**
 * Single source of truth for every color in the game (world, entities, and,
 * via `applyCssPalette`, the DOM/menus). No hex literals outside this file.
 *
 * Saturation rule:
 *  - `core`  saturated; only small emissives and Isaac's own tech (RIG, visor, stasis, laser).
 *  - `mid`   world surfaces and objects (pickups, escape room, beacons).
 *  - `dim`   matches the desaturated holographic menus.
 *
 * Values marked "legacy" equal what the code used before this file existed, so
 * migrating a call site to them changes nothing visually.
 */

const signal = (core: number, mid: number, dim: number) => ({ core, mid, dim });

export const PALETTE = {
  /** Muted teal-gray industrial metal ramp (hue ~190, low saturation), darkest to lightest. */
  metal: {
    void: 0x050809, // fog, deep shadow
    m900: 0x0d1417,
    m800: 0x162126,
    m700: 0x23323a,
    steel: 0x2b4048, // teal-gray cargo steel
    m500: 0x3d5259,
    m300: 0x70898f
  },
  /** Scene ambient tint. */
  ambient: 0x08131a,
  /** Warmer atmosphere for industrial areas (engineering). */
  ambientWarm: 0x10140f,
  fogWarm: 0x080b09,
  /** Worn bronze / rust / grease (Isaac's suit, grime). */
  rust: {
    bronze: 0x8a6a43,
    rust: 0x5c4528,
    grease: 0x2d2214
  },
  cyan: signal(0x00f0ff, 0x4fa3ad, 0x9fc9d0),
  amber: signal(0xff9900, 0xb08a50, 0xd6b889),
  red: signal(0xff2222, 0xa8534c, 0xff9a8f),
  green: signal(0x00ff66, 0x4f9a78, 0x8ff0b5),
  flesh: {
    skin: 0xb4bcb6, // bone / chitin, pale teal-gray
    bone: 0x6f7d7c,
    blood: 0x990000,
    viscera: 0x770000,
    leather: 0x25343a, // Leaper hide / dark chitin
    sallow: 0x657a76, // Leaper skin (greenish teal-gray)
    pallid: 0x7a8a90 // Exploder skin (pale blue-gray)
  },
  /** Explosions and fire (legacy values). */
  fire: {
    flame: 0xff7700,
    blast: 0xff6600
  },
  /** Desaturated holographic UI ink (menus, inventory). */
  ui: {
    white: 0xffffff,
    bright: 0xf4fbfc,
    ink: 0xe4f1f3,
    soft: 0xdbe7e9,
    dim: 0x9fb9be,
    dark: 0x0c1416,
    text: 0xcfd8dc,
    hint: 0xffb18a
  },
  light: {
    corridor: 0xcfe6e8, // cold teal-white practical light
    flashlight: 0xcfe8ee
  }
} as const;

export const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

/** Exposes the palette to CSS as `--c-<family>-<token>` custom properties. */
export function applyCssPalette(root: HTMLElement = document.documentElement): void {
  for (const [family, tokens] of Object.entries(PALETTE)) {
    if (typeof tokens === 'number') {
      root.style.setProperty(`--c-${family}`, hex(tokens));
      continue;
    }
    for (const [name, value] of Object.entries(tokens)) {
      root.style.setProperty(`--c-${family}-${name}`, hex(value as number));
    }
  }
}
