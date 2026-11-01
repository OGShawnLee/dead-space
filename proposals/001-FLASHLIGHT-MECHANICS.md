# Proposal 001: Diegetic Flashlight Mechanics & Survival Horror Systems

- **Status**: Proposed
- **Author**: Antigravity & Engineering Team
- **Date**: 2026-10-31
- **Target**: `dead-space` Prototype Core Systems

---

## 1. Overview & Design Philosophy

In keeping with the core design ethos of *Dead Space*, all information provided to the player must remain strictly **diegetic** (embedded within Isaac Clarke's equipment and the physical environment). There are **no on-screen HUD icons, batteries, or minimaps**.

Currently, the flashlight functions merely as a static toggle (`[F]` key) that casts an illumination spot cone and slightly adjusts AI awareness ranges. This proposal introduces six layered gameplay mechanics that elevate the flashlight from a simple utility into an active tool for survival, tension, and combat strategy.

---

## 2. Proposed Mechanics

### 2.1 Electromagnetic Proximity Interference (Diegetic Threat Radar)
* **Concept**: As Necromorphs draw near (especially approaching from behind or lurking around sharp corners), the electrical systems of Isaac's suit experience localized electromagnetic disruption.
* **Behavior**:
  - Within a 4.5–6.0m radius of a living enemy, the flashlight beam begins to jitter, flutter in intensity, and flicker erratically.
  - Accompanied by procedural synthetic audio: filament buzzing, low-frequency electrical humming, and subtle sparking crackles.
* **Gameplay Value**: Serves as an atmospheric, non-visual radar. The player instinctively knows they are being stalked before visual confirmation, instilling instant panic without breaking immersion.

---

### 2.2 Tactical Stealth vs. Aggro Dilemma (Light Awareness System)
* **Concept**: Deepen the tension between illumination and enemy detection.
* **Behavior**:
  - **Flashlight ON**: Line of sight (LoS) detection radius for enemies expands significantly (up to 11–12 meters when facing the beam). Idle or dormant Necromorphs immediately awaken upon being bathed in direct light.
  - **Flashlight OFF**: Enemy vision cone drops drastically down to 2.5–3.5 meters (unless alerted by auditory cues like weapon discharges or sprinting footsteps).
* **Gameplay Value**: Forces a continuous risk-reward decision: navigate in pitch-black corridors to avoid attracting swarms of Slashers and Leapers, or illuminate the room at the expense of revealing your exact position.

---

### 2.3 Diegetic Suit Battery with Kinetic / Passive Recharge
* **Concept**: Remove infinite flashlight uptime while avoiding artificial on-screen battery bars.
* **Behavior**:
  - The flashlight operates on a limited capacitor charge lasting ~45 seconds of continuous usage.
  - **Diegetic Indicator**: A micro LED strip positioned right on Isaac's left collar / shoulder mount shifts color:
    - **Cyan (100% – 50%)**: Optimal power.
    - **Amber (50% – 20%)**: Warning state, slight reduction in throw distance.
    - **Pulsing Red (< 20%)**: Critical depleted state, frequent brown-outs before turning completely off.
  - **Recharge Mechanics**:
    - *Passive*: Shuts off the light to slowly recharge back to full over 15 seconds.
    - *Active (Kinetic Shake)*: Pressing or tapping `[F]` while light is off triggers a brief kinetic dynamo charge, producing tactile mechanical clicks and rapidly restoring capacity.

---

### 2.4 Focused High-Beam Stun (Retinal Disorientation)
* **Concept**: Linking flashlight modes with aiming posture.
* **Behavior**:
  - **Neutral Walk**: Wide, soft diffuse illumination cone ($\sim 35^\circ$ angle) intended for spatial navigation.
  - **Aiming (Right Mouse Button)**: The flashlight focuses down into a narrow, high-intensity beam ($\sim 16^\circ$ angle, boosted lumen output).
  - Directing this high-intensity beam directly at an approaching Necromorph's head/eyes triggers a 0.8–1.2s retinal glare reaction (the enemy flinches or raises its arms to shield its eyes), buying crucial time to dismember limbs.
  - High-beam mode consumes battery charge at double rate.

---

### 2.5 Atmospheric Volumetric Cone & Micro-Dust Shadows
* **Concept**: Emphasize claustrophobia and anticipatory terror through lighting fidelity.
* **Behavior**:
  - A subtle additive volumetric light cone geometry trailing Isaac's shoulder spotlight.
  - Microscopic space dust and vent steam motes drifting through the beam.
  - Sharp shadow projection around corridor corners: players will see elongated monstrous blade silhouettes on walls before the Necromorph physically steps into view.

---

### 2.6 Ultraviolet (UV) Phosphorescence & Environmental Clues
* **Concept**: Utilizing darkness and specific light spectrums to read environmental storytelling clues.
* **Behavior**:
  - Certain warnings and codes in the USG Ishimura (e.g., *"CUT OFF THEIR LIMBS"*, locker door codes, emergency exit route arrows) are rendered in latent phosphorescent bio-luminescent marker or dried blood.
  - When the flashlight is toggled off in completely dark sections or switched to a secondary blacklight wavelength, these hidden warnings glow faintly in the dark.

---

## 3. Implementation Roadmap

1. **Phase 1: Diegetic Threat Flicker & Audio Feedback**
   - Add proximity distance check in `Engine.ts` against alive enemies.
   - Modulate `spotLight.intensity` and play procedural filament crackle in `SoundSystem.ts`.
2. **Phase 2: Enhanced AI Light Cones & Stealth Integration**
   - Refine `Necromorph.ts`, `Exploder.ts`, and `Leaper.ts` perception logic to differentiate between direct beam focus and peripheral ambient presence.
3. **Phase 3: Suit Shoulder LED Indicator & Battery Drain Loop**
   - Attach a miniature emission box / cylinder to Isaac's collar in `Player.ts`.
   - Implement charge timer and color transitions (`0x00f0ff` $\rightarrow$ `0xffaa00` $\rightarrow$ `0xff2222`).
4. **Phase 4: High-Beam Aiming Focus & Stun State**
   - Lerp spotlight angle between $35^\circ$ (idle) and $16^\circ$ (aiming).
   - Add brief disorientation state to enemy update loops when facing Isaac.
