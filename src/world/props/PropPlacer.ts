import {
  Box3,
  Color,
  Euler,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type Scene
} from 'three';
import { PROPS, type PropDef, type PropId } from './PropDefs';

export interface PropSpawn {
  id: PropId;
  /** Chance per candidate slot (open cell, or open cell wall side). */
  density: number;
}

export interface PlacementContext {
  /** 1 = wall; other values are open cells (see ShipLevel). */
  grid: number[][];
  cellSize: number;
  wallHeight: number;
  halfW: number;
  rng: () => number;
}

/** Deterministic RNG so a seed reproduces the same dressing. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WALL_DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const NO_CRATES = new Set([2, 3]); // start and escape rooms stay clear

/** Places props with one InstancedMesh per prop type. */
export class PropPlacer {
  meshes: InstancedMesh[] = [];
  colliders: Box3[] = [];

  build(scene: Scene, spawns: PropSpawn[], ctx: PlacementContext): void {
    const { grid, cellSize, wallHeight, halfW, rng } = ctx;
    const N = grid.length;
    const q = new Quaternion();
    const pos = new Vector3();
    const one = new Vector3(1, 1, 1);
    const euler = new Euler();

    for (const spawn of spawns) {
      const def: PropDef = PROPS[spawn.id];
      const matrices: Matrix4[] = [];
      const add = () => matrices.push(new Matrix4().compose(pos, q, one));

      for (let z = 1; z < N - 1; z++) {
        for (let x = 1; x < N - 1; x++) {
          const val = grid[z][x];
          if (val === 1) continue;
          const cx = x * cellSize - halfW + cellSize / 2;
          const cz = z * cellSize - halfW + cellSize / 2;

          if (def.placement === 'ceiling') {
            if (rng() >= spawn.density) continue;
            // Run the beam along the open axis of the corridor.
            const openX = grid[z][x - 1] !== 1 || grid[z][x + 1] !== 1;
            q.setFromEuler(euler.set(0, openX ? 0 : Math.PI / 2, 0));
            pos.set(cx, wallHeight - 0.1, cz);
            add();
            continue;
          }

          for (const [dx, dz] of WALL_DIRS) {
            if (grid[z + dz][x + dx] !== 1) continue;
            if (def.placement === 'floor' && NO_CRATES.has(val)) continue;
            if (rng() >= spawn.density) continue;

            const inset = cellSize / 2 - def.depth / 2 - (def.placement === 'floor' ? 0.05 : 0);
            pos.set(cx + dx * inset, def.y, cz + dz * inset);
            // Local +Z must point into the room, i.e. opposite to the wall direction.
            q.setFromEuler(euler.set(0, Math.atan2(-dx, -dz), 0));
            add();

            if (def.collider) {
              const half = def.depth / 2;
              this.colliders.push(new Box3(
                new Vector3(pos.x - half, 0, pos.z - half),
                new Vector3(pos.x + half, def.y * 2, pos.z + half)
              ));
            }
          }
        }
      }

      if (matrices.length === 0) continue;
      const mesh = new InstancedMesh(def.geometry(), def.material(), matrices.length);
      const tint = new Color();
      matrices.forEach((mat, i) => {
        mesh.setMatrixAt(i, mat);
        const k = 1 - def.tintVariance + rng() * def.tintVariance;
        mesh.setColorAt(i, tint.setScalar(k));
      });
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  dispose(scene: Scene): void {
    for (const mesh of this.meshes) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as { dispose(): void }).dispose();
      mesh.dispose();
    }
    this.meshes = [];
    this.colliders = [];
  }
}
