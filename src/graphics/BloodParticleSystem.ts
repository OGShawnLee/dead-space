import { Mesh, BoxGeometry, MeshBasicMaterial, PointLight, Vector3, type Scene } from 'three';

interface Particle {
  mesh: Mesh;
  vel: Vector3;
  life: number;
  gravityScale?: number;
}

/**
 * Blood Particle System
 * Emits and manages visceral blood splatter bursts, floor stains, and volatile explosions.
 */
export class BloodParticleSystem {
  particles: Particle[] = [];
  pGeo = new BoxGeometry(0.06, 0.06, 0.06);
  pMat = new MeshBasicMaterial({ color: 0x990000 });
  stasisGeo = new BoxGeometry(0.04, 0.04, 0.04);
  stasisMat = new MeshBasicMaterial({ color: 0x00f0ff });

  constructor(public scene: Scene) {}

  spawnSplatter(pos: Vector3, normal: Vector3, count = 25): void {
    for (let i = 0; i < count; i++) {
      const p = new Mesh(this.pGeo, this.pMat);
      p.position.copy(pos);
      this.scene.add(p);

      const vel = normal.clone().multiplyScalar(2.0).add(new Vector3(
        (Math.random() - 0.5) * 4.0,
        Math.random() * 3.5 + 0.8,
        (Math.random() - 0.5) * 4.0
      ));

      this.particles.push({
        mesh: p,
        vel: vel,
        life: Math.random() * 0.8 + 0.4
      });
    }
  }

  spawnExplosionBlast(pos: Vector3, count = 55): void {
    const fireGeo = new BoxGeometry(0.12, 0.12, 0.12);
    const fireMat = new MeshBasicMaterial({ color: 0xff7700 });
    const goreMat = new MeshBasicMaterial({ color: 0x770000 });

    for (let i = 0; i < count; i++) {
      const isFire = Math.random() < 0.5;
      const p = new Mesh(fireGeo, isFire ? fireMat : goreMat);
      p.position.copy(pos);
      this.scene.add(p);

      const speed = Math.random() * 8.0 + 3.0;
      const angleH = Math.random() * Math.PI * 2;
      const angleV = (Math.random() - 0.3) * Math.PI;

      const vel = new Vector3(
        Math.cos(angleH) * Math.cos(angleV) * speed,
        Math.sin(angleV) * speed + 2.5,
        Math.sin(angleH) * Math.cos(angleV) * speed
      );

      this.particles.push({
        mesh: p,
        vel: vel,
        life: Math.random() * 1.0 + 0.5
      });
    }

    // Dynamic explosive fireball light
    const blastLight = new PointLight(0xff6600, 7.0, 10.0);
    blastLight.position.copy(pos).add(new Vector3(0, 0.6, 0));
    this.scene.add(blastLight);
    setTimeout(() => {
      this.scene.remove(blastLight);
    }, 140);
  }

  spawnStasisSparks(pos: Vector3, count = 20): void {
    for (let i = 0; i < count; i++) {
      const p = new Mesh(this.stasisGeo, this.stasisMat);
      p.position.copy(pos);
      this.scene.add(p);

      const speed = Math.random() * 3.2 + 0.8;
      const angleH = Math.random() * Math.PI * 2;
      const angleV = (Math.random() - 0.5) * Math.PI;

      const vel = new Vector3(
        Math.cos(angleH) * Math.cos(angleV) * speed,
        Math.sin(angleV) * speed + 0.5,
        Math.sin(angleH) * Math.cos(angleV) * speed
      );

      this.particles.push({
        mesh: p,
        vel: vel,
        life: Math.random() * 0.45 + 0.25,
        gravityScale: 0.3 // Stasis sparks linger / float with low gravity
      });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      const grav = 9.8 * (p.gravityScale !== undefined ? p.gravityScale : 1.0);
      p.vel.y -= grav * dt;
      p.mesh.position.addScaledVector(p.vel, dt);

      if (p.mesh.position.y < 0.04) {
        p.mesh.position.y = 0.04;
        p.vel.set(0, 0, 0);
      }

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }
}
