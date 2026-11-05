import { SkeletonHelper, type Material, type Mesh, type Object3D, type Scene } from 'three';

/**
 * `?isaac=debug` viewer (Proposal 005, section 9) so the owner can inspect the model:
 * - skeleton overlay (drawn through the body)
 * - K: toggle skeleton   O: toggle turntable   P: toggle bind pose (freezes animation)
 * - J: toggle wireframe on the body
 * Keys do not collide with gameplay (WASD, Shift, F, R, C, E, Tab, Esc).
 */
export class IsaacDebug {
  readonly helper: SkeletonHelper;
  turntable = true;
  bindPose = false;
  private wireframe = false;
  private readonly onKey = (e: KeyboardEvent): void => {
    switch (e.code) {
      case 'KeyK': this.helper.visible = !this.helper.visible; break;
      case 'KeyO': this.turntable = !this.turntable; break;
      case 'KeyP': this.bindPose = !this.bindPose; break;
      case 'KeyJ': this.setWireframe(!this.wireframe); break;
    }
  };

  constructor(scene: Scene, private readonly modelRoot: Object3D, private readonly body: Mesh) {
    this.helper = new SkeletonHelper(modelRoot);
    scene.add(this.helper);
    if (typeof window !== 'undefined') window.addEventListener('keydown', this.onKey);
    console.info('[isaac=debug] K skeleton, O turntable, P bind pose, J wireframe');
  }

  update(dt: number): void {
    if (this.turntable) this.modelRoot.rotation.y += dt * 0.5;
  }

  private setWireframe(on: boolean): void {
    this.wireframe = on;
    (this.body.material as Material & { wireframe: boolean }).wireframe = on;
  }
}
