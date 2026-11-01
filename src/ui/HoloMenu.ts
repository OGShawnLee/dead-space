import type { SoundSystem } from '../core/SoundSystem';
import './HoloMenu.css';

/**
 * HoloMenu
 * Dead Space–style 3D stacked holographic menu.
 *
 * - Every submenu is a new panel pushed onto a 3D stack. Previous panels recede
 *   backwards and to the left (staggered depth), exactly like the original game.
 * - Header slashes reflect depth: "/ MAIN MENU" → "// SETTINGS" → "/// CAMERA".
 * - Keyboard (↑↓ / W S, ←→ / A D, Enter, Esc) + mouse (hover, click, drag sliders,
 *   wheel, click a receded panel to jump back to it).
 * - A side description panel explains the focused entry.
 */

export type MenuItemKind = 'action' | 'submenu' | 'toggle' | 'slider' | 'select' | 'info' | 'text';
export type MenuVariant = 'default' | 'danger' | 'success';
export type MenuMode = 'main' | 'pause' | 'end';

type Dyn<T> = T | (() => T);

export interface MenuItemDef {
  id: string;
  label: string;
  /** Defaults to 'submenu' when `submenu` is set, otherwise 'action'. */
  kind?: MenuItemKind;
  description?: Dyn<string>;
  disabled?: Dyn<boolean>;
  /** Renders the focused state with the danger palette (e.g. destructive confirms). */
  danger?: boolean;

  /** action */
  onSelect?: () => void;
  /** submenu */
  submenu?: () => MenuDef;

  /** toggle */
  getBool?: () => boolean;
  setBool?: (v: boolean) => void;

  /** slider */
  getNum?: () => number;
  setNum?: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;

  /** select */
  options?: string[];
  getIndex?: () => number;
  setIndex?: (i: number) => void;

  /** info */
  value?: Dyn<string>;
  keys?: string[];

  /** text (non-focusable paragraph block, trusted static HTML) */
  html?: string;
}

export interface MenuDef {
  id: string;
  title: string;
  items: MenuItemDef[];
  variant?: MenuVariant;
  /** Side panel copy shown when the panel has no focusable entries. */
  intro?: { title: string; body: string };
}

export interface OpenOptions {
  /** Invoked when "back" is requested on the root panel (e.g. resume from pause). */
  onBackAtRoot?: () => void;
}

interface PanelState {
  def: MenuDef;
  el: HTMLElement;
  listEl: HTMLElement;
  footerEl: HTMLElement;
  itemEls: (HTMLElement | null)[];
  focus: number;
}

const STATUS_LOG = [
  '¡PELIGRO! BRECHA DE COMBUSTIBLE EN SECCIÓN 205',
  'BLOQUEO DE MAMPAROS INICIADO // CUBIERTA 04',
  'PROPULSORES: NO OPERATIVOS',
  'ESCANEO DEL SISTEMA FINALIZADO',
  'SOPORTE VITAL AL 34% // FILTROS COMPROMETIDOS',
  'DESCOMPRESIÓN NO PLANIFICADA EN SECCIÓN 206',
  'ENLACE CON USG KELLION: SIN RESPUESTA',
  'ÓRBITA DE AEGIS VII: DECAYENDO',
  'TRANVÍA DE CARGA: ENERGÍA INTERRUMPIDA',
  'ALERTA DE CUARENTENA // CUBIERTA MÉDICA',
  'C.E.C. RIG OS v4.2 // DIAGNÓSTICO OK'
];

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const resolve = <T>(v: Dyn<T> | undefined, fallback: T): T =>
  v === undefined ? fallback : typeof v === 'function' ? (v as () => T)() : v;

export class HoloMenu {
  stack: PanelState[] = [];
  mode: MenuMode | null = null;
  isOpen = false;

  private stage: HTMLElement;
  private descEl: HTMLElement;
  private descTitle: HTMLElement;
  private descBody: HTMLElement;
  private logEl: HTMLElement;
  private openedAt = 0;
  private onBackAtRoot?: () => void;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private logTimer?: ReturnType<typeof setInterval>;
  private logCursor = 0;
  private dragging: { panel: PanelState; index: number; track: HTMLElement } | null = null;

  constructor(public root: HTMLElement, private sound: SoundSystem) {
    this.root.innerHTML = `
      <div class="holo-backdrop">
        <div class="holo-watermark" aria-hidden="true">DEAD<br>SPACE</div>
        <div class="holo-log" aria-hidden="true"></div>
        <div class="holo-version">C.E.C. RIG OS // v0.4.2</div>
      </div>
      <div class="holo-viewport">
        <div class="holo-stage"></div>
      </div>
      <aside class="holo-desc">
        <div class="holo-desc-label">/ INFO</div>
        <div class="holo-desc-title"></div>
        <div class="holo-desc-body"></div>
      </aside>
    `;
    this.stage = this.root.querySelector('.holo-stage') as HTMLElement;
    this.descEl = this.root.querySelector('.holo-desc') as HTMLElement;
    this.descTitle = this.root.querySelector('.holo-desc-title') as HTMLElement;
    this.descBody = this.root.querySelector('.holo-desc-body') as HTMLElement;
    this.logEl = this.root.querySelector('.holo-log') as HTMLElement;

    this.bindGlobalListeners();
  }

  // ───────────────────────────── Public API ─────────────────────────────

  open(def: MenuDef, mode: MenuMode, opts: OpenOptions = {}): void {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.stack.forEach(p => p.el.remove());
    this.stack = [];

    this.mode = mode;
    this.onBackAtRoot = opts.onBackAtRoot;
    this.isOpen = true;
    this.openedAt = performance.now();

    this.root.classList.remove('mode-main', 'mode-pause', 'mode-end');
    this.root.classList.add('is-open', `mode-${mode}`);

    if (mode === 'main') this.startLog();
    else this.stopLog();

    this.push(def);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.dragging = null;
    this.root.classList.remove('is-open');
    this.stopLog();
    this.closeTimer = setTimeout(() => {
      if (this.isOpen) return;
      this.stack.forEach(p => p.el.remove());
      this.stack = [];
      this.mode = null;
    }, 450);
  }

  push(def: MenuDef): void {
    const panel = this.renderPanel(def, this.stack.length);
    this.stack.push(panel);

    panel.el.classList.add('is-entering');
    this.stage.appendChild(panel.el);
    void panel.el.offsetWidth; // force reflow so the entering transition runs
    requestAnimationFrame(() => panel.el.classList.remove('is-entering'));

    this.layout();
    panel.focus = this.firstFocusable(panel);
    this.applyFocus(panel);
  }

  /** Go back one level. On the root panel this delegates to `onBackAtRoot`. */
  back(): void {
    if (!this.isOpen) return;
    if (this.stack.length <= 1) {
      if (this.onBackAtRoot) {
        this.sound.playUiBack();
        this.onBackAtRoot();
      }
      return;
    }
    const top = this.stack.pop() as PanelState;
    top.el.classList.add('is-leaving');
    setTimeout(() => top.el.remove(), 420);
    this.sound.playUiBack();
    this.layout();
    const current = this.top();
    if (current) {
      this.refreshControls(current);
      this.applyFocus(current);
    }
  }

  /** Re-renders dynamic values (toggles, sliders, info values) of the active panel. */
  refresh(): void {
    const top = this.top();
    if (top) {
      this.refreshControls(top);
      this.updateDescription(top);
    }
  }

  // ───────────────────────────── Rendering ─────────────────────────────

  private renderPanel(def: MenuDef, depthIndex: number): PanelState {
    const el = document.createElement('section');
    el.className = `holo-panel holo-panel--${def.variant ?? 'default'}`;
    const slashes = '/'.repeat(Math.min(depthIndex + 1, 3));

    el.innerHTML = `
      <header class="holo-header">
        <span class="holo-header-text"><span class="holo-slashes">${slashes}</span> ${escapeHtml(def.title)}</span>
        <span class="holo-header-notch"></span>
      </header>
      <div class="holo-body"><div class="holo-list" role="menu"></div></div>
      <footer class="holo-footer"></footer>
    `;

    const listEl = el.querySelector('.holo-list') as HTMLElement;
    const footerEl = el.querySelector('.holo-footer') as HTMLElement;
    const panel: PanelState = { def, el, listEl, footerEl, itemEls: [], focus: -1 };

    def.items.forEach((item, i) => {
      const kind = this.kindOf(item);
      if (kind === 'text') {
        const block = document.createElement('div');
        block.className = 'holo-text';
        block.innerHTML = item.html ?? '';
        listEl.appendChild(block);
        panel.itemEls.push(null);
        return;
      }

      const row = document.createElement('div');
      row.className = `holo-item holo-item--${kind}${item.danger ? ' is-danger' : ''}`;
      row.setAttribute('role', 'menuitem');
      row.dataset.index = String(i);
      row.innerHTML = `
        <span class="holo-item-tab"></span>
        <span class="holo-item-label">${escapeHtml(item.label)}</span>
        <span class="holo-item-control">${this.controlMarkup(item, kind)}</span>
      `;

      row.addEventListener('mouseenter', () => {
        if (this.top() !== panel || this.dragging) return;
        if (this.isFocusable(item) && panel.focus !== i) {
          panel.focus = i;
          this.applyFocus(panel);
          this.sound.playUiMove();
        }
      });

      row.addEventListener('click', (e: MouseEvent) => {
        if (this.top() !== panel) return; // receded panels are handled by panel click
        // Keep the click from reaching the panel handler, which would treat the
        // freshly pushed submenu as "a deeper panel to pop back from".
        e.stopPropagation();
        if (!this.isFocusable(item)) return;
        panel.focus = i;
        this.applyFocus(panel);

        const target = e.target as HTMLElement;
        if (kind === 'select') {
          if (target.closest('.holo-select-arrow.l')) { this.adjust(-1); return; }
          if (target.closest('.holo-select-arrow.r')) { this.adjust(1); return; }
        }
        if (kind === 'slider') return; // handled by pointer drag
        this.activate();
      });

      if (kind === 'slider') {
        const track = row.querySelector('.holo-slider-track') as HTMLElement;
        track.addEventListener('pointerdown', (e: PointerEvent) => {
          if (this.top() !== panel || !this.isFocusable(item)) return;
          e.preventDefault();
          panel.focus = i;
          this.applyFocus(panel);
          this.dragging = { panel, index: i, track };
          track.setPointerCapture(e.pointerId);
          this.setSliderFromPointer(e.clientX);
        });
        track.addEventListener('pointermove', (e: PointerEvent) => {
          if (this.dragging && this.dragging.track === track) this.setSliderFromPointer(e.clientX);
        });
        const endDrag = (): void => { if (this.dragging?.track === track) this.dragging = null; };
        track.addEventListener('pointerup', endDrag);
        track.addEventListener('pointercancel', endDrag);
      }

      listEl.appendChild(row);
      panel.itemEls.push(row);
    });

    // Clicking a receded panel jumps back to that depth
    el.addEventListener('click', () => {
      const idx = this.stack.indexOf(panel);
      if (idx >= 0 && idx < this.stack.length - 1) {
        while (this.stack.length > idx + 1) this.back();
      }
    });

    // Mouse wheel scrolls focus through entries
    listEl.addEventListener('wheel', (e: WheelEvent) => {
      if (this.top() !== panel) return;
      e.preventDefault();
      this.move(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    this.refreshControls(panel);
    return panel;
  }

  private controlMarkup(item: MenuItemDef, kind: MenuItemKind): string {
    switch (kind) {
      case 'submenu':
        return '<span class="holo-chevron"></span>';
      case 'toggle':
        return '<span class="holo-switch"><span class="holo-switch-bar"></span></span>';
      case 'slider':
        return `
          <span class="holo-slider">
            <span class="holo-slider-track"><span class="holo-slider-fill"></span><span class="holo-slider-thumb"></span></span>
            <span class="holo-slider-val"></span>
          </span>`;
      case 'select': {
        const pips = (item.options ?? []).map(() => '<i></i>').join('');
        return `
          <span class="holo-select">
            <span class="holo-select-row">
              <span class="holo-select-arrow l">&lt;</span>
              <span class="holo-select-val"></span>
              <span class="holo-select-arrow r">&gt;</span>
            </span>
            <span class="holo-select-pips">${pips}</span>
          </span>`;
      }
      case 'info':
        if (item.keys && item.keys.length) {
          return `<span class="holo-keys">${item.keys
            .map(k => (k === '/' ? '<span class="holo-key-sep">/</span>' : `<kbd>${escapeHtml(k)}</kbd>`))
            .join('')}</span>`;
        }
        return '<span class="holo-info-val"></span>';
      default:
        return '';
    }
  }

  private refreshControls(panel: PanelState): void {
    panel.def.items.forEach((item, i) => {
      const row = panel.itemEls[i];
      if (!row) return;
      const kind = this.kindOf(item);
      row.classList.toggle('is-disabled', resolve(item.disabled, false));

      if (kind === 'toggle') {
        const on = item.getBool ? item.getBool() : false;
        row.querySelector('.holo-switch')?.classList.toggle('is-on', on);
      } else if (kind === 'slider') {
        const min = item.min ?? 0;
        const max = item.max ?? 1;
        const v = item.getNum ? item.getNum() : min;
        const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
        const fill = row.querySelector('.holo-slider-fill') as HTMLElement | null;
        const thumb = row.querySelector('.holo-slider-thumb') as HTMLElement | null;
        const val = row.querySelector('.holo-slider-val') as HTMLElement | null;
        if (fill) fill.style.width = `${pct}%`;
        if (thumb) thumb.style.left = `${pct}%`;
        if (val) val.textContent = item.format ? item.format(v) : String(Math.round(v));
      } else if (kind === 'select') {
        const opts = item.options ?? [];
        const idx = item.getIndex ? item.getIndex() : 0;
        const val = row.querySelector('.holo-select-val') as HTMLElement | null;
        if (val) val.textContent = opts[idx] ?? '';
        row.querySelectorAll('.holo-select-pips i').forEach((pip, p) => pip.classList.toggle('is-on', p === idx));
      } else if (kind === 'info' && !(item.keys && item.keys.length)) {
        const val = row.querySelector('.holo-info-val') as HTMLElement | null;
        if (val) val.textContent = resolve(item.value, '');
      }
    });
  }

  /** Positions every panel in the 3D stack according to its depth. */
  private layout(): void {
    const n = this.stack.length;
    this.stack.forEach((p, i) => {
      const d = n - 1 - i;
      p.el.style.setProperty('--d', String(d));
      p.el.style.zIndex = String(i + 1);
      p.el.classList.toggle('is-active', d === 0);
      p.el.classList.toggle('is-behind', d > 0);
      p.el.classList.toggle('is-hidden', d > 3);
    });
  }

  // ───────────────────────────── Focus / Navigation ─────────────────────────────

  private top(): PanelState | undefined {
    return this.stack[this.stack.length - 1];
  }

  private kindOf(item: MenuItemDef): MenuItemKind {
    return item.kind ?? (item.submenu ? 'submenu' : 'action');
  }

  private isFocusable(item: MenuItemDef): boolean {
    return this.kindOf(item) !== 'text' && !resolve(item.disabled, false);
  }

  private firstFocusable(panel: PanelState): number {
    return panel.def.items.findIndex(it => this.isFocusable(it));
  }

  private applyFocus(panel: PanelState): void {
    panel.itemEls.forEach((row, i) => row?.classList.toggle('is-focused', i === panel.focus));

    // Keep focused entry visible inside the scrollable list
    const row = panel.itemEls[panel.focus];
    if (row) {
      const list = panel.listEl;
      const top = row.offsetTop - list.offsetTop;
      const bottom = top + row.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top - 6;
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 6;
    }

    this.updateDescription(panel);
    this.updateFooter(panel);
  }

  private updateDescription(panel: PanelState): void {
    const item = panel.def.items[panel.focus];
    let title = '';
    let body = '';
    if (item) {
      title = item.label;
      body = resolve(item.description, '');
    } else if (panel.def.intro) {
      title = panel.def.intro.title;
      body = panel.def.intro.body;
    }
    if (!body && panel.def.intro) {
      title = panel.def.intro.title;
      body = panel.def.intro.body;
    }

    this.descEl.classList.toggle('is-empty', !body);
    this.descEl.classList.remove('holo-desc--danger', 'holo-desc--success');
    if (panel.def.variant && panel.def.variant !== 'default') {
      this.descEl.classList.add(`holo-desc--${panel.def.variant}`);
    }
    if (this.descTitle.textContent !== title || this.descBody.textContent !== body) {
      this.descEl.classList.remove('is-swap');
      void this.descEl.offsetWidth;
      this.descEl.classList.add('is-swap');
      this.descTitle.textContent = title;
      this.descBody.textContent = body;
    }
  }

  private updateFooter(panel: PanelState): void {
    const item = panel.def.items[panel.focus];
    const kind = item ? this.kindOf(item) : null;
    const hints: string[] = [];
    if (kind === 'action' || kind === 'submenu' || kind === 'toggle') {
      hints.push('<span class="holo-hint"><kbd>ENTER</kbd> SELECCIONAR</span>');
    }
    if (kind === 'slider' || kind === 'select' || kind === 'toggle') {
      hints.push('<span class="holo-hint"><kbd>&lt;</kbd><kbd>&gt;</kbd> AJUSTAR</span>');
    }
    if (this.stack.length > 1 || this.onBackAtRoot) {
      hints.push('<span class="holo-hint"><kbd>ESC</kbd> ATRÁS</span>');
    }
    panel.footerEl.innerHTML = hints.join('');
  }

  private move(delta: number): void {
    const panel = this.top();
    if (!panel) return;
    const items = panel.def.items;
    if (!items.some(it => this.isFocusable(it))) return;

    let i = panel.focus;
    for (let n = 0; n < items.length; n++) {
      i = (i + delta + items.length) % items.length;
      if (this.isFocusable(items[i])) break;
    }
    if (i !== panel.focus) {
      panel.focus = i;
      this.applyFocus(panel);
      this.sound.playUiMove();
    }
  }

  private activate(): void {
    const panel = this.top();
    if (!panel) return;
    const item = panel.def.items[panel.focus];
    if (!item || !this.isFocusable(item)) return;

    switch (this.kindOf(item)) {
      case 'action':
        this.sound.playUiSelect();
        this.flash(panel);
        item.onSelect?.();
        break;
      case 'submenu':
        if (item.submenu) {
          this.sound.playUiSelect();
          this.push(item.submenu());
        }
        return;
      case 'toggle':
      case 'select':
        this.adjust(1);
        return;
      default:
        return;
    }
    if (this.isOpen && this.top() === panel) {
      this.refreshControls(panel);
      this.updateDescription(panel);
    }
  }

  private adjust(dir: number): void {
    const panel = this.top();
    if (!panel) return;
    const item = panel.def.items[panel.focus];
    if (!item || !this.isFocusable(item)) return;
    const kind = this.kindOf(item);

    if (kind === 'toggle' && item.getBool && item.setBool) {
      item.setBool(!item.getBool());
    } else if (kind === 'slider' && item.getNum && item.setNum) {
      const min = item.min ?? 0;
      const max = item.max ?? 1;
      const step = item.step ?? 0.1;
      const next = Math.min(max, Math.max(min, item.getNum() + dir * step));
      item.setNum(Number(next.toFixed(4)));
    } else if (kind === 'select' && item.getIndex && item.setIndex && item.options?.length) {
      const len = item.options.length;
      item.setIndex((item.getIndex() + dir + len) % len);
    } else {
      return;
    }
    this.sound.playUiAdjust();
    this.refreshControls(panel);
    this.updateDescription(panel);
  }

  private setSliderFromPointer(clientX: number): void {
    if (!this.dragging) return;
    const { panel, index, track } = this.dragging;
    const item = panel.def.items[index];
    if (!item.setNum || !item.getNum) return;
    const rect = track.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
    const min = item.min ?? 0;
    const max = item.max ?? 1;
    const step = item.step ?? 0.1;
    const raw = min + t * (max - min);
    const snapped = Math.round((raw - min) / step) * step + min;
    const v = Number(Math.min(max, Math.max(min, snapped)).toFixed(4));
    if (v !== item.getNum()) {
      item.setNum(v);
      this.sound.playUiAdjust();
      this.refreshControls(panel);
    }
  }

  private flash(panel: PanelState): void {
    const row = panel.itemEls[panel.focus];
    if (!row) return;
    row.classList.remove('is-pressed');
    void row.offsetWidth;
    row.classList.add('is-pressed');
  }

  // ───────────────────────────── Ambient status log ─────────────────────────────

  private startLog(): void {
    this.stopLog();
    this.logEl.innerHTML = '';
    for (let i = 0; i < 6; i++) this.pushLogLine();
    this.logTimer = setInterval(() => this.pushLogLine(), 2600);
  }

  private stopLog(): void {
    if (this.logTimer) clearInterval(this.logTimer);
    this.logTimer = undefined;
  }

  private pushLogLine(): void {
    const line = document.createElement('div');
    line.className = 'holo-log-line';
    const text = STATUS_LOG[this.logCursor % STATUS_LOG.length];
    line.textContent = text;
    if (text.startsWith('¡PELIGRO') || text.includes('ALERTA')) line.classList.add('is-warn');
    this.logCursor++;
    this.logEl.appendChild(line);
    while (this.logEl.children.length > 7) this.logEl.firstElementChild?.remove();
  }

  // ───────────────────────────── Input ─────────────────────────────

  private bindGlobalListeners(): void {
    // Capture phase on window: runs before gameplay InputManager and swallows keys while open
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!this.isOpen) return;
      if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) return;

      this.unlockAudio();
      e.stopImmediatePropagation();

      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          e.preventDefault();
          this.move(-1);
          break;
        case 'ArrowDown':
        case 'KeyS':
        case 'Tab':
          e.preventDefault();
          this.move(e.shiftKey && e.code === 'Tab' ? -1 : 1);
          break;
        case 'ArrowLeft':
        case 'KeyA':
          e.preventDefault();
          this.adjust(-1);
          break;
        case 'ArrowRight':
        case 'KeyD':
          e.preventDefault();
          this.adjust(1);
          break;
        case 'Enter':
        case 'NumpadEnter':
        case 'Space':
        case 'KeyE':
          e.preventDefault();
          if (!e.repeat) this.activate();
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          // Guard against the Esc that just released pointer lock re-closing the menu
          if (!e.repeat && performance.now() - this.openedAt > 300) this.back();
          break;
      }
    }, true);

    this.root.addEventListener('pointerdown', () => this.unlockAudio());

    // Subtle parallax tilt of the whole holographic stack
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isOpen) return;
      const mx = (e.clientX / window.innerWidth - 0.5) * 2;
      const my = (e.clientY / window.innerHeight - 0.5) * 2;
      this.root.style.setProperty('--mx', mx.toFixed(3));
      this.root.style.setProperty('--my', my.toFixed(3));
    });
  }

  private unlockAudio(): void {
    this.sound.init();
    this.sound.resume();
  }
}
