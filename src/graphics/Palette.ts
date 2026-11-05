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
  /** Cold industrial metal ramp, darkest to lightest. */
  metal: {
    void: 0x050608, // legacy: fog, deep shadow
    m900: 0x0e1014,
    m800: 0x16181c,
    m700: 0x22262c,
    m500: 0x3d4450,
    m300: 0x6b7280
  },
  /** Scene ambient tint. */
  ambient: 0x080b12, // legacy
  /** Worn bronze / rust / grease (Isaac's suit, grime). */
  rust: {
    bronze: 0x8a6a43,
    rust: 0x5c4528,
    grease: 0x2d2214
  },
  cyan: signal(0x00f0ff, 0x2fa3b3, 0x86bcc7),
  amber: signal(0xff9900, 0xc98a2e, 0xe0b070),
  red: signal(0xff2222, 0xb8403a, 0xff9a8f),
  green: signal(0x00ff66, 0x3aa86a, 0x8ff0b5),
  flesh: {
    skin: 0xd8c8b8,
    bone: 0x83776e,
    blood: 0x990000,
    viscera: 0x770000,
    leather: 0x2d3748 // Leaper hide
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
    corridor: 0xd8e8ff, // legacy: cold practical light
    flashlight: 0xd4e9ff // legacy
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
