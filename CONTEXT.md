# CONTEXT.md — Agent onboarding for `dead-space`

Read this first. It is the single place that explains what the project is, how it is built, the decisions already taken (including the ones that were tried and rejected), and how to work with the owner. Keep it updated when something here stops being true.

Last updated: 2026-11-04, branch `feat/visual-overhaul` (based on `1748b46`). Visual overhaul steps 1–2 (themes + unified palette) are implemented; owner confirmed they look good.

---

## 1. What this is

**Dead Space: Sector Protocol** — a playable third-person survival-horror prototype inspired by *Dead Space* (2008), running in the browser. Three.js + TypeScript + Vite, no frameworks, no external assets.

The player is Isaac Clarke on the USG Ishimura: a procedurally generated grid labyrinth of dark corridors, Necromorph enemies killed by **dismemberment**, a **stasis** module, a **flashlight**, a diegetic UI (RIG spine health, stasis dial, ammo hologram on the weapon) and a **holographic inventory / menu** in the style of the original.

### Hard constraints (from the README, do not break)
- **Zero external assets**: no `.gltf/.obj/.png/.jpg/.mp3/.wav`. Geometry is primitives; textures are generated at runtime on `<canvas>`; audio is synthesized with the Web Audio API. The only shipped asset is the font `public/fonts/GeistPixel-Line.woff2` (loaded by `HoloMenu.css`).
- **60 FPS** in the browser. Keep light counts, shadow-casting lights and per-frame allocations in mind.
- **Diegetic UI**: information lives on Isaac or in the world. The 2D HUD was removed on purpose (see 6).

---

## 2. Working with the owner

- The owner writes in **Spanish** and answers best to short, concrete replies; UI copy in the game is **Spanish** (menus, prompts, item names). Code, comments, commit messages, proposals and docs are **English**.
- Commits: **Conventional Commits in English** (`feat(scope): ...`, `fix(scope): ...`), end with the `Co-Authored-By` line from the active system reminder. **Do not commit or push unless asked.** Do work on a feature branch, never directly on `main`.
- The agent **cannot run a browser**. Visual and interaction work is verified only with `tsc`, `vite build` and small numeric `bun` scripts; always say it was not seen in the browser and tell the owner what to check. Prefer numeric checks (e.g. projecting points through a `PerspectiveCamera`) over guessing signs and directions.
- The owner iterates visually and **will say when something looks wrong**. Several approaches were tried and reverted (section 9). When asked to revert, revert fully and cleanly, and keep proposals as written references.
- Ask before big visual direction changes; the owner has strong, specific taste (see 9.2).

### Tooling gotchas (Windows, Git Bash)
- **Long `python - <<'EOF'` heredocs inside the Bash tool can fail** to parse ("unexpected EOF while looking for matching `'`"). For multi-file edits write the script to `$TEMP/xxx.py` with the **Write** tool, run it with `python "$TEMP/xxx.py" "$(pwd)"`, then delete it. Small heredocs work.
- When writing edit helpers, make `sub(s, old, new)` assert `s.count(old) == 1` and write the file back **after** all replacements (an early helper returned a stale copy and silently wrote nothing).
- Use `pwd -W` when a Windows-style absolute path is needed inside `bun` test scripts.
- Git warns "LF will be replaced by CRLF" — harmless.
- Handy checks:
  ```bash
  ./node_modules/.bin/tsc --noEmit -p .                                   # typecheck (TS 7, strict:false)
  ./node_modules/.bin/vite build --outDir "$TEMP/ds-build" --emptyOutDir  # production build, then rm -rf it
  bun run check:palette                                                   # fails on color literals outside Palette.ts
  bun scripts/isaac-check.ts                                              # Isaac contract, poses, tech colors, fade, framing (stub DOM)
  bun run dev                                                             # dev server (vite, port 3000)
  ```

---

## 3. Stack and config

| Item | Value |
| :--- | :--- |
| Runtime libs | `three@^0.187` (only dependency) |
| Dev | `vite@^8`, `typescript@^7`, `@types/three` |
| Entry | `index.html` -> `game.ts` -> `new DeadSpaceGame()` (`src/core/Engine.ts`) |
| TS config | `strict:false`, `types:["vite/client"]` (needed for CSS imports), includes `src/**/*` and `game.ts` |
| Deploy | `vercel.json` (clean URLs, immutable cache for js/css) |
| Package manager | bun (`bun.lock`), but `npm`/`node_modules/.bin` work |

`README.md` is **partially outdated** (it still describes `.js` files and an older folder tree); this file is the accurate map. The README's controls table is current.

---

## 4. Repository map

```text
dead-space/
├── CONTEXT.md                  # this file
├── README.md                   # public docs (architecture section is stale; controls table is current)
├── index.html                  # canvas container, CRT/vignette overlays, #hud (crosshair + toast), #holo-inventory, #holo-menu
├── style.css                   # global styles: overlays, damage flash, crosshair, pickup toast
├── game.ts                     # bootstrap
├── public/fonts/GeistPixel-Line.woff2
├── proposals/                  # design docs (see section 10)
└── src/
    ├── types.ts                # LimbType, LimbMesh, InputState, InputHandlers, CameraSettings, PickupItem, EscapeZone
    ├── core/
    │   ├── Engine.ts           # DeadSpaceGame: scene, renderer, loop, combat, stasis, pickups, menus + inventory flow
    │   ├── InputManager.ts     # keyboard/mouse -> InputState + handler callbacks
    │   └── SoundSystem.ts      # all audio (Web Audio): combat, enemies, UI blips, master volume, ambient drone
    ├── camera/ThirdPersonCamera.ts   # over-the-shoulder camera, pointer lock, aim zoom, collision, inventory shot
    ├── entities/
    │   ├── Player.ts           # Isaac gameplay: hp/ammo/stasis/inventory, movement + collisions, tech colors (RIG, stasis, ammo); visuals via an IsaacView
    │   ├── isaac/              # Proposal 005: Isaac's visuals and animation
    │   │   ├── IsaacView.ts    # IsaacView contract + IsaacAnimState (intent from Player) + ?isaac=legacy query
    │   │   ├── IsaacTech.ts    # shared tech parts: ammo hologram, aim laser, stasis gauge, RIG light, flashlight, proximity fade
    │   │   ├── IsaacModel.ts   # new model (default). Phase 1: provisional capsule mannequin on a joint hierarchy; WEAPON_SIDE
    │   │   └── LegacyIsaac.ts  # old box model behind ?isaac=legacy (A/B until the owner approves, then deleted)
    │   ├── anatomy.ts          # organic geometry builders (limb, torso, head, scythe, tail, spikes, claws, idleBreath); no gameplay
    │   ├── Necromorph.ts       # Slasher: limb hierarchy, patrol/chase, dismemberment
    │   ├── Exploder.ts         # Exploder: volatile sac, explosion AoE
    │   └── Leaper.ts           # Leaper: stalk/windup/lunge, tail blade
    ├── world/
    │   ├── AreaTheme.ts        # data-only area looks: THEMES['ishimura-default'] (atmosphere, surfaces, light mix); getTheme()
    │   ├── props/PropDefs.ts   # PROPS registry (pipe, trim, vent, conduit, crate): geometry/material factories + placement rule
    │   ├── props/PropPlacer.ts # seeded placement, one InstancedMesh per prop type, crate colliders, dispose()
    │   ├── ShipLevel.ts        # grid labyrinth generator (takes a theme), colliders, corridor lights, escape chamber, pickups
    │   ├── LineOfSight.ts      # checkLineOfSight(): ray vs collider boxes (AI cannot see through walls)
    │   └── GibPart.ts          # kinematic debris for severed limbs
    ├── graphics/
    │   ├── Palette.ts          # SINGLE SOURCE OF COLOR: PALETTE tokens, hex(), applyCssPalette() (see section 6)
    │   ├── TextureFactory.ts   # procedural CanvasTextures (wall, floor grate, ceiling, hazard stripes, suit, necro skin, holo ammo)
    │   └── BloodParticleSystem.ts   # blood / explosion / stasis spark particles
    ├── inventory/
    │   ├── ItemDefs.ts         # ITEMS registry (data only) + getItem()
    │   ├── Inventory.ts        # pure model (no DOM/Three): 5x3 grid, weapon ring, stacks, add/remove/use, onChange
    │   ├── ItemIcons.ts        # procedural item icons (canvas -> data URL, cached); Record<ItemId,...> forces an icon per item
    │   └── tabs/
    │       ├── HoloTab.ts      # interface every inventory tab implements (+ TabContext, Hint, NavDir)
    │       └── InventoryTab.ts # weapon ring, key items, grid, suit/nodes/credits, description bar
    └── ui/
        ├── HoloMenu.ts / .css  # stacked 3D holographic menus (main / pause / death / victory)
        ├── GameMenus.ts        # menu definitions (Spanish copy) + MenuContext + DEFAULT_SETTINGS
        ├── HoloInventory.ts / .css   # inventory shell: open/close, tab bar, footer, key routing, parallax
```

Naming: classes PascalCase files, no barrel files, ES modules with relative imports. Comments are sparse and explain **why**.

---

## 5. Runtime architecture

### 5.1 `DeadSpaceGame` (`core/Engine.ts`)
Constructor order: `initThree()` (scene, placeholder fog/ambient, `PerspectiveCamera(68)`, `WebGLRenderer` with PCF soft shadows) -> `SoundSystem` -> `ShipLevel` -> `applyAtmosphere(level.theme)` (fog `0x050608 @0.08` and ambient `0x080b12 @0.18` now come from the theme) -> `BloodParticleSystem` -> `Player` -> `ThirdPersonCamera` -> settings from `localStorage['deadspace_settings']` -> `InputManager` -> `spawnEnemies()` -> `setupMenus()` -> `requestAnimationFrame(animate)`.

State flags: `isPaused` (starts **true**: frozen behind the main menu), `missionStarted`, `inventoryOpen`, `endScreenShown`, `gameWon`. `Player.isDead`.

`animate()`: while the main menu is up it slowly orbits the camera around Isaac (`yaw += dt*0.07`); otherwise, when not paused: level update (flicker, pickup spin) -> `player.update(dt, inventoryOpen ? INACTIVE_INPUT : input.state, colliders)` -> `cameraController.update` -> stasis projectiles -> gibs -> enemies -> blood particles -> pickups/escape check -> game over check. Then `renderer.render`.

Enemy union type: `Enemy = (Necromorph | Exploder | Leaper) & {...}`. Spawn: `idx % 4`: 1 -> Exploder, 3 -> Leaper, else Slasher.

### 5.2 Input and pointer lock
- `InputManager` handles WASD, Shift (sprint), F (flashlight), R (reload), C/E (stasis), **Tab (toggle inventory)**, Esc, mouse buttons (right = aim, left = shoot, middle = stasis). **Q no longer heals** (consumables are used from the inventory).
- Pointer lock is requested on click of the canvas container and on `startMission` / `resumeGame`. `ThirdPersonCamera.isLocked` gates shooting and look.
- `pointerlockchange` with no lock and `!inventoryOpen` -> `openPause()`. The inventory releases the lock **on purpose** (the mouse is used on the panel), hence the `inventoryOpen` guard.
- `HoloMenu` and `HoloInventory` register a **capture-phase** `keydown` on `window` and `stopImmediatePropagation()` while open, so gameplay never sees their keys.

### 5.3 Menus (`ui/HoloMenu.ts`, `ui/GameMenus.ts`)
DOM + CSS 3D. A stack of panels; the active one faces the player and previous ones recede back-left (`--d`). Items: `action | submenu | toggle | slider | select | info | text`. Header slashes grow with depth (`/ // ///`). Keyboard + mouse (hover, click, drag sliders, wheel, click a receded panel to jump back). A side panel shows the description. `buildMainMenu/PauseMenu/DeathMenu/VictoryMenu(ctx)` produce `MenuDef`s; `MenuContext` is the bridge to the Engine. Settings: invert X/Y, sensitivity, master volume (stored via `saveSettings`).

### 5.4 Inventory (see section 7)

---

## 6. Gameplay systems (current behavior)

### Combat and dismemberment
- Each enemy builds a limb hierarchy from `LimbMesh` meshes tagged with `tagLimb(mesh, type, hp)`; raycasts from `shootPlasmaCutter()` hit limbs. Plasma does **35** damage: limbs have ~25 HP (one-shot severing), torso takes ~10 (negligible). Decapitation is fatal. Both arms severed -> disarmed (no damage) and bleeds out; one leg -> speed -40%; both legs -> crawler.
- Severed limbs spawn `GibPart` debris with wall bounce. Exploder shatters into gibs and deals AoE via `handleExplosionAoE`.
- Enemy HP: Slasher 120, Exploder 100, Leaper 90.

### Enemy AI
- Slasher / Exploder: `PATROL` -> `CHASE`. Leaper: `PATROL` -> `STALK` -> `WINDUP` -> `LUNGE` -> `ATTACK`.
- Detection (Slasher): flashlight on + line of sight + <11 m + within a 60° cone; or LoS and <5 m; or <2.2 m. `alertNearby(pos)` is used for gunshots. All sight checks use `checkLineOfSight` (no wall-hacking).
- `applyStasis(duration=5, factor=0.5)` slows movement/timers by 50%.

### Stasis
3 charges (`stasisCharges`). Fire only while aiming; projectile slows enemies in a 2.2 m AoE. **Recharged by using a Stasis Pack from the inventory** (no longer instant on pickup).

### Flashlight (current, simple)
`Player.buildFlashlight()`: `SpotLight(0xd4e9ff, 4.5, 30m, angle π/6, penumbra 0.35)` on Isaac's shoulder, casts shadows, toggled with F (`flashlightOn`). It only affects AI detection. **Proposal 001** designs a full flashlight system (EM interference radar, stealth vs aggro, battery, high-beam stun, volumetric cone, UV clues) — **not implemented yet**.

### Level (`world/ShipLevel.ts`)
`gridSize=17`, `cellSize=4`, `wallHeight=3.6`. Cell codes: `0` corridor, `1` wall, `2` start room, `3` escape room, `4` storage. Corridors are carved first, then rooms (so room tags survive). Look is driven by an `AreaTheme` (`ShipLevel(scene, themeId)`): surfaces, light kinds/shares/flicker chance and atmosphere are data. Per open cell: 22% enemy spawn point (not near the start), `theme.lights.density` (14%) corridor light (35% red always flickering / 65% white flickering 50%), 22% pickup (45% plasma energy / 30% med pack / 25% stasis pack). Colliders are `Box3[]` used by player movement, camera, LoS and projectiles. Escape chamber: green pad + beacon; reaching it = victory.

### Pickups and items
`PickupItem { group, itemId, picked, rotSpeed }`. `checkPickupsAndEscape()` picks up automatically within 1.4 m **only if the whole `pickupAmount` fits**; otherwise shows "Inventario lleno: ...". Toast via `showPrompt()`.

### Zero-HUD
The 2D HUD was removed. On screen only: the **crosshair** (kept as the aim source of truth: the weapon model is primitive and its light does not track the aim), the **pickup/status toast** (`#pickup-toast`, bottom-left, Geist Pixel Line), the damage flash and the CRT/vignette overlays. Health = RIG spine on Isaac's back (6 vertebrae: `rig.ok` > `rig.warn` > `rig.crit`), stasis = shoulder dial, ammo = hologram on the cutter (its plane has `depthTest:false` so the arm cannot clip it).

### Color: single source of truth (`graphics/Palette.ts`)
**Rule: no color literals (`0xRRGGBB`, `#hex`) anywhere except `src/graphics/Palette.ts`.** Use `PALETTE.<family>.<token>` in TS, and `var(--c-<family>-<token>)` in CSS (`applyCssPalette()` in `game.ts` writes them to `:root` at boot). `bun run check:palette` (`scripts/check-palette.mjs`) fails if a literal appears elsewhere (`rgba(...)` is not checked; for translucent canvas colors use the `rgba(token, alpha)` helper from `Palette.ts`). Need a new color? Add a token, do not inline it.

Families: `metal` (void, m900…m300 ramp), `ambient`, `rust` (rust, grease), `suit` (Isaac: fabric, fabricDark, panel, strap, copper, copperDark, copperHi, patina, brass), `rig` (Isaac's tech state lights: ok, warn, crit, off, glow), `weapon` (Plasma Cutter: paint, paintWorn, gunmetal, steelDark, dial, grip, cable, wear), `cyan` / `amber` / `red` / `green` (each `core | mid | dim`), `flesh` (skin, bone, blood, viscera, leather), `fire` (flame, blast), `ui` (menu ink: white, bright, ink, soft, dim, dark, text, hint), `light` (corridor, flashlight).

**Saturation rule (owner feedback: the world was too saturated and clashed with the desaturated menus):** `core` = saturated, only for small emissives and strong signals (alarms); Isaac's own tech (RIG, visor, stasis gauge + projectile + sparks, laser, plasma beam, ammo hologram) uses the **desaturated `rig.*` tokens** (owner decision, Proposal 005; point lights use `rig.glow` in the nominal state); `mid` = world surfaces and objects (pickups, escape room, beacon, hazard stripes); `dim` = matches the holographic menus. Tune `mid` values in `Palette.ts` if something looks too dull or too loud.

### Look (current)
Practical lights carry the color (red `red.core` always flickering, cold white `light.corridor`); heavy darkness (fog `metal.void` @0.08). Walls/floor/ceiling are `MeshStandardMaterial` with a single canvas color map (grays unified into the `metal` ramp), `metalness` 0.65–0.9 and **no environment map**, which renders them nearly black/flat (relief maps now derive from the color maps; see Proposal 004). Enemies and Isaac are boxes/cones/cylinders. Renderer has no tone mapping and no post-processing; scanlines and vignette are CSS overlays (`.crt-overlay`, `.vignette-overlay`).

### TODO: environment details from owner reference screenshots (2026-11-04)
Pending props/decals/effects, to add as `PROPS` entries / theme data (no per-area code):
- Ceiling beam grid: crossing beams and long parallel conduit bundles (not just single beams).
- Wall paneling: recessed panels, structural ribs and door frames with a vertical light strip.
- Signage: wall signs and holographic door status panels (diegetic, Spanish copy).
- Low ground fog / volumetric haze near the floor (cheap sprites or additive cones, no post-processing).
- Better cargo containers: beveled/curved straps, stacked crates of different sizes, tilted/fallen ones.
- Clutter and storytelling: overturned wheelchairs, debris, bodies, scattered equipment.
- Grated floor with worn/wet patches (roughness variation) and dark stains.
- **Enemy variants:** stronger blue-black necromorphs (darker skin, bluish tint) as tougher variants of the same morphologies; implement as skin/tint data on the enemy builder, not new classes.
- ~~Teal/cyan-gray world and enemy palette~~ — **done** (2026-11-04): `metal`, `flesh`, `ambient` and `light` tokens retinted to a muted teal-gray; surfaces made matte (metalness 0.25–0.5, roughness 0.55–0.85). Tune in `Palette.ts` / `AreaTheme.ts`.

## 7. Holographic inventory (implemented, phases 1–4 of Proposal 003)

### Model (`inventory/`)
- `ItemDefs.ts`: `ITEMS: Record<ItemId, ItemDef>` with `ItemId = 'plasma_cutter' | 'plasma_energy' | 'med_small' | 'stasis_pack'`. `ItemDef`: `name`, `description` (Spanish), `category`, `maxStack`, `pickupAmount`, optional `use(ctx)` / `canUse(ctx)`. Stack sizes: plasma_energy 25 (pickup 15), med_small 5, stasis_pack 3. **Add an item = one registry entry + one painter in `ItemIcons.ts`.**
- `Inventory.ts`: `new Inventory(5, 3)` (15 slots), `weapons[]` ring, `nodes`, `credits` (placeholders, 0), `count/has/spaceFor`, `add` (tops up stacks, then empty slots, returns units added), `remove`, `canUseSlot/useSlot/useItem`, `onChange(fn)`.
- `Player.inventory` is the **single source of truth**: `reserveAmmo` is a getter on it; `reload()` pulls from it; `applyHealing(50)` is the med pack effect; starting loadout = cutter + 30 plasma + 2 med packs.

### UI (`ui/HoloInventory.ts` + `inventory/tabs/*`)
- `HoloInventory(root, ctx, onRequestClose)` owns open/close animation, tab bar, footer hints, and key routing; tabs implement `HoloTab` (`mount/onShow/refresh/onNav/onConfirm/footerHints`) and are added with `register()`. `TabContext = { inventory, player, sound, notify }`. Availability (`canUse`, e.g. med pack at full HP) is refreshed every 250 ms while open.
- `InventoryTab`: weapon ring (4 hexes), 6 key-item slots, 5x3 grid, side panel (suit level 1, `AIRE 70s` and `ARMADURA 0%` are **placeholders**, nodes, credits), description bar. Click or `Enter` uses the focused slot. Keys: `WASD`/arrows navigate, `Q`/`E` switch tabs, `Tab`/`Esc`/`Backspace` close.
- Only the Inventory tab exists. **Next (phase 5):** `MissionTab` (objectives list + "personal journal", reference screenshot: two columns, `[Tab] Exit`) and `LogsTab`, driven by a `SectorDef`; the tab bar should show 4 icons (Inventory, Map placeholder, Mission, Logs) with `<` `>`.

### Open/close flow (`Engine.openInventory/closeInventory`)
Open requires `missionStarted`, not paused, not dead/won, no menu open. It sets `inventoryOpen = true` **first**, `resetInputState()`, `cameraController.setInventoryShot(true, colliders)`, releases pointer lock, opens the hologram. While open: **Isaac is rooted** (player gets `INACTIVE_INPUT`), aim/shoot/reload/flashlight are blocked, the **game does not pause** (enemies keep acting), and **damage does not close it**. Close re-requests pointer lock. Death/victory close it without re-locking.

### Camera "inventory shot" (`ThirdPersonCamera`)
- Overlay panel, so walls can never occlude it. The scene is shifted left by `SHOT_SHIFT = 0.2` of the width with `camera.setViewOffset()` (positive offset moves the scene left; verified in three's source) so Isaac sits left and the panel right. FOV 65 -> 55 and a closer `inventoryOffset = (0.55, 0.25, -2.4)`.
- **4-orientation probing**: on open, candidate orbit angles `SHOT_ORBITS = [65,50,35,20]°` (positive swings the camera so Isaac faces screen-right, verified numerically) are tested by raycasting from his head to each pose (`isPoseFree`, clearance 0.4 m, camera point must not be inside a collider). First free pose wins; if none, only the shift is used. Eased with `shotBlend`. `this.yaw/pitch` are never modified, so Isaac's facing and aim are preserved. Mouse look is blocked while the shot is active. The suit never fades while open.
- Panel CSS (`HoloInventory.css`): `.hi-stage` at `right:3vw`, `width:min(820px,60vw)`, `transform: translateY(-50%) rotateY(calc(7deg + var(--mx)*2.5deg)) rotateX(calc(var(--my)*-2deg))`, `perspective:1500px`; inner layers use `translateZ` for a **minimal mouse parallax** (`--mx/--my` set from `mousemove`). Tilt/camera tuning knobs: the `rotateY/rotateX` lines in `.hi-stage`, `inventoryOffset`, and the `0.06` pitch in `ThirdPersonCamera.update`.

---

## 8. Visual stack and z-order (DOM)
`#game-container` (canvas, z1) < `.crt-overlay` (z2) < `.vignette-overlay` (z3) < `.damage-flash` (z4) < `#hud` (z10: crosshair + toast) < `.holo-inventory` (z45) < `.holo-menu` (z50). The HUD is hidden (`opacity:0`) whenever a holo menu is open. Fonts: `Geist Pixel Line` (holo UI), `Share Tech Mono / Orbitron / Rajdhani` from Google Fonts (legacy CSS vars).

---

## 9. Decisions and rejected approaches (do not repeat without asking)

### 9.1 Inventory hologram (all tried in phase 4, only the first was kept)
1. **Kept — screen-space DOM overlay + camera shot (projection shift + 4-orientation orbit probing) + Isaac rooted + free mouse + minimal parallax.** This was the owner's original choice and the final one.
2. Rejected: a world-space `CSS3DRenderer` hologram parented to Isaac (billboard / tilted to the camera / depth "hole" so Isaac draws over the panel). It allowed walking and real parallax but produced odd perspectives, clipped the panel and needed turning Isaac.
3. Rejected: turning Isaac toward free space on open (`FreeFacing`), head glance toward the panel, panel on the left with Isaac on the right, and a camera-locked transparent-quad cut-out (`HoloWindow`) so Isaac occludes the panel.
4. **Idea on the table (not started):** fade-to-black "eyes close", then a first-person view with a slightly transparent, curved (helmet-visor) hologram covering the screen, minimal parallax, and an automatic exit when an enemy attacks. Curvature would be done by rotating panel columns around a vertical axis (CSS), with wider-than-tall cells and more horizontal spacing. Open question was whether "exit on attack" means any damage or only close-range enemy attacks (recommended: close-range attacks).

### 9.2 Visual overhaul (Proposal 004) — first attempt reverted
- Tried: ACES tone mapping + procedural `RoomEnvironment` IBL + bloom + film grain + vignette + chromatic aberration, a desaturated "remake" palette and derived normal/roughness maps. **The owner rejected the result: "it gives a completely different look".** All code was reverted; `proposals/004-VISUAL-OVERHAUL.md` stays as a reference.
- **Revised direction (owner, 2026-11-02):** a **rustic palette of metallic colors, no filter** (no tone mapping / bloom / grain / color grading passes), **lights with more noticeable colors**, and **keep the heavy darkness** so the **flashlight mechanic (Proposal 001) is emphasized**. Enemies and environment should still be made less simple, but within that look.
- **Accepted plan (2026-11-02): aesthetics as data.** Proposal 004 was rewritten: an `AreaTheme` per area (atmosphere, surfaces, light mix; later props, decals, enemy mix), referenced by the future `SectorDef`, so new areas/chapters (the 12 *Dead Space* chapters ~ 6 themes) need only data. Acceptance test per step: *can a new area be added by touching only data files?* Second theme `engineering` added with data only (amber service lamps, denser warm fog, more grating and pipework); select it for testing with `?theme=engineering`, default is `ishimura-default`. Done: props registry (`world/props/`, `AreaTheme.props` lists `{id, density}`; `ShipLevel(scene, themeId, seed)` places them, colliders appended to `colliders`), theme infra (texture cache with `TextureFactory.surface()/disposeSurfaces()`) and the palette unification (`Palette.ts`, section 6). Relief maps are done (`TextureFactory.surfaceMaps()` derives normal + roughness from luminance; `SurfaceDef.relief` sets strength). Enemies were remodeled with `entities/anatomy.ts` + `graphics/EnemyMaterials.ts` (organic limbs/skulls/scythes/tail, relief skin per variant, idle breathing, per-instance scale/tint; limb tagging, hierarchy and AI unchanged). Next: more props/decals (see TODO list), a second theme as scalability proof.
- Performance guardrail for bigger areas: cap real `PointLight`s to the N nearest (pool), others emissive meshes; one shadow light (flashlight); dispose on sector change.
- Useful findings to reuse: (a) `metalness` 0.8–0.9 with no environment map makes metals render almost black — consider lowering metalness / brightening albedo / a very subtle envMap **without** tone mapping; (b) `TextureFactory` canvas maps could gain derived normal/roughness maps (Sobel on luminance) for relief; (c) enemy remodel must keep the limb hierarchy and `LimbMesh` hitboxes so dismemberment/AI do not change.

---

## 10. Proposals (design docs in `proposals/`)

Reference images live in `proposals/references/` and are **git-ignored** (third-party artwork, local only). Do not commit them.

| # | File | Status |
| :--- | :--- | :--- |
| 001 | `001-FLASHLIGHT-MECHANICS.md` | Proposed, **not implemented**: EM interference radar, stealth vs aggro, battery with shoulder LED, high-beam stun, volumetric cone + dust, UV clues. Priority now increased because the visual direction relies on darkness. |
| 002 | `002-WORLD-EXPANSION-AND-GAME-ROADMAP.md` | Proposed: environmental hazards (steam, vacuum + oxygen), power rerouting, Marker dementia, Kinesis/Stomp, multi-sector tram progression. |
| 003 | `003-HOLOGRAPHIC-INVENTORY-AND-ZERO-HUD.md` | Accepted. Phases 1–4 implemented and committed; 5 (Mission + Logs tabs, `SectorDef`) and 6 (persistence/polish) pending. Section 7 lists the owner's decisions. |
| 004 | `004-VISUAL-OVERHAUL.md` | Accepted (rewritten): data-driven themes. Theme infra and unified palette implemented; props, enemy builder, relief maps and a second theme pending (see 9.2). |
| 005 | `005-ISAAC-REMODEL.md` | Proposed (hand-off for Claude Opus): detailed procedural Isaac (Level 1 RIG suit, copper gear, skinned fabric body, procedural animation with IK), new Plasma Cutter model, desaturated `rig.*` HUD lights; reference images in `proposals/references/`. **Phase 1 done and approved (2026-11-04)** (scaffold + contract + palette; new default is a provisional mannequin, old model at `?isaac=legacy`). Note: the follow camera sits over Isaac's anatomical **left** shoulder (+X) and the weapon is on that side; **Owner decision (2026-11-04): keep the camera where it is** (left shoulder); `IsaacModel.WEAPON_SIDE` stays `1`. Crosshair uses `rig.ok`. |

Decisions already taken in 003 (still valid): stasis recharged from the inventory; damage does not close the inventory; 5x3 grid; `Tab` opens it; no quick-use keys for consumables; pickups are automatic while there is room; crosshair stays as the HTML reticle.

---

## 11. Git state

- Branches: `main` (= `origin/main` @ `5c1cad2`, holographic menu), `feat/holographic-inventory` and `feat/visual-overhaul` (both @ `1748b46`, `feat(inventory): add holographic inventory with zero-HUD`).
- `1748b46` includes the inventory **and** the zero-HUD / HUD removal / ammo hologram fix, because `Engine.ts`, `index.html` and `style.css` mixed those changes.
- Nothing has been pushed from the feature branches. No PR exists.

---

**Priority (owner, 2026-11-04): Isaac remodel, see Proposal 005.**

1. **Visual overhaul, next steps** (Proposal 004): props registry with `InstancedMesh` (pipes, conduits, crates, trim), then relief maps for materials, enemy builder, second theme. No post-processing; colors only via `Palette.ts`.
2. **Flashlight mechanics** (Proposal 001), phases 1–4, since the look depends on it.
3. **Inventory phase 5**: Mission + Logs tabs and `SectorDef`.
4. Enemy remodel (organic shapes) keeping hitboxes; then environment props; then Isaac.
5. README refresh (stale architecture section) once the above settle.
