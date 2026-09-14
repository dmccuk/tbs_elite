import * as THREE from "three";
import { glowTexture } from "./fx/textures";

// Procedural ship and prop models. Every model faces -Z (the same way a
// camera looks), so orienting with Matrix4.lookAt points the nose at a target.
//
// Each ship is returned as a ShipModel: `root` is moved/rotated by gameplay,
// `body` is the visual child that can bank or barrel-roll without disturbing
// the flight direction, and the marker arrays give world positions for engine
// trails, gun muzzles and missile pods.

export interface ShipModel {
  root: THREE.Group;
  body: THREE.Group;
  engines: THREE.Object3D[];
  guns: THREE.Object3D[];
  pods: THREE.Object3D[];
  bay: THREE.Object3D | null;
  glows: THREE.Sprite[];
  cargo: THREE.Object3D[];
}

function newModel(): ShipModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  return { root, body, engines: [], guns: [], pods: [], bay: null, glows: [], cargo: [] };
}

function marker(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D {
  const m = new THREE.Object3D();
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const glowMaterials = new Map<string, THREE.SpriteMaterial>();

/**
 * Additive glow sprite. Materials are shared per colour so spawning missiles
 * and drones doesn't pile up materials; pass unique=true if you will change
 * the sprite's colour at runtime.
 */
export function glowSprite(color: number, size: number, intensity = 2.5, unique = false): THREE.Sprite {
  const key = `${color}:${intensity}`;
  let mat = unique ? undefined : glowMaterials.get(key);
  if (!mat) {
    mat = new THREE.SpriteMaterial({
      map: glowTexture,
      color: new THREE.Color(color).multiplyScalar(intensity),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    if (!unique) glowMaterials.set(key, mat);
  }
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

// ---------------------------------------------------------------------------
// Hull textures: panel seams, weathering and lit windows drawn on a canvas.

interface PanelOptions {
  base: string;
  seam: string;
  variance: number;       // 0–1 brightness jitter per panel
  grime?: number;         // 0–1 amount of dark streaks
  windows?: string;       // emissive window colour; omitted = no emissive map
  windowDensity?: number;
  repeat?: [number, number];
}

export function panelTextures(opts: PanelOptions, size = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = opts.base;
  ctx.fillRect(0, 0, size, size);

  // Panels of varying size in a loose grid.
  const cell = size / 16;
  for (let y = 0; y < 16; y++) {
    let x = 0;
    while (x < 16) {
      const w = 1 + Math.floor(Math.random() * 4);
      const shade = (Math.random() - 0.5) * opts.variance;
      ctx.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`;
      ctx.fillRect(x * cell, y * cell, w * cell, cell);
      ctx.strokeStyle = opts.seam;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x * cell + 0.5, y * cell + 0.5, w * cell - 1, cell - 1);
      // Rivets / greebles
      if (Math.random() < 0.25) {
        ctx.fillStyle = opts.seam;
        ctx.fillRect(x * cell + 4, y * cell + 4, 3, 3);
        ctx.fillRect(x * cell + w * cell - 7, y * cell + 4, 3, 3);
      }
      x += w;
    }
  }

  if (opts.grime) {
    for (let i = 0; i < 120 * opts.grime; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const g = ctx.createLinearGradient(x, y, x, y + 40 + Math.random() * 80);
      g.addColorStop(0, `rgba(10,8,5,${0.25 * Math.random()})`);
      g.addColorStop(1, "rgba(10,8,5,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, 3 + Math.random() * 10, 120);
    }
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  if (opts.repeat) map.repeat.set(opts.repeat[0], opts.repeat[1]);

  let emissiveMap: THREE.CanvasTexture | null = null;
  if (opts.windows) {
    const e = document.createElement("canvas");
    e.width = e.height = size;
    const ectx = e.getContext("2d")!;
    ectx.fillStyle = "#000";
    ectx.fillRect(0, 0, size, size);
    ectx.fillStyle = opts.windows;
    const density = opts.windowDensity ?? 0.3;
    for (let row = 0; row < 32; row++) {
      if (row % 3 !== 1) continue;
      for (let col = 0; col < 64; col++) {
        if (Math.random() < density) ectx.fillRect(col * (size / 64) + 1, row * (size / 32) + 2, size / 64 - 3, 3);
      }
    }
    emissiveMap = new THREE.CanvasTexture(e);
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
    if (opts.repeat) emissiveMap.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  return { map, emissiveMap };
}

// ---------------------------------------------------------------------------
// Player: Space Refuse Collector MK-IV — a boxy, grimy garbage hauler.

export function createPlayerShip(): ShipModel {
  const m = newModel();
  const s = 0.04;
  const b = m.body;

  const hullTex = panelTextures({ base: "#6b5f48", seam: "rgba(20,16,10,0.8)", variance: 0.18, grime: 1.2, repeat: [1, 1] });
  const hullPaint = new THREE.MeshStandardMaterial({ map: hullTex.map, roughness: 0.72, metalness: 0.45 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.8 });
  const hazard = new THREE.MeshStandardMaterial({ color: 0xd8a820, roughness: 0.55, metalness: 0.3, emissive: 0x442200, emissiveIntensity: 0.35 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7, metalness: 0.3 });
  const glass = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc860).multiplyScalar(1.6) });

  // Main chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(s * 0.7, s * 0.5, s * 1.2), hullPaint);
  b.add(chassis);

  // Side armour skirts
  for (const side of [1, -1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(s * 0.08, s * 0.35, s * 1.0), darkMetal);
    skirt.position.set(side * s * 0.39, -s * 0.05, 0);
    b.add(skirt);
  }

  // Cockpit pod and windshield
  const cockpit = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.18, s * 0.24, s * 0.45, 8), hullPaint);
  cockpit.rotation.x = Math.PI / 2;
  cockpit.position.set(0, s * 0.1, -s * 0.78);
  b.add(cockpit);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(s * 0.28, s * 0.07, s * 0.16), glass);
  windshield.position.set(0, s * 0.22, -s * 0.82);
  b.add(windshield);

  // Cargo clamp and the bio-waste container
  const clampMesh = new THREE.Mesh(new THREE.BoxGeometry(s * 0.5, s * 0.1, s * 0.9), darkMetal);
  clampMesh.position.set(0, -s * 0.3, 0);
  b.add(clampMesh);
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(s * 0.45, s * 0.35, s * 0.7), hazard);
  cargo.position.set(0, -s * 0.52, 0);
  b.add(cargo);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(s * 0.46, s * 0.07, s * 0.71), stripeMat);
  stripe.position.set(0, -s * 0.52, 0);
  b.add(stripe);
  m.cargo.push(cargo, stripe);

  // Twin engine nacelles
  for (const side of [1, -1]) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.14, s * 0.16, s * 0.6, 12), darkMetal);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(side * s * 0.42, s * 0.02, s * 0.5);
    b.add(nacelle);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(s * 0.14, s * 0.025, 6, 16), hazard);
    ring.position.set(side * s * 0.42, s * 0.02, s * 0.3);
    b.add(ring);
    const glow = glowSprite(0xff8833, s * 0.4, 1.8);
    glow.position.set(side * s * 0.42, s * 0.02, s * 0.84);
    b.add(glow);
    m.glows.push(glow);
    m.engines.push(marker(b, side * s * 0.42, s * 0.02, s * 0.86));
  }

  // Gun hardpoints under the cockpit
  for (const side of [1, -1]) {
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.025, s * 0.03, s * 0.4, 6), darkMetal);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(side * s * 0.25, -s * 0.12, -s * 0.72);
    b.add(gun);
    m.guns.push(marker(b, side * s * 0.25, -s * 0.12, -s * 0.95));
  }

  // Antenna mast and nav lights
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.015, s * 0.015, s * 0.5, 6), darkMetal);
  mast.position.set(s * 0.2, s * 0.45, s * 0.25);
  b.add(mast);
  const port = glowSprite(0xff3344, s * 0.25, 3);
  port.position.set(-s * 0.46, s * 0.1, 0);
  const stbd = glowSprite(0x33ff66, s * 0.25, 3);
  stbd.position.set(s * 0.46, s * 0.1, 0);
  b.add(port, stbd);

  return m;
}

// ---------------------------------------------------------------------------
// Royal Yacht "Royal Favor" — polished silver with gold trim and blue engines.
// Built along +X, then turned so the nose faces -Z.

export function createRoyalYacht(): ShipModel {
  const m = newModel();
  const inner = new THREE.Group();
  inner.rotation.y = Math.PI / 2;
  m.body.add(inner);
  const sc = 0.1;

  const hullTex = panelTextures({ base: "#c9ccd8", seam: "rgba(60,70,90,0.55)", variance: 0.1, windows: "#ffe9a0", windowDensity: 0.45, repeat: [3, 1] });
  const hullMat = new THREE.MeshStandardMaterial({
    map: hullTex.map, emissiveMap: hullTex.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.4,
    roughness: 0.22, metalness: 0.85,
  });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x8e9ab0, roughness: 0.3, metalness: 0.9 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd070, roughness: 0.25, metalness: 1, emissive: 0x664411, emissiveIntensity: 0.6 });
  const windowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe9a0).multiplyScalar(1.8) });

  const section = (r1: number, r2: number, len: number, x: number) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(sc * r1, sc * r2, sc * len, 24), hullMat);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set(sc * x, 0, 0);
    inner.add(mesh);
  };
  section(0.32, 0.4, 1.6, -1.2);   // aft
  section(0.22, 0.32, 1.8, 0.3);   // mid
  section(0.15, 0.22, 1.0, 1.7);   // forward

  const nose = new THREE.Mesh(new THREE.ConeGeometry(sc * 0.15, sc * 0.5, 24), hullMat);
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(sc * 2.45, 0, 0);
  inner.add(nose);

  // Gold trim bands
  for (const x of [-0.4, 1.2, 2.2]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(sc * (x < 0 ? 0.33 : x < 2 ? 0.23 : 0.16), sc * 0.018, 6, 32), goldMat);
    band.rotation.y = Math.PI / 2;
    band.position.set(sc * x, 0, 0);
    inner.add(band);
  }

  // Bridge tower
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(sc * 0.55, sc * 0.2, sc * 0.3), accentMat);
  bridge.position.set(sc * 0.4, sc * 0.32, 0);
  inner.add(bridge);
  const bridgeWindow = new THREE.Mesh(new THREE.BoxGeometry(sc * 0.46, sc * 0.05, sc * 0.31), windowMat);
  bridgeWindow.position.set(sc * 0.42, sc * 0.37, 0);
  inner.add(bridgeWindow);
  const crest = new THREE.Mesh(new THREE.CylinderGeometry(sc * 0.07, sc * 0.07, sc * 0.015, 20), goldMat);
  crest.rotation.z = Math.PI / 2;
  crest.position.set(sc * 0.68, sc * 0.32, 0);
  inner.add(crest);

  // Swept fins with nav lights
  for (const side of [1, -1]) {
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(-sc * 1.0, 0);
    finShape.lineTo(-sc * 1.25, sc * 0.55);
    finShape.lineTo(-sc * 0.75, sc * 0.55);
    finShape.closePath();
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: sc * 0.03, bevelEnabled: false }), accentMat);
    fin.rotation.x = side * Math.PI / 2;
    fin.position.set(-sc * 0.2, 0, side * sc * 0.3);
    inner.add(fin);
    const nav = glowSprite(side === 1 ? 0x33ff66 : 0xff3344, sc * 0.25, 3);
    nav.position.set(-sc * 1.15, 0, side * sc * 0.86);
    inner.add(nav);
  }

  // Dorsal fin and ventral keel
  const keel = new THREE.Mesh(new THREE.BoxGeometry(sc * 1.0, sc * 0.2, sc * 0.04), accentMat);
  keel.position.set(-sc * 0.3, -sc * 0.34, 0);
  inner.add(keel);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(sc * 0.012, sc * 0.012, sc * 0.45, 6), accentMat);
  antenna.position.set(sc * 1.2, sc * 0.42, 0);
  inner.add(antenna);

  // Triple blue plasma engines
  for (let i = -1; i <= 1; i++) {
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(sc * 0.13, sc * 0.17, sc * 0.3, 16), accentMat);
    housing.rotation.z = Math.PI / 2;
    housing.position.set(-sc * 2.1, 0, i * sc * 0.22);
    inner.add(housing);
    const glow = glowSprite(0x66bbff, sc * 0.9, 3);
    glow.position.set(-sc * 2.3, 0, i * sc * 0.22);
    inner.add(glow);
    m.glows.push(glow);
    m.engines.push(marker(inner, -sc * 2.3, 0, i * sc * 0.22));
  }

  return m;
}

// ---------------------------------------------------------------------------
// The Black Ship — a House Cayston corvette. Dark, angular, red-lit.

export function createCorvette(): ShipModel {
  const m = newModel();
  const inner = new THREE.Group();
  inner.rotation.y = Math.PI / 2;
  m.body.add(inner);
  const sc = 0.3;

  const hullTex = panelTextures({ base: "#15161c", seam: "rgba(0,0,0,0.9)", variance: 0.12, grime: 0.4, windows: "#ff3a1a", windowDensity: 0.12, repeat: [2, 1] });
  const darkHull = new THREE.MeshStandardMaterial({
    map: hullTex.map, emissiveMap: hullTex.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.2,
    roughness: 0.5, metalness: 0.85,
  });
  const plate = new THREE.MeshStandardMaterial({ color: 0x23252e, roughness: 0.42, metalness: 0.9, emissive: 0x220000, emissiveIntensity: 0.3 });
  const redGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a00).multiplyScalar(2.5) });
  const ember = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a2a).multiplyScalar(2) });

  const mainHull = new THREE.Mesh(new THREE.CylinderGeometry(sc * 0.08, sc * 0.45, sc * 2.6, 6), darkHull);
  mainHull.rotation.z = -Math.PI / 2;
  inner.add(mainHull);

  const dorsal = new THREE.Mesh(new THREE.BoxGeometry(sc * 2.0, sc * 0.18, sc * 0.5), plate);
  dorsal.position.set(-sc * 0.2, sc * 0.22, 0);
  inner.add(dorsal);
  const belly = new THREE.Mesh(new THREE.BoxGeometry(sc * 1.6, sc * 0.14, sc * 0.7), plate);
  belly.position.set(-sc * 0.3, -sc * 0.22, 0);
  inner.add(belly);

  // Bridge spine and sensor slit
  const tower = new THREE.Mesh(new THREE.BoxGeometry(sc * 0.4, sc * 0.16, sc * 0.2), plate);
  tower.position.set(-sc * 0.5, sc * 0.38, 0);
  inner.add(tower);
  const slit = new THREE.Mesh(new THREE.BoxGeometry(sc * 0.05, sc * 0.04, sc * 0.34), redGlow);
  slit.position.set(sc * 0.95, sc * 0.05, 0);
  inner.add(slit);
  const towerSlit = new THREE.Mesh(new THREE.BoxGeometry(sc * 0.05, sc * 0.03, sc * 0.21), redGlow);
  towerSlit.position.set(-sc * 0.3, sc * 0.42, 0);
  inner.add(towerSlit);

  // Twin forward cannons
  for (const sign of [1, -1]) {
    const mount = new THREE.Mesh(new THREE.BoxGeometry(sc * 0.2, sc * 0.1, sc * 0.2), plate);
    mount.position.set(sc * 0.55, sign * sc * 0.32, 0);
    inner.add(mount);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(sc * 0.025, sc * 0.03, sc * 0.65, 8), plate);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(sc * 0.88, sign * sc * 0.32, 0);
    inner.add(barrel);
    m.guns.push(marker(inner, sc * 1.22, sign * sc * 0.32, 0));
  }

  // Swept wings with missile pods
  for (const side of [1, -1]) {
    const wingShape = new THREE.Shape();
    wingShape.moveTo(sc * 0.2, 0);
    wingShape.lineTo(-sc * 1.1, 0);
    wingShape.lineTo(-sc * 1.3, sc * 0.95);
    wingShape.lineTo(-sc * 0.6, sc * 0.95);
    wingShape.closePath();
    const wing = new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape, { depth: sc * 0.05, bevelEnabled: false }), plate);
    wing.rotation.x = side * Math.PI / 2;
    wing.position.set(0, -sc * 0.02, side * sc * 0.1);
    inner.add(wing);

    const pod = new THREE.Mesh(new THREE.BoxGeometry(sc * 0.5, sc * 0.12, sc * 0.16), plate);
    pod.position.set(-sc * 0.85, 0, side * sc * 0.95);
    inner.add(pod);
    for (const k of [-1, 1]) {
      const tip = glowSprite(0xff4422, sc * 0.08, 3);
      tip.position.set(-sc * 0.58, 0, side * sc * 0.95 + k * sc * 0.05);
      inner.add(tip);
    }
    m.pods.push(marker(inner, -sc * 0.55, 0, side * sc * 0.95));
    const tipLight = glowSprite(0xff2222, sc * 0.12, 3);
    tipLight.position.set(-sc * 1.25, 0, side * sc * 1.05);
    inner.add(tipLight);
  }

  // Twin engines
  for (const side of [1, -1]) {
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(sc * 0.16, sc * 0.21, sc * 0.55, 12), plate);
    housing.rotation.z = Math.PI / 2;
    housing.position.set(-sc * 1.45, 0, side * sc * 0.32);
    inner.add(housing);
    const innerGlow = new THREE.Mesh(new THREE.CylinderGeometry(sc * 0.12, sc * 0.12, sc * 0.05, 12), ember);
    innerGlow.rotation.z = Math.PI / 2;
    innerGlow.position.set(-sc * 1.73, 0, side * sc * 0.32);
    inner.add(innerGlow);
    const glow = glowSprite(0xff3300, sc * 0.9, 3);
    glow.position.set(-sc * 1.85, 0, side * sc * 0.32);
    inner.add(glow);
    m.glows.push(glow);
    m.engines.push(marker(inner, -sc * 1.85, 0, side * sc * 0.32));
  }

  const spike = new THREE.Mesh(new THREE.ConeGeometry(sc * 0.025, sc * 0.45, 6), plate);
  spike.position.set(-sc * 0.45, sc * 0.65, 0);
  inner.add(spike);

  m.bay = marker(inner, -sc * 0.3, -sc * 0.4, 0);
  return m;
}

// ---------------------------------------------------------------------------
// Cayston attack drone — small, fast, forward-swept blades and a red eye.

const droneMats = {
  body: new THREE.MeshStandardMaterial({ color: 0x2b2d36, roughness: 0.4, metalness: 0.9, emissive: 0x220000, emissiveIntensity: 0.4 }),
  blade: new THREE.MeshStandardMaterial({ color: 0x3c3f4a, roughness: 0.35, metalness: 0.9 }),
  eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(3) }),
};
const droneGeo = {
  body: new THREE.OctahedronGeometry(1, 0),
  blade: (() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.9, -0.5);
    shape.lineTo(1.1, -1.2);
    shape.lineTo(0.3, -0.3);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
  })(),
  eye: new THREE.SphereGeometry(1, 10, 8),
};

export function createDrone(): ShipModel {
  const m = newModel();
  const s = 0.028;
  const core = new THREE.Mesh(droneGeo.body, droneMats.body);
  core.scale.set(s * 0.55, s * 0.4, s * 1.1);
  m.body.add(core);
  for (const side of [1, -1]) {
    const blade = new THREE.Mesh(droneGeo.blade, droneMats.blade);
    blade.scale.set(side * s, s, s);
    blade.rotation.x = -Math.PI / 2;
    blade.position.set(0, 0, s * 0.3);
    m.body.add(blade);
  }
  const eye = new THREE.Mesh(droneGeo.eye, droneMats.eye);
  eye.scale.setScalar(s * 0.16);
  eye.position.set(0, s * 0.12, -s * 0.8);
  m.body.add(eye);
  const glow = glowSprite(0xff3322, s * 1.6, 3);
  glow.position.set(0, 0, s * 1.05);
  m.body.add(glow);
  m.glows.push(glow);
  m.engines.push(marker(m.body, 0, 0, s * 1.1));
  m.guns.push(marker(m.body, 0, 0, -s * 1.2));
  return m;
}

// ---------------------------------------------------------------------------
// Missile — shared geometry, one small group per missile.

const missileGeo = {
  body: new THREE.CylinderGeometry(0.004, 0.005, 0.045, 8).rotateX(Math.PI / 2),
  nose: new THREE.ConeGeometry(0.004, 0.012, 8).rotateX(-Math.PI / 2),
  fin: new THREE.BoxGeometry(0.014, 0.0015, 0.01),
};
const missileMats = {
  body: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.4, metalness: 0.8 }),
  nose: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4422).multiplyScalar(2) }),
};

export function createMissile(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(missileGeo.body, missileMats.body));
  const nose = new THREE.Mesh(missileGeo.nose, missileMats.nose);
  nose.position.z = -0.028;
  g.add(nose);
  for (let i = 0; i < 2; i++) {
    const fin = new THREE.Mesh(missileGeo.fin, missileMats.body);
    fin.position.z = 0.018;
    fin.rotation.z = i * Math.PI / 2;
    g.add(fin);
  }
  const glow = glowSprite(0xff7a2a, 0.06, 3.5);
  glow.position.z = 0.03;
  g.add(glow);
  return g;
}

// ---------------------------------------------------------------------------
// Bio-waste container, once launched — tumbling hazard box with a beacon.

export function createCargoMine(): { root: THREE.Group; light: THREE.Sprite } {
  const g = new THREE.Group();
  const s = 0.04;
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(s * 0.45, s * 0.35, s * 0.7),
    new THREE.MeshStandardMaterial({ color: 0xd8a820, roughness: 0.55, metalness: 0.3, emissive: 0x663300, emissiveIntensity: 0.6 })
  );
  g.add(box);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(s * 0.46, s * 0.07, s * 0.71),
    new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 })
  );
  g.add(stripe);
  const light = glowSprite(0xffaa00, s * 1.8, 3, true); // recoloured while armed
  g.add(light);
  return { root: g, light };
}

// ---------------------------------------------------------------------------
// Practice target — a floating junk drum from the Collector's own route.

const drumGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.05, 14);
const drumMats = [0x8a4a2a, 0x3a6a4a, 0x6a6a72].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.5 })
);
const drumBand = new THREE.MeshStandardMaterial({ color: 0xd8a820, emissive: 0x442200, emissiveIntensity: 0.5, roughness: 0.6 });
const drumBandGeo = new THREE.CylinderGeometry(0.0205, 0.0205, 0.008, 14);

export function createDrum(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(drumGeo, drumMats[Math.floor(Math.random() * drumMats.length)]));
  for (const y of [-0.014, 0.014]) {
    const band = new THREE.Mesh(drumBandGeo, drumBand);
    band.position.y = y;
    g.add(band);
  }
  const light = glowSprite(0xffaa00, 0.03, 2);
  light.position.y = 0.03;
  g.add(light);
  return g;
}

// ---------------------------------------------------------------------------
// Rendezvous beacon

export function createBeacon(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00ff88).multiplyScalar(2), transparent: true, opacity: 0.85 });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.006, 8, 48), mat);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.004, 8, 48), mat);
  ring2.rotation.x = Math.PI / 2;
  g.add(ring1, ring2);
  g.add(glowSprite(0x00ff88, 0.18, 3));
  g.name = "beacon";
  return g;
}
