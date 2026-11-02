import type { HoloTab, NavDir, TabContext } from '../inventory/tabs/HoloTab';
import './HoloInventory.css';

/**
 * HoloInventory
 * Shell of the holographic inventory: open/close animation, tab bar, footer hints and
 * input routing. Tabs implement `HoloTab` and know nothing about the shell.
 *
 * The game never pauses while it is open; the Engine decides what "open" means for
 * Isaac (rooted, camera shot, pointer lock). This class only owns the hologram.
 */
export class HoloInventory {
  isOpen = false;

  private tabs: HoloTab[] = [];
  private active = 0;
  private tabBody: HTMLElement;
  private tabBar: HTMLElement;
  private titleEl: HTMLElement;
  private footerEl: HTMLElement;
  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor(
    public root: HTMLElement,
    private ctx: TabContext,
    private onRequestClose: () => void
  ) {
    this.root.classList.add('holo-inventory');
    this.root.innerHTML = `
      <div class="hi-veil"></div>
      <div class="hi-viewport">
        <div class="hi-stage">
          <section class="hi-panel">
            <header class="hi-header">
              <div class="hi-tabs"></div>
              <div class="hi-titlebar">
                <span class="hi-arrow l">&lt;</span>
                <span class="hi-title"></span>
                <span class="hi-arrow r">&gt;</span>
              </div>
            </header>
            <div class="hi-body"></div>
            <footer class="hi-footer"></footer>
          </section>
        </div>
      </div>
    `;
    this.tabBody = this.root.querySelector('.hi-body') as HTMLElement;
    this.tabBar = this.root.querySelector('.hi-tabs') as HTMLElement;
    this.titleEl = this.root.querySelector('.hi-title') as HTMLElement;
    this.footerEl = this.root.querySelector('.hi-footer') as HTMLElement;

    this.root.querySelector('.hi-arrow.l')!.addEventListener('click', () => this.switchTab(-1));
    this.root.querySelector('.hi-arrow.r')!.addEventListener('click', () => this.switchTab(1));
    this.bindGlobalListeners();
  }

  // ───────────────────────────── Public API ─────────────────────────────

  register(tab: HoloTab): void {
    const pane = document.createElement('div');
    pane.className = 'hi-pane';
    pane.hidden = true;
    this.tabBody.appendChild(pane);
    tab.mount(pane, this.ctx);
    this.tabs.push(tab);

    const icon = document.createElement('button');
    icon.className = 'hi-tab-icon';
    icon.type = 'button';
    icon.title = tab.title;
    icon.innerHTML = tab.icon;
    icon.addEventListener('click', () => this.showTab(this.tabs.indexOf(tab)));
    this.tabBar.appendChild(icon);

    if (this.tabs.length === 1) this.showTab(0, false);
  }

  open(): void {
    if (this.isOpen || this.tabs.length === 0) return;
    this.isOpen = true;
    this.root.classList.add('is-open');
    this.root.classList.remove('is-opening');
    void this.root.offsetWidth; // restart the unfold animation
    this.root.classList.add('is-opening');
    this.showTab(this.active, false);

    // Dynamic availability (e.g. med pack at full health) changes without inventory events
    this.refreshTimer = setInterval(() => this.tabs[this.active]?.refresh(), 250);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('is-open', 'is-opening');
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  // ───────────────────────────── Tabs ─────────────────────────────

  private showTab(index: number, sound = true): void {
    if (index < 0 || index >= this.tabs.length) return;
    if (sound && index !== this.active) this.ctx.sound.playUiMove();
    this.active = index;

    this.tabs.forEach((tab, i) => {
      (this.tabBody.children[i] as HTMLElement).hidden = i !== index;
      this.tabBar.children[i].classList.toggle('is-active', i === index);
    });

    const tab = this.tabs[index];
    this.titleEl.textContent = tab.title;
    this.root.classList.toggle('has-tabs', this.tabs.length > 1);
    tab.onShow();
    this.renderFooter();
  }

  private switchTab(dir: number): void {
    if (this.tabs.length < 2) return;
    this.showTab((this.active + dir + this.tabs.length) % this.tabs.length);
  }

  private renderFooter(): void {
    const hints = this.tabs[this.active]?.footerHints() ?? [];
    this.footerEl.innerHTML = hints
      .map(h => `<span class="hi-hint">${h.keys.map(k => `<kbd>${k}</kbd>`).join('')} ${h.label}</span>`)
      .join('');
  }

  // ───────────────────────────── Input ─────────────────────────────

  private bindGlobalListeners(): void {
    // Capture phase on window: swallows every key while open so gameplay never sees it
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!this.isOpen) return;
      if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat && (e.code === 'Tab' || e.code === 'Escape' || e.code === 'Enter')) return;

      const tab = this.tabs[this.active];
      const nav: Record<string, NavDir> = {
        ArrowUp: 'up', KeyW: 'up',
        ArrowDown: 'down', KeyS: 'down',
        ArrowLeft: 'left', KeyA: 'left',
        ArrowRight: 'right', KeyD: 'right'
      };

      if (nav[e.code]) tab.onNav(nav[e.code]);
      else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') tab.onConfirm();
      else if (e.code === 'KeyQ') this.switchTab(-1);
      else if (e.code === 'KeyE') this.switchTab(1);
      else if (e.code === 'Tab' || e.code === 'Escape' || e.code === 'Backspace') this.onRequestClose();
    }, true);

    // Subtle parallax tilt of the panel, same idea as HoloMenu
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isOpen) return;
      const mx = (e.clientX / window.innerWidth - 0.5) * 2;
      const my = (e.clientY / window.innerHeight - 0.5) * 2;
      this.root.style.setProperty('--mx', mx.toFixed(3));
      this.root.style.setProperty('--my', my.toFixed(3));
    });
  }
}
