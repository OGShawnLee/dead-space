import { Mesh, Vector3, type BufferGeometry, type Material, type Quaternion, type Scene } from 'three';

/**
 * Gib Part
 * Physical debris representing severed limbs tumbling and bouncing on the floor.
 */
export class GibPart {
  mesh: Mesh;
  velocity: Vector3;
  rotVel: Vector3;
  life = 12.0;

  constructor(
    public scene: Scene,
    geometry: BufferGeometry,
    material: Material | Material[],
    worldPos: Vector3,
    worldQuat: Quaternion,
    initialVel: Vector3
  ) {
    this.mesh = new Mesh(geometry, material);
    this.mesh.position.copy(worldPos);
    this.mesh.quaternion.copy(worldQuat);
    this.scene.add(this.mesh);

    this.velocity = initialVel.clone().add(new Vector3(
      (Math.random() - 0.5) * 1.5,
      Math.random() * 2.0 + 1.2,
      (Math.random() - 0.5) * 1.5
    ));
    this.rotVel = new Vector3(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8
    );
  }

  update(dt: number): boolean {
    if (this.life <= 0) return false;
    this.life -= dt;

    this.velocity.y -= 9.8 * dt;
    this.mesh.position.addScaledVector(this.velocity, dt);

    if (this.mesh.position.y < 0.15) {
      this.mesh.position.y = 0.15;
      this.velocity.y = -this.velocity.y * 0.35;
      this.velocity.x *= 0.6;
      this.velocity.z *= 0.6;
      this.rotVel.multiplyScalar(0.7);
    }

    this.mesh.rotation.x += this.rotVel.x * dt;
    this.mesh.rotation.y += this.rotVel.y * dt;
    this.mesh.rotation.z += this.rotVel.z * dt;

    if (this.life <= 0) {
      this.scene.remove(this.mesh);
      return false;
    }
    return true;
  }
}
