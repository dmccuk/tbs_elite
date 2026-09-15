import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { glowSprite, panelTextures, type ShipModel } from "./models";

// Frontier models for the Prologue (Tessick-3): the Frontier Corps' Seagull,
// the raiders' fighters and cargo shuttle, the relay station and the practice
// buoys. Same conventions as models.ts: 1 unit = 1 km, ships face -Z, markers
// and glows hang under `body` or a group (never under a mesh: baking removes
// meshes). Canvas-backed materials are built lazily on first use and shared,
// and static parts are merged into one mesh per material to save draw calls.

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

function lazy<T>(build: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= build());
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const std = (color: number, roughness: number, metalness: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
/** Unlit colour pushed past 1 so the bloom pass picks it up. */
const lit = (color: number, k: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });
/** Material settings for decals floated just off a surface. */
const decal = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };

function panelMat(opts: Parameters<typeof panelTextures>[0], roughness: number, metalness: number, glow = 1.2, size = 512) {
  const t = panelTextures(opts, size);
  return new THREE.MeshStandardMaterial({
    map: t.map, roughness, metalness,
    ...(t.emissiveMap ? { emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: glow } : {}),
  });
}

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** Cylinder lying along Z: rFront at the -Z end, rRear at the +Z end. */
function zCyl(rFront: number, rRear: number, len: number, seg = 12, open = false) {
  return new THREE.CylinderGeometry(rRear, rFront, len, seg, 1, open).rotateX(Math.PI / 2);
}

const shape = (pts: number[][]) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
/** Flat outline in the XZ plane — points are (x, forward), forward = -Z — extruded `thick` in Y, centred. */
function planform(pts: number[][], thick: number) {
  return new THREE.ExtrudeGeometry(shape(pts), { depth: thick, bevelEnabled: false }).translate(0, 0, -thick / 2).rotateX(-Math.PI / 2);
}
/** Side profile — points are (forward, up), forward = -Z — extruded `width` across X, centred. */
function profile(pts: number[][], width: number) {
  return new THREE.ExtrudeGeometry(shape(pts), { depth: width, bevelEnabled: false }).translate(0, 0, -width / 2).rotateY(Math.PI / 2);
}

const Y_UP = V(0, 1, 0);
const rodGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
const nozzleMat = std(0x1c1d21, 0.45, 0.85, { side: THREE.DoubleSide });

/** Thin cylinder from a to b. */
function rod(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const d = b.clone().sub(a);
  const mesh = add(parent, rodGeo, mat);
  mesh.position.copy(a).lerp(b, 0.5);
  mesh.quaternion.setFromUnitVectors(Y_UP, d.clone().normalize());
  mesh.scale.set(r, d.length(), r);
  return mesh;
}

/** Glow sprite under `parent`; flash = [period, phase] makes it a blinking beacon with its own material. */
function light(parent: THREE.Object3D, color: number, size: number, x: number, y: number, z: number, flash?: [number, number]): THREE.Sprite {
  const s = glowSprite(color, size, 3, !!flash);
  s.position.set(x, y, z);
  if (flash) s.onBeforeRender = flasher([s.material], flash[0], flash[1]);
  parent.add(s);
  return s;
}

function group(parent: THREE.Object3D, x = 0, y = 0, z = 0, rz = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.z = rz;
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// Baking and beacons

type Part = { geo: THREE.BufferGeometry; mat: THREE.Material };
const ATTRS = ["position", "normal", "uv"] as const;

/** Merges every plain mesh under `root` into one geometry per material (root's local space) and removes the
 *  originals; groups, sprites, markers and instanced meshes stay. No negative-scale parts: winding would flip. */
function bakeParts(root: THREE.Object3D): Part[] {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) meshes.push(o); });
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const mesh of meshes) {
    const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    if (ATTRS.some((n) => !src.getAttribute(n))) continue;
    const geo = new THREE.BufferGeometry();
    for (const n of ATTRS) geo.setAttribute(n, src.getAttribute(n));
    geo.applyMatrix4(toRoot.clone().multiply(mesh.matrixWorld));
    const mat = mesh.material as THREE.Material;
    byMat.set(mat, [...(byMat.get(mat) ?? []), geo]);
    mesh.removeFromParent();
  }
  return Array.from(byMat, ([mat, geos]) => ({ mat, geo: mergeGeometries(geos) }));
}

function addParts(parent: THREE.Object3D, parts: Part[]): void {
  for (const p of parts) parent.add(new THREE.Mesh(p.geo, p.mat));
}

/** onBeforeRender hook that flashes the given materials together. Purely cosmetic (gameplay never reads it),
 *  so it runs on wall-clock time rather than the game scheduler. */
function flasher(mats: { color: THREE.Color }[], period: number, phase: number, duty = 0.25): () => void {
  const bases = mats.map((m) => m.color.clone());
  return () => {
    const on = (performance.now() / 1000 / period + phase) % 1 < duty;
    mats.forEach((m, i) => m.color.copy(bases[i]).multiplyScalar(on ? 1 : 0.08));
  };
}

// ---------------------------------------------------------------------------
// Canvas textures: hazard stripes, scorch marks.

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const hazardTex = lazy(() => canvasTex(64, 64, (ctx) => {
  ctx.fillStyle = "#d0a020";
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "#17150f";
  ctx.setTransform(1, 0, 1, 1, 0, 0); // shear, so the rectangles become seamless diagonal stripes
  for (let x = -64; x < 64; x += 32) ctx.fillRect(x, 0, 16, 64);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "rgba(40,30,20,0.25)";
  for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * 64, Math.random() * 64, 2 + Math.random() * 4, 1 + Math.random() * 2);
}));

const hazardMats = new Map<number, THREE.MeshStandardMaterial>();
/** Yellow/black hazard stripes repeated `rx` times across a face. */
function hazardMat(rx: number): THREE.MeshStandardMaterial {
  if (!hazardMats.has(rx)) {
    const map = hazardTex().clone();
    map.repeat.set(rx, 1);
    hazardMats.set(rx, std(0xffffff, 0.6, 0.3, { map, emissive: 0x442200, emissiveIntensity: 0.3 }));
  }
  return hazardMats.get(rx)!;
}

/** Soot blotches and blast streaks, fully transparent at the edges. */
const scorchMat = lazy(() => new THREE.MeshBasicMaterial({
  ...decal,
  map: canvasTex(256, 256, (ctx) => {
    for (let i = 0; i < 8; i++) {
      const x = 128 + (Math.random() - 0.5) * 77, y = 128 + (Math.random() - 0.5) * 77, r = 26 + Math.random() * 46;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      for (const [o, c] of [[0, "rgba(6,5,4,0.8)"], [0.55, "rgba(18,11,6,0.4)"], [1, "rgba(18,11,6,0)"]] as const) g.addColorStop(o, c);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
    ctx.strokeStyle = "rgba(8,6,4,0.3)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 56;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * 20, 128 + Math.sin(a) * 20);
      ctx.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
      ctx.stroke();
    }
  }),
}));

// ---------------------------------------------------------------------------
// Seagull — the Frontier Corps' old patrol fighter. Worn naval grey-white,
// gull wings, twin engines, a pair of nose-mounted coilgun barrels.

const seagullKit = lazy(() => ({
  hull: panelMat({ base: "#a9adb0", seam: "rgba(36,40,46,0.7)", variance: 0.14, grime: 1.1 }, 0.62, 0.45),
  belly: std(0x6d7378, 0.7, 0.4),
  dark: std(0x2a2d32, 0.5, 0.8),
  coil: std(0xb87444, 0.35, 0.9, { emissive: 0x5a1c00, emissiveIntensity: 0.6 }),
  glass: std(0x1a2733, 0.12, 0.7, { emissive: 0x4b8db0, emissiveIntensity: 0.55 }),
  ember: lit(0xffb070, 2.2),
}));
const stripeMats = new Map<number, THREE.MeshStandardMaterial>();

/** Seagull patrol fighter (player & wingman). stripe = squadron stripe colour (default faded navy blue 0x3a5a8a); wingman passes 0xcc6622. */
export function createSeagull(stripe = 0x3a5a8a): ShipModel {
  const m = newModel();
  const b = m.body;
  const k = seagullKit();
  if (!stripeMats.has(stripe)) stripeMats.set(stripe, std(stripe, 0.6, 0.35));
  const paint = stripeMats.get(stripe)!;
  const oval = (mesh: THREE.Mesh) => mesh.scale.set(1.2, 0.85, 1);
  // Fuselage: flattened ten-sided tube, long nose cone, short dark tail cone
  oval(add(b, zCyl(0.0042, 0.0052, 0.03, 10), k.hull, 0, 0, 0.002));
  oval(add(b, new THREE.ConeGeometry(0.0042, 0.012, 10).rotateX(-Math.PI / 2), k.hull, 0, 0, -0.019));
  oval(add(b, zCyl(0.0052, 0.0034, 0.005, 10), k.dark, 0, 0, 0.0195));
  oval(add(b, zCyl(0.00488, 0.0049, 0.002, 10), paint, 0, 0, 0.002)); // squadron band
  add(b, box(0.0024, 0.0022, 0.01), k.hull, 0, 0.0044, 0.009);        // dorsal spine
  add(b, box(0.003, 0.0016, 0.014), k.belly, 0, -0.0042, 0.006);      // ventral keel
  for (const side of [1, -1]) add(b, box(0.0016, 0.0024, 0.007), k.dark, side * 0.0056, -0.0004, -0.002); // cheek intakes
  // Bubble canopy with two frame hoops, whip antenna
  add(b, new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), k.glass, 0, 0.0032, -0.0075).scale.set(0.0033, 0.0032, 0.0075);
  const hoopGeo = new THREE.TorusGeometry(1, 0.07, 4, 14, Math.PI);
  for (const [z, f] of [[-0.006, 0.98], [-0.0105, 0.92]]) add(b, hoopGeo, k.dark, 0, 0.0032, z).scale.set(0.0033 * f, 0.0032 * f, 0.0033);
  add(b, new THREE.CylinderGeometry(0.00012, 0.00012, 0.004, 4), k.dark, 0.0008, 0.0068, 0.003).rotation.x = 0.5;
  // Gull wings: inner panel climbs, outer panel droops, squadron-coloured tips.
  // The port wing is the starboard one turned upside down (no mirroring, so it bakes cleanly).
  const innerGeo = planform([[0, 0.006], [0, -0.01], [0.011, -0.01], [0.011, 0.001]], 0.0012);
  const outerGeo = planform([[0, 0.001], [0, -0.01], [0.0065, -0.01], [0.0065, -0.0028]], 0.001);
  const tipGeo = planform([[0.0065, -0.0028], [0.0065, -0.01], [0.0085, -0.01], [0.0085, -0.004]], 0.001);
  for (const side of [1, -1]) {
    const wing = group(b, 0, -0.0012, 0.004, side > 0 ? 0 : Math.PI);
    const inner = group(wing, 0.004, 0, 0, side * 0.3);
    const outer = group(inner, 0.011, 0, 0, side * -0.42);
    add(inner, innerGeo, k.hull);
    add(outer, outerGeo, k.hull);
    add(outer, tipGeo, paint);
    light(outer, side === 1 ? 0x33ff66 : 0xff3344, 0.007, 0.0089, 0, 0.007);
  }
  // Swept tail fin with a squadron-coloured cap and a white strobe
  add(b, profile([[0, 0], [-0.01, 0], [-0.01141, 0.006], [-0.00529, 0.006]], 0.0007), k.hull, 0, 0.0036, 0.006);
  add(b, profile([[-0.00529, 0.006], [-0.01141, 0.006], [-0.012, 0.0085], [-0.0075, 0.0085]], 0.0007), paint, 0, 0.0036, 0.006);
  light(b, 0xffffff, 0.004, 0, 0.0123, 0.0178);
  // Twin engine nacelles blended into the wing roots
  for (const side of [1, -1]) {
    const x = side * 0.0072, y = -0.0006;
    add(b, zCyl(0.003, 0.0033, 0.015, 12), k.hull, x, y, 0.0155);
    add(b, zCyl(0.00335, 0.00335, 0.0015, 12), paint, x, y, 0.019);
    add(b, zCyl(0.0031, 0.0027, 0.003, 12, true), nozzleMat, x, y, 0.0245);
    add(b, new THREE.CircleGeometry(0.0026, 12), k.ember, x, y, 0.0232);
    m.glows.push(light(b, 0xffaa55, 0.018, x, y, 0.026));
    m.engines.push(marker(b, x, y, 0.0262));
  }
  // Uprated coilgun: two chin barrels wrapped in copper accelerator coils
  const coilGeo = new THREE.TorusGeometry(0.0009, 0.00028, 6, 12);
  for (const side of [1, -1]) {
    const x = side * 0.0046, y = -0.0024;
    add(b, box(0.0026, 0.002, 0.009), k.dark, side * 0.0048, y, -0.008);
    add(b, zCyl(0.00055, 0.00065, 0.014, 8), k.dark, x, y, -0.016);
    for (const z of [-0.0125, -0.0155, -0.0185]) add(b, coilGeo, k.coil, x, y, z);
    add(b, zCyl(0.0008, 0.0008, 0.0015, 8), k.dark, x, y, -0.0225);
    m.guns.push(marker(b, x, y, -0.0236));
  }

  addParts(b, bakeParts(b));
  return m;
}

// ---------------------------------------------------------------------------
// Pirate fighter — older than the Seagull and badly kept: off-centre cockpit,
// one big engine, a primer-red replacement wing, two mismatched gun pods.
// Built once as a template and baked; every fighter shares the result.

const pirateKit = lazy(() => {
  // Patchwork hull: a grimy panelled grey, two plain greys that don't match it, primer red
  const hull = panelMat({ base: "#5a5e62", seam: "rgba(12,12,14,0.85)", variance: 0.32, grime: 1.6 }, 0.8, 0.4, 1, 256);
  const [greyB, greyC, rust, dark] = [[0x7d7f7a, 0.75, 0.35], [0x3f4247, 0.6, 0.65], [0x74361f, 0.9, 0.2], [0x1f2023, 0.5, 0.8]]
    .map(([c, r, mt]) => std(c, r, mt));
  const glass = lit(0x8fcf66, 1.3);
  const t = new THREE.Group();
  add(t, box(0.011, 0.008, 0.022), hull, 0, 0, -0.002);
  const nose = new THREE.CylinderGeometry(0.0062, 0.0032, 0.007, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2).toNonIndexed();
  nose.computeVertexNormals(); // flat-faced wedge
  add(t, nose, greyB, 0, 0, -0.0165).scale.set(1.25, 0.9, 1);
  // Cockpit sits off-centre to port
  add(t, box(0.0065, 0.0032, 0.008), greyC, -0.0008, 0.0054, -0.009);
  add(t, box(0.0054, 0.0016, 0.0005), glass, -0.0008, 0.0058, -0.01328);
  for (const side of [1, -1]) add(t, box(0.0004, 0.0012, 0.005), glass, -0.0008 + side * 0.00345, 0.0058, -0.009);
  // One big engine offset to starboard, a dead auxiliary thruster to port
  add(t, zCyl(0.0052, 0.0056, 0.012, 12), greyC, 0.0012, 0.0002, 0.012);
  for (const z of [0.009, 0.0145]) add(t, zCyl(0.0059, 0.0059, 0.0015, 12), dark, 0.0012, 0.0002, z);
  add(t, zCyl(0.0052, 0.0046, 0.003, 12, true), nozzleMat, 0.0012, 0.0002, 0.0185);
  add(t, new THREE.CircleGeometry(0.0044, 12), lit(0xff6a3a, 2.2), 0.0012, 0.0002, 0.0182);
  add(t, zCyl(0.0018, 0.0021, 0.009, 8), rust, -0.0068, -0.0024, 0.0105);
  add(t, zCyl(0.0017, 0.0015, 0.0015, 8, true), nozzleMat, -0.0068, -0.0024, 0.0157);
  // Wings: a straight grey slab with an end plate, and a swept primer-red replacement
  add(t, box(0.012, 0.0012, 0.01), greyB, 0.0112, -0.0015, 0.003).rotation.z = -0.08;
  add(t, box(0.0012, 0.005, 0.008), greyC, 0.0174, -0.0025, 0.004);
  add(t, planform([[0, 0.005], [0, -0.006], [-0.0115, -0.006], [-0.0115, -0.001]], 0.0014), rust, -0.005, -0.0012, 0.003).rotation.z = 0.06;
  // Bolted-on gun pods, no two alike
  add(t, box(0.003, 0.0015, 0.006), dark, 0.0062, -0.0035, -0.008);
  add(t, box(0.0032, 0.0032, 0.012), greyC, 0.0078, -0.0045, -0.008);
  for (const z of [-0.011, -0.005]) add(t, box(0.0037, 0.0037, 0.001), dark, 0.0078, -0.0045, z);
  add(t, zCyl(0.0007, 0.0007, 0.007, 6), dark, 0.0078, -0.0045, -0.0165);
  add(t, box(0.003, 0.0015, 0.006), dark, -0.0062, -0.0035, -0.007);
  add(t, zCyl(0.0017, 0.0017, 0.01, 8), greyB, -0.0074, -0.0042, -0.007);
  add(t, zCyl(0.0019, 0.0019, 0.001, 8), rust, -0.0074, -0.0042, -0.004);
  add(t, zCyl(0.0005, 0.0005, 0.009, 6), dark, -0.0074, -0.0042, -0.0155);
  // Patch panels, a crooked fin, a bent antenna
  add(t, box(0.0045, 0.0005, 0.006), rust, 0.0018, 0.00425, 0.002);
  add(t, box(0.0005, 0.004, 0.007), greyB, 0.00575, 0.0005, -0.006);
  add(t, box(0.0005, 0.0035, 0.006), greyC, -0.00575, -0.001, 0.003);
  add(t, box(0.0008, 0.005, 0.006), greyB, -0.0022, 0.0068, 0.0095).rotation.x = 0.35;
  add(t, new THREE.CylinderGeometry(0.0002, 0.0002, 0.008, 4), dark, 0.003, 0.0075, 0.001).rotation.set(0.5, 0, -0.35);
  return bakeParts(t);
});

/** Pirate fighter: crude, older, mismatched patched panels. Spawned ×3, so share geos/mats. */
export function createPirateFighter(): ShipModel {
  const m = newModel();
  const b = m.body;
  addParts(b, pirateKit());
  m.glows.push(light(b, 0xff6633, 0.02, 0.0012, 0.0002, 0.0205));
  m.engines.push(marker(b, 0.0012, 0.0002, 0.0205));
  m.guns.push(marker(b, 0.0078, -0.0045, -0.0205), marker(b, -0.0074, -0.0042, -0.0205));
  light(b, 0xff3344, 0.005, -0.0165, -0.002, 0.006); // only the port nav light still works
  light(b, 0xffaa33, 0.004, -0.0022, 0.0096, 0.0115);
  return m;
}

// ---------------------------------------------------------------------------
// Cargo shuttle — boxy hauler: truck-style cab, ribbed hold with side doors,
// and a dark engine block with three nozzles (the thing the player must hit).

const shuttleKit = lazy(() => ({
  hull: panelMat({ base: "#747060", seam: "rgba(24,20,14,0.8)", variance: 0.22, grime: 1.5 }, 0.78, 0.4),
  block: panelMat({ base: "#27282c", seam: "rgba(0,0,0,0.9)", variance: 0.14, grime: 0.7 }, 0.5, 0.8, 1, 256),
  door: std(0x565140, 0.8, 0.35),
  rib: std(0x3a3b3f, 0.55, 0.7),
  orange: std(0xc8601c, 0.6, 0.3, { emissive: 0x401400, emissiveIntensity: 0.4 }),
  glass: lit(0xa8dcff, 1.4),
  warm: lit(0xffbf70, 1.15),
  unlit: std(0x121417, 0.2, 0.6),
  ember: lit(0xff9a50, 2.2),
}));

export interface ShuttleModel extends ShipModel {
  /** Marker at the centre of the rear engine block — gameplay puts the "engines" hit sphere (radius 0.022) here. */
  engineBlock: THREE.Object3D;
}

/** Boxy pirate cargo shuttle carrying captives. */
export function createShuttle(): ShuttleModel {
  const m = newModel();
  const b = m.body;
  const k = shuttleKit();
  // Cab with a raked windshield (z -0.045 … -0.032) and an amber roof beacon
  add(b, profile([[0, -0.008], [0.01, -0.008], [0.013, -0.002], [0.0095, 0.007], [0, 0.0085]], 0.022), k.hull, 0, 0.001, -0.032);
  add(b, box(0.016, 0.005, 0.0004), k.glass, 0, 0.00451, -0.04318).rotation.x = 0.371;
  add(b, box(0.0008, 0.0053, 0.0006), k.rib, 0, 0.00458, -0.04337).rotation.x = 0.371;
  for (const side of [1, -1]) add(b, box(0.0004, 0.0028, 0.005), k.glass, side * 0.0111, 0.0045, -0.037);
  add(b, new THREE.SphereGeometry(0.0012, 8, 6), k.orange, 0, 0.0095, -0.036);
  // Cargo hold (z -0.032 … 0.014): ribs, side doors with hazard sills, a few portholes
  add(b, box(0.035, 0.028, 0.046), k.hull, 0, 0, -0.009);
  for (const z of [-0.031, -0.0205, 0.0025, 0.013]) add(b, box(0.0364, 0.0294, 0.0018), k.rib, 0, 0, z);
  for (const side of [1, -1]) {
    add(b, box(0.0006, 0.019, 0.0198), k.door, side * 0.0178, -0.0015, -0.009);
    add(b, box(0.0009, 0.019, 0.0006), k.rib, side * 0.018, -0.0015, -0.009);
    add(b, box(0.0008, 0.0016, 0.02), hazardMat(6), side * 0.0179, -0.0122, -0.009);
    [-0.028, -0.0255, -0.023, 0.006, 0.0095].forEach((z, i) =>
      add(b, box(0.0004, 0.0022, 0.0022), (i + (side > 0 ? 0 : 1)) % 3 === 1 ? k.unlit : k.warm, side * 0.0177, 0.0075, z));
  }
  for (const z of [-0.026, 0.008]) add(b, box(0.024, 0.0006, 0.008), k.door, 0, 0.0143, z);
  for (const side of [1, -1]) add(b, box(0.004, 0.003, 0.036), k.rib, side * 0.012, -0.0155, -0.009);
  add(b, new THREE.CylinderGeometry(0.0003, 0.0003, 0.008, 5), k.rib, 0.012, 0.018, -0.028);
  // Collar and feed pipes into the engine block
  add(b, box(0.026, 0.02, 0.005), k.rib, 0, 0, 0.0165);
  for (const [px, py] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) add(b, zCyl(0.001, 0.001, 0.006, 6), k.door, px * 0.0133, py * 0.0098, 0.0165);
  // Engine block (z 0.019 … 0.041): dark housing, orange warning band, radiator fins
  add(b, box(0.03, 0.024, 0.022), k.block, 0, 0, 0.03);
  add(b, box(0.0306, 0.0246, 0.0018), k.orange, 0, 0, 0.0205);
  for (const side of [1, -1]) for (const z of [0.025, 0.029, 0.033, 0.037]) add(b, box(0.0022, 0.018, 0.0008), k.rib, side * 0.0161, 0, z);
  add(b, box(0.008, 0.002, 0.006), k.rib, -0.008, 0.013, 0.036);
  const engineBlock = marker(b, 0, 0, 0.032);
  // Two big nozzles and a small one on top
  for (const [x, y, r, len] of [[-0.0078, -0.0035, 0.0062, 0.006], [0.0078, -0.0035, 0.0062, 0.006], [0, 0.0072, 0.0036, 0.004]]) {
    add(b, zCyl(r * 0.8, r, len, 16, true), nozzleMat, x, y, 0.041 + len / 2);
    add(b, new THREE.CircleGeometry(r * 0.78, 16), k.ember, x, y, 0.0413);
    m.glows.push(light(b, 0xff8a3a, r * 4.5, x, y, 0.041 + len));
    m.engines.push(marker(b, x, y, 0.0415 + len));
  }
  // Rear-facing defence turret on the engine block
  add(b, new THREE.CylinderGeometry(0.0032, 0.0036, 0.0018, 12), k.rib, 0, 0.0129, 0.027);
  add(b, box(0.0045, 0.0026, 0.005), k.block, 0, 0.0151, 0.0275);
  add(b, zCyl(0.0005, 0.0005, 0.007, 6), k.rib, 0, 0.0152, 0.0335);
  m.guns.push(marker(b, 0, 0.0152, 0.0372));
  // Running lights: port/starboard, white stern lights, red dorsal, amber cab beacon
  for (const [c, x, y, z, s] of [
    [0xff3344, -0.0182, 0.0125, -0.0305, 0.006], [0x33ff66, 0.0182, 0.0125, -0.0305, 0.006], [0xffffff, -0.0145, 0.0115, 0.0412, 0.005],
    [0xffffff, 0.0145, 0.0115, 0.0412, 0.005], [0xff2a1a, 0, 0.0152, 0.012, 0.005], [0xffaa33, 0, 0.0102, -0.036, 0.006],
  ]) light(b, c, s, x, y, z);

  addParts(b, bakeParts(b));
  return { ...m, engineBlock };
}

// ---------------------------------------------------------------------------
// Tessick-3 communications relay: lattice spine, three dishes, solar and
// radiator wings, a half-stripped power-cell rack, a docking clamp on +X and
// scorch marks from the raid. Solid parts stay within ~0.22 km of the origin.

const relayKit = lazy(() => ({
  struct: std(0x5b5f67, 0.55, 0.75),
  hub: panelMat({ base: "#8a8f96", seam: "rgba(30,34,40,0.7)", variance: 0.15, grime: 1.2, windows: "#ffd49a", windowDensity: 0.18, repeat: [3, 1] }, 0.6, 0.55, 1.1),
  module: panelMat({ base: "#6c7077", seam: "rgba(20,22,26,0.8)", variance: 0.2, grime: 1.4 }, 0.7, 0.5),
  dish: std(0xc3c6cb, 0.55, 0.35, { side: THREE.DoubleSide }),
  solar: panelMat({ base: "#1a2744", seam: "rgba(140,160,195,0.55)", variance: 0.12, repeat: [2, 3] }, 0.3, 0.6, 1, 256),
  radiator: panelMat({ base: "#a19f97", seam: "rgba(40,40,40,0.5)", variance: 0.06, grime: 0.6 }, 0.7, 0.4, 1, 256),
  dark: std(0x26282c, 0.5, 0.8),
  canister: std(0x5d6b50, 0.6, 0.5),
  charge: lit(0x5fe0ff, 1.6),
  empty: lit(0xff2a18, 2),
  hazard: hazardMat(3),
  label: std(0xffffff, 0.8, 0.2, {
    ...decal,
    map: canvasTex(512, 128, (ctx) => {
      ctx.fillStyle = "rgba(214,208,190,0.9)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 74px monospace";
      ctx.fillText("TESSICK-3", 256, 50);
      ctx.font = "bold 24px monospace";
      ctx.fillText("TESSICK-VARN CORRIDOR · SECTOR TWO RELAY", 256, 108);
      ctx.globalCompositeOperation = "destination-out"; // chipped paint
      for (let i = 0; i < 260; i++) ctx.fillRect(Math.random() * 512, Math.random() * 128, 1 + Math.random() * 5, 1 + Math.random() * 3);
    }),
  }),
}));

/** Parabolic dish (LatheGeometry) with rim, back mount and a feed horn on three struts; opens along `facing`. */
function dish(parent: THREE.Object3D, at: THREE.Vector3, facing: THREE.Vector3, R: number, depth: number, k: ReturnType<typeof relayKit>) {
  const g = new THREE.Group();
  g.position.copy(at);
  g.quaternion.setFromUnitVectors(Y_UP, facing.clone().normalize());
  parent.add(g);
  const pts = Array.from({ length: 13 }, (_, i) => new THREE.Vector2((R * i) / 12, depth * (i / 12) ** 2));
  add(g, new THREE.LatheGeometry(pts, 32), k.dish);
  add(g, new THREE.TorusGeometry(R, R * 0.025, 6, 40).rotateX(Math.PI / 2), k.struct, 0, depth, 0);
  add(g, new THREE.CylinderGeometry(R * 0.16, R * 0.24, R * 0.16, 12), k.dark, 0, -R * 0.07, 0);
  const focus = (R * R) / (4 * depth);
  add(g, new THREE.CylinderGeometry(R * 0.05, R * 0.08, R * 0.14, 10), k.dark, 0, focus, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    rod(g, V(Math.cos(a) * R * 0.97, depth * 0.94, Math.sin(a) * R * 0.97), V(0, focus, 0), R * 0.012, k.struct);
  }
  return { group: g, focus };
}

/** Local-space point on the relay (relative to the relay group origin) where the shuttle sits docked. */
export const RELAY_DOCK = new THREE.Vector3(0.265, -0.02, 0);

/** Tessick-3 communications relay station (static set piece). */
export function createRelay(): THREE.Group {
  const g = new THREE.Group();
  g.name = "relay";
  const k = relayKit();
  // Truss work: every strut is an instance of one unit box, so it's a single draw call.
  const struts: THREE.Matrix4[] = [];
  const strut = (a: THREE.Vector3, b: THREE.Vector3, t: number) => {
    const d = b.clone().sub(a);
    const q = new THREE.Quaternion().setFromUnitVectors(Y_UP, d.clone().normalize());
    struts.push(new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), q, V(t, d.length(), t)));
  };
  /** Square-section girder from a to b: four longerons, rungs and alternating diagonals. */
  const lattice = (a: THREE.Vector3, b: THREE.Vector3, half: number, bays: number, t: number) => {
    const dir = b.clone().sub(a).normalize();
    const u = Y_UP.clone().cross(dir);
    if (u.lengthSq() < 1e-8) u.set(1, 0, 0);
    u.setLength(half);
    const v = dir.clone().cross(u);
    const corners = [u.clone().add(v), u.clone().sub(v), u.clone().negate().sub(v), u.clone().negate().add(v)];
    for (const c of corners) strut(a.clone().add(c), b.clone().add(c), t);
    for (let i = 0; i <= bays; i++) {
      const p = a.clone().lerp(b, i / bays);
      const q = a.clone().lerp(b, (i + 1) / bays);
      corners.forEach((c0, j) => {
        const c1 = corners[(j + 1) % 4];
        strut(p.clone().add(c0), p.clone().add(c1), t * 0.7);
        if (i < bays) strut(p.clone().add(j % 2 ? c0 : c1), q.clone().add(j % 2 ? c1 : c0), t * 0.6);
      });
    }
  };

  lattice(V(0, -0.17, 0), V(0, 0.15, 0), 0.014, 10, 0.0035);               // spine
  lattice(V(0.04, -0.02, 0), V(0.185, -0.02, 0), 0.008, 6, 0.0028);        // docking arm
  for (const s of [1, -1]) lattice(V(0, 0, s * 0.04), V(0, 0, s * 0.19), 0.005, 5, 0.0025); // solar arms
  lattice(V(0, -0.06, 0), V(-0.168, -0.06, 0), 0.004, 6, 0.0022);          // radiator boom
  lattice(V(-0.035, 0.03, 0.01), V(-0.13, 0.052, 0.02), 0.004, 4, 0.0022); // dish 2 boom
  lattice(V(0, -0.14, -0.012), V(0.017, -0.132, -0.088), 0.0035, 3, 0.002); // dish 3 boom
  // Hub (control and crew module), end caps, equipment ring, lower service module with its nameplate
  add(g, new THREE.CylinderGeometry(0.045, 0.045, 0.07, 24), k.hub);
  add(g, new THREE.CylinderGeometry(0.022, 0.045, 0.018, 24), k.module, 0, 0.044, 0);
  add(g, new THREE.CylinderGeometry(0.045, 0.022, 0.018, 24), k.module, 0, -0.044, 0);
  add(g, new THREE.TorusGeometry(0.047, 0.0035, 8, 40).rotateX(Math.PI / 2), k.struct, 0, 0.012, 0);
  add(g, box(0.08, 0.05, 0.08), k.module, 0, -0.1, 0);
  add(g, new THREE.PlaneGeometry(0.066, 0.016), k.label, 0, -0.088, -0.0406).rotation.y = Math.PI;
  // Dishes: the big uplink on top, two smaller ones on booms, and a whip antenna below
  add(g, box(0.016, 0.008, 0.016), k.dark, 0, 0.154, 0);
  const main = dish(g, V(0, 0.16, 0), V(0.35, 1, 0.45), 0.065, 0.022, k);
  rod(main.group, V(0, main.focus, 0), V(0, main.focus + 0.028, 0), 0.0006, k.struct);
  light(main.group, 0xff2a1a, 0.014, 0, main.focus + 0.029, 0, [1.8, 0]);
  dish(g, V(-0.14, 0.055, 0.02), V(-1, 0.45, 0.35), 0.045, 0.015, k);
  rod(g, V(-0.13, 0.052, 0.02), V(-0.14, 0.055, 0.02), 0.003, k.dark);
  dish(g, V(0.02, -0.13, -0.095), V(0.25, -0.5, -1), 0.045, 0.015, k);
  rod(g, V(0.017, -0.132, -0.088), V(0.02, -0.13, -0.095), 0.003, k.dark);
  rod(g, V(0.014, -0.17, 0.014), V(0.014, -0.235, 0.014), 0.0009, k.struct);
  light(g, 0xff2a1a, 0.014, 0.014, -0.237, 0.014, [1.8, 0.5]);
  // Power-cell rack on the service module's +X face. Five cells already gone,
  // a sixth half pulled out; red lamps on the shelf lips mark the empty slots.
  add(g, box(0.003, 0.064, 0.13), k.dark, 0.0415, -0.1, 0);
  for (const y of [-0.1315, -0.1, -0.0685]) add(g, box(0.026, 0.003, 0.13), k.struct, 0.056, y, 0);
  for (const z of [-0.064, 0.064]) strut(V(0.068, -0.133, z), V(0.068, -0.067, z), 0.0025);
  const [canGeo, bandGeo, capGeo, socketGeo] = [[0.0075, 0.0075, 0.025], [0.0077, 0.0077, 0.003], [0.005, 0.0075, 0.002], [0.0058, 0.0058, 0.0012]]
    .map(([top, bottom, h]) => new THREE.CylinderGeometry(top, bottom, h, 12));
  const lampGeo = box(0.0012, 0.002, 0.005);
  for (let i = 0; i < 12; i++) {
    const row = Math.floor(i / 6), z = -0.05 + (i % 6) * 0.02, y = row ? -0.086 : -0.1175;
    const gone = [1, 4, 6, 8, 11].includes(i);
    add(g, lampGeo, gone ? k.empty : k.charge, 0.0696, row ? -0.1 : -0.1315, z);
    if (gone) add(g, socketGeo, k.dark, 0.056, y - 0.012, z);
    if (gone) continue;
    const cell = group(g, i === 5 ? 0.063 : 0.056, y, z, i === 5 ? -0.35 : 0);
    add(cell, canGeo, k.canister);
    add(cell, bandGeo, k.charge, 0, 0.006, 0);
    add(cell, capGeo, k.dark, 0, 0.0135, 0);
  }
  // Docking arm along +X: crawlway tube, root collar, clamp head, jaws and docking lamps
  add(g, new THREE.CylinderGeometry(0.0045, 0.0045, 0.145, 10).rotateZ(Math.PI / 2), k.module, 0.1125, -0.02, 0);
  add(g, box(0.02, 0.026, 0.026), k.dark, 0.05, -0.02, 0);
  add(g, box(0.016, 0.024, 0.024), k.dark, 0.193, -0.02, 0);
  add(g, box(0.004, 0.0252, 0.0252), k.hazard, 0.197, -0.02, 0);
  add(g, new THREE.TorusGeometry(0.0065, 0.0014, 6, 20).rotateY(Math.PI / 2), k.struct, 0.2015, -0.02, 0);
  for (const s of [1, -1]) {
    add(g, box(0.013, 0.004, 0.016), k.struct, 0.2065, -0.02 + s * 0.009, 0);
    add(g, box(0.003, 0.005, 0.016), k.dark, 0.2115, -0.02 + s * 0.0055, 0);
    light(g, 0xffaa22, 0.008, 0.214, -0.02 + s * 0.011, 0);
  }
  // Solar wings on ±Z. One panel hangs off a broken hinge (+Z outer, starboard);
  // its opposite number (-Z outer, port) was shot away, leaving a bent spar.
  const panelGeo = box(0.048, 0.0015, 0.056);
  for (const s of [1, -1]) {
    for (const [x, zc] of [[0.029, 0.08], [-0.029, 0.08], [0.029, 0.14], [-0.029, 0.14]]) {
      const outer = zc > 0.1 && s * x > 0;
      if (outer && s < 0) strut(V(-0.006, 0, -0.112), V(-0.04, 0.012, -0.13), 0.0015);
      if (outer && s < 0) continue;
      const p = add(g, panelGeo, k.solar, x, outer ? -0.008 : 0, s * zc);
      p.rotation.z = outer ? -0.5 : 0;
      if (outer) add(p, new THREE.PlaneGeometry(0.04, 0.04).rotateX(-Math.PI / 2), scorchMat(), 0, 0.0009, 0);
    }
    light(g, 0xffffff, 0.014, 0, 0, s * 0.193, [2.2, s > 0 ? 0.25 : 0.75]);
  }
  // Radiator fins on the -X boom
  const radGeo = box(0.055, 0.02, 0.0015);
  for (const x of [-0.075, -0.135]) for (const y of [-0.047, -0.073]) add(g, radGeo, k.radiator, x, y, 0);
  light(g, 0xff2a1a, 0.014, -0.172, -0.06, 0, [1.8, 0.25]);
  // Scorch marks from the raid
  const burn = scorchMat();
  for (const [theta, y] of [[0.4, 0.004], [3.7, -0.012], [5.2, 0.014]]) {
    add(g, new THREE.CylinderGeometry(0.0457, 0.0457, 0.042, 10, 1, true, theta, 1.1), burn, 0, y, 0);
  }
  add(g, new THREE.PlaneGeometry(0.05, 0.04), burn, 0.008, -0.098, 0.0406);
  add(g, new THREE.PlaneGeometry(0.045, 0.035), burn, -0.0406, -0.104, 0.01).rotation.y = -Math.PI / 2;
  add(g, new THREE.PlaneGeometry(0.014, 0.014).rotateX(-Math.PI / 2), burn, 0.193, -0.0074, 0); // on the clamp head

  addParts(g, bakeParts(g));
  const truss = new THREE.InstancedMesh(box(1, 1, 1), k.struct, struts.length);
  struts.forEach((mtx, i) => truss.setMatrixAt(i, mtx));
  truss.computeBoundingSphere();
  g.add(truss);
  return g;
}

// ---------------------------------------------------------------------------
// Navigation buoy — practice target. Hazard-striped body, antenna, and an
// amber lamp that flashes (every buoy shares one material, so they flash in sync).

const buoyKit = lazy(() => {
  const metal = std(0x3a3d43, 0.5, 0.75);
  const lamp = lit(0xffaa22, 2);
  const t = new THREE.Group();
  add(t, new THREE.ConeGeometry(0.0045, 0.006, 14).rotateX(Math.PI), metal, 0, -0.011, 0);
  add(t, new THREE.CylinderGeometry(0.0045, 0.0045, 0.012, 14), hazardMat(3), 0, -0.002, 0);
  add(t, new THREE.CylinderGeometry(0.0045, 0.0045, 0.002, 14), metal, 0, 0.005, 0);
  add(t, new THREE.CylinderGeometry(0.0022, 0.0045, 0.002, 14), metal, 0, 0.007, 0);
  const collar = new THREE.TorusGeometry(0.0048, 0.0006, 6, 20).rotateX(Math.PI / 2);
  for (const y of [-0.008, 0.004]) add(t, collar, metal, 0, y, 0);
  const finGeo = box(0.004, 0.005, 0.0004);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    add(t, finGeo, metal, Math.cos(a) * 0.0042, -0.0105, Math.sin(a) * 0.0042).rotation.y = -a;
  }
  add(t, new THREE.SphereGeometry(0.0014, 10, 8), lamp, 0, 0.0095, 0);
  add(t, new THREE.CylinderGeometry(0.0002, 0.0003, 0.008, 5), metal, 0.0022, 0.012, 0);
  const lightMat = glowSprite(0xffaa22, 0.014, 3, true).material;
  return { parts: bakeParts(t), lightMat, flash: flasher([lightMat, lamp], 1.3, 0, 0.3) };
});

/** Practice target: a small navigation buoy with a blinking-looking amber light. Spawned ×7. */
export function createBuoy(): THREE.Group {
  const k = buoyKit();
  const g = new THREE.Group();
  addParts(g, k.parts);
  const lamp = new THREE.Sprite(k.lightMat);
  lamp.scale.setScalar(0.014);
  lamp.position.y = 0.0095;
  lamp.onBeforeRender = k.flash;
  g.add(lamp);
  return g;
}
