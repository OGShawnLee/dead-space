# Proposal 004: Visual Overhaul (data-driven, scalable)

- **Status**: Accepted (rewritten 2026-11-02). Steps 1–2 implemented (themes, unified palette); the rest pending.
- **Target**: `src/world/`, `src/graphics/`, `src/entities/`, `src/core/Engine.ts`

---

## 1. Problem

The prototype reads as "simple and neon": metals with no environment map render almost black, level geometry is flat boxes with one color texture, enemies are boxes/cones. The game will grow (new areas, lore, missions; the 12 chapters of *Dead Space* map to ~6 environments), so any fix must **not** cost more per added area.

## 2. Art direction (owner, 2026-11-02)

- **Rustic palette of metallic colors, no filters**: no tone mapping, bloom, grain or color-grading passes.
- **Lights with more noticeable colors**: practical lights carry the color.
- **Keep the heavy darkness**, to emphasize the flashlight (Proposal 001).
- Enemies and environment less simple, within that look.

## 3. Core principle: aesthetics as data

If adding an area requires touching `ShipLevel.ts` or `TextureFactory.ts`, cost grows per chapter. So the look of an area is an `AreaTheme` (`src/world/AreaTheme.ts`), a plain data object, like `ITEMS` for the inventory:

- atmosphere (fog, ambient), surface materials, light mix (kinds, shares, flicker),
- later: allowed props + density, decals, enemy mix, ambient audio.

Proposal 003's `SectorDef` (objectives, logs) will reference a theme: `SectorDef = { theme, objectives, logs, enemies }`.

Suggested themes for the 12 chapters: Medical, Engineering, Hydroponics, Mining, Hangar/Tram, Colony.

**Acceptance test for every step**: *can a new area be added by touching only data files?*

## 4. Steps

1. **Theme infrastructure, no visual change** — *done*. `AreaTheme` + `THEMES['ishimura-default']` reproducing the current look; `ShipLevel(scene, themeId)` reads surfaces and light mix from the theme; `Engine.applyAtmosphere(theme)` sets fog/ambient; `TextureFactory.surface(id)` caches textures (`disposeSurfaces()` for sector changes).
2. **Unified palette** — *done*. `src/graphics/Palette.ts` is the single source of color (~35 tokens; `core`/`mid`/`dim` saturation levels), CSS reads `--c-*` variables, `bun run check:palette` blocks stray literals. World uses `mid`, `core` is reserved for Isaac's tech and tiny emissives.
3. **Materials with relief** — *done* (`TextureFactory.surfaceMaps()`, `SurfaceDef.relief`; walls, floor, ceiling and crates). rustic metals, brighter albedo / lower metalness (or a very subtle envMap without tone mapping), derived normal + roughness maps (Sobel on luminance) cached per surface; more saturated practical lights. Done by editing the theme + TextureFactory params, first for a Medical theme.
4. **Props as a registry** — *first version done* (`src/world/props/`: pipe, trim, vent, conduit, crate; seeded, instanced; more props/decals pending). `PROPS: Record<PropId, PropDef>` (geometry, material, placement rule: wall / ceiling / corner / floor). Seeded placement driven by the theme; one `InstancedMesh` per prop type. Pipes, conduits, vents, crates, trim.
5. **Enemy builder** — *first version done* (`entities/anatomy.ts`, `graphics/EnemyMaterials.ts`; Slasher, Exploder, Leaper remodeled keeping limb tagging, hierarchy and AI). keep the `LimbMesh` hierarchy and hitboxes untouched (gameplay). Appearance moves to a per-morphology builder (capsule/lathe/tube, vertex noise, wet skin, stump caps, procedural idle) with scale/tint variants. New enemy = new morphology, not duplicated logic.
6. **Second theme** (e.g. Engineering) added with data only: the scalability proof. Then Isaac's suit.

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
- **Teal/cyan-gray world and enemy palette:** the owner wants the world and the enemies in a muted, grayish cyan/teal, aligned with the holographic menus. Retint `metal`, `flesh` and light tokens in `Palette.ts` (and enemy skin variants) toward that; do it through tokens only.

## 5. Performance guardrails (needed for bigger areas)

- Cap real `PointLight`s to the N nearest the player (pool); the rest are emissive meshes. Current 14% of cells with a light does not scale.
- One shadow-casting light: the flashlight.
- Far lamps faked with cheap additive cones.
- Dispose geometries/materials/textures on sector change.
- Instancing for props; per-sector budgets.

## 6. History (do not repeat)

First attempt (ACES tone mapping, procedural `RoomEnvironment` IBL, bloom, grain, vignette, chromatic aberration, desaturated "remake" palette) was implemented and **reverted**: "it gives a completely different look". Findings kept: metalness 0.8-0.9 without env map is near-black; derived normal/roughness maps add relief without changing the look; enemy remodel must keep the hitbox hierarchy.
