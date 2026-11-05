/**
 * DEAD SPACE: SECTOR PROTOCOL
 * Entry Point (Modular Architecture - TypeScript)
 */

import { DeadSpaceGame } from './src/core/Engine';
import { applyCssPalette } from './src/graphics/Palette';

window.addEventListener('DOMContentLoaded', () => {
  applyCssPalette();
  new DeadSpaceGame();
});
