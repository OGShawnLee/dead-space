/**
 * Single source of truth for every color in the game (world, entities, and,
 * via `applyCssPalette`, the DOM/menus). No hex literals outside this file.
 *
 * Saturation rule:
 *  - `core`  saturated; only small emissives and strong signals (alarms).
 *  - `rig`   desaturated state lights for Isaac's tech (RIG spine, visor, stasis, cutter).
 *  - `mid`   world surfaces and objects (pickups, escape room, beacons).
 *  - `dim`   matches the desaturated holographic menus.
 *
 * Values marked "legacy" equal what the code used before this file existed, so
 * migrating a call site to them changes nothing visually.
 */

const signal = (core: number, mid: number, dim: number) => ({ core, mid, dim });

/** Muted teal-gray industrial metal ramp (hue ~190, low saturation), darkest to lightest. */
const metal = {
  void: 0x050809, // fog, deep shadow
  m900: 0x0d1417,
  m800: 0x162126,
  m700: 0x23323a,
  steel: 0x2b4048, // teal-gray cargo steel
  m500: 0x3d5259,
  m300: 0x70898f
};

export const PALETTE = {
  metal,
  /** Scene ambient tint. */
  ambient: 0x08131a,
  /** Warmer atmosphere for industrial areas (engineering). */
  ambientWarm: 0x10140f,
  fogWarm: 0x080b09,
  /** Worn rust / grease (legacy suit texture, grime). */
  rust: {
    rust: 0x5c4528,
    grease: 0x2d2214
  },
  /**
   * Isaac's Level 1 RIG suit: olive fabric, black panels, aged copper.
   * Refined against the reference turnaround (lit samples, lifted toward albedo).
   */
  suit: {
    fabric: 0x50554b, // olive-gray jacket
    fabricDark: 0x2d302c, // charcoal trousers
    panel: 0x181b1b, // black shoulder caps, side panels, gloves
    strap: 0x2b2925, // belts, leather
    copper: 0x8e6a4c, // base copper (helmet, bracers, boots)
    copperDark: 0x4f3a2a, // recesses, boot shadow side
    copperHi: 0xb48e6c, // worn edges
    patina: 0x55746a, // teal oxidation in crevices
    brass: 0xa88d5c // buckles, clips
  },
  /**
   * Desaturated state lights for Isaac's tech (owner decision, Proposal 005 11.1):
   * RIG spine, visor, stasis gauge, cutter hologram, lasers, stasis shot.
   * State order: ok > warn > crit > off.
   */
  rig: {
    ok: 0x8fd4dc, // nominal / full: pale cyan
    warn: 0xd9a461, // mid state: muted orange
    crit: 0xc9615a, // critical: muted red
    off: metal.m900, // drained segment
    glow: 0xa9dde3 // light color and additive glow (lighter than `ok`)
  },
  /** Plasma Cutter, sampled from the reference and kept muted. */
  weapon: {
    paint: 0xb8a352, // worn safety-yellow frames
    paintWorn: 0x8d9296, // bare steel where paint chipped
    gunmetal: 0x2a2f33, // main body
    steelDark: 0x4a5054, // secondary plates
    dial: 0xa4adb0, // knurled silver dial
    grip: 0x56403a, // textured brown-red grip
    cable: 0x111517,
    wear: 0x8a3a2c // red scratches / dried blood on the paint
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

/** CSS `rgba()` from a palette token, for canvas glows and translucent fills. */
export const rgba = (n: number, alpha: number): string =>
  `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;

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
