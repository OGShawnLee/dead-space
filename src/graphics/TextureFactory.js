const THREE = window.THREE;

/**
 * Procedural Texture Generator
 * Generates all textures in runtime using HTML5 Canvas (Zero external image dependencies)
 */
export class TextureFactory {
  static createMetalWall() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#1a1d22');
    grad.addColorStop(0.5, '#262a30');
    grad.addColorStop(1, '#16181c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = '#0e1014';
    ctx.lineWidth = 8;
    ctx.strokeRect(16, 16, 480, 480);
    ctx.strokeRect(16, 250, 480, 2);

    ctx.strokeStyle = '#3d4450';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 472, 472);

    const drawBolt = (x, y) => {
      ctx.fillStyle = '#0a0c0e';
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6b7280';
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

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  static createFloorGrate() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#101216';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#030405';
    ctx.strokeStyle = '#2b313a';
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

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }

  static createCeiling() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#14171c';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#090a0d';
    ctx.fillRect(20, 20, 216, 216);

    ctx.strokeStyle = '#222830';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 128); ctx.lineTo(256, 128);
    ctx.moveTo(128, 0); ctx.lineTo(128, 256);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }

  static createHazardStripes(red = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const color1 = red ? '#cc1111' : '#f59e0b';
    const color2 = '#111317';

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

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  static createSuitTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#5c4528';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#2d2214';
    ctx.lineWidth = 4;
    for (let y = 8; y < 256; y += 14) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#8c6b40';
    ctx.lineWidth = 1;
    for (let y = 10; y < 256; y += 14) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }

    return new THREE.CanvasTexture(canvas);
  }

  static createNecroSkin() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#83776e';
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

    return new THREE.CanvasTexture(canvas);
  }

  static createHoloAmmoCanvas(ammo, maxAmmo) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 256, 128);

    ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 236, 108);

    ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
    for (let y = 14; y < 118; y += 4) {
      ctx.fillRect(12, y, 232, 2);
    }

    ctx.fillStyle = ammo === 0 ? '#ff3333' : '#00e5ff';
    ctx.font = 'bold 54px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = ammo === 0 ? 'rgba(255, 51, 51, 0.8)' : 'rgba(0, 229, 255, 0.9)';
    ctx.shadowBlur = 10;
    ctx.fillText(`${ammo}`, 95, 64);

    ctx.font = '24px monospace';
    ctx.fillStyle = '#7dd3fc';
    ctx.shadowBlur = 0;
    ctx.fillText(`/${maxAmmo}`, 180, 72);

    return canvas;
  }
}
