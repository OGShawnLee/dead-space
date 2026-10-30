/**
 * DEAD SPACE: SECTOR PROTOCOL
 * Entry Point (Modular Architecture)
 * 
 * Directory Structure:
 * ├── index.html
 * ├── style.css
 * ├── game.js
 * └── src/
 *     ├── core/
 *     │   ├── Engine.js           (Game loop, scene, renderer, combat orchestration)
 *     │   ├── InputManager.js     (Keyboard, mouse, pointer lock, key listeners)
 *     │   └── SoundSystem.js      (Web Audio API procedural sound synthesizer)
 *     ├── graphics/
 *     │   ├── TextureFactory.js   (Procedural CanvasTextures: metal, grates, skin, holo)
 *     │   └── BloodParticleSystem.js (Gore and blood splatter particle system)
 *     ├── world/
 *     │   ├── ShipLevel.js        (3D procedural extruded grid labyrinth, rooms, lights)
 *     │   ├── LineOfSight.js      (Raycast obstruction checks through wall colliders)
 *     │   └── GibPart.js          (Severed limb debris physics and floor bouncing)
 *     ├── entities/
 *     │   ├── Player.js           (Isaac Clarke, 3D RIG spine, weapon, flashlight)
 *     │   └── Necromorph.js       (Slasher enemy, surgical dismemberment, disarm logic)
 *     └── camera/
 *         └── ThirdPersonCamera.js (Over-the-shoulder smoothed camera, wall collision)
 */

import { DeadSpaceGame } from './src/core/Engine.js';

window.addEventListener('DOMContentLoaded', () => {
  new DeadSpaceGame();
});
