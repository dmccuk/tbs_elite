import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { glowSprite, panelTextures } from "./models";

// Shared model-building kit: the small helpers every procedural model uses —
// geometry shorthands, materials, glow beacons, truss lattices, canvas
// textures, and the baker that merges static parts into one mesh per material.
//
// Conventions (same as models.ts): 1 unit = 1 km, ships and stations face -Z,
// markers/sprites hang under a group rather than a mesh (baking removes meshes).

export function lazy<T>(build: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= build());
}

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const std = (color: number, roughness: number, metalness: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
/** Unlit colour pushed past 1 so the bloom pass picks it up. */
export const lit = (color: number, k: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });
/** Material settings for decals floated just off a surface. */
export const decal = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };

export function panelMat(opts: Parameters<typeof panelTextures>[0], roughness: number, metalness: number, glow = 1.2, size = 512) {
  const t = panelTextures(opts, size);
  return new THREE.MeshStandardMaterial({
    map: t.map, roughness, metalness,
    ...(t.emissiveMap ? { emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: glow } : {}),
  });
}

export function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** Cylinder lying along Z: rFront at the -Z end, rRear at the +Z end. */
export function zCyl(rFront: number, rRear: number, len: number, seg = 12, open = false) {
  return new THREE.CylinderGeometry(rRear, rFront, len, seg, 1, open).rotateX(Math.PI / 2);
}

export const shape = (pts: number[][]) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
/** Flat outline in the XZ plane — points are (x, forward), forward = -Z — extruded `thick` in Y, centred. */
export function planform(pts: number[][], thick: number) {
  return new THREE.ExtrudeGeometry(shape(pts), { depth: thick, bevelEnabled: false }).translate(0, 0, -thick / 2).rotateX(-Math.PI / 2);
}
/** Side profile — points are (forward, up), forward = -Z — extruded `width` across X, centred. */
export function profile(pts: number[][], width: number) {
  return new THREE.ExtrudeGeometry(shape(pts), { depth: width, bevelEnabled: false }).translate(0, 0, -width / 2).rotateY(Math.PI / 2);
}

export const Y_UP = V(0, 1, 0);
export const rodGeo = new THREE.CylinderGeometry(1, 1, 1, 6);

/** Thin cylinder from a to b. */
export function rod(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const d = b.clone().sub(a);
  const mesh = add(parent, rodGeo, mat);
  mesh.position.copy(a).lerp(b, 0.5);
  mesh.quaternion.setFromUnitVectors(Y_UP, d.clone().normalize());
  mesh.scale.set(r, d.length(), r);
  return mesh;
}

/** Glow sprite under `parent`; flash = [period, phase] makes it a blinking beacon with its own material. */
export function light(parent: THREE.Object3D, color: number, size: number, x: number, y: number, z: number, flash?: [number, number]): THREE.Sprite {
  const s = glowSprite(color, size, 3, !!flash);
  s.position.set(x, y, z);
  if (flash) s.onBeforeRender = flasher([s.material], flash[0], flash[1]);
  parent.add(s);
  return s;
}

export function group(parent: THREE.Object3D, x = 0, y = 0, z = 0, rz = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.z = rz;
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// Baking and beacons

export type Part = { geo: THREE.BufferGeometry; mat: THREE.Material };
const ATTRS = ["position", "normal", "uv"] as const;

/** Merges every plain mesh under `root` into one geometry per material (root's local space) and removes the
 *  originals; groups, sprites, markers and instanced meshes stay. No negative-scale parts: winding would flip. */
export function bakeParts(root: THREE.Object3D): Part[] {
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

export function addParts(parent: THREE.Object3D, parts: Part[]): void {
  for (const p of parts) parent.add(new THREE.Mesh(p.geo, p.mat));
}

/** onBeforeRender hook that flashes the given materials together. Purely cosmetic (gameplay never reads it),
 *  so it runs on wall-clock time rather than the game scheduler. */
export function flasher(mats: { color: THREE.Color }[], period: number, phase: number, duty = 0.25): () => void {
  const bases = mats.map((m) => m.color.clone());
  return () => {
    const on = (performance.now() / 1000 / period + phase) % 1 < duty;
    mats.forEach((m, i) => m.color.copy(bases[i]).multiplyScalar(on ? 1 : 0.08));
  };
}

// ---------------------------------------------------------------------------
// Canvas textures: hazard stripes, scorch marks.

export function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
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

export const hazardTex = lazy(() => canvasTex(64, 64, (ctx) => {
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
export function hazardMat(rx: number): THREE.MeshStandardMaterial {
  if (!hazardMats.has(rx)) {
    const map = hazardTex().clone();
    map.repeat.set(rx, 1);
    hazardMats.set(rx, std(0xffffff, 0.6, 0.3, { map, emissive: 0x442200, emissiveIntensity: 0.3 }));
  }
  return hazardMats.get(rx)!;
}

/** Soot blotches and blast streaks, fully transparent at the edges. */
export const scorchMat = lazy(() => new THREE.MeshBasicMaterial({
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
// Truss work

/** Collects strut transforms, then builds them as one instanced mesh (one draw call). */
export class Trusses {
  private struts: THREE.Matrix4[] = [];

  /** A single strut of thickness t from a to b. */
  strut(a: THREE.Vector3, b: THREE.Vector3, t: number) {
    const d = b.clone().sub(a);
    const q = new THREE.Quaternion().setFromUnitVectors(Y_UP, d.clone().normalize());
    this.struts.push(new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), q, V(t, d.length(), t)));
  }

  /** Square-section girder from a to b: four longerons, rungs and alternating diagonals. */
  lattice(a: THREE.Vector3, b: THREE.Vector3, half: number, bays: number, t: number) {
    const dir = b.clone().sub(a).normalize();
    const u = Y_UP.clone().cross(dir);
    if (u.lengthSq() < 1e-8) u.set(1, 0, 0);
    u.setLength(half);
    const v = dir.clone().cross(u);
    const corners = [u.clone().add(v), u.clone().sub(v), u.clone().negate().sub(v), u.clone().negate().add(v)];
    for (const c of corners) this.strut(a.clone().add(c), b.clone().add(c), t);
    for (let i = 0; i <= bays; i++) {
      const p = a.clone().lerp(b, i / bays);
      const q = a.clone().lerp(b, (i + 1) / bays);
      corners.forEach((c0, j) => {
        const c1 = corners[(j + 1) % 4];
        this.strut(p.clone().add(c0), p.clone().add(c1), t * 0.7);
        if (i < bays) this.strut(p.clone().add(j % 2 ? c0 : c1), q.clone().add(j % 2 ? c1 : c0), t * 0.6);
      });
    }
  }

  /** Adds the instanced truss mesh to `parent` (call once, after all struts). */
  build(parent: THREE.Object3D, mat: THREE.Material) {
    if (this.struts.length === 0) return;
    const mesh = new THREE.InstancedMesh(box(1, 1, 1), mat, this.struts.length);
    this.struts.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.computeBoundingSphere();
    parent.add(mesh);
  }
}
