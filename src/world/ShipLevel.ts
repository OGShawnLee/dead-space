import {
  MeshStandardMaterial,
  MeshBasicMaterial,
  BoxGeometry,
  PlaneGeometry,
  CylinderGeometry,
  TorusGeometry,
  Mesh,
  PointLight,
  Group,
  DoubleSide,
  Vector3,
  Box3,
  type Scene
} from 'three';
import { TextureFactory } from '../graphics/TextureFactory';
import type { PickupItem, EscapeZone } from '../types';

export interface FlickerLightItem {
  light: PointLight;
  fixture: Mesh<BoxGeometry, MeshBasicMaterial>;
  baseIntensity: number;
  isFlickering: boolean;
  flickerSpeed: number;
}

/**
 * USG Ishimura Sector Ship Level
 * Procedurally generates claustrophobic steel corridors, decompression doors, flickering lighting,
 * and collectible supply crates (Ammo, Medkits, Stasis Packs).
 */
export class ShipLevel {
  gridSize = 17;
  cellSize = 4;
  wallHeight = 3.6;
  colliders: Box3[] = [];
  flickerLights: FlickerLightItem[] = [];
  pickups: PickupItem[] = [];
  escapeZone: EscapeZone | null = null;
  spawnPoints: Vector3[] = [];
  playerStart = new Vector3(0, 0, 0);

  matWall!: MeshStandardMaterial;
  matFloor!: MeshStandardMaterial;
  matCeiling!: MeshStandardMaterial;
  matEscape!: MeshStandardMaterial;

  constructor(public scene: Scene) {
    this.initMaterials();
    this.buildLevel();
  }

  initMaterials(): void {
    this.matWall = new MeshStandardMaterial({
      map: TextureFactory.createMetalWall(),
      roughness: 0.3,
      metalness: 0.9
    });

    this.matFloor = new MeshStandardMaterial({
      map: TextureFactory.createFloorGrate(),
      roughness: 0.4,
      metalness: 0.8
    });

    this.matCeiling = new MeshStandardMaterial({
      map: TextureFactory.createCeiling(),
      roughness: 0.5,
      metalness: 0.65
    });
    this.matEscape = new MeshStandardMaterial({
      color: 0x00ff66,
      emissive: 0x00aa44,
      emissiveIntensity: 0.6,
      roughness: 0.2
    });
  }

  buildLevel(): void {
    const N = this.gridSize;
    const grid: number[][] = Array(N).fill(null).map(() => Array(N).fill(1));

    const carveRoom = (cx: number, cz: number, w: number, h: number, val = 0): void => {
      for (let x = cx - Math.floor(w / 2); x <= cx + Math.floor(w / 2); x++) {
        for (let z = cz - Math.floor(h / 2); z <= cz + Math.floor(h / 2); z++) {
          if (x > 0 && x < N - 1 && z > 0 && z < N - 1) {
            grid[z][x] = val;
          }
        }
      }
    };

    const connect = (x1: number, z1: number, x2: number, z2: number): void => {
      let cx = x1;
      let cz = z1;
      while (cx !== x2) {
        if (cx > 0 && cx < N - 1 && cz > 0 && cz < N - 1) grid[cz][cx] = 0;
        cx += cx < x2 ? 1 : -1;
      }
      while (cz !== z2) {
        if (cx > 0 && cx < N - 1 && cz > 0 && cz < N - 1) grid[cz][cx] = 0;
        cz += cz < z2 ? 1 : -1;
      }
    };

    // 1. Connect corridors between rooms
    connect(3, 3, Math.floor(N / 2), Math.floor(N / 2));
    connect(Math.floor(N / 2), Math.floor(N / 2), N - 4, N - 4);
    connect(3, 3, 3, N - 4);
    connect(3, N - 4, Math.floor(N / 2), Math.floor(N / 2));
    connect(N - 4, 3, N - 4, N - 4);
    connect(3, 3, N - 4, 3);

    // 2. Carve rooms after corridors so room values and tags are cleanly preserved
    carveRoom(Math.floor(N / 2), Math.floor(N / 2), 4, 4, 0); // Center large room
    carveRoom(N - 4, 3, 3, 3, 4); // Storage 1
    carveRoom(3, N - 4, 3, 3, 4); // Storage 2
    carveRoom(3, 3, 3, 3, 2); // Start isolated room (val = 2)
    carveRoom(N - 4, N - 4, 3, 3, 3); // Escape room (val = 3)

    const wallGeo = new BoxGeometry(this.cellSize, this.wallHeight, this.cellSize);
    const floorGeo = new PlaneGeometry(this.cellSize, this.cellSize);
    const ceilingGeo = new PlaneGeometry(this.cellSize, this.cellSize);
    const halfW = (N * this.cellSize) / 2;

    // Explicitly set player start position at center of start room (3, 3)
    this.playerStart.set(
      3 * this.cellSize - halfW + this.cellSize / 2,
      0,
      3 * this.cellSize - halfW + this.cellSize / 2
    );

    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const val = grid[z][x];
        const wx = x * this.cellSize - halfW + this.cellSize / 2;
        const wz = z * this.cellSize - halfW + this.cellSize / 2;

        if (val === 1) {
          const wallMesh = new Mesh(wallGeo, this.matWall);
          wallMesh.position.set(wx, this.wallHeight / 2, wz);
          wallMesh.castShadow = true;
          wallMesh.receiveShadow = true;
          this.scene.add(wallMesh);
          this.colliders.push(new Box3().setFromObject(wallMesh));
        } else {
          const floorMesh = new Mesh(floorGeo, this.matFloor);
          floorMesh.rotation.x = -Math.PI / 2;
          floorMesh.position.set(wx, 0, wz);
          floorMesh.receiveShadow = true;
          this.scene.add(floorMesh);

          const ceilMesh = new Mesh(ceilingGeo, this.matCeiling);
          ceilMesh.rotation.x = Math.PI / 2;
          ceilMesh.position.set(wx, this.wallHeight, wz);
          this.scene.add(ceilMesh);

          if (val === 2) {
            // Player start room: no enemies spawn here
          } else if (val === 3) {
            // Only spawn escape chamber and escape zone once at center of escape room
            if (x === N - 4 && z === N - 4) {
              this.escapeZone = {
                center: new Vector3(wx, 0, wz),
                radius: 4.2
              };
              this.createEscapeChamber(wx, wz);
            }
          } else if (val === 0 || val === 4) {
            if (Math.random() < 0.22 && (Math.abs(wx - this.playerStart.x) > 10 || Math.abs(wz - this.playerStart.z) > 10)) {
              this.spawnPoints.push(new Vector3(wx, 0, wz));
            }

            if (Math.random() < 0.14) {
              this.createCorridorLight(wx, wz, Math.random() < 0.35 ? 'red' : 'white');
            }

            if (Math.random() < 0.22) {
              const r = Math.random();
              const pickupType: 'ammo' | 'medkit' | 'stasis' = r < 0.45 ? 'ammo' : (r < 0.75 ? 'medkit' : 'stasis');
              this.createPickup(wx, wz, pickupType);
            }
          }
        }
      }
    }
  }

  createCorridorLight(x: number, z: number, type: 'red' | 'white'): void {
    const isRed = type === 'red';
    const color = isRed ? 0xff2222 : 0xd8e8ff;
    const light = new PointLight(color, isRed ? 1.4 : 1.0, 7.5);
    light.position.set(x, this.wallHeight - 0.35, z);
    this.scene.add(light);

    const fixtureGeo = new BoxGeometry(0.8, 0.15, 0.3);
    const fixtureMat = new MeshBasicMaterial({ color: color });
    const fixture = new Mesh(fixtureGeo, fixtureMat);
    fixture.position.copy(light.position);
    this.scene.add(fixture);

    this.flickerLights.push({
      light: light,
      fixture: fixture,
      baseIntensity: light.intensity,
      isFlickering: isRed || Math.random() < 0.5,
      flickerSpeed: Math.random() * 8 + 4
    });
  }

  createEscapeChamber(x: number, z: number): void {
    const greenLight = new PointLight(0x00ff66, 3.5, 12);
    greenLight.position.set(x, this.wallHeight - 0.4, z);
    this.scene.add(greenLight);

    const padGeo = new CylinderGeometry(2.2, 2.2, 0.1, 16);
    const pad = new Mesh(padGeo, this.matEscape);
    pad.position.set(x, 0.05, z);
    this.scene.add(pad);

    const beaconGeo = new CylinderGeometry(2, 2, this.wallHeight, 16, 1, true);
    const beaconMat = new MeshBasicMaterial({
      color: 0x00ff66,
      transparent: true,
      opacity: 0.18,
      side: DoubleSide
    });
    const beacon = new Mesh(beaconGeo, beaconMat);
    beacon.position.set(x, this.wallHeight / 2, z);
    this.scene.add(beacon);

    const consoleGeo = new BoxGeometry(1.0, 1.2, 0.6);
    const consoleMat = new MeshStandardMaterial({
      color: 0x22262c,
      roughness: 0.4
    });
    const consoleMesh = new Mesh(consoleGeo, consoleMat);
    consoleMesh.position.set(x, 0.6, z - 1.5);
    this.scene.add(consoleMesh);

    const screenGeo = new PlaneGeometry(0.7, 0.4);
    const screenMat = new MeshBasicMaterial({ color: 0x00ff88 });
    const screen = new Mesh(screenGeo, screenMat);
    screen.position.set(x, 0.9, z - 1.19);
    this.scene.add(screen);
  }

  createPickup(x: number, z: number, type: 'ammo' | 'medkit' | 'stasis'): void {
    const group = new Group();

    if (type === 'ammo') {
      const geo = new BoxGeometry(0.45, 0.25, 0.35);
      const mat = new MeshStandardMaterial({
        color: 0x00a8cc,
        emissive: 0x00e5ff,
        emissiveIntensity: 0.5,
        roughness: 0.3
      });
      const mesh = new Mesh(geo, mat);
      group.add(mesh);
      const pl = new PointLight(0x00e5ff, 0.6, 2.5);
      group.add(pl);
    } else if (type === 'stasis') {
      // Hexagonal Stasis Recharge Battery Pack
      const geo = new CylinderGeometry(0.18, 0.18, 0.4, 6);
      const mat = new MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x00f0ff,
        emissiveIntensity: 0.8,
        roughness: 0.2,
        metalness: 0.5
      });
      const mesh = new Mesh(geo, mat);
      group.add(mesh);

      const ringGeo = new TorusGeometry(0.22, 0.03, 8, 16);
      const ringMat = new MeshBasicMaterial({ color: 0x00f0ff });
      const ring = new Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      const pl = new PointLight(0x00f0ff, 0.9, 2.8);
      group.add(pl);
    } else {
      const geo = new CylinderGeometry(0.2, 0.2, 0.45, 8);
      const mat = new MeshStandardMaterial({
        color: 0x15803d,
        emissive: 0x22c55e,
        emissiveIntensity: 0.5,
        roughness: 0.3
      });
      const mesh = new Mesh(geo, mat);
      group.add(mesh);
      const pl = new PointLight(0x22c55e, 0.6, 2.5);
      group.add(pl);
    }

    group.position.set(x, 0.4, z);
    this.scene.add(group);

    this.pickups.push({
      group: group,
      type: type,
      picked: false,
      rotSpeed: Math.random() * 1.5 + 1.0
    });
  }

  update(dt: number, time: number): void {
    this.flickerLights.forEach(item => {
      if (item.isFlickering) {
        const noise = Math.sin(time * item.flickerSpeed) + Math.sin(time * item.flickerSpeed * 2.3);
        const flicker = noise > 0.8 ? 0.1 : (noise < -0.6 ? 0.3 : 1.0);
        item.light.intensity = item.baseIntensity * flicker;
        item.fixture.material.opacity = flicker;
      }
    });

    this.pickups.forEach(item => {
      if (!item.picked) {
        item.group.rotation.y += item.rotSpeed * dt;
        item.group.position.y = 0.4 + Math.sin(time * 3 + item.rotSpeed) * 0.08;
      }
    });
  }
}
