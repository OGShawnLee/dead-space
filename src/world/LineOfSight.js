const THREE = window.THREE;

/**
 * Line of Sight (LoS) Raycasting Check
 * Prevents AI sensory cheating / wall-hacking through obstacle bounding boxes.
 */
export function checkLineOfSight(posA, posB, colliders) {
  const dir = new THREE.Vector3().subVectors(posB, posA);
  const totalDist = dir.length();
  if (totalDist <= 0.01) return true;
  dir.normalize();

  const ray = new THREE.Ray(posA, dir);
  const hitPoint = new THREE.Vector3();

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
