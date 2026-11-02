# Proposal 003: Holographic Inventory, Zero-HUD Immersion & Extensible Inventory Architecture

- **Status**: Accepted (decisions in section 7); phases 1-4 implemented, phases 5-6 pending
- **Date**: 2026-11-01
- **Target**: `src/ui/`, `src/inventory/` (new), `src/camera/ThirdPersonCamera.ts`, `src/core/Engine.ts`, `src/entities/Player.ts`

---

## 1. Goals

1. Remove the 2D HTML HUD (`#hud` in `index.html`) so every piece of information lives in the world or in the inventory hologram.
2. Add a real-time (game never pauses) holographic inventory, like the original: Isaac sits at the left of the frame, the panel floats at the right.
3. Make it work in the tight corridors of the level, including when Isaac is pressed against a wall.
4. Build it data-driven, so new items, tabs, logs, sectors and story content are added as data/small modules, not by editing the UI.

---

## 2. Zero-HUD: where each HUD element goes

| Today (2D HTML)              | Replacement                                                                                           |
| :--------------------------- | :---------------------------------------------------------------------------------------------------- |
| `RIG VITAL` bar + `%`        | Already diegetic: RIG spine on Isaac's back. Remove the HTML copy (and the `updateRigSpine` DOM code in `Player.ts`). |
| Stasis                       | Already diegetic: shoulder dial.                                                                       |
| Ammo                         | Already diegetic: holo on the Plasma Cutter. Fix its clipping into the arm (visible in the current non-aim screenshot). |
| Medkit count / Flashlight    | Inventory (medkit stack). The flashlight beam itself is the feedback; `F` stays as a gameplay action. `Q` no longer heals (see section 4). |
| `MISIÓN PRIORITARIA`         | Objectives tab of the inventory. Optional: a short holographic hint when a new objective starts.       |
| `AMENAZAS ACTIVAS`           | Delete. It leaks information the original never gave.                                                  |
| Prompt bar (`+15 plasma...`) | Small pickup toast, bottom-left, in the holo font (the original does this). Context prompts ("press F") become a hologram near the interactable. |
| Crosshair brackets           | **Kept** (HTML). Isaac's model is primitive and the cutter's light does not track the aim, so the static screen-space reticle is the source of truth for where shots land. Revisit if the cutter gets a proper aimed laser. |
| Damage flash, CRT, vignette  | Keep: these are screen effects, not HUD.                                                               |

Rule: after this change, `index.html` contains only the canvas container, screen effects, the crosshair, `#holo-menu` and a new `#holo-inventory`.

---

## 3. Solving the wall problem

Why it is a problem: if the hologram or the camera move are placed *in the world* next to Isaac, a wall on his left blocks them. The fix is to make the inventory **independent of world geometry**.

### 3.1 The panel is screen-space, not world-space
A DOM/CSS-3D overlay (same technology and styling as `HoloMenu`: perspective, tilted slab, Geist Pixel Line). Walls can never occlude it; it gets mouse input and crisp text for free. The opening animation (panel unfolding in perspective) is pure CSS and needs no space. A dark veil behind it keeps it readable when the camera is against a wall. Mouse movement adds a **minimal parallax** (`--mx` / `--my` tilt the stage a couple of degrees; inner layers sit at different `translateZ`).

### 3.2 Moving Isaac to the left of the frame without moving the camera
`PerspectiveCamera.setViewOffset()` (a horizontal shift of the projection, eased in/out). Isaac slides left on screen with **zero world-space camera movement**, so nothing can collide. A slight FOV narrowing (65 -> 55) adds the framing look.

### 3.3 Orbit pose probing (4 orientations)
For the extra cinematic angle (camera swings toward Isaac's side so he faces the panel), space is never assumed:
1. Candidate camera poses at orbit angles +65, +50, +35, +20 degrees (positive = the side that makes Isaac face screen-right, verified numerically).
2. For each, raycast from Isaac's head to the pose against `level.colliders`, with clearance.
3. Pick the first free pose; if none is free, stay on the shift only. Ease to it, and back on close.

The suit never fades while the inventory is open.

### 3.4 Isaac stands still
While open Isaac is rooted (neutral input, no aim/shoot/reload/flashlight). The game keeps running; damage does not close it. The mouse is free for the UI.

> *Tried and rejected (phase 4 iterations)*: a world-space CSS3D hologram attached to Isaac (billboard / tilted toward the camera / depth "hole" so Isaac occludes it), turning Isaac toward free space, a head glance toward the panel, and a camera-locked depth cut-out so Isaac draws over the panel. They produced odd perspectives or clipped the panel. The screen-space overlay with orbit probing is simpler and robust in tight corridors.

---

## 4. Business rules

**Real time**
- `isPaused` stays `false`. Enemies, AI, stasis timers and audio keep running.
- While open, Isaac is rooted: movement, aim, shoot, reload, sprint and the flashlight are blocked (hands on the RIG).
- The panel is drawn over walls (screen-space overlay); a dark veil and its backing plate keep it readable.
- Opening is blocked while dead, in the end screens, in the pause menu, and (future) while grappled.
- Taking damage does **not** close it (tension is the point). The red damage flash and the suit's spine react, and `Esc`/`Tab` closes instantly (short close animation, input back right away).

**Items**
- Using an item is instant and real-time (med pack heals immediately, same as `heal()` today).
- Items stack up to `maxStack`; the grid has a limited number of slots (**5 columns x 3 rows = 15 slots**; rows can be unlocked by suit level later).
- Pickups are collected **automatically** on proximity, as today, only while there is room (a free slot, or free stack space for stackable items). Otherwise the item stays in the world and the toast shows "inventory full". No manual pick-up/drop in v1.
- No quick-use keys for consumables (as in the original): healing or refilling stasis requires opening the inventory, and the game keeps running meanwhile. That exposure is the cost. `R` (reload), `F` (flashlight) and firing stasis stay as gameplay actions. `Q` stops healing; update README and the controls menu.
- Dropping is not in v1 (the original also has no free drop for story items).

**Pause menu vs inventory**
- `Tab` toggles the inventory. `Esc` closes it if open, otherwise opens the pause menu. Inside it: WASD / arrows navigate, `Enter` or click uses, `Q`/`E` switch tabs, mouse hover/click works.
- Pointer lock is released while open (the mouse is needed to click slots); `Engine` guards `pointerlockchange` with `inventoryOpen` so that is not read as "pause". Closing re-requests the lock.

---

## 5. Architecture (extensible by design)

```text
src/inventory/
├── ItemDefs.ts          # registry: id -> ItemDef (data only)
├── Inventory.ts         # pure model: slots, stacks, add/remove/use, events (no DOM, no Three)
├── tabs/
│   ├── HoloTab.ts       # interface every tab implements
│   ├── InventoryTab.ts  # weapons ring, grid, suit/nodes/credits side panel, description bar
│   ├── MissionTab.ts    # two columns: objectives list + personal journal (see 5.4)
│   └── LogsTab.ts       # audio/text logs collected
└── ItemIcons.ts         # procedural icons (canvas), no image assets
src/ui/
├── HoloInventory.ts     # shell: open/close anim, tab bar (LB/RB = Q/E), input routing, renders active tab
└── HoloInventory.css
```

### 5.1 Item definition (data, no logic in the UI)
```ts
interface ItemDef {
  id: string;                 // 'med_small', 'plasma_energy', 'stasis_pack', 'plasma_cutter', 'log_001'
  name: string;
  description: string;
  category: 'weapon' | 'consumable' | 'ammo' | 'key' | 'log';
  maxStack: number;
  icon: (ctx: CanvasRenderingContext2D, size: number) => void; // procedural, in ItemIcons.ts
  use?: (game: DeadSpaceGame) => boolean;   // returns true if consumed
  canUse?: (game: DeadSpaceGame) => boolean; // e.g. med pack disabled at full HP
}
```
Adding a new item = one registry entry + one icon function. Nothing else changes.

### 5.2 Model
`Inventory` is pure TypeScript: `add(id, n)`, `remove(id, n)`, `count(id)`, `use(slot)`, `slots`, and an `onChange` event. It is unit-testable without a browser and serializable (`localStorage` save later).

`Player.medkits`, `reserveAmmo` and (see open question) `stasisCharges` stop being separate counters and become reads from the inventory. `checkPickupsAndEscape` calls `inventory.add(...)` instead of mutating the player. `PickupItem.type` widens from the 3-string union to an `ItemDef` id so new pickups (logs, nodes) need no engine changes.

### 5.3 Tabs
```ts
interface HoloTab {
  id: string; title: string; iconKey: string;
  render(root: HTMLElement, ctx: TabContext): void;   // build DOM once
  refresh(): void;                                    // on inventory/game change
  onNav(dir: 'up'|'down'|'left'|'right'): void;
  onConfirm(): void;
  onSecondary?(): void;                               // e.g. reset / drop later
  footerHints(): Hint[];                              // drives the Navigate / Select / Exit bar
}
```
Tabs register in a list in `HoloInventory`. Future tabs (Schematics, Store/Bench, Map per sector, Suit upgrades) are new files, nothing else.

### 5.4 Content that will grow
- **Mission tab** (reference screenshot): left column `OBJECTIVES` (selectable list, each entry styled by state: active / completed / pending), right column `PERSONAL JOURNAL` showing the text tied to the focused objective. Footer: `Navegar` / `[Tab] Salir`. The tab bar has 4 icons with `<` `>` arrows (Inventory, Map placeholder, Mission, Logs); the Map tab can be an empty "no data" tab until sectors exist.
- **Sectors / story**: objectives and logs come from a `SectorDef` (id, objectives[], logs[]); the Objectives and Logs tabs only read from the current sector. Proposal 002's tram/sector system plugs in here.
- **Weapons**: the weapon ring maps to an `equipped` list; v1 only has the Plasma Cutter, the 4-slot ring is built but mostly empty.
- **Currency**: `nodes` and `credits` live in the model from day one (shown as 0) so the side panel matches the reference and the bench/store comes later without a rewrite.

### 5.5 Navigation
- Tabs: `Q` / `E` (or `LB`/`RB` hints in the bar), plus clicking the tab icons.
- Grid: `WASD` / arrows, mouse hover to focus, `Enter` / click to use, `Esc` / `Tab` close.
- Description bar at the bottom shows the focused item (name, text, icon), as in the reference; footer shows `Navegar / Usar / Salir`.
- Reuse `HoloMenu`'s input capture (window keydown in capture phase swallowing gameplay keys) and UI sounds (`playUiMove`, `playUiSelect`, `playUiBack`).

### 5.6 Images without image files
Zero-assets rule holds: item icons are drawn on a `<canvas>` (or small SVG) from primitives, consistent with `TextureFactory`. A shared `drawIcon(def)` is cached per item.

---

## 6. Phased plan

1. **Model + registry**: `Inventory`, `ItemDefs` for the current items (plasma energy, med pack, stasis pack, plasma cutter). Move player counters/pickups onto it. No visible change yet.
2. **Zero-HUD**: delete `#hud` and its CSS/DOM writes in `Engine.ts`/`Player.ts`; add the pickup toast; fix the ammo holo clipping.
3. **Camera inventory shot**: `setViewOffset` shift + FOV ease, then pose probing; opacity lock. Testable with a debug key.
4. **HoloInventory shell + InventoryTab**: open/close anim, rooted-Isaac rules, pointer-lock guard in `Engine`.
5. **Mission + Logs tabs** and sample `SectorDef`.
6. **Persistence** of the inventory (optional) and polish (sound, flicker, hover).

Each phase leaves the game playable.

---

## 7. Decisions

1. **Stasis packs**: stored in the inventory; the stasis meter is refilled by *using* a pack from the inventory (no longer instant on pickup).
2. **Damage**: taking damage does not close the inventory.
3. **Grid**: 5 x 3 (15 slots).
4. **Inventory key**: `Tab`. `Q` no longer heals; consumables are used only from the inventory.
5. **Pickups**: automatic while there is space.
6. **Crosshair**: stays as the HTML reticle (source of truth for aim).

## 8. Next step

Start at phase 1 (section 6): `Inventory` model + `ItemDefs` (plasma energy, small med pack, stasis pack, plasma cutter), move `medkits` / `reserveAmmo` / stasis refills onto it, with no visible UI change. README controls and `GameMenus.ts` controls list need updating when `Q` stops healing (phase 4).
