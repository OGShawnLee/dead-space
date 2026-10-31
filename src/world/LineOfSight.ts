import { Vector3, Ray, type Box3 } from 'three';

/**
 * Line of Sight (LoS) Raycasting Check
 * Prevents AI sensory cheating / wall-hacking through obstacle bounding boxes.
 */
export function checkLineOfSight(posA: Vector3, posB: Vector3, colliders: Box3[]): boolean {
  const dir = new Vector3().subVectors(posB, posA);
  const totalDist = dir.length();
  if (totalDist <= 0.01) return true;
  dir.normalize();

  const ray = new Ray(posA, dir);
  const hitPoint = new Vector3();

  for (let i = 0; i < colliders.length; i++) {
    const box = colliders[i];
    if (ray.intersectBox(box, hitPoint)) {
      const hitDist = posA.distanceTo(hitPoint);
      if (hitDist < totalDist - 0.25) {
        return false; // Obstructed by wall
      }
    }
  }
  return true;
}
