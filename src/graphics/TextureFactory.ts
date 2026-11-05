import { CanvasTexture, RepeatWrapping } from 'three';
import { PALETTE, hex } from './Palette';

/**
 * Procedural Texture Generator
 * Generates all textures in runtime using HTML5 Canvas (Zero external image dependencies)
 */
export class TextureFactory {
  private static surfaceCache = new Map<string, CanvasTexture>();

  /** Cached surface texture by id; shared between materials until `disposeSurfaces()`. */
  static surface(id: 'metalWall' | 'floorGrate' | 'ceiling'): CanvasTexture {
    let tex = this.surfaceCache.get(id);
    if (!tex) {
      tex = id === 'metalWall' ? this.createMetalWall()
        : id === 'floorGrate' ? this.createFloorGrate()
        : this.createCeiling();
      this.surfaceCache.set(id, tex);
    }
    return tex;
  }

  static disposeSurfaces(): void {
    this.surfaceCache.forEach(t => t.dispose());
    this.surfaceCache.clear();
  }

  static createMetalWall(): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, hex(PALETTE.metal.m800));
    grad.addColorStop(0.5, hex(PALETTE.metal.m700));
    grad.addColorStop(1, hex(PALETTE.metal.m800));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = hex(PALETTE.metal.m900);
    ctx.lineWidth = 8;
    ctx.strokeRect(16, 16, 480, 480);
    ctx.strokeRect(16, 250, 480, 2);

    ctx.strokeStyle = hex(PALETTE.metal.m500);
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 472, 472);

    const drawBolt = (x: number, y: number) => {
      ctx.fillStyle = hex(PALETTE.metal.m900);
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hex(PALETTE.metal.m300);
      ctx.beginPath();
      ctx.arc(x - 1, y - 1, 4, 0, Math.PI * 2);
      ctx.fill();
    };

    [36, 476].forEach(x => {
      [36, 240, 272, 476].forEach(y => drawBolt(x, y));
    });

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      const sx = Math.random() * 512;
      const sy = Math.random() * 512;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (Math.random() - 0.5) * 60, sy + (Math.random() - 0.5) * 60);
      ctx.stroke();
    }

    const tex = new CanvasTexture(canvas);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    return tex;
  }

  static createFloorGrate(): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = hex(PALETTE.metal.m900);
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = hex(PALETTE.metal.void);
    ctx.strokeStyle = hex(PALETTE.metal.m700);
    ctx.lineWidth = 2;

    const cols = 8;
    const rows = 8;
    const cw = 256 / cols;
    const ch = 256 / rows;

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const x = c * cw + 4;
        const y = r * ch + 4;
        const w = cw - 8;
        const h = ch - 8;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
    }

    const tex = new CanvasTexture(canvas);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }

  static createCeiling(): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = hex(PALETTE.metal.m800);
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = hex(PALETTE.metal.void);
    ctx.fillRect(20, 20, 216, 216);

    ctx.strokeStyle = hex(PALETTE.metal.m700);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 128); ctx.lineTo(256, 128);
    ctx.moveTo(128, 0); ctx.lineTo(128, 256);
    ctx.stroke();

    const tex = new CanvasTexture(canvas);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }

  static createHazardStripes(red = false): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const color1 = red ? hex(PALETTE.red.mid) : hex(PALETTE.amber.mid);
    const color2 = hex(PALETTE.metal.m900);

    ctx.fillStyle = color2;
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = color1;
    const stripeW = 32;
    for (let x = -256; x < 512; x += stripeW * 2) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + stripeW, 0);
      ctx.lineTo(x + stripeW + 256, 256);
      ctx.lineTo(x + 256, 256);
      ctx.closePath();
      ctx.fill();
    }

    const tex = new CanvasTexture(canvas);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    return tex;
  }

  static createSuitTexture(): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = hex(PALETTE.rust.rust);
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = hex(PALETTE.rust.grease);
    ctx.lineWidth = 4;
    for (let y = 8; y < 256; y += 14) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }

    ctx.strokeStyle = hex(PALETTE.rust.bronze);
    ctx.lineWidth = 1;
    for (let y = 10; y < 256; y += 14) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }

    return new CanvasTexture(canvas);
  }

  static createNecroSkin(): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = hex(PALETTE.flesh.bone);
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 60; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = Math.random() * 24 + 4;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(120, 20, 20, 0.7)');
      grad.addColorStop(0.7, 'rgba(50, 10, 10, 0.4)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(30, 20, 60, 0.5)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 15; i++) {
      ctx.beginPath();
      let vx = Math.random() * 256;
      let vy = Math.random() * 256;
      ctx.moveTo(vx, vy);
      for (let j = 0; j < 5; j++) {
        vx += (Math.random() - 0.5) * 30;
        vy += (Math.random() - 0.5) * 30;
        ctx.lineTo(vx, vy);
      }
      ctx.stroke();
    }

    return new CanvasTexture(canvas);
  }

  static createHoloAmmoCanvas(ammo: number, maxAmmo: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 512, 256);

    // Color thresholds: Blue (> 50%) -> Orange (21-50%) -> Red (<= 20%)
    const ratio = ammo / Math.max(1, maxAmmo);
    let mainColor = hex(PALETTE.cyan.core);
    let glowColor = 'rgba(0, 240, 255, 0.25)';
    let scanlineFill = 'rgba(0, 240, 255, 0.08)';
    let frameColor = 'rgba(0, 240, 255, 0.65)';
    let subTextColor = hex(PALETTE.cyan.dim);

    if (ratio <= 0.2) {
      // Critical Red (0 to 2 shots)
      mainColor = hex(PALETTE.red.core);
      glowColor = 'rgba(255, 34, 34, 0.25)';
      scanlineFill = 'rgba(255, 34, 34, 0.12)';
      frameColor = 'rgba(255, 34, 34, 0.75)';
      subTextColor = hex(PALETTE.red.dim);
    } else if (ratio <= 0.5) {
      // Warning Orange / Amber (3 to 5 shots)
      mainColor = hex(PALETTE.amber.core);
      glowColor = 'rgba(255, 153, 0, 0.25)';
      scanlineFill = 'rgba(255, 153, 0, 0.10)';
      frameColor = 'rgba(255, 153, 0, 0.75)';
      subTextColor = hex(PALETTE.amber.dim);
    }

    // Outer subtle boundary frame
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(16, 16, 480, 224);

    // Subtle holographic scanlines
    ctx.fillStyle = scanlineFill;
    for (let y = 20; y < 236; y += 8) {
      ctx.fillRect(20, y, 472, 4);
    }

    // Dead Space holographic corner brackets
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 6;
    const bLen = 28;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(16, 16 + bLen); ctx.lineTo(16, 16); ctx.lineTo(16 + bLen, 16);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(496 - bLen, 16); ctx.lineTo(496, 16); ctx.lineTo(496, 16 + bLen);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(16, 240 - bLen); ctx.lineTo(16, 240); ctx.lineTo(16 + bLen, 240);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(496 - bLen, 240); ctx.lineTo(496, 240); ctx.lineTo(496 - bLen, 240);
    ctx.stroke();

    // Prominent bold current ammo number
    ctx.fillStyle = mainColor;
    ctx.font = '900 115px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 16;
    ctx.fillText(`${ammo}`, 190, 128);

    // Capacity indicator
    ctx.font = '700 48px monospace';
    ctx.fillStyle = subTextColor;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 8;
    ctx.fillText(`/${maxAmmo}`, 360, 140);

    return canvas;
  }
}
