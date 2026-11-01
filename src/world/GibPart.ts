import { Box3, Mesh, Vector3, type BufferGeometry, type Material, type Quaternion, type Scene } from 'three';

/**
 * Gib Part
 * Physical debris representing severed limbs tumbling and bouncing on the floor and against walls.
 */
export class GibPart {
  mesh: Mesh;
  velocity: Vector3;
  rotVel: Vector3;
  life = 12.0;
  radius = 0.22;

  private static _testBox = new Box3();

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
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
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

  update(dt: number, colliders?: Box3[]): boolean {
    if (this.life <= 0) return false;
    this.life -= dt;

    // Gravity
    this.velocity.y -= 9.8 * dt;

    // Vertical movement & floor/ceiling collision
    const nextY = this.mesh.position.y + this.velocity.y * dt;
    if (nextY <= 0.15) {
      this.mesh.position.y = 0.15;
      if (Math.abs(this.velocity.y) < 0.4) {
        this.velocity.y = 0;
      } else {
        this.velocity.y = -this.velocity.y * 0.35;
      }
      this.velocity.x *= 0.65;
      this.velocity.z *= 0.65;
      this.rotVel.multiplyScalar(0.7);
      if (Math.abs(this.velocity.x) < 0.05) this.velocity.x = 0;
      if (Math.abs(this.velocity.z) < 0.05) this.velocity.z = 0;
    } else if (nextY >= 3.2) {
      this.mesh.position.y = 3.2;
      this.velocity.y = -Math.abs(this.velocity.y) * 0.35;
    } else {
      this.mesh.position.y = nextY;
    }

    const currentY = Math.max(0.15, this.mesh.position.y);
    const r = this.radius;

    // Horizontal X movement & wall bounce
    if (Math.abs(this.velocity.x) > 0.01) {
      const nextX = this.mesh.position.x + this.velocity.x * dt;
      let hitColliderX: Box3 | null = null;

      if (colliders && colliders.length > 0) {
        GibPart._testBox.min.set(nextX - r, currentY, this.mesh.position.z - r);
        GibPart._testBox.max.set(nextX + r, currentY + 0.35, this.mesh.position.z + r);
        for (let i = 0; i < colliders.length; i++) {
          if (GibPart._testBox.intersectsBox(colliders[i])) {
            hitColliderX = colliders[i];
            break;
          }
        }
      }

      if (hitColliderX) {
        // Position at wall boundary to avoid tunneling
        if (this.velocity.x > 0) {
          this.mesh.position.x = hitColliderX.min.x - r - 0.02;
        } else {
          this.mesh.position.x = hitColliderX.max.x + r + 0.02;
        }
        // Invert X velocity with bounce restitution and friction
        this.velocity.x = -this.velocity.x * 0.4;
        this.rotVel.multiplyScalar(0.75);
        if (Math.abs(this.velocity.x) < 0.1) this.velocity.x = 0;
      } else {
        this.mesh.position.x = nextX;
      }
    }

    // Horizontal Z movement & wall bounce
    if (Math.abs(this.velocity.z) > 0.01) {
      const nextZ = this.mesh.position.z + this.velocity.z * dt;
      let hitColliderZ: Box3 | null = null;

      if (colliders && colliders.length > 0) {
        GibPart._testBox.min.set(this.mesh.position.x - r, currentY, nextZ - r);
        GibPart._testBox.max.set(this.mesh.position.x + r, currentY + 0.35, nextZ + r);
        for (let i = 0; i < colliders.length; i++) {
          if (GibPart._testBox.intersectsBox(colliders[i])) {
            hitColliderZ = colliders[i];
            break;
          }
        }
      }

      if (hitColliderZ) {
        // Position at wall boundary to avoid tunneling
        if (this.velocity.z > 0) {
          this.mesh.position.z = hitColliderZ.min.z - r - 0.02;
        } else {
          this.mesh.position.z = hitColliderZ.max.z + r + 0.02;
        }
        // Invert Z velocity with bounce restitution and friction
        this.velocity.z = -this.velocity.z * 0.4;
        this.rotVel.multiplyScalar(0.75);
        if (Math.abs(this.velocity.z) < 0.1) this.velocity.z = 0;
      } else {
        this.mesh.position.z = nextZ;
      }
    }

    // Angular tumbling
    if (this.rotVel.lengthSq() > 0.001) {
      this.mesh.rotation.x += this.rotVel.x * dt;
      this.mesh.rotation.y += this.rotVel.y * dt;
      this.mesh.rotation.z += this.rotVel.z * dt;
    }

    if (this.life <= 0) {
      this.scene.remove(this.mesh);
      return false;
    }
    return true;
  }
}
