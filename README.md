# 🛸 Dead Space: Sector Protocol (Three.js Prototype)

> A playable third-person **Survival Horror prototype** inspired by the classic *Dead Space*. Built with **HTML5, CSS3, JavaScript ES Modules, and Three.js**, running at a solid 60 FPS with zero heavy frameworks and zero external downloaded assets.

---

## 📋 Table of Contents
1. [Overview & Design Philosophy](#-overview--design-philosophy)
2. [Key Features](#-key-features)
3. [Modular Architecture (ES Modules)](#-modular-architecture-es-modules)
4. [Gameplay Mechanics](#-gameplay-mechanics)
   - [Diegetic Interface (3D RIG Spine & Holograms)](#diegetic-interface-3d-rig-spine--holograms)
   - [Surgical Dismemberment Combat](#surgical-dismemberment-combat)
   - [Sensory Enemy AI & Line of Sight (LoS)](#sensory-enemy-ai--line-of-sight-los)
   - [Over-The-Shoulder Camera Controller](#over-the-shoulder-camera-controller)
   - [Procedural Audio Engine (Web Audio API)](#procedural-audio-engine-web-audio-api)
5. [Controls](#-controls)
6. [How to Run](#-how-to-run)
7. [Roadmap](#-roadmap)

---

## 🌌 Overview & Design Philosophy

The player embodies an engineer trapped in the suffocating, dark corridors of an abandoned deep-space mining vessel overrun by mutated biomechanical creatures known as **Necromorphs**. The objective is to scavenge for resources (plasma cells and medkits), survive aggressive ambushes, and navigate through the ship's labyrinth to the **Escape Shuttle Airlock**.

### Strict Architectural Principles:
- **Zero External Assets**: No 3D model files (`.gltf`, `.obj`) or downloaded raster images (`.png`, `.jpg`). Everything is built from **primitive geometries** (boxes, cylinders, cones, planes) and procedurally generated textures crafted at runtime via HTML5 `CanvasTexture`.
- **Zero External Audio Files**: No audio files (`.mp3`, `.wav`). Every gunshot, metallic reload, guttural screech, footstep, and heartbeat is synthesized dynamically via the **Web Audio API** using custom oscillators, biquad filters, and FM synthesis.
- **60 FPS Performance**: Optimized render passes, PCF soft shadow maps, localized point light radii, and modular components designed for high-performance browser execution.

---

## ⚡ Key Features

- **Strategic Dismemberment**: Center-mass shots to the torso deal negligible damage. Severing arms, scythe blades, and legs is the only effective way to neutralize threats.
- **True 3D Extruded RIG Spine**: Isaac's signature health bar is modeled as an extruded 3D cybernetic column on his back with 6 illuminated vertebrae that shift colors (Cyan $\rightarrow$ Amber $\rightarrow$ Pulsing Alert Red) and cast a real-time point-light aura onto his suit.
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
    │   ├── Engine.js            # Main loop, Three.js scene, renderer, combat raycasting
    │   ├── InputManager.js      # Decoupled keyboard, mouse, and pointer-lock event handling
    │   └── SoundSystem.js       # Real-time procedural audio synthesizer (Web Audio API)
    ├── graphics/
    │   ├── TextureFactory.js    # Procedural CanvasTextures (metal plates, grates, flesh, holo)
    │   └── BloodParticleSystem.js # Real-time blood splatter particle pool and floor stains
    ├── world/
    │   ├── ShipLevel.js         # 3D labyrinth generator, colliders, lights, escape zone
    │   ├── LineOfSight.js       # Obstacle raycasting check preventing wall-cheating
    │   └── GibPart.js           # Kinematic physics for severed limb debris
    ├── entities/
    │   ├── Player.js            # Isaac Clarke: 3D RIG spine, flashlight, Plasma Cutter
    │   └── Necromorph.js        # Slasher enemy: limb hierarchy, 1-shot cuts, disarming
    └── camera/
        └── ThirdPersonCamera.js # Over-the-shoulder smoothed camera with anti-clipping
```

---

## 🕹️ Gameplay Mechanics

### Diegetic Interface (3D RIG Spine & Holograms)
In true *Dead Space* tradition, essential survival data is integrated seamlessly into the game world:
1. **Physical RIG Spine**: 6 prominent 3D vertebrae mounted along Isaac's spinal bracket.
   - **$100\% - 75\%$**: Vibrant Neon Cyan (`#00f0ff`).
   - **$74\% - 40\%$**: Warning Amber (`#ff9900`).
   - **$< 25\%$**: Flashing Emergency Red (`#ff1a1a`), accompanied by acoustic sub-bass heartbeats.
2. **Back Aura PointLight**: Casts a colored glow onto Isaac's neck, shoulders, and the ground behind him, visually communicating health status at a glance.
3. **Weapon Ammo Hologram**: Diegetic digital readout attached to the Plasma Cutter showing `clip / reserve`.

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
- **Anti-Clipping Protection**: A reverse raycast from the player's head prevents the camera from penetrating corridor walls.

### Procedural Audio Engine (Web Audio API)
- **Plasma Cutter Discharge**: Downward frequency sweep ($1100\text{ Hz}$ to $70\text{ Hz}$) on a sawtooth wave combined with bandpass-filtered noise simulating gas ionization.
- **Metallic Reload**: Two-stage mechanical clinks ($1400\text{ Hz}$ and $520\text{ Hz}$).
- **Visceral Dismemberment**: Heavy bone snap transient ($320\text{ Hz}$) coupled with low-passed tearing noise.
- **Necromorph Growls & Shrieks**: FM synthesis with $40\text{ Hz}$ modulation and sharp pitch drops upon aggro.
- **Heartbeat Monitor**: Sub-bass double thump (*lub-dub*) that dynamically accelerates as Isaac's health falls below $40\%$.

---

## 🎮 Controls

| Input | Action |
| :--- | :--- |
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | Move relative to character orientation |
| <kbd>Mouse</kbd> | Rotate body (Y-axis) & adjust camera pitch |
| <kbd>Right Click (Hold)</kbd> | Aim mode (over-the-shoulder zoom + laser sight) |
| <kbd>Left Click</kbd> | Fire Plasma Cutter |
| <kbd>Left Shift</kbd> | Sprint |
| <kbd>R</kbd> | Reload Plasma Cutter magazine |
| <kbd>Q</kbd> | Inject Medkit (+50 RIG Health) |
| <kbd>F</kbd> | Toggle Tactical Flashlight |
| <kbd>Escape</kbd> | Pause game & release mouse pointer lock |

---

## 🚀 How to Run

Because the project relies on **native JavaScript ES Modules** (`import` / `export`), modern browsers enforce CORS security policies that block execution via direct double-click (`file:///`). It must be served through a local HTTP server.

### Option 1: Python (Standard & Built-in)
Open a terminal in the project directory and run:
```bash
python -m http.server 8080
```
Then navigate to: **[http://localhost:8080](http://localhost:8080)**.

### Option 2: Node.js
```bash
npx serve .
```

### Option 3: VS Code Live Server
Install the **Live Server** extension, right-click `index.html`, and choose **"Open with Live Server"**.

---

## 🛠️ Roadmap

Upcoming experimental features and mechanics:
- [ ] **Stasis Module**: Slow-motion projectile freezing enemies to $10\%$ speed for 5 seconds.
- [ ] **Isaac's Stomp**: Heavy melee foot-stomp with <kbd>Space</kbd> to crush crawling enemies and crack supply crates.
- [ ] **Plasma Cutter Rotation**: Toggle horizontal vs. vertical emitter orientation with <kbd>T</kbd>.
- [ ] **New Necromorph Variants**:
  - *Exploder*: Mutated entity with a glowing volatile explosive sac on its left arm.
  - *Leaper*: Legless crawler with a barbed spinal scythe capable of long-distance lunges.
- [ ] **Zero-G & Decompression Zones**: Magnetic boot thrusters, floating debris, and a timed oxygen meter in soundless vacuum.

---

*Engineered as a high-fidelity WebGL / Three.js technical showcase.*
