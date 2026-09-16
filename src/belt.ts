import * as THREE from "three";
import { rand } from "./config";
import { scene } from "./renderer";
import { rockGeometry } from "./world";
import { KESSLER_POS } from "./kessler";

// The Cruise's endless asteroid belt. Rocks live in a box that travels with the
// ship: a rock that drops off one face comes back in on the opposite face,
// reshuffled, so the belt never runs out and never repeats. Rocks shrink away
// near the box's edges, so nothing pops in. Two layers: a dense near field of
// small and medium rocks, and a sparse far field of big ones for depth.
//
// A clear corridor is kept along the autopilot's flight path (setBeltPath) and
// a clear bubble around the Kessler, so the ride and its cameras never clip.

interface FieldRock {
  mesh: number;         // which variant mesh
  index: number;        // instance index in that mesh
  pos: THREE.Vector3;
  scale: number;
  radius: number;
  axis: THREE.Vector3;
  angle: number;
  spin: number;
}

interface FieldSpec {
  perVariant: number;
  half: THREE.Vector3;   // half-size of the travelling box (km)
  scale: () => number;
  fade: number;          // fraction of the box, at its edges, that rocks grow in over
}

/** Clearance from the flight path to a rock's surface (km). Cameras stay closer than this. */
export const CORRIDOR = 0.22;
const KESSLER_CLEAR = 5.5; // she's nearly 2 km long: keep the rocks well off her

const NEAR: FieldSpec = {
  perVariant: 150,
  half: new THREE.Vector3(8, 2.6, 8),
  scale: () => (Math.random() < 0.1 ? rand(0.35, 1.1) : Math.pow(Math.random(), 2.2) * 0.28 + 0.02),
  fade: 0.2,
};
const FAR: FieldSpec = {
  perVariant: 28,
  half: new THREE.Vector3(36, 7, 36),
  scale: () => rand(0.8, 2.6),
  fade: 0.25,
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const _color = new THREE.Color();

let path: THREE.Vector3[] = [];
/** Clearance per path point (km); negative = the default CORRIDOR. */
let pathClear: number[] = [];
let nearestIndex = 0;

/** Nearest point on the flight path to `pos` (coarse pass, then a local refine). Sets nearestIndex. */
function nearestOnPath(pos: THREE.Vector3, out: THREE.Vector3): number {
  const n = path.length;
  if (n < 2) return Infinity;
  const step = 12;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < n; i += step) {
    const d = path[i].distanceToSquared(pos);
    if (d < bestD) { bestD = d; best = i; }
  }
  for (let i = Math.max(0, best - step); i < Math.min(n, best + step); i++) {
    const d = path[i].distanceToSquared(pos);
    if (d < bestD) { bestD = d; best = i; }
  }
  out.copy(path[best]);
  nearestIndex = best;
  return Math.sqrt(bestD);
}

const _p = new THREE.Vector3();

/** Push a rock out of the Kessler's bubble and the flight corridor. */
function keepClear(r: FieldRock) {
  let need = KESSLER_CLEAR + r.radius;
  if (r.pos.distanceTo(KESSLER_POS) < need) r.pos.sub(KESSLER_POS).setLength(need + rand(0, 1.5)).add(KESSLER_POS);
  const d = nearestOnPath(r.pos, _p);
  const clear = pathClear[nearestIndex] ?? -1;
  need = (clear >= 0 ? clear : CORRIDOR) + r.radius;
  if (d < need) {
    _d.subVectors(r.pos, _p);
    if (_d.lengthSq() < 1e-8) _d.set(0, 1, 0);
    r.pos.copy(_p).addScaledVector(_d.normalize(), need + rand(0, 0.3));
  }
}

class Field {
  meshes: THREE.InstancedMesh[] = [];
  rocks: FieldRock[] = [];

  constructor(private spec: FieldSpec, material: THREE.Material, geos: THREE.BufferGeometry[], group: THREE.Group) {
    geos.forEach((geo, mi) => {
      const mesh = new THREE.InstancedMesh(geo, material, spec.perVariant);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // instances roam far from the mesh's origin
      for (let i = 0; i < spec.perVariant; i++) {
        _color.setHSL(0.08 + rand(-0.04, 0.04), rand(0.05, 0.2), rand(0.42, 0.8));
        mesh.setColorAt(i, _color);
        this.rocks.push({ mesh: mi, index: i, pos: new THREE.Vector3(), scale: 0.1, radius: 0.1, axis: new THREE.Vector3(0, 1, 0), angle: 0, spin: 0 });
      }
      this.meshes.push(mesh);
      group.add(mesh);
    });
  }

  private reshape(r: FieldRock) {
    r.scale = this.spec.scale();
    r.radius = r.scale * 1.05;
    r.axis.randomDirection();
    r.angle = rand(0, Math.PI * 2);
    r.spin = rand(0.04, 0.35) / (1 + r.scale * 3);
  }

  /** Fill the whole box around `center`. */
  scatter(center: THREE.Vector3) {
    const h = this.spec.half;
    for (const r of this.rocks) {
      this.reshape(r);
      r.pos.set(center.x + rand(-h.x, h.x), center.y + rand(-h.y, h.y), center.z + rand(-h.z, h.z));
      keepClear(r);
    }
  }

  /** Re-check every rock against a new flight path. */
  reclear() {
    for (const r of this.rocks) keepClear(r);
  }

  update(dt: number, center: THREE.Vector3) {
    const h = this.spec.half;
    const fade = this.spec.fade;
    for (const r of this.rocks) {
      // Wrap: off one face, back in on the opposite one at a fresh spot.
      let wrapped = false;
      for (const axis of ["x", "y", "z"] as const) {
        const d = r.pos[axis] - center[axis];
        if (d > h[axis]) { r.pos[axis] -= 2 * h[axis]; wrapped = true; }
        else if (d < -h[axis]) { r.pos[axis] += 2 * h[axis]; wrapped = true; }
        if (wrapped) {
          for (const other of ["x", "y", "z"] as const) {
            if (other !== axis) r.pos[other] = center[other] + rand(-h[other], h[other]);
          }
          this.reshape(r);
          keepClear(r);
          break;
        }
      }
      r.angle += r.spin * dt;
      const e = Math.max(Math.abs(r.pos.x - center.x) / h.x, Math.abs(r.pos.y - center.y) / h.y, Math.abs(r.pos.z - center.z) / h.z);
      const grow = Math.min(1, Math.max(0, (1 - e) / fade));
      _q.setFromAxisAngle(r.axis, r.angle);
      _s.setScalar(r.scale * grow * grow + 1e-5);
      _m.compose(r.pos, _q, _s);
      this.meshes[r.mesh].setMatrixAt(r.index, _m);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}

interface Belt { group: THREE.Group; near: Field; far: Field; gateMesh: THREE.InstancedMesh; }
let belt: Belt | null = null;

/** Rocks planted on the path for the joyride's slalom (fixed in space, not wrapped). */
const MAX_GATES = 24;
let gates: { pos: THREE.Vector3; radius: number }[] = [];

function build(): Belt {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x6b7480, roughness: 0.95, metalness: 0.08, flatShading: true });
  const geos = [rockGeometry(2.2), rockGeometry(5.9), rockGeometry(9.4)];
  const gateMesh = new THREE.InstancedMesh(geos[1], material, MAX_GATES);
  gateMesh.frustumCulled = false;
  for (let i = 0; i < MAX_GATES; i++) gateMesh.setColorAt(i, _color.setHSL(0.08, 0.12, rand(0.5, 0.75)));
  gateMesh.count = 0;
  group.add(gateMesh);
  const b = { group, near: new Field(NEAR, material, geos, group), far: new Field(FAR, material, geos, group), gateMesh };
  group.visible = false;
  scene.add(group);
  return b;
}

function placeGates() {
  if (!belt) return;
  const m = belt.gateMesh;
  m.count = Math.min(MAX_GATES, gates.length);
  for (let i = 0; i < m.count; i++) {
    _q.setFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)));
    _s.setScalar(gates[i].radius / 1.05);
    _m.compose(gates[i].pos, _q, _s);
    m.setMatrixAt(i, _m);
  }
  m.instanceMatrix.needsUpdate = true;
}

/** Show the belt, filled around `center` (built on first use). */
export function showBelt(center: THREE.Vector3) {
  belt ??= build();
  belt.group.visible = true;
  belt.near.scatter(center);
  belt.far.scatter(center);
  placeGates();
}

export function hideBelt() {
  if (belt) belt.group.visible = false;
  path = [];
  pathClear = [];
  gates = [];
}

/**
 * The autopilot's flight path: rocks keep out of a corridor around it, `clear[i]`
 * km from point i to a rock's surface (negative = CORRIDOR). `slalom` rocks are
 * planted as given.
 */
export function setBeltPath(points: THREE.Vector3[], clear: number[] = [], slalom: { pos: THREE.Vector3; radius: number }[] = []) {
  path = points;
  pathClear = clear;
  gates = slalom;
  if (belt?.group.visible) {
    belt.near.reclear();
    belt.far.reclear();
    placeGates();
  }
}

export function updateBelt(dt: number, center: THREE.Vector3) {
  if (!belt?.group.visible) return;
  belt.near.update(dt, center);
  belt.far.update(dt, center);
}

/** Is `pos` inside (or within `margin` of) any belt rock? For keeping cameras out of rocks. */
export function rockBlocks(pos: THREE.Vector3, margin = 0.01): boolean {
  if (!belt?.group.visible) return false;
  for (const g of gates) if (g.pos.distanceTo(pos) < g.radius + margin) return true;
  for (const f of [belt.near, belt.far]) {
    for (const r of f.rocks) {
      const need = r.radius + margin;
      if (Math.abs(r.pos.x - pos.x) > need || Math.abs(r.pos.z - pos.z) > need) continue;
      if (r.pos.distanceToSquared(pos) < need * need) return true;
    }
  }
  return false;
}

/** A near-field rock beside the path around `pos` (for a camera tucked in behind it), if any. */
export function rockBeside(pos: THREE.Vector3, maxGap: number): { pos: THREE.Vector3; radius: number } | null {
  if (!belt?.group.visible) return null;
  let best: FieldRock | null = null;
  let bestD = Infinity;
  for (const r of belt.near.rocks) {
    if (r.scale < 0.06 || r.scale > 0.8) continue;
    const gap = r.pos.distanceTo(pos) - r.radius;
    if (gap < CORRIDOR * 0.9 || gap > maxGap) continue;
    if (gap < bestD) { bestD = gap; best = r; }
  }
  return best ? { pos: best.pos, radius: best.radius } : null;
}
