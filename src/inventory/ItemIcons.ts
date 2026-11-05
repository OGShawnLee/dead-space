import type { ItemId } from './ItemDefs';
import { PALETTE, hex } from '../graphics/Palette';

/**
 * Procedural item icons (zero-assets rule: drawn on a canvas, cached as data URLs).
 * `Record<ItemId, ...>` makes it a compile error to add an item without an icon.
 */

const SIZE = 128;
const INK = hex(PALETTE.ui.ink);
const EDGE = hex(PALETTE.cyan.dim);
const FILL = 'rgba(120, 180, 192, 0.32)';

type Painter = (c: CanvasRenderingContext2D) => void;

const shape = (c: CanvasRenderingContext2D, trace: () => void): void => {
  c.beginPath();
  trace();
  c.fill();
  c.stroke();
};

const PAINTERS: Record<ItemId, Painter> = {
  plasma_energy: c => {
    // Slanted energy cell with contacts
    c.translate(SIZE / 2, SIZE / 2);
    c.rotate(-0.5);
    shape(c, () => c.roundRect(-40, -22, 80, 44, 6));
    c.beginPath();
    c.moveTo(-26, -22); c.lineTo(-26, 22);
    c.moveTo(-8, -22); c.lineTo(-8, 22);
    c.stroke();
    c.fillStyle = INK;
    c.fillRect(-34, -8, 6, 16);
    shape(c, () => c.rect(40, -10, 8, 20));
  },
  med_small: c => {
    // Med pack: rounded case with a cross
    shape(c, () => c.roundRect(24, 30, 80, 68, 8));
    c.fillStyle = INK;
    c.fillRect(58, 42, 12, 44);
    c.fillRect(42, 58, 44, 12);
    shape(c, () => c.rect(50, 22, 28, 8));
  },
  stasis_pack: c => {
    // Hexagonal battery with a ring
    shape(c, () => {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const x = SIZE / 2 + Math.cos(a) * 40;
        const y = SIZE / 2 + Math.sin(a) * 40;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath();
    });
    c.beginPath();
    c.ellipse(SIZE / 2, SIZE / 2, 26, 12, 0, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = INK;
    c.beginPath();
    c.arc(SIZE / 2, SIZE / 2, 6, 0, Math.PI * 2);
    c.fill();
  },
  plasma_cutter: c => {
    // Side profile of the Plasma Cutter
    shape(c, () => c.roundRect(20, 46, 70, 32, 6));
    shape(c, () => c.rect(90, 55, 22, 14));
    shape(c, () => {
      c.moveTo(40, 78); c.lineTo(56, 78); c.lineTo(52, 104); c.lineTo(36, 104); c.closePath();
    });
    c.fillStyle = INK;
    c.fillRect(30, 54, 34, 6);
  }
};

const cache = new Map<ItemId, string>();

/** Returns a (cached) data URL with the icon of the given item. */
export function getItemIcon(id: ItemId): string {
  const hit = cache.get(id);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const c = canvas.getContext('2d')!;
  c.lineWidth = 4;
  c.lineJoin = 'round';
  c.strokeStyle = EDGE;
  c.fillStyle = FILL;
  PAINTERS[id](c);

  const url = canvas.toDataURL('image/png');
  cache.set(id, url);
  return url;
}
