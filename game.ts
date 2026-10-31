/**
 * DEAD SPACE: SECTOR PROTOCOL
 * Entry Point (Modular Architecture - TypeScript)
 */

import { DeadSpaceGame } from './src/core/Engine';

window.addEventListener('DOMContentLoaded', () => {
  new DeadSpaceGame();
});
