/**
 * Input Manager
 * Manages keyboard, mouse buttons, aiming triggers, and contextual keybinds.
 */
export class InputManager {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.state = {
      forward: false,
      backward: false,
      strafeLeft: false,
      strafeRight: false,
      sprint: false,
      aiming: false
    };

    this.setupListeners();
  }

  setupListeners() {
    window.addEventListener('keydown', (e) => {
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
        case 'KeyQ':
          if (this.handlers.onHeal) this.handlers.onHeal();
          break;
        case 'Escape':
          if (this.handlers.onTogglePause) this.handlers.onTogglePause();
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': this.state.forward = false; break;
        case 'KeyS': this.state.backward = false; break;
        case 'KeyA': this.state.strafeLeft = false; break;
        case 'KeyD': this.state.strafeRight = false; break;
        case 'ShiftLeft': this.state.sprint = false; break;
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        this.state.aiming = true;
        if (this.handlers.onAimChange) this.handlers.onAimChange(true);
      } else if (e.button === 0) {
        if (this.handlers.onShoot) this.handlers.onShoot();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) {
        this.state.aiming = false;
        if (this.handlers.onAimChange) this.handlers.onAimChange(false);
      }
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
