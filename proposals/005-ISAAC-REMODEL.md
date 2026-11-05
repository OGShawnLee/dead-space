# Proposal 005: Isaac Clarke remodel (detailed procedural character + animation)

- **Status**: Proposed (2026-11-04). Written as a hand-off for the implementing agent (Claude Opus).
- **Target**: `src/entities/Player.ts` (gameplay stays), new `src/entities/isaac/*`, `src/graphics/Palette.ts`, `src/graphics/TextureFactory.ts`
- **References** (owner-provided; stored in `proposals/references/`, **not shipped in the game bundle**, they are only visual guidance; the zero-assets rule applies to the game itself). Re-read both before every phase:
  1. **Level 1 RIG suit** turnaround sheet (front, back, side).
  2. **Plasma Cutter** model sheet.

> `proposals/references/` is **git-ignored on purpose** (third-party artwork, kept local only). If the folder is missing, work from the written analysis in sections 1 and 5.5 and ask the owner for the images.

![Level 1 RIG suit turnaround](references/isaac-level1-suit.png)

![Plasma Cutter](references/plasma-cutter.png)

> Isaac is the center of the game: the camera is on him 100% of the time, and the inventory "shot" shows him up close. He must be the most polished thing on screen. The first enemy remodel (`entities/anatomy.ts`) was a first pass and is low-poly on purpose; **Isaac needs a much higher standard** (smooth bending joints, layered gear, real animation), not "boxes with rounded edges".

---

## 0. Instructions for the implementing agent

1. Read `CONTEXT.md` first (rules, tooling gotchas, owner preferences). Key points: Spanish UI copy, English code/commits/docs; **zero external assets** (primitives + canvas textures only); 60 FPS; **no color literals outside `src/graphics/Palette.ts`** (`bun run check:palette`); no post-processing; look is matte, muted teal-gray world with **copper/bronze for Isaac**.
2. You cannot see the browser. Verify with `tsc`, `vite build`, `bun run check:palette` and **numeric bun scripts** (bounds, bone positions, weights, IK reach, triangle counts). Always tell the owner what to check visually. A debug viewer (section 9) is part of the plan so the owner can inspect quickly.
3. Do not commit unless asked. Work on the current feature branch. Conventional Commits in English.
4. Work phase by phase (section 8); each phase must leave the game playable. Keep the old model reachable with `?isaac=legacy` until the owner approves the new one (A/B), then delete it.
5. Ask the owner before big look decisions that this document does not settle (section 11).

---

## 1. Reference analysis (Level 1 RIG suit)

The suit is a **soft, worn engineering jumpsuit with a few copper armor pieces** (it is the starter suit: little metal, mostly fabric). Read it as three material families: **olive-gray fabric, black panels/rubber, aged copper/bronze**, plus **glowing blue-white** light (visor, spine).

| Part | What the reference shows | Material / color |
| :--- | :--- | :--- |
| **Helmet** | Domed copper shell made of **segmented plates with ridges** along the top and sides, a rounded back, a wide **visor with three horizontal glowing slits** (blue-white), a collar ring at the neck. Looks hand-built, riveted. | Copper (base + dark recess grooves + lighter edge wear); visor emissive |
| **Neck / collar** | Dark ring, copper clasps, cables entering from the RIG. | Black rubber + copper clips |
| **Torso (jacket)** | Gray-green fabric, **vertical center seam**, black side panels, black shoulder caps, a copper **chest yoke / harness plate at the sternum** with a small clip and cables; fabric wrinkles at the waist. | Fabric (main), black panel, copper accents |
| **Belt** | Wide dark belt with a **square copper/brass buckle**, small pouches and loops. | Black leather, brass |
| **Arms** | Fabric sleeves, black shoulder cap, **ribbed copper forearm bracers** (segmented bands with a glove cuff), a small copper elbow piece. | Fabric, copper bracer, black |
| **Gloves** | Black gloves with **individual fingers**, slightly bent at rest, rubber knuckle pads. | Black rubber/leather |
| **Legs** | Charcoal work trousers, **cargo pocket on the thigh** with flap, thigh strap with copper buckle, **knee pad** layered on top, creases at knee and hip. | Dark fabric, black pads, copper buckle |
| **Boots** | **Tall copper armored boots**: ribbed shin guard that wraps the calf, thick layered sole, ankle buckles/straps, heavy toe. This is the most "metal" part of the lower body. | Copper (darker than helmet), black sole |
| **RIG (back)** | A **vertical glowing tube running from under the helmet down the spine**, mounted in a **copper-ribbed housing** (stacked vertebra plates on one side), a power cable curving to the belt, a copper connector ring at the lower end, a small pack at the upper back. The tube follows the curve of the back. | Copper housing; tube emissive blue-white (our health bar: cyan > amber > red) |
| **Silhouette** | Heroic but human proportions (about 7.5 heads), broad shoulders, slightly forward head carriage, hands low and relaxed, boots chunky. | n/a |

Style notes: nothing is clean. There is **edge wear** on copper (lighter where metal shows), **darker recesses** in grooves, fabric **creases**, and small repeated hardware (rivets, buckles, bolts). The color story is "olive fabric + copper" with cold blue-white light as the only bright accent.

---

## 2. Contract: what must keep working (read before touching `Player.ts`)

External code depends on these members. The new model must keep them (as the same fields or getters), so Engine, camera, inventory and enemies do not change.

| Used by | Member | Notes |
| :--- | :--- | :--- |
| Engine, camera, enemies | `player.root` (Group at the **feet**, `rotation.y` = yaw set by the camera, model **faces +Z**) | World position drives collisions (radius 0.5, height 1.8) |
| Engine, camera | `isDead`, `isAiming`, `hp`, `maxHp`, `flashlightOn`, `ammo`, `maxAmmo`, `reserveAmmo`, `stasisCharges`, `maxStasisCharges`, `inventory` | Gameplay state stays in `Player` |
| Engine | `takeDamage`, `applyHealing`, `reload`, `fireStasis`, `rechargeStasis`, `toggleFlashlight`, `updateHoloAmmo`, `update(dt, input, colliders)` | Same signatures |
| Engine (stasis shot) | `player.armL.getWorldPosition(...)` | Needs a **left hand/forearm Object3D** (`armL`) whose world position is where the stasis projectile spawns (currently + (0, 0.1, 0.25)) |
| Engine (plasma beam) | `player.weaponGroup.getWorldPosition(...)` | Needs the **weapon muzzle area** Object3D (`weaponGroup`); the beam starts there. Holo ammo screen and 3 lasers live in this group |
| Camera | `player.setProximityOpacity(a)` | Fades the whole suit when the camera is close. Must traverse every material of the new model (and the weapon). See risks (section 10) |
| Player internals | `rigSegments` (6 meshes, `MeshBasicMaterial`, colored by `updateRigSpine`), `stasisSegmentMats` (3 arcs, colored by `updateStasisMeter`), `stasisLight`, `rigBackLight`, `holoScreen`, `holoLight`, `laserLine`, `spotLight` + `spotTarget` | Keep the **same behavior and colors**: cyan > amber > red > dark (`PALETTE.cyan.core`, `amber.core`, `red.core`, `metal.m900`) |
| Camera | head anchor at `root.position + (0, 1.45, 0)` | If the new Isaac is taller or the head sits elsewhere, update the two `1.45` uses (`ThirdPersonCamera.ts`, `setInventoryShot` and `update`) consistently |

Design rule: **`Player` keeps gameplay; a new `IsaacModel` owns visuals and animation.** `Player.update()` computes intent (velocity, aiming, stasis timer, etc.) and calls `model.update(dt, state)`. `Player` exposes `armL`, `weaponGroup`, `rigSegments`, ... as getters that point into the model.

---

## 3. Target quality and budget

- **Triangles**: ~25k-35k total for Isaac (helmet ~3k, jacket+torso ~5k, arms ~4k, legs ~5k, boots ~4k, gloves ~3k, RIG ~3k, belt/pouches/hardware ~3k, weapon ~2k). Enemies are ~2-4k; Isaac is shown close, so he can afford 10x. Log the real count with a numeric script and keep it under 40k.
- **Draw calls**: at most ~25 for Isaac (merge static hardware per material; use `InstancedMesh` for repeated rivets/bolts). Skinning cost for ~20 bones is negligible.
- **Shadows**: the only shadow-casting light is the flashlight, mounted on Isaac's shoulder. Do **not** let the body cast shadows from that light (self-shadowing/acne). Keep `castShadow` off for the body (or use a cheap proxy). Isaac may still **receive** light.
- **Textures**: 512 or 1024 canvases max, cached through `TextureFactory.surface()/surfaceMaps()` (add ids to `SurfaceId`), normal/roughness maps derived as already done.

---

## 4. Palette: copper and the fabric (tokens only)

Add a `suit` family to `Palette.ts` (values are estimates; **sample the reference** to refine, keep them muted to match the world):

```
suit: {
  fabric:      ~0x4b5650   // olive/teal-gray jacket
  fabricDark:  ~0x2e3634   // trousers
  panel:       ~0x151a1b   // black shoulder caps, side panels, gloves
  strap:       ~0x2a2623   // belts, leather
  copper:      ~0x9a6a47   // base copper
  copperDark:  ~0x5a3b28   // recesses, boots shadow side
  copperHi:    ~0xc08a60   // worn edges
  patina:      ~0x55746a   // subtle teal oxidation in crevices (ties to the world palette)
  brass:       ~0xb08d57   // buckles, clips
}
```

**HUD light colors (owner decision, 2026-11-04).** The lights on Isaac's body and weapon (RIG spine, stasis arcs and their lights, Plasma Cutter holo screen, lasers and muzzle light, the stasis projectile) must use **desaturated** colors, in all states, so they match the muted world and the holographic menus instead of the current neon `0x00f0ff`. Add a dedicated family and migrate every Isaac-tech use of `cyan.core` / `amber.core` / `red.core` (in `Player.ts`, `Engine.ts`, `BloodParticleSystem.ts`' stasis sparks, `TextureFactory.createHoloAmmoCanvas`) to it:

```
rig: {                      // estimates, refine by eye against the menus (--holo-glow ~ rgba(140,225,235))
  ok:    ~0x8fd4dc   // nominal / full: pale desaturated cyan
  warn:  ~0xd9a461   // mid state: muted orange
  crit:  ~0xc9615a   // critical: muted red
  off:   metal.m900  // drained segment
  glow:  ~0xa9dde3   // additive glow / light color (lighter than `ok`)
}
```

`cyan.core/amber.core/red.core` stay available for rare strong signals (alarms), but Isaac's equipment no longer uses them. Light intensities may need a small bump since the colors are less saturated; keep them noticeable in the dark.

**Plasma Cutter tokens** (see section 5.5), sampled from the reference and kept muted:

```
weapon: {
  paint:     ~0xc9a93e   // safety-yellow painted frames (slightly dull)
  paintWorn: ~0x8d9296   // bare steel where the paint has chipped
  gunmetal:  ~0x2a2f33   // main body
  steelDark: ~0x464c52   // secondary plates
  dial:      ~0xa7adb1   // knurled silver dial
  grip:      ~0x4a2c27   // textured brown-red grip
  cable:     ~0x111517
  wear:      ~0x8a3a2c   // red scratches / dried blood on the paint
}
```

Existing `rust.bronze` (0x8a6a43) is the old suit tone; migrate its users (`createSuitTexture`) to `suit.*`. The RIG light and visor keep using `cyan.core` (the owner's rule: cyan `core` is reserved for Isaac's tech). Do not add hex literals anywhere else.

---

## 5. Architecture

New folder `src/entities/isaac/` (one responsibility per file):

| File | Responsibility |
| :--- | :--- |
| `IsaacSkeleton.ts` | Bone definition as **data**: names, parents, rest positions/rotations, limits. One source of truth used by mesh generation, animation and the debug viewer. |
| `IsaacBody.ts` | Builds the **skinned** fabric body (jacket/torso, sleeves, trousers) as `SkinnedMesh` from the skeleton: generates tube/loft geometry along each limb with **procedural skin weights** (blend two bones near elbows, knees, hips, shoulders, waist, neck). |
| `IsaacGear.ts` | Rigid armor/hardware parts attached to bones: helmet, collar, chest yoke, shoulder caps, forearm bracers, knee pads, shin guards/boots, belt + buckle + pouches, thigh pocket, gloves/fingers, cables. Merged per material. |
| `IsaacRig.ts` | The RIG spine assembly: curved housing along the back, 6 glowing segments (`rigSegments`), cable to the belt, connector ring, upper-back pack, stasis socket with the 3 arcs (`stasisSegments`). Keeps current colors/behavior. |
| `IsaacMaterials.ts` | Materials and canvas textures: fabric (weave, stitching, wrinkles), copper (edge wear, patina, rivets), black rubber, emissive. Uses `surfaceMaps()` for relief. |
| `IsaacAnimator.ts` | Procedural animation (section 6). No clips; pure functions of a small state struct. |
| `IsaacWeapon.ts` | The **Plasma Cutter** model (section 5.5): C-shaped frames, body, dial, grip, magazine, cable, emitter; sockets for the muzzle, the holo screen and the lasers. |
| `IsaacModel.ts` | Public facade: `new IsaacModel()`, `.root`, `.armL`, `.weaponGroup`, `.rigSegments`, `.stasis*`, `.update(dt, state)`, `.setProximityOpacity()`, `.playHurt(dir)`, `.playDeath()`. |
| `debug` hooks | `?isaac=debug` (section 9). |

Keep `anatomy.ts` for enemies; reuse its noise/taper helpers only if they help.

### 5.1 Skeleton (about 22 bones)

`hips (root)` > `spine1` > `spine2 (chest)` > `neck` > `head`; `spine2` > `clavicle.L/R` > `upperarm.L/R` > `forearm.L/R` > `hand.L/R`; `hips` > `thigh.L/R` > `shin.L/R` > `foot.L/R` > `toe.L/R`. Plus sockets (empty `Object3D`s) for: `weaponSocket` (right hand), `flashlight` (right shoulder/helmet side), `stasisSocket` (right shoulder blade), `muzzle`, `armL` (left hand).

Proportions (meters, origin at the feet, +Z forward): total 1.82; foot length 0.27, shin 0.44, thigh 0.46, hip height 0.90; spine to shoulders 0.52, shoulder (clavicle-to-clavicle) width 0.46, chest depth 0.26, waist width 0.34; neck 0.08; helmet 0.32 tall, 0.27 wide, 0.30 deep; upper arm 0.30, forearm 0.27, hand 0.19. The helmet center sits near y 1.68; adjust the camera anchor if you move it.

### 5.2 Building the fabric body (the "not a monigote" part)

- For each limb: **loft** a tube along the bone chain: rings every ~2.5 cm, each ring an ellipse with per-ring radii (muscle/fabric volume, thicker at biceps/thigh, narrower at wrist/ankle), 12-16 segments around. Torso: lofted ribcage-to-waist with shoulders and a slightly forward chest, belly curve, and a lower hip flare; arms and legs start inside the torso/hips so seams are hidden under armor and belt.
- **Skin weights**: for each vertex, weight = smooth blend of the two nearest bones along the chain (cosine falloff over ~6 cm around the joint). Normalize; max 2 bones per vertex; store `skinIndex/skinWeight`.
- **Details in geometry**: vertical center seam on the jacket (a thin raised ridge), trouser creases at the knee and hip (small vertex noise driven by a crease function), sleeve cuff overlapping the bracer, collar roll. Use `fleshify`-style smooth noise at very low amplitude only for wrinkles.
- **Vertex colors or a second UV-less mask** can tint panels (black shoulder caps, side panels) so fewer materials/draw calls are needed; otherwise use 2-3 materials max (fabric, panel, strap).

### 5.3 Gear (rigid parts, high detail)

All built from lathe/extrude/tube/rounded-box helpers (write a `roundedBox`, `bevelExtrude`, `ribbedCylinder`, `platePanel` toolkit; **do not use plain `BoxGeometry` for visible armor**):
- **Helmet**: dome (lathe, 24+ segments) subdivided into **ridged plates** (raised ribs along meridians, a brow plate, side cheek plates), rivets, a recessed visor frame with **3 horizontal slits** (emissive `MeshBasicMaterial` + a soft glow gradient texture), a rear neck guard. Slightly forward-tilted.
- **Chest yoke/harness**: curved plate at the sternum, two clips, shoulder straps over the jacket, black shoulder caps (rounded, layered).
- **Forearm bracers**: ribbed cylinders (stacked rings with chamfers) + cuff, copper; **elbow piece**.
- **Gloves**: palm + 4 fingers (2-3 segments each, capsule-like) + thumb; **finger bones are optional**: author 3 hand poses (relaxed, grip-weapon, open-palm for stasis) as pre-baked finger rotations applied to rigid finger groups.
- **Belt**: loop with brass buckle, 3-4 pouches (rounded boxes with flaps), a cable anchor.
- **Legs**: thigh strap + buckle, cargo pocket with flap on the left thigh, knee pads (layered rounded plates), **tall boots** (shin guard with 3-4 horizontal ribs, ankle straps with buckles, thick two-layer sole with tread blocks, toe cap).
- **Hardware**: repeated rivets/bolts as `InstancedMesh` per material.

### 5.4 RIG spine (the identity piece)

- A **curved tube housing** following a `CatmullRomCurve3` along the back (neck base to lower back), copper ribs (stacked vertebra plates) on the outside, the glowing tube inside.
- The glowing tube is split into **6 segments** (`rigSegments`, `MeshBasicMaterial`) so `updateRigSpine()` keeps working (colors cyan > amber > red; inactive = `metal.m900`). Add a soft additive glow sprite/gradient behind each segment (cheap), not post-processing.
- Cable from the housing to the belt (tube with spring secondary motion), connector ring at the base, upper-back pack.
- **Stasis socket** on the right shoulder blade (3 arcs + node), same behavior as now.
- Keep `rigBackLight` and `stasisLight` (point lights). Mind the light budget.

### 5.5 Plasma Cutter (new model, from the reference)

The reference is the weapon's signature silhouette: **two stacked pairs of big C-shaped yellow frames** (an upper bracket and a lower bracket, each drawn as an outer and an inner layer slightly offset), opening toward the front, around a **dark gunmetal body**; the cutting channel/emitter sits between the arms.

| Element | What the reference shows | Build |
| :--- | :--- | :--- |
| **C frames** (4 pieces: 2 layers x upper/lower) | Thick painted-yellow C/L brackets with beveled edges, raised inner rim and small stencil marks; the inner layer is slightly smaller and set back. Heavily worn: paint chipped to gray steel at the edges, red scratches and stains. | `ExtrudeGeometry` from a rounded-C `Shape` with `bevelEnabled` (thickness ~2 cm, bevel ~3 mm); two layers per side with a small offset; texture `weapon.paint` + chips |
| **Main body** | Dark gunmetal block with panel seams, vents (a drilled hole pattern), bolts, a recessed circular area with a **knurled silver dial/sphere** (the ribbed wheel) and a cable looping from it. | Rounded/chamfered boxes merged; dial = `LatheGeometry` with a ribbed profile (many small ribs) + hemispherical cap; seams via inset panel plates |
| **Top sight/receiver** | A tapered rear section with a rail, a stenciled label and an angled top plate (paint on top, gunmetal below). | Extruded profile + thin plate; stencil as texture marks (no readable brand text required) |
| **Grip** | Pistol grip with a **brown-red textured/ribbed surface**, trigger guard and trigger, a cable running along the back of the grip. | Extruded curved profile with ribs (grooves via normal/relief), trigger as a small bevelled piece, `TubeGeometry` cable |
| **Magazine / battery block** | A dark block under the front, with a ribbed side and an energy cell window; the barrel/emitter tube protrudes forward under the Cs. | Chamfered boxes + a cylinder emitter with rings |

Construction targets: **~2k-4k triangles**, merged per material (paint, gunmetal, steel, grip, dial, cable, emissive window). Materials from the `weapon.*` tokens; matte/slightly satin (paint roughness ~0.6, steel ~0.5, metalness 0.2-0.4). Paint wear: a canvas texture with chipped edges (lighter steel showing), scratches, and a few red stains (`weapon.wear`), derived normal/roughness via `surfaceMaps()`.

Gameplay-facing parts to keep: `weaponGroup` (parent; muzzle at the emitter, between the Cs), the **holographic ammo screen** (`holoScreen`, `depthTest:false`, same behavior) placed on the side of the body facing the camera, `holoLight`, and the **3 laser lines** from the emitter. The holo screen/lights use the new `rig.*` colors. Orientation: barrel along +Z; the right hand holds the grip, the left hand supports under the front (give the weapon two grip sockets for the aim IK). The muzzle flash and plasma beam originate at the emitter (`Engine.shootPlasmaCutter()` reads `weaponGroup` world position; add a dedicated `muzzle` Object3D and expose it, then switch Engine to it).

---

## 6. Animation plan (procedural, layered)

No keyframe clips. A state struct is computed in `Player.update()`:
`{ velocityLocal (x = strafe, z = forward), speed01, sprint, aiming, aimPitch, stasisT, reloadT, hurtT, dead, flashlight }`, and `IsaacAnimator` turns it into bone rotations each frame. Use **critically damped springs** for smoothing and blending (no snapping between poses).

1. **Base locomotion (legs + hips)**
   - Phase advances with **distance traveled**, not time (no foot sliding feel); stride length scales with speed.
   - Directional blending: use the local velocity vector to blend forward / backward / left / right cycles (phase offsets and hip yaw), so strafing and backpedaling look right.
   - **Two-bone IK for legs** (analytic): foot target from the gait curve (lift arc, plant), hip bob and sway, pelvis tilt, knee direction fixed forward. Sprint: forward lean, longer stride, shorter flight, arms pump.
   - Foot contact events drive **footstep sounds** (replace the current `stepTimer` hack).
2. **Upper body layers**
   - **Spine twist and counter-rotation** with the gait (chest opposes hips), subtle shoulder roll.
   - **Aim layer**: when aiming, the chest/head pitch follow the camera pitch; right arm extended holding the Plasma Cutter (weapon attached to `weaponSocket` on the right hand, no more manual position hacks), left hand supporting under the barrel (simple IK to a grip point on the weapon). Legs keep walking (strafe walk at aim speed).
   - **Low-ready stance** when not aiming: weapon held near the hip, elbow bent, slight arm swing from the gait.
   - **Head**: looks toward where the camera aims, with limits and lag; slight forward-head carriage from the reference.
3. **Action animations** (additive/override layers with ease in/out)
   - **Stasis**: left arm thrust forward, palm open pose, shoulder rotation, small recoil on the torso (0.4 s, matches `stasisAnimTimer`); projectile spawn at `armL`.
   - **Reload**: weapon pulled toward the chest, cell swap motion, return (match `reload()` timing, plus sound sync).
   - **Plasma shot recoil**: tiny kick on the right arm/shoulder per shot (needs a hook from Engine's shoot; keep optional).
   - **Hurt**: flinch with torso and head recoil; direction from the attacker (add optional `fromDir` to `takeDamage`, default none).
   - **Heal**: quick hand-to-chest gesture (optional).
   - **Death**: fall sequence (knees buckle, torso folds back, settles on the floor) over ~1.2 s, replacing the current single rotation; the RIG keeps flickering.
   - **Flashlight toggle**: brief hand-to-shoulder gesture (optional).
4. **Idle and secondary motion**
   - Breathing (chest scale/rotation), weight shift between feet every few seconds, tiny head scan, fingers relax.
   - **Spring-driven secondary motion**: RIG cable, belt pouches, jacket hem (pendulum/spring on a few helper bones or on rigid parts), so movement feels alive. Cheap, and large payoff.
5. **Inventory shot**: Isaac is rooted while it is open; play a calm idle (breathing, slow head look toward the panel) so the close-up does not look frozen.

Validation: write bun scripts that step the animator and assert joint limits (elbows/knees do not hyperextend, feet never go below the floor, no NaN), and print foot height, stride length and hand-to-muzzle distance for the aim pose.

---

## 7. Materials and textures (canvas, procedural)

- **Fabric**: weave pattern + fine noise, vertical stitching lines, darker creases and seam highlights; normal/roughness derived (`surfaceMaps`), roughness ~0.85, metalness 0.
- **Copper**: base `suit.copper`, grooves in `copperDark`, **edge wear** in `copperHi`, scattered rivets, faint `patina` in crevices; **matte** (roughness ~0.6, metalness ~0.4). The owner finds the world too shiny; copper should read as warm, worn, not chrome.
- **Black panels/gloves**: rubber/leather, roughness ~0.7, subtle stitch and wrinkle normals.
- **Visor/RIG**: `MeshBasicMaterial` with `cyan.core`, plus a gradient glow texture; the white-blue look in the reference can be achieved by mixing a lighter center in the gradient (token-based).
- All through `TextureFactory` (new ids in `SurfaceId`), cached, disposed with `disposeSurfaces()`.

---

## 8. Phases (each leaves the game playable)

1. **Scaffold + contract + palette.** Create `src/entities/isaac/`, an `IsaacModel` facade with the same public members, wired behind `?isaac=legacy` (old model) vs new default; move nothing gameplay-related. Add the `suit`, `rig` and `weapon` palette tokens and **migrate all Isaac-tech lights to `rig.*`** (spine, stasis, cutter holo/lasers/muzzle, stasis projectile and sparks, ammo canvas): this part is visible immediately and independent of the new model. *Check*: `tsc`, game boots with a placeholder model, all Engine/camera interactions work.
2. **Skeleton + skinned fabric body.** Skeleton data, lofted limbs/torso, skin weights, T/A-pose. *Check*: numeric script (height ~1.82, weights sum to 1, triangle count, bones in expected world positions); debug viewer shows the bones.
3. **Gear pass.** Helmet, collar, yoke, shoulder caps, bracers, gloves, belt/pouches, knee pads, boots. *Check*: bounds per part, tri budget, no part floating (distance of each part's bbox to its bone).
4. **Materials and textures.** Fabric/copper/black textures, relief, palette-only colors. *Check*: `check:palette`; owner reviews the look in the debug viewer.
5. **RIG + stasis + flashlight + Plasma Cutter.** Rebuild the RIG housing with the 6 segments, stasis socket/arcs/lights, flashlight mount, and the **new Plasma Cutter** (section 5.5) in the hands with the holo screen, lights and lasers kept and recolored. Split into 5a (RIG/stasis/flashlight) and 5b (weapon) if it helps review. *Check*: health/stasis color tests (call `takeDamage`, `fireStasis` in a bun script with a stub scene).
6. **Locomotion + aim.** Gait with IK, directional blending, sprint, aim layer, camera-linked head/chest. *Check*: numeric gait tests; owner plays and reports feel.
7. **Action animations.** Stasis, reload, hurt, death, idle, secondary motion, footstep sync. *Check*: owner plays; tune timings.
8. **Polish and cleanup.** `setProximityOpacity` on the new materials, perf pass (draw calls, light budget), remove `?isaac=legacy` and the old code after owner approval, update `CONTEXT.md`.

---

## 9. Debug and verification tooling (the agent cannot see the browser)

- `?isaac=debug`: freezes the player in an empty spot, shows a `SkeletonHelper`, a slow turntable, and keys to cycle poses (idle, walk phase scrub, sprint, aim, stasis, reload, hurt, death). It lets the **owner** review quickly and send screenshots.
- Numeric scripts under `scripts/` (not shipped): skeleton/weights/tri-count, IK reach and joint limits, animation NaN checks. Run with `bun`.
- Always finish a phase with: `tsc`, `vite build`, `bun run check:palette`, and a message listing exactly what to look at in the browser.

---

## 10. Risks and decisions already made

- **Proximity fade with skinned, multi-material gear.** `setProximityOpacity` flips `transparent/opacity` per material; sorting artifacts are likely on overlapping layers. Prefer a **dither/alpha-hash discard** in the materials (via `onBeforeCompile` or `alphaHash: true` in three) instead of real transparency, so there is no sort problem. Validate with the inventory shot and a close camera.
- **Self-shadowing from the shoulder flashlight.** Keep body `castShadow` off for that light (or put the body on a layer the shadow camera skips).
- **Camera and collider heights.** Keep height ~1.8 and origin at the feet. If the head moves, update the `1.45` anchors.
- **Performance.** Skinning is cheap; the risk is draw calls and lights. Merge by material, instance hardware, no new real-time lights beyond RIG/stasis/holo/flashlight.
- **Scope.** Fingers can start as rigid hand poses; full finger IK is out of scope.
- **Decided**: procedural skinned fabric + rigid copper gear; procedural animation with IK (no clips); copper-forward palette with muted olive fabric; matte look; legacy model behind a flag until approval.

## 11. Owner decisions (2026-11-04) and remaining questions

Decided:
1. **HUD/tech lights are desaturated** (RIG spine, stasis, cutter), in all states (ok / orange / red), via the new `rig.*` tokens (section 4). The visor uses the same `rig.glow`/`rig.ok` family, a pale desaturated cyan.
2. **A new Plasma Cutter model is part of this proposal**, built from the reference with its muted colors (section 5.5).
3. **The camera will pull back a bit** to show more of Isaac. The implementing agent tunes the over-the-shoulder offsets (`ThirdPersonCamera`: `offset`, aim zoom, `inventoryOffset`, the `1.45` head anchors) once the new model is in place; keep the collision and the inventory shot working.
4. Helmet always on.

Still open (ask only if it blocks you): whether the sleeves keep the black shoulder caps as in the reference (assumed yes), and how many hand poses are wanted beyond relaxed / grip / open-palm.

---

## 12. Success criteria

- At the inventory shot and in the over-the-shoulder view, Isaac reads clearly as the Level 1 RIG suit from the reference: olive fabric, copper helmet/boots/bracers, glowing spine.
- No visible box silhouettes; joints bend smoothly; hands have fingers.
- Walking, sprinting, aiming, stasis, reload, hurt and death each have distinct, smooth animation with no foot sliding.
- 60 FPS with enemies on screen; Isaac under 40k triangles and ~25 draw calls.
- `tsc`, `vite build`, `check:palette` pass; Engine, camera, inventory and enemies unchanged except for the documented hooks.
