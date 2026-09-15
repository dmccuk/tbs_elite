import * as THREE from "three";
import { G, emit, type Entity } from "./game";
import { clamp, damp, lerp, rand } from "./config";
import { glowSprite, panelTextures } from "./models";
import { scene } from "./renderer";
import { audio } from "./audio";
import { damagePlayer, setPlayerPose } from "./player";

// The Kessler: the Ninth Patrol Squadron's patrol corvette, which carries the
// Seagulls (they can't jump). A small carrier with a hangar bay running right
// through her: fighters land through the stern door and launch out of the bow.
//
// Landing: fly through the approach rings, cross the stern door slower than
// CAPTURE_MAX and the mag-clamp arrestor field takes the ship, centres it and
// brakes it onto the cradle. Too fast and the field can't hold you — you go out
// of the bow door with the deck crew watching. The hull and bay walls are solid.
//
// The model faces -Z and is never rotated, so world → local is a subtraction.

export const KESSLER_POS = new THREE.Vector3(3.5, 1.2, 31);

/** Bay tunnel (local km): open at both ends. */
const BAY = { x: 0.085, yTop: 0.03, yBot: -0.06, zBow: -0.27, zStern: 0.24 };
const BAY_Y = (BAY.yTop + BAY.yBot) / 2;
const HULL = { x: 0.15, yTop: 0.085, yBot: -0.08 };
/** Rough half-extents of a Seagull, for the tight fit inside the bay. */
const SHIP = { x: 0.023, y: 0.01 };
const CRADLE = new THREE.Vector3(0, BAY.yBot + 0.012, 0.0);
const CRADLE_2_Z = -0.14;               // Harren's cradle, ahead of yours
/** Faster than this through the stern door and the field can't hold the ship (km/s). */
export const CAPTURE_MAX = 0.35;
const RING_DIST = [0.55, 1.15, 1.85];   // km behind the stern door
const RING_R = 0.06;
const APPROACH_LEN = 2.4;               // km behind the stern that counts as "on approach"
const LAUNCH_SPEED = 1.0;
/** Landing practice starts this far behind the stern door (km). */
const DRILL_START_DIST = 12.4;

interface Box { min: THREE.Vector3; max: THREE.Vector3; }
const box3 = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box =>
  ({ min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1) });

/** Solid parts of the ship for collisions (local), leaving the tunnel clear. */
const SOLIDS: Box[] = [
  box3(-HULL.x, BAY.yTop, BAY.zBow, HULL.x, HULL.yTop, BAY.zStern),        // upper hull
  box3(-HULL.x, HULL.yBot, BAY.zBow, HULL.x, BAY.yBot, BAY.zStern),        // keel
  box3(-HULL.x, BAY.yBot, BAY.zBow, -BAY.x, BAY.yTop, BAY.zStern),         // port bay wall
  box3(BAY.x, BAY.yBot, BAY.zBow, HULL.x, BAY.yTop, BAY.zStern),           // starboard bay wall
  box3(-0.1, 0.0, -0.37, 0.1, HULL.yTop, BAY.zBow),                         // nose, above the bow door
  box3(-0.235, -0.04, 0.05, -0.15, 0.04, 0.26),                            // port engine
  box3(0.15, -0.04, 0.05, 0.235, 0.04, 0.26),                              // starboard engine
  box3(0.06, HULL.yTop, -0.02, 0.12, 0.14, 0.09),                          // bridge island
];

// --- Model -------------------------------------------------------------------------

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function deckTexture() {
  return canvasTex(256, 768, (x) => {
    x.fillStyle = "#2b2e33"; x.fillRect(0, 0, 256, 768);
    x.strokeStyle = "rgba(0,0,0,0.55)"; x.lineWidth = 2;
    for (let y = 0; y < 768; y += 48) x.strokeRect(2, y + 1, 252, 46);
    x.strokeRect(64, 0, 128, 768);
    // Centreline dashes and the two cradle boxes (yours nearest the stern door).
    x.fillStyle = "#e8b21c";
    for (let y = 8; y < 768; y += 40) x.fillRect(124, y, 8, 22);
    x.lineWidth = 6; x.strokeStyle = "#e8b21c";
    const cradleY = (z: number) => ((z - BAY.zBow) / (BAY.zStern - BAY.zBow)) * 768;
    for (const z of [CRADLE.z, CRADLE_2_Z]) x.strokeRect(70, cradleY(z) - 60, 116, 120);
    x.fillStyle = "#e8b21c"; x.font = "bold 34px sans-serif"; x.textAlign = "center";
    x.fillText("2", 128, cradleY(CRADLE.z) + 12);
    x.fillText("1", 128, cradleY(CRADLE_2_Z) + 12);
    // Hazard chevrons at both doors.
    for (const y0 of [0, 732]) for (let i = -2; i < 12; i++) {
      x.fillStyle = i % 2 ? "#e8b21c" : "#15130c";
      x.beginPath(); x.moveTo(i * 24, y0); x.lineTo(i * 24 + 24, y0); x.lineTo(i * 24 + 60, y0 + 36); x.lineTo(i * 24 + 36, y0 + 36); x.fill();
    }
  });
}

function nameTexture() {
  return canvasTex(1024, 128, (x) => {
    x.clearRect(0, 0, 1024, 128);
    x.fillStyle = "rgba(225,230,235,0.85)";
    x.font = "900 86px 'Big Shoulders Stencil Display', Impact, sans-serif";
    x.textBaseline = "middle";
    x.fillText("KESSLER", 24, 60);
    x.font = "600 30px sans-serif";
    x.fillText("NINTH PATROL SQUADRON", 560, 64);
  });
}

function hazardTexture() {
  const t = canvasTex(128, 32, (x) => {
    for (let i = -1; i < 9; i++) {
      x.fillStyle = i % 2 ? "#e8b21c" : "#15130c";
      x.beginPath(); x.moveTo(i * 16, 32); x.lineTo(i * 16 + 16, 32); x.lineTo(i * 16 + 32, 0); x.lineTo(i * 16 + 16, 0); x.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

interface Carrier {
  root: THREE.Group;
  strobes: THREE.Sprite[];
  runway: THREE.Sprite[];
  field: THREE.Mesh;
  rings: THREE.Group;
  ringMats: THREE.MeshBasicMaterial[];
  bay: Entity;
}

let carrier: Carrier | null = null;

/** Build the Kessler (once). world-frontier.ts adds `root` to the frontier props. */
export function createKesslerCarrier(): Carrier {
  if (carrier) return carrier;
  const g = new THREE.Group();
  const hullTex = panelTextures({ base: "#5c6572", seam: "rgba(10,12,16,0.85)", variance: 0.2, grime: 0.9, windows: "#d8ecff", windowDensity: 0.05, repeat: [3, 1] });
  const hull = new THREE.MeshStandardMaterial({ map: hullTex.map, emissiveMap: hullTex.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.55, metalness: 0.75 });
  const plate = new THREE.MeshStandardMaterial({ color: 0x3d434d, roughness: 0.5, metalness: 0.8 });
  const bayWall = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.7, metalness: 0.6 });
  const deck = new THREE.MeshStandardMaterial({ map: deckTexture(), roughness: 0.8, metalness: 0.4 });
  const hazard = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.6, metalness: 0.3, emissive: 0x2a1c00, emissiveIntensity: 0.6 });
  const lightStrip = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0d0).multiplyScalar(1.1) });
  const lining = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.85, metalness: 0.4 });
  const windowBand = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbfe0ff).multiplyScalar(1.7) });
  const nozzle = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5aa0ff).multiplyScalar(1.4) });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const slab = (b: Box, mat: THREE.Material) => {
    const s = new THREE.Vector3().subVectors(b.max, b.min);
    const c = new THREE.Vector3().addVectors(b.max, b.min).multiplyScalar(0.5);
    return add(new THREE.BoxGeometry(s.x, s.y, s.z), mat, c.x, c.y, c.z);
  };

  // Hull around the tunnel.
  for (let i = 0; i < 4; i++) slab(SOLIDS[i], hull);
  // Tapered nose above the bow door.
  const nose = new THREE.CylinderGeometry(0.05, 0.11, 0.1, 4, 1);
  nose.rotateY(Math.PI / 4); nose.rotateX(-Math.PI / 2); nose.scale(1.35, 0.55, 1);
  add(nose, hull, 0, 0.045, -0.32);
  // Chines, dorsal spine and a keel plate.
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.012, 0.03, 0.46), plate, side * 0.155, 0.02, -0.02);
  add(new THREE.BoxGeometry(0.08, 0.014, 0.42), plate, -0.02, HULL.yTop + 0.007, -0.03);
  add(new THREE.BoxGeometry(0.2, 0.01, 0.4), plate, 0, HULL.yBot - 0.005, 0);
  // Bridge island to starboard, with a lit window band.
  slab(SOLIDS[7], plate);
  add(new THREE.BoxGeometry(0.062, 0.008, 0.002), windowBand, 0.09, 0.125, -0.021);
  add(new THREE.BoxGeometry(0.004, 0.08, 0.004), plate, 0.1, 0.18, 0.05);
  // Point-defence turrets.
  for (const z of [-0.18, 0.16]) add(new THREE.CylinderGeometry(0.014, 0.018, 0.014, 10), plate, -0.05, HULL.yTop + 0.012, z);
  // Engines flanking the stern door.
  for (const side of [-1, 1]) {
    const e = new THREE.CylinderGeometry(0.04, 0.046, 0.21, 16);
    e.rotateX(Math.PI / 2);
    add(e, plate, side * 0.192, 0, 0.155);
    add(new THREE.CircleGeometry(0.034, 16), nozzle, side * 0.192, 0, 0.261);
    const glow = glowSprite(0x66aaff, 0.11, 1.6);
    glow.position.set(side * 0.192, 0, 0.275);
    g.add(glow);
    add(new THREE.BoxGeometry(0.03, 0.02, 0.12), plate, side * 0.165, 0, 0.14);
  }
  // Name stencil on both flanks.
  const nameMat = new THREE.MeshBasicMaterial({ map: nameTexture(), transparent: true, depthWrite: false });
  for (const side of [-1, 1]) {
    const n = add(new THREE.PlaneGeometry(0.26, 0.032), nameMat, side * 0.1515, 0.058, -0.06);
    n.rotation.y = side * Math.PI / 2;
  }

  // Bay interior: deck, ceiling light strips, wall ribs, cradles.
  const floor = add(new THREE.PlaneGeometry(BAY.x * 2, BAY.zStern - BAY.zBow), deck, 0, BAY.yBot + 0.0006, (BAY.zStern + BAY.zBow) / 2);
  floor.rotation.x = -Math.PI / 2;
  // Dark lining over the walls and ceiling (the hull plating is for the outside).
  const len = BAY.zStern - BAY.zBow;
  const midZ = (BAY.zStern + BAY.zBow) / 2;
  for (const side of [-1, 1]) {
    const w = add(new THREE.PlaneGeometry(len, BAY.yTop - BAY.yBot), lining, side * (BAY.x - 0.0008), BAY_Y, midZ);
    w.rotation.y = -side * Math.PI / 2;
  }
  const ceiling = add(new THREE.PlaneGeometry(BAY.x * 2, len), lining, 0, BAY.yTop - 0.0008, midZ);
  ceiling.rotation.x = Math.PI / 2;
  for (const x of [-0.045, 0.045]) add(new THREE.BoxGeometry(0.003, 0.0015, len - 0.06), lightStrip, x, BAY.yTop - 0.0025, -0.015);
  for (let z = BAY.zBow + 0.04; z < BAY.zStern; z += 0.06) {
    for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.004, BAY.yTop - BAY.yBot, 0.008), bayWall, side * (BAY.x - 0.002), BAY_Y, z);
  }
  for (const z of [CRADLE.z, CRADLE_2_Z]) {
    for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.005, 0.008, 0.07), plate, side * 0.03, BAY.yBot + 0.004, z);
    add(new THREE.BoxGeometry(0.065, 0.005, 0.006), plate, 0, BAY.yBot + 0.006, z - 0.03);
    const lamp = glowSprite(0xffb040, 0.008, 2);
    lamp.position.set(0.034, BAY.yBot + 0.01, z + 0.036);
    g.add(lamp);
  }
  // Door frames with hazard stripes.
  for (const z of [BAY.zStern + 0.001, BAY.zBow - 0.001]) {
    const zz = z;
    const bar = (w: number, h: number, x: number, y: number) => {
      const m = add(new THREE.PlaneGeometry(w, h), hazard, x, y, zz);
      if (z < 0) m.rotation.y = Math.PI;
    };
    bar(BAY.x * 2 + 0.02, 0.01, 0, BAY.yTop + 0.005);
    bar(BAY.x * 2 + 0.02, 0.01, 0, BAY.yBot - 0.005);
    bar(0.01, BAY.yTop - BAY.yBot, -BAY.x - 0.005, BAY_Y);
    bar(0.01, BAY.yTop - BAY.yBot, BAY.x + 0.005, BAY_Y);
  }
  // A warm glow just inside the stern door so the opening reads from outside.
  const bayGlow = glowSprite(0xffcc88, 0.09, 0.7);
  bayGlow.position.set(0, BAY_Y, BAY.zStern - 0.03);
  g.add(bayGlow);

  // Runway lights along both deck edges, chasing toward the cradle.
  const runway: THREE.Sprite[] = [];
  for (let z = BAY.zStern + 0.3; z > CRADLE.z; z -= 0.05) {
    for (const side of [-1, 1]) {
      const s = glowSprite(0x44ff88, 0.014, 3, true);
      s.position.set(side * (BAY.x - 0.008), BAY.yBot + 0.003, z);
      g.add(s);
      runway.push(s);
    }
  }

  // Nav lights and strobes.
  const port = glowSprite(0xff2020, 0.03, 3);
  port.position.set(-0.24, 0.02, 0.1);
  const stbd = glowSprite(0x20ff60, 0.03, 3);
  stbd.position.set(0.24, 0.02, 0.1);
  g.add(port, stbd);
  const strobes: THREE.Sprite[] = [];
  for (const [x, y, z] of [[0.1, 0.23, 0.05], [0, HULL.yTop + 0.02, 0.24], [0, 0.06, -0.37]] as const) {
    const s = glowSprite(0xffffff, 0.04, 3);
    s.position.set(x, y, z);
    g.add(s);
    strobes.push(s);
  }

  // The mag-clamp field: a faint blue glow filling the bay while it holds a ship.
  const field = add(
    new THREE.BoxGeometry(BAY.x * 2 - 0.004, BAY.yTop - BAY.yBot - 0.004, BAY.zStern - BAY.zBow),
    new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }),
    0, BAY_Y, (BAY.zStern + BAY.zBow) / 2,
  );
  field.visible = false;

  g.position.copy(KESSLER_POS);

  // Approach rings (their own group in the main scene, shown for landings only).
  const rings = new THREE.Group();
  const ringMats: THREE.MeshBasicMaterial[] = [];
  for (const d of RING_DIST) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffaa33).multiplyScalar(2), transparent: true, opacity: 0.9 });
    ringMats.push(mat);
    const r = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.003, 8, 40), mat);
    r.position.set(KESSLER_POS.x, KESSLER_POS.y + BAY_Y, KESSLER_POS.z + BAY.zStern + d);
    rings.add(r);
  }
  rings.visible = false;
  scene.add(rings);

  const entry = new THREE.Object3D();
  entry.position.set(KESSLER_POS.x, KESSLER_POS.y + BAY_Y, KESSLER_POS.z + BAY.zStern);
  const bay: Entity = { kind: "bay", obj: entry, vel: new THREE.Vector3(), radius: 0.06, hp: 1, maxHp: 1, alive: true, label: "KESSLER HANGAR BAY" };

  carrier = { root: g, strobes, runway, field, rings, ringMats, bay };
  return carrier;
}

// --- Landing ------------------------------------------------------------------------

const _q = new THREE.Vector3();
const _w = new THREE.Vector3();
const _c = new THREE.Vector3();
let prevZ = 99;
let ringsPassed = [false, false, false];
let bumpCooldown = 0;
let waveOffWarned = false;
let chase = 0;

/** Back to square one (mission start / restart). */
export function resetDock() {
  const d = G.dock;
  d.state = "free";
  d.entrySpeed = d.entryOffset = d.scrapes = d.rings = 0;
  d.overshoot = d.inTunnel = d.approach = false;
  ringsPassed = [false, false, false];
  prevZ = 99;
  waveOffWarned = false;
  G.touchThrottle = 0.7;
  if (G.player) G.player.captured = false;
  if (carrier) {
    carrier.field.visible = false;
    for (const m of carrier.ringMats) m.color.setHex(0xffaa33).multiplyScalar(2);
  }
}

/** Launch off the catapult, out through the bow door (from a landing in free flight). */
export function launchFromKessler() {
  if (G.dock.state !== "landed") return;
  G.dock.state = "launching";
  G.player.speed = 0.1;
  audio.missileIgnite(1);
  G.fx.shake(0.3);
  emit({ type: "dockLaunched" });
}

const landingsActive = () => G.freeFlight || G.landingDrill || G.phase === "cruise";
/** The approach rings are a practice aid: the Cruise's autopilot doesn't need them (and they'd glare on camera). */
const ringsActive = () => G.freeFlight || G.landingDrill;

/** The bay's centreline in world space: the cradle's x/z at mid-tunnel height, and the two doors' z. */
export const BAY_LINE = {
  centre: new THREE.Vector3(KESSLER_POS.x, KESSLER_POS.y + BAY_Y, KESSLER_POS.z + CRADLE.z),
  sternZ: KESSLER_POS.z + BAY.zStern,
  bowZ: KESSLER_POS.z + BAY.zBow,
};

/** Put the ship straight onto the cradle, clamped (the Cruise starts here). */
export function dockAtCradle() {
  const d = G.dock;
  const p = G.player;
  d.state = "landed";
  d.inTunnel = true;
  p.captured = true;
  p.speed = 0;
  p.vel.set(0, 0, 0);
  setPlayerPose(_w.copy(CRADLE).add(KESSLER_POS), 0, 0);
  prevZ = CRADLE.z;
}

function scrape(at: THREE.Vector3) {
  if (bumpCooldown > 0) return;
  bumpCooldown = 0.35;
  const p = G.player;
  p.speed *= 0.8;
  damagePlayer(4, at);
  G.fx.sparksAt(at, 18, 0xffcc88, 0.3, 0.004, 0.5);
  G.dock.scrapes++;
  emit({ type: "dockScrape" });
}

/** Solid hull and the bay tunnel's walls. q is the ship's position in local space (edited in place). */
function collide(q: THREE.Vector3): boolean {
  const inBayXY = Math.abs(q.x) < BAY.x && q.y > BAY.yBot && q.y < BAY.yTop;
  const inTunnelZ = q.z < BAY.zStern && q.z > BAY.zBow;
  if (inBayXY) {
    if (!inTunnelZ) return false;
    // Inside the bay: keep the wingtips off the walls, floor and ceiling.
    const x = clamp(q.x, -BAY.x + SHIP.x, BAY.x - SHIP.x);
    const y = clamp(q.y, BAY.yBot + SHIP.y, BAY.yTop - SHIP.y);
    if (x === q.x && y === q.y) return false;
    q.x = x; q.y = y;
    return true;
  }
  // Outside the bay: the hull is solid.
  const r = 0.03;
  let hit = false;
  for (const b of SOLIDS) {
    _c.copy(q).clamp(b.min, b.max);
    const d = q.distanceTo(_c);
    if (d >= r) continue;
    hit = true;
    if (d > 1e-6) q.copy(_c).addScaledVector(_w.subVectors(q, _c).divideScalar(d), r);
    else {
      // Centre inside the box: shove out along the shallowest axis.
      const pen = [q.x - b.min.x, b.max.x - q.x, q.y - b.min.y, b.max.y - q.y, q.z - b.min.z, b.max.z - q.z];
      const i = pen.indexOf(Math.min(...pen));
      if (i === 0) q.x = b.min.x - r; else if (i === 1) q.x = b.max.x + r;
      else if (i === 2) q.y = b.min.y - r; else if (i === 3) q.y = b.max.y + r;
      else if (i === 4) q.z = b.min.z - r; else q.z = b.max.z + r;
    }
  }
  return hit;
}

/** Per frame (after the player moves): lights, rings, collisions, capture, braking, catapult. */
export function updateKessler(dt: number) {
  const k = carrier;
  const frontier = !!k && G.world.theme === "frontier" && G.phase !== "splash";
  G.bay = frontier ? k!.bay : null;
  if (!k || !frontier) return;
  const d = G.dock;
  const p = G.player;
  bumpCooldown -= dt;

  // Runway lights chase toward the cradle; the field glows while it holds a ship.
  chase += dt * 2.5;
  k.runway.forEach((s, i) => {
    const on = ((Math.floor(i / 2) - chase) % 6 + 6) % 6 < 1;
    s.material.color.setHex(d.state === "captured" ? 0x44aaff : 0x44ff88).multiplyScalar(on ? 3 : 0.4);
  });
  k.field.visible = d.state === "captured" || d.state === "landed" || d.state === "launching";
  if (k.field.visible) (k.field.material as THREE.MeshBasicMaterial).opacity = 0.025 + Math.sin(G.time * 6) * 0.012;
  k.rings.visible = ringsActive() && d.state === "free";

  _q.subVectors(p.obj.position, KESSLER_POS);
  const q = _q;

  if (d.state === "free") {
    if (!p.alive) return;
    // On approach: lined up behind the stern door.
    const behind = q.z - BAY.zStern;
    d.approach = landingsActive() && behind > 0 && behind < APPROACH_LEN && Math.abs(q.x) < 0.5 && Math.abs(q.y - BAY_Y) < 0.4;
    G.touchThrottle = d.approach && behind < 1.6 ? 0.28 : 0.7; // phones have no brake: ease off automatically
    if (d.approach && behind < 0.7 && p.speed > CAPTURE_MAX && !waveOffWarned) {
      waveOffWarned = true;
      emit({ type: "dockWaveOff" });
    }
    if (ringsActive()) {
      RING_DIST.forEach((rd, i) => {
        if (ringsPassed[i] || Math.abs(q.z - (BAY.zStern + rd)) > 0.04) return;
        if (Math.hypot(q.x, q.y - BAY_Y) < RING_R) {
          ringsPassed[i] = true;
          d.rings++;
          k.ringMats[i].color.setHex(0x44ff66).multiplyScalar(2);
          audio.beep(true);
        }
      });
    }
    // Crossing the stern door, heading in: the arrestor field tries to take the ship.
    const inOpening = Math.abs(q.x) < BAY.x - SHIP.x * 0.5 && q.y > BAY.yBot && q.y < BAY.yTop;
    if (landingsActive() && prevZ > BAY.zStern && q.z <= BAY.zStern && inOpening && p.forward.z < -0.6) {
      d.entrySpeed = p.speed;
      d.entryOffset = Math.hypot(q.x, q.y - CRADLE.y);
      if (p.speed <= CAPTURE_MAX) {
        d.state = "captured";
        p.captured = true;
        audio.lockTone();
        emit({ type: "dockCaptured", speed: p.speed });
      } else {
        d.overshoot = true;
        G.fx.flash(_w.copy(p.obj.position), 0.08, 0xff3322, 0.3);
      }
    }
    if (collide(q)) {
      p.obj.position.copy(q).add(KESSLER_POS);
      scrape(p.obj.position);
    }
    d.inTunnel = Math.abs(q.x) < BAY.x && q.y > BAY.yBot && q.y < BAY.yTop && q.z < BAY.zStern + 0.05 && q.z > BAY.zBow - 0.05;
    // Came in too hot and has shot out of the bow door.
    if (d.overshoot && q.z < BAY.zBow - 0.05) {
      d.overshoot = false;
      emit({ type: "dockOvershoot" });
    }
    if (q.z > BAY.zStern + APPROACH_LEN) waveOffWarned = false;
  } else if (d.state === "captured") {
    // Brake to a stop over the cradle, centring up and levelling out as we go.
    const remaining = Math.max(0, q.z - CRADLE.z);
    const decel = Math.max(0.12, (d.entrySpeed * d.entrySpeed) / (2 * (BAY.zStern - CRADLE.z)));
    p.speed = Math.min(p.speed, Math.sqrt(2 * decel * remaining) + 0.004);
    q.z -= Math.min(remaining, p.speed * dt);
    q.x = lerp(q.x, CRADLE.x, damp(3, dt));
    q.y = lerp(q.y, CRADLE.y, damp(3, dt));
    const yawHome = Math.round(p.yaw / (Math.PI * 2)) * Math.PI * 2;
    setPlayerPose(_w.copy(q).add(KESSLER_POS), lerp(p.yaw, yawHome, damp(3, dt)), lerp(p.pitch, 0, damp(3, dt)));
    p.vel.copy(p.forward).multiplyScalar(p.speed);
    d.inTunnel = true;
    if (remaining < 0.002) {
      d.state = "landed";
      p.speed = 0;
      p.vel.set(0, 0, 0);
      setPlayerPose(_w.copy(CRADLE).add(KESSLER_POS), yawHome, 0);
      G.fx.flash(p.obj.position, 0.05, 0x66bbff, 0.4);
      G.fx.shake(0.25);
      audio.missileRelease(); // the clamps bite
      emit({ type: "dockLanded" });
    }
  } else if (d.state === "landed") {
    p.speed = 0;
    p.vel.set(0, 0, 0);
  } else if (d.state === "launching") {
    // Catapult down the bay and out of the bow door.
    p.speed = Math.min(LAUNCH_SPEED, p.speed + 2.2 * dt);
    q.z -= p.speed * dt;
    q.x = lerp(q.x, 0, damp(4, dt));
    q.y = lerp(q.y, BAY_Y, damp(4, dt));
    setPlayerPose(_w.copy(q).add(KESSLER_POS), p.yaw, 0);
    p.vel.copy(p.forward).multiplyScalar(p.speed);
    for (const e of p.model.engines) {
      e.getWorldPosition(_c);
      G.fx.fire.emit(_c.x, _c.y, _c.z, 0, 0, 0, 0.3, 0.008, 0.002, 0xffcc66, 0xff3300, 0.8);
    }
    if (q.z < BAY.zBow - 0.08) {
      d.state = "free";
      d.inTunnel = false;
      p.captured = false;
      p.throttle = 0.8;
      ringsPassed = [false, false, false];
      d.rings = 0;
      for (const m of k.ringMats) m.color.setHex(0xffaa33).multiplyScalar(2);
    }
  }
  prevZ = q.z;
}

/** Where to start the landing drill: lined up behind the stern, DRILL_START_DIST out, facing the ship. */
export function drillStart(out: THREE.Vector3): THREE.Vector3 {
  return out.set(KESSLER_POS.x + rand(-0.15, 0.15), KESSLER_POS.y + BAY_Y + rand(0.05, 0.15), KESSLER_POS.z + BAY.zStern + DRILL_START_DIST);
}

/** How far the ship is behind the stern door (km), for the guide. */
export function distanceToBay(): number {
  return G.player.obj.position.distanceTo(G.bay?.obj.position ?? G.player.obj.position);
}

