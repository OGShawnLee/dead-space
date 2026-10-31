const THREE = window.THREE;

/**
 * Blood Particle System
 * Emits and manages visceral blood splatter bursts, floor stains, and volatile explosions.
 */
export class BloodParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.pGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    this.pMat = new THREE.MeshBasicMaterial({ color: 0x990000 });

    this.stasisGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
    this.stasisMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
  }

  spawnSplatter(pos, normal, count = 25) {
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(this.pGeo, this.pMat);
      p.position.copy(pos);
      this.scene.add(p);

      const vel = normal.clone().multiplyScalar(2.0).add(new THREE.Vector3(
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

  spawnExplosionBlast(pos, count = 55) {
    const fireGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xff7700 });
    const goreMat = new THREE.MeshBasicMaterial({ color: 0x770000 });

    for (let i = 0; i < count; i++) {
      const isFire = Math.random() < 0.5;
      const p = new THREE.Mesh(fireGeo, isFire ? fireMat : goreMat);
      p.position.copy(pos);
      this.scene.add(p);

      const speed = Math.random() * 8.0 + 3.0;
      const angleH = Math.random() * Math.PI * 2;
      const angleV = (Math.random() - 0.3) * Math.PI;

      const vel = new THREE.Vector3(
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
    const blastLight = new THREE.PointLight(0xff6600, 7.0, 10.0);
    blastLight.position.copy(pos).add(new THREE.Vector3(0, 0.6, 0));
    this.scene.add(blastLight);
    setTimeout(() => {
      this.scene.remove(blastLight);
    }, 140);
  }

  spawnStasisSparks(pos, count = 20) {
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(this.stasisGeo, this.stasisMat);
      p.position.copy(pos);
      this.scene.add(p);

      const speed = Math.random() * 3.2 + 0.8;
      const angleH = Math.random() * Math.PI * 2;
      const angleV = (Math.random() - 0.5) * Math.PI;

      const vel = new THREE.Vector3(
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

  update(dt) {
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
