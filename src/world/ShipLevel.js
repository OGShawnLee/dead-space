const THREE = window.THREE;
import { TextureFactory } from '../graphics/TextureFactory.js';

/**
 * Procedural Ship Level Generator
 * Generates an extruded 3D labyrinth, metal panels, colliders, escape airlock, and props.
 */
export class ShipLevel {
  constructor(scene) {
    this.scene = scene;
    this.gridSize = 17;
    this.cellSize = 4;
    this.wallHeight = 3.6;
    this.colliders = [];
    this.flickerLights = [];
    this.pickups = [];
    this.escapeZone = null;
    this.spawnPoints = [];
    this.playerStart = new THREE.Vector3(0, 0, 0);

    this.matWall = new THREE.MeshStandardMaterial({
      map: TextureFactory.createMetalWall(),
      roughness: 0.65,
      metalness: 0.5
    });
    this.matFloor = new THREE.MeshStandardMaterial({
      map: TextureFactory.createFloorGrate(),
      roughness: 0.8,
      metalness: 0.6
    });
    this.matCeiling = new THREE.MeshStandardMaterial({
      map: TextureFactory.createCeiling(),
      roughness: 0.9,
      metalness: 0.3
    });
    this.matEscape = new THREE.MeshStandardMaterial({
      color: 0x00ff66,
      emissive: 0x00ff66,
      emissiveIntensity: 0.8,
      roughness: 0.2
    });

    this.generate();
  }

  generate() {
    const N = this.gridSize;
    const grid = Array(N).fill(null).map(() => Array(N).fill(1));

    const carveRoom = (cx, cz, w, h, val = 0) => {
      for (let x = cx - Math.floor(w / 2); x <= cx + Math.floor(w / 2); x++) {
        for (let z = cz - Math.floor(h / 2); z <= cz + Math.floor(h / 2); z++) {
          if (x > 0 && x < N - 1 && z > 0 && z < N - 1) {
            grid[z][x] = val;
          }
        }
      }
    };

    carveRoom(3, 3, 3, 3, 2); // Start room
    carveRoom(N - 4, N - 4, 3, 3, 3); // Escape room
    carveRoom(N - 4, 3, 3, 3, 4); // Storage 1
    carveRoom(3, N - 4, 3, 3, 4); // Storage 2
    carveRoom(Math.floor(N / 2), Math.floor(N / 2), 4, 4, 0); // Center

    const connect = (x1, z1, x2, z2) => {
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

    connect(3, 3, Math.floor(N / 2), Math.floor(N / 2));
    connect(Math.floor(N / 2), Math.floor(N / 2), N - 4, N - 4);
    connect(3, 3, 3, N - 4);
    connect(3, N - 4, Math.floor(N / 2), Math.floor(N / 2));
    connect(N - 4, 3, N - 4, N - 4);
    connect(3, 3, N - 4, 3);

    const wallGeo = new THREE.BoxGeometry(this.cellSize, this.wallHeight, this.cellSize);
    const floorGeo = new THREE.PlaneGeometry(this.cellSize, this.cellSize);
    const ceilingGeo = new THREE.PlaneGeometry(this.cellSize, this.cellSize);
    const halfW = (N * this.cellSize) / 2;

    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const val = grid[z][x];
        const wx = x * this.cellSize - halfW + this.cellSize / 2;
        const wz = z * this.cellSize - halfW + this.cellSize / 2;

        if (val === 1) {
          const wallMesh = new THREE.Mesh(wallGeo, this.matWall);
          wallMesh.position.set(wx, this.wallHeight / 2, wz);
          wallMesh.castShadow = true;
          wallMesh.receiveShadow = true;
          this.scene.add(wallMesh);
          this.colliders.push(new THREE.Box3().setFromObject(wallMesh));
        } else {
          const floorMesh = new THREE.Mesh(floorGeo, this.matFloor);
          floorMesh.rotation.x = -Math.PI / 2;
          floorMesh.position.set(wx, 0, wz);
          floorMesh.receiveShadow = true;
          this.scene.add(floorMesh);

          const ceilMesh = new THREE.Mesh(ceilingGeo, this.matCeiling);
          ceilMesh.rotation.x = Math.PI / 2;
          ceilMesh.position.set(wx, this.wallHeight, wz);
          this.scene.add(ceilMesh);

          if (val === 2) {
            this.playerStart.set(wx, 0, wz);
          } else if (val === 3) {
            this.escapeZone = {
              center: new THREE.Vector3(wx, 0, wz),
              radius: 3.5
            };
            this.createEscapeChamber(wx, wz);
          } else if (val === 0 || val === 4) {
            if (Math.random() < 0.22 && (Math.abs(wx - this.playerStart.x) > 10 || Math.abs(wz - this.playerStart.z) > 10)) {
              this.spawnPoints.push(new THREE.Vector3(wx, 0, wz));
            }

            if (Math.random() < 0.14) {
              this.createCorridorLight(wx, wz, Math.random() < 0.35 ? 'red' : 'white');
            }

            if (Math.random() < 0.2) {
              this.createPickup(wx, wz, Math.random() < 0.55 ? 'ammo' : 'medkit');
            }
          }
        }
      }
    }
  }

  createCorridorLight(x, z, type) {
    const isRed = type === 'red';
    const color = isRed ? 0xff2222 : 0xd8e8ff;
    const light = new THREE.PointLight(color, isRed ? 1.4 : 1.0, 7.5);
    light.position.set(x, this.wallHeight - 0.35, z);
    this.scene.add(light);

    const fixtureGeo = new THREE.BoxGeometry(0.8, 0.15, 0.3);
    const fixtureMat = new THREE.MeshBasicMaterial({ color: color });
    const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
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

  createEscapeChamber(x, z) {
    const greenLight = new THREE.PointLight(0x00ff66, 3.5, 12);
    greenLight.position.set(x, this.wallHeight - 0.4, z);
    this.scene.add(greenLight);

    const padGeo = new THREE.CylinderGeometry(2.2, 2.2, 0.1, 16);
    const pad = new THREE.Mesh(padGeo, this.matEscape);
    pad.position.set(x, 0.05, z);
    this.scene.add(pad);

    const beaconGeo = new THREE.CylinderGeometry(2, 2, this.wallHeight, 16, 1, true);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0x00ff66,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(x, this.wallHeight / 2, z);
    this.scene.add(beacon);

    const consoleGeo = new THREE.BoxGeometry(1.0, 1.2, 0.6);
    const consoleMat = new THREE.MeshStandardMaterial({
      color: 0x22262c,
      roughness: 0.4
    });
    const consoleMesh = new THREE.Mesh(consoleGeo, consoleMat);
    consoleMesh.position.set(x, 0.6, z - 1.5);
    this.scene.add(consoleMesh);

    const screenGeo = new THREE.PlaneGeometry(0.7, 0.4);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(x, 0.9, z - 1.19);
    this.scene.add(screen);
  }

  createPickup(x, z, type) {
    const isAmmo = type === 'ammo';
    const group = new THREE.Group();

    if (isAmmo) {
      const geo = new THREE.BoxGeometry(0.45, 0.25, 0.35);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x00a8cc,
        emissive: 0x00e5ff,
        emissiveIntensity: 0.5,
        roughness: 0.3
      });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      const pl = new THREE.PointLight(0x00e5ff, 0.6, 2.5);
      group.add(pl);
    } else {
      const geo = new THREE.CylinderGeometry(0.2, 0.2, 0.45, 8);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x15803d,
        emissive: 0x22c55e,
        emissiveIntensity: 0.5,
        roughness: 0.3
      });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      const pl = new THREE.PointLight(0x22c55e, 0.6, 2.5);
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

  update(dt, time) {
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
