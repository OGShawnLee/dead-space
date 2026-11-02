import type { InputState, InputHandlers } from '../types';

/**
 * Input Manager
 * Manages keyboard, mouse buttons, aiming triggers, and contextual keybinds.
 */
export class InputManager {
  state: InputState = {
    forward: false,
    backward: false,
    strafeLeft: false,
    strafeRight: false,
    sprint: false,
    aiming: false
  };

  constructor(public handlers: InputHandlers = {}) {
    this.setupListeners();
  }

  setupListeners(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': this.state.forward = true; break;
        case 'KeyS': this.state.backward = true; break;
        case 'KeyA': this.state.strafeLeft = true; break;
        case 'KeyD': this.state.strafeRight = true; break;
        case 'ShiftLeft': this.state.sprint = true; break;
        case 'KeyF':
          if (this.handlers.onToggleFlashlight) this.handlers.onToggleFlashlight();
          break;
        case 'KeyR':
          if (this.handlers.onReload) this.handlers.onReload();
          break;
        case 'KeyC':
        case 'KeyE':
          if (this.handlers.onStasis) this.handlers.onStasis();
          break;
        case 'Tab':
          // Keep the browser from moving focus out of the game
          e.preventDefault();
          if (!e.repeat && this.handlers.onToggleInventory) this.handlers.onToggleInventory();
          break;
        case 'Escape':
          if (this.handlers.onTogglePause) this.handlers.onTogglePause();
          break;
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': this.state.forward = false; break;
        case 'KeyS': this.state.backward = false; break;
        case 'KeyA': this.state.strafeLeft = false; break;
        case 'KeyD': this.state.strafeRight = false; break;
        case 'ShiftLeft': this.state.sprint = false; break;
      }
    });

    window.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 2) {
        this.state.aiming = true;
        if (this.handlers.onAimChange) this.handlers.onAimChange(true);
      } else if (e.button === 0) {
        if (this.handlers.onShoot) this.handlers.onShoot();
      } else if (e.button === 1) {
        // Middle mouse button activates Stasis
        if (this.handlers.onStasis) this.handlers.onStasis();
      }
    });

    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button === 2) {
        this.state.aiming = false;
        if (this.handlers.onAimChange) this.handlers.onAimChange(false);
      }
    });

    window.addEventListener('contextmenu', (e: MouseEvent) => e.preventDefault());
  }
}
