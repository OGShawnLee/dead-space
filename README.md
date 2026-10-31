# 🛸 Dead Space: Sector Protocol (Three.js Prototype)

> A playable third-person **Survival Horror prototype** inspired by the classic *Dead Space*. Built with **HTML5, CSS3, JavaScript ES Modules, and Three.js**, running at a solid 60 FPS with zero heavy frameworks and zero external downloaded assets.

---

## 📋 Table of Contents
1. [Overview & Design Philosophy](#-overview--design-philosophy)
2. [Key Features](#-key-features)
3. [Modular Architecture (ES Modules)](#-modular-architecture-es-modules)
4. [Gameplay Mechanics](#-gameplay-mechanics)
   - [Diegetic Interface (3D RIG Spine, Stasis Meter & Holograms)](#diegetic-interface-3d-rig-spine-stasis-meter--holograms)
   - [Stasis Module (Temporal Dilatation)](#stasis-module-temporal-dilatation)
   - [Surgical Dismemberment Combat](#surgical-dismemberment-combat)
   - [Sensory Enemy AI & Line of Sight (LoS)](#sensory-enemy-ai--line-of-sight-los)
   - [Over-The-Shoulder Camera Controller](#over-the-shoulder-camera-controller)
   - [Procedural Audio Engine (Web Audio API)](#procedural-audio-engine-web-audio-api)
5. [Controls](#-controls)
6. [How to Run](#-how-to-run)
7. [Roadmap](#-roadmap)

---

## 🌌 Overview & Design Philosophy

The player embodies an engineer trapped in the suffocating, dark corridors of an abandoned deep-space mining vessel overrun by mutated biomechanical creatures known as **Necromorphs**. The objective is to scavenge for resources (plasma cells, medkits, and stasis packs), survive aggressive ambushes, and navigate through the ship's labyrinth to the **Escape Shuttle Airlock**.

### Strict Architectural Principles:
- **Zero External Assets**: No 3D model files (`.gltf`, `.obj`) or downloaded raster images (`.png`, `.jpg`). Everything is built from **primitive geometries** (boxes, cylinders, cones, planes) and procedurally generated textures crafted at runtime via HTML5 `CanvasTexture`.
- **Zero External Audio Files**: No audio files (`.mp3`, `.wav`). Every gunshot, metallic reload, guttural screech, footstep, and heartbeat is synthesized dynamically via the **Web Audio API** using custom oscillators, biquad filters, and FM synthesis.
- **60 FPS Performance**: Optimized render passes, PCF soft shadow maps, localized point light radii, and modular components designed for high-performance browser execution.

---

## ⚡ Key Features

- **Strategic Dismemberment**: Center-mass shots to the torso deal negligible damage. Severing arms, scythe blades, and legs is the only effective way to neutralize threats.
- **True 3D Extruded RIG Spine & Stasis Ring**: Isaac's signature health bar is modeled as an extruded 3D cybernetic column on his back with 6 illuminated vertebrae that shift colors (Cyan $\rightarrow$ Amber $\rightarrow$ Pulsing Alert Red). Next to it on his right shoulder blade is the diegetic circular **Stasis Meter** tracking charges (3 charges = Cyan, 2 = Amber, 1 = Flashing Red, 0 = Depleted).
- **Stasis Module**: Slow-motion projectile fired from Isaac's left hand that dilates time for struck enemies by $50\%$ for 5 seconds, enabling tactical dismemberment of charging Exploders and acrobatic Leapers mid-air.
- **Floating Holographic Ammo Display**: Semi-transparent cyan HUD plane projected directly above the Plasma Cutter displaying live clip capacity and reserve cells.
- **Realistic Sensory AI (No Wall-Hacking)**: Necromorphs respect physical geometry through raycast Line-of-Sight (LoS) checks. They detect Isaac via direct sightlines, loud gunshot acoustics, or flashlight illumination.
- **Procedural Ship Labyrinth**: 2D grid-based dungeon extruded into 3D corridors featuring metallic floor grates, overhead conduits, flickering emergency lights, and claustrophobic volumetric fog.

---

## 📁 Modular Architecture (ES Modules)

The codebase is organized into clean, single-responsibility modules using native ES Modules:

```text
dead-space/
├── index.html                   # Semantic markup, CRT scanline overlays, and diegetic HUD
├── style.css                    # Industrial aesthetics, retro CRT scanlines, and UI styling
├── game.js                      # Clean entry-point bootstrap
├── README.md                    # Comprehensive project documentation
└── src/
    ├── core/
    │   ├── Engine.js            # Main loop, Three.js scene, renderer, combat raycasting, stasis projectiles
    │   ├── InputManager.js      # Decoupled keyboard, mouse, and pointer-lock event handling
    │   └── SoundSystem.js       # Real-time procedural audio synthesizer (Web Audio API)
    ├── graphics/
    │   ├── TextureFactory.js    # Procedural CanvasTextures (metal plates, grates, flesh, holo)
    │   └── BloodParticleSystem.js # Real-time blood splatter, explosions, and stasis spark particle pool
    ├── world/
    │   ├── ShipLevel.js         # 3D labyrinth generator, colliders, lights, pickups (Ammo, Medkit, Stasis)
    │   ├── LineOfSight.js       # Obstacle raycasting check preventing wall-cheating
    │   └── GibPart.js           # Kinematic physics for severed limb debris
    ├── entities/
    │   ├── Player.js            # Isaac Clarke: 3D RIG spine, stasis meter, flashlight, Plasma Cutter
    │   ├── Necromorph.js        # Slasher enemy: limb hierarchy, 1-shot cuts, disarming, stasis slow
    │   ├── Exploder.js          # Exploder enemy: volatile rectangular sac, crawling, suicide blast
    │   └── Leaper.js            # Leaper enemy: quadruped acrobatics, spinal scythe, mid-air freeze
    └── camera/
        └── ThirdPersonCamera.js # Over-the-shoulder smoothed camera with proximity occlusion fade
```

---

## 🕹️ Gameplay Mechanics

### Diegetic Interface (3D RIG Spine, Stasis Meter & Holograms)
In true *Dead Space* tradition, essential survival data is integrated seamlessly into the game world:
1. **Physical RIG Spine**: 6 prominent 3D vertebrae mounted along Isaac's spinal bracket.
   - **$100\% - 75\%$**: Vibrant Neon Cyan (`#00f0ff`).
   - **$74\% - 40\%$**: Warning Amber (`#ff9900`).
   - **$< 25\%$**: Flashing Emergency Red (`#ff1a1a`), accompanied by acoustic sub-bass heartbeats.
2. **Circular Stasis Meter (Shoulder Blade)**:
   - **3 Charges**: Vibrant Cyan (`#00f0ff`).
   - **2 Charges**: Warning Amber (`#ff9900`).
   - **1 Charge**: Flashing Critical Red (`#ff2a2a`).
   - **0 Charges**: Dark / Depleted (`#181e26`).
3. **Weapon Ammo Hologram**: Diegetic digital readout attached to the Plasma Cutter showing `clip / reserve`.

### Stasis Module (Temporal Dilatation)
- **Aim-Only Trigger**: Isaac can only activate Stasis while aiming with <kbd>Right Click</kbd>. Pressing <kbd>C</kbd>, <kbd>E</kbd>, or <kbd>Middle Mouse Button</kbd> causes Isaac to thrust his left arm forward with an open-palm gesture, discharging an ionized stasis projectile.
- **50% Velocity Dilation**: Reduces enemy movement, leap velocity, crawl speed, attack timers, and detonation windup by $50\%$ for 5.0 seconds.
- **Area-of-Effect Field**: Impacting an enemy creates a 2.2m stasis shockwave that slows down clustered Necromorphs.
- **Resource Management**: 3 charges max for Suit Level 1. Refilled by collecting blue C.E.C. Stasis Battery packs.

### Surgical Dismemberment Combat
Each Necromorph features an independent hitbox hierarchy:
- **Torso**: Absorbs plasma bursts with heavy resistance (10 HP damage).
- **Limbs (Head, Arms, Blades, Legs - 25 HP)**: The Plasma Cutter delivers 35 damage per hit, **cleanly severing limbs in a single well-aimed shot**.
- **Severing Both Arms (Disarmed State)**: If both arms are removed, the Necromorph **cannot attack** (attack damage drops to 0), stumbles in agony, and collapses into a bleed-out death within seconds.
- **Severing Legs**:
  - 1 leg severed: Enemy stumbles with movement speed reduced by $40\%$.
  - Both legs severed: Drops to the floor as a **Crawler**, dragging its torso aggressively with its arms.
- **Decapitation**: Fatal critical hit.

### Sensory Enemy AI & Line of Sight (LoS)
`LineOfSight.js` verifies whether ship bulkheads obstruct the ray between the Necromorph's head and Isaac's body:
- **Pitch Black**: Visual detection range is limited to 5 meters along clear corridors; auditory detection triggers within 2.2 meters from footsteps.
- **Flashlight On**: Detection extends up to 11 meters, **only if Isaac points the beam directly at the enemy**.
- **Gunshots**: Firing the Plasma Cutter alerts unalerted Necromorphs within a 10-meter radius that have an unobstructed path.

### Over-The-Shoulder Camera Controller
- Smoothed camera follower offset behind Isaac's right shoulder.
- **Aim Mode**: Holding Right Click brings the camera tighter to the shoulder, reduces FOV from $70^\circ$ to $50^\circ$, slows movement for precision, and projects the guide laser.
- **Proximity Occlusion Fade**: In tight corridors or corners where walls push the camera near Isaac, his suit progressively fades to $15\%$ opacity so the reticle is never obstructed.

---

## 🎮 Controls

| Input | Action |
| :--- | :--- |
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | Move relative to character orientation |
| <kbd>Mouse</kbd> | Rotate body (Y-axis) & adjust camera pitch |
| <kbd>Right Click (Hold)</kbd> | Aim mode (over-the-shoulder zoom + laser sight) |
| <kbd>Left Click</kbd> | Fire Plasma Cutter |
| <kbd>C</kbd> / <kbd>E</kbd> / <kbd>Middle Click</kbd> | Fire Stasis Module (While Aiming) |
| <kbd>Left Shift</kbd> | Sprint |
| <kbd>R</kbd> | Reload Plasma Cutter magazine |
| <kbd>Q</kbd> | Inject Medkit (+50 RIG Health) |
| <kbd>F</kbd> | Toggle Tactical Flashlight |
| <kbd>Escape</kbd> | Pause game & release mouse pointer lock |

---

## 🚀 How to Run

Because the project relies on **native JavaScript ES Modules** (`import` / `export`), modern browsers enforce CORS security policies that block execution via direct double-click (`file:///`). It must be served through a local HTTP server.

### Option 1: Bun / Vite (Fastest)
```bash
bun run dev
```

### Option 2: Python (Standard & Built-in)
```bash
python -m http.server 8080
```

---

## 🛠️ Roadmap

Upcoming experimental features and mechanics:
- [x] **Stasis Module**: Slow-motion projectile freezing enemies to $50\%$ speed for 5 seconds (Level 1 Suit module with 3 charges and diegetic RIG back gauge).
- [ ] **Isaac's Stomp**: Heavy melee foot-stomp with <kbd>Space</kbd> to crush crawling enemies and crack supply crates.
- [ ] **Plasma Cutter Rotation**: Toggle horizontal vs. vertical emitter orientation with <kbd>T</kbd>.
- [x] **New Necromorph Variants**:
  - *Exploder*: Mutated entity with a glowing volatile explosive sac on its left arm.
  - *Leaper*: Legless crawler with a barbed spinal scythe capable of long-distance lunges.
- [ ] **Zero-G & Decompression Zones**: Magnetic boot thrusters, floating debris, and a timed oxygen meter in soundless vacuum.

---

*Engineered as a high-fidelity WebGL / Three.js technical showcase.*
