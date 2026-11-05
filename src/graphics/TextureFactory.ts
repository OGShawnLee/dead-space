import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { PALETTE, hex } from './Palette';

/**
 * Procedural Texture Generator
 * Generates all textures in runtime using HTML5 Canvas (Zero external image dependencies)
 */
export type SurfaceId =
  | 'metalWall' | 'floorGrate' | 'floorPlate' | 'ceiling' | 'crateSteel'
  | 'necroSlasher' | 'necroLeaper' | 'necroExploder';

export class TextureFactory {
  private static surfaceCache = new Map<string, CanvasTexture>();
  private static reliefCache = new Map<string, { normalMap: CanvasTexture; roughnessMap: CanvasTexture }>();

  /** Cached surface texture by id; shared between materials until `disposeSurfaces()`. */
  static surface(id: SurfaceId): CanvasTexture {
    let tex = this.surfaceCache.get(id);
    if (!tex) {
      tex = id === 'metalWall' ? this.createMetalWall()
        : id === 'floorGrate' ? this.createFloorGrate()
        : id === 'floorPlate' ? this.createFloorPlate()
        : id === 'crateSteel' ? this.createCrateSteel()
        : id === 'necroSlasher' ? this.createNecroSkin(PALETTE.flesh.bone)
        : id === 'necroLeaper' ? this.createNecroSkin(PALETTE.flesh.sallow)
        : id === 'necroExploder' ? this.createNecroSkin(PALETTE.flesh.pallid)
        : this.createCeiling();
      this.surfaceCache.set(id, tex);
    }
    return tex;
  }

  /**
   * Color map plus normal and roughness maps derived from its luminance, cached together.
   * Relief without changing the look: the albedo is untouched, light just catches the details.
   */
  static surfaceMaps(id: SurfaceId, strength = 2): {
    map: CanvasTexture; normalMap: CanvasTexture; roughnessMap: CanvasTexture;
  } {
    const map = this.surface(id);
    let relief = this.reliefCache.get(id);
    if (!relief) {
      relief = this.deriveRelief(map, strength);
      this.reliefCache.set(id, relief);
    }
    return { map, ...relief };
  }

  private static deriveRelief(src: CanvasTexture, strength: number): { normalMap: CanvasTexture; roughnessMap: CanvasTexture } {
    const img = src.image as HTMLCanvasElement;
    const w = img.width;
    const h = img.height;
    const data = img.getContext('2d')!.getImageData(0, 0, w, h).data;

    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      lum[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
    }

    const nCanvas = document.createElement('canvas');
    nCanvas.width = w;
    nCanvas.height = h;
    const nCtx = nCanvas.getContext('2d')!;
    const nImg = nCtx.createImageData(w, h);
    const rCanvas = document.createElement('canvas');
    rCanvas.width = w;
    rCanvas.height = h;
    const rCtx = rCanvas.getContext('2d')!;
    const rImg = rCtx.createImageData(w, h);

    const at = (x: number, y: number) => lum[((y + h) % h) * w + ((x + w) % w)];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Sobel on luminance; image Y points down, normal maps use +Y up (OpenGL).
        const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
        const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
        let nx = -dx * strength;
        let ny = dy * strength;
        const inv = 1 / Math.hypot(nx, ny, 1);
        nx *= inv;
        ny *= inv;
        const nz = inv;
        const i = (y * w + x) * 4;
        nImg.data[i] = (nx * 0.5 + 0.5) * 255;
        nImg.data[i + 1] = (ny * 0.5 + 0.5) * 255;
        nImg.data[i + 2] = (nz * 0.5 + 0.5) * 255;
        nImg.data[i + 3] = 255;

        // Darker = grimier = rougher, plus fine noise; scales the material roughness.
        const rough = Math.min(1, Math.max(0.6, 1 - lum[y * w + x] * 0.9 + (Math.random() - 0.5) * 0.12));
        const g = rough * 255;
        rImg.data[i] = g;
        rImg.data[i + 1] = g;
        rImg.data[i + 2] = g;
        rImg.data[i + 3] = 255;
      }
    }
    nCtx.putImageData(nImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);

    const wrap = (t: CanvasTexture) => {
      t.wrapS = src.wrapS;
      t.wrapT = src.wrapT;
      t.repeat.copy(src.repeat);
      return t;
    };
    return { normalMap: wrap(new CanvasTexture(nCanvas)), roughnessMap: wrap(new CanvasTexture(rCanvas)) };
  }

  static disposeSurfaces(): void {
    this.surfaceCache.forEach(t => t.dispose());
    this.surfaceCache.clear();
    this.reliefCache.forEach(r => { r.normalMap.dispose(); r.roughnessMap.dispose(); });
    this.reliefCache.clear();
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

  /** Large solid floor plate: few big seams, bolts, stains and scuffs (low-frequency detail). */
  static createFloorPlate(): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = hex(PALETTE.metal.m800);
    ctx.fillRect(0, 0, 512, 512);

    // Soft mottling so large areas are not flat
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const rad = 40 + Math.random() * 90;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const dark = Math.random() < 0.6;
      g.addColorStop(0, dark ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.05)');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }

    // 2x2 plates with beveled seams
    ctx.lineWidth = 6;
    ctx.strokeStyle = hex(PALETTE.metal.m900);
    ctx.strokeRect(3, 3, 506, 506);
    ctx.beginPath();
    ctx.moveTo(256, 0); ctx.lineTo(256, 512);
    ctx.moveTo(0, 256); ctx.lineTo(512, 256);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hex(PALETTE.metal.m500);
    ctx.beginPath();
    ctx.moveTo(262, 0); ctx.lineTo(262, 512);
    ctx.moveTo(0, 262); ctx.lineTo(512, 262);
    ctx.stroke();

    // Bolts at plate corners
    for (const x of [28, 228, 284, 484]) {
      for (const y of [28, 228, 284, 484]) {
        ctx.fillStyle = hex(PALETTE.metal.m900);
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hex(PALETTE.metal.m500);
        ctx.beginPath();
        ctx.arc(x - 1, y - 1, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Grease stains and long scuffs
    ctx.strokeStyle = hex(PALETTE.rust.grease);
    for (let i = 0; i < 10; i++) {
      ctx.globalAlpha = 0.15 + Math.random() * 0.2;
      ctx.lineWidth = 6 + Math.random() * 14;
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 140, y + (Math.random() - 0.5) * 140);
      ctx.stroke();
    }
    ctx.strokeStyle = hex(PALETTE.metal.m300);
    ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) {
      ctx.globalAlpha = 0.08 + Math.random() * 0.12;
      const sx = Math.random() * 512;
      const sy = Math.random() * 512;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (Math.random() - 0.5) * 90, sy + (Math.random() - 0.5) * 90);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    return tex;
  }

  /** Drainage grate: a heavy frame around long slots (reads as grating, not as a field of squares). */
  static createFloorGrate(): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = hex(PALETTE.metal.m700);
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = hex(PALETTE.metal.m900);
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 504, 504);

    // Inner recessed area with long vertical slots in 2 rows
    const x0 = 40;
    const w = 432;
    const rows = [[40, 214], [258, 214]];
    for (const [y, h] of rows) {
      ctx.fillStyle = hex(PALETTE.metal.void);
      ctx.fillRect(x0, y, w, h);
      ctx.fillStyle = hex(PALETTE.metal.m800);
      for (let x = x0 + 14; x < x0 + w - 6; x += 28) ctx.fillRect(x, y, 14, h);
      ctx.strokeStyle = hex(PALETTE.metal.m500);
      ctx.lineWidth = 3;
      ctx.strokeRect(x0, y, w, h);
    }

    // Bolts and wear
    for (const x of [20, 492]) {
      for (const y of [20, 256, 492]) {
        ctx.fillStyle = hex(PALETTE.metal.m900);
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hex(PALETTE.metal.m500);
        ctx.beginPath();
        ctx.arc(x - 1, y - 1, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = hex(PALETTE.rust.grease);
    for (let i = 0; i < 8; i++) {
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 6 + Math.random() * 10;
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 100, y + (Math.random() - 0.5) * 100);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    return tex;
  }

  /** Blue-gray cargo container steel: recessed panels, rivets, scuffs, rust streaks, tag. */
  static createCrateSteel(): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = hex(PALETTE.metal.steel);
    ctx.fillRect(0, 0, 256, 256);

    // Recessed panel with bevel
    ctx.fillStyle = hex(PALETTE.metal.m800);
    ctx.fillRect(28, 28, 200, 200);
    ctx.strokeStyle = hex(PALETTE.metal.m900);
    ctx.lineWidth = 6;
    ctx.strokeRect(28, 28, 200, 200);
    ctx.strokeStyle = hex(PALETTE.metal.m500);
    ctx.lineWidth = 2;
    ctx.strokeRect(34, 34, 188, 188);

    // Stiffener grooves
    ctx.strokeStyle = hex(PALETTE.metal.m900);
    ctx.lineWidth = 4;
    for (const y of [92, 128, 164]) {
      ctx.beginPath();
      ctx.moveTo(48, y);
      ctx.lineTo(208, y);
      ctx.stroke();
    }

    // Rivets
    for (const x of [14, 242]) {
      for (const y of [14, 128, 242]) {
        ctx.fillStyle = hex(PALETTE.metal.m900);
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hex(PALETTE.metal.m300);
        ctx.beginPath();
        ctx.arc(x - 1, y - 1, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Rust streaks running down
    ctx.strokeStyle = hex(PALETTE.rust.grease);
    for (let i = 0; i < 14; i++) {
      ctx.globalAlpha = 0.18 + Math.random() * 0.25;
      ctx.lineWidth = 1 + Math.random() * 3;
      const x = Math.random() * 256;
      const y = Math.random() * 120;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 8, y + 40 + Math.random() * 110);
      ctx.stroke();
    }

    // Edge scuffs
    ctx.strokeStyle = hex(PALETTE.metal.m300);
    ctx.lineWidth = 1;
    for (let i = 0; i < 30; i++) {
      ctx.globalAlpha = 0.1 + Math.random() * 0.15;
      const sx = Math.random() * 256;
      const sy = Math.random() * 256;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (Math.random() - 0.5) * 40, sy + (Math.random() - 0.5) * 40);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Stenciled tag
    ctx.fillStyle = hex(PALETTE.red.mid);
    ctx.globalAlpha = 0.7;
    ctx.fillRect(150, 46, 56, 14);
    ctx.fillStyle = hex(PALETTE.ui.dim);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(48, 46, 70, 6);
    ctx.fillRect(48, 56, 40, 4);
    ctx.globalAlpha = 1;

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
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

  /** Necromorph skin: mottled base, bruised blotches, wounds, veins and tendon streaks. */
  static createNecroSkin(base: number = PALETTE.flesh.bone, wound: number = PALETTE.flesh.blood): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const rgba = (n: number, a: number) => `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;

    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, 256, 256);

    // Large pale and dark patches so the skin is not one flat tone
    for (let i = 0; i < 18; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const rad = 30 + Math.random() * 50;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, Math.random() < 0.5 ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.08)');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }

    // Raw wounds
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const rad = Math.random() * 22 + 4;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, rgba(wound, 0.75));
      grad.addColorStop(0.7, rgba(wound, 0.35));
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tendon streaks, mostly vertical
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 200;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 12, y + 20 + Math.random() * 60);
      ctx.stroke();
    }

    // Veins
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

    const tex = new CanvasTexture(canvas);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    return tex;
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
