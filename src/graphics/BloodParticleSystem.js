const THREE = window.THREE;

/**
 * Blood Particle System
 * Emits and manages visceral blood splatter bursts and floor stains.
 */
export class BloodParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.pGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    this.pMat = new THREE.MeshBasicMaterial({ color: 0x990000 });
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

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 9.8 * dt;
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
