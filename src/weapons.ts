import * as THREE from "three";

// Laser bolts for every ship, drawn as one instanced mesh. Hits are tested
// along the segment travelled each frame, so fast bolts never tunnel through
// small targets.

/** "fx" bolts are purely visual (point-defence tracers) and never collide. */
export type BoltOwner = "player" | "enemy" | "fx";

export interface Bolt {
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  owner: BoltOwner;
  damage: number;
  length: number;
  width: number;
  color: THREE.Color;
  active: boolean;
}

const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _d = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

export class BoltPool {
  readonly mesh: THREE.InstancedMesh;
  readonly bolts: Bolt[] = [];

  constructor(capacity = 400) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1).rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let i = 0; i < capacity; i++) {
      this.bolts.push({
        pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(),
        life: 0, owner: "player", damage: 0, length: 0.05, width: 0.002, color: new THREE.Color(), active: false,
      });
    }
  }

  fire(pos: THREE.Vector3, vel: THREE.Vector3, owner: BoltOwner, damage: number, life: number, color: number, length: number, width: number) {
    const b = this.bolts.find((x) => !x.active);
    if (!b) return null;
    b.pos.copy(pos);
    b.prev.copy(pos);
    b.vel.copy(vel);
    b.life = life;
    b.owner = owner;
    b.damage = damage;
    b.length = length;
    b.width = width;
    b.color.setHex(color).multiplyScalar(3);
    b.active = true;
    return b;
  }

  /** Advance bolts; `hit` returns true if the bolt struck something and should vanish. */
  update(dt: number, hit: (b: Bolt) => boolean) {
    let n = 0;
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) { b.active = false; continue; }
      b.prev.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      if (hit(b)) { b.active = false; continue; }

      _d.copy(b.vel).normalize();
      _q.setFromUnitVectors(Z, _d);
      _s.set(b.width, b.width, b.length);
      // Draw the bolt trailing behind its tip.
      _m.compose(_d.multiplyScalar(-b.length / 2).add(b.pos), _q, _s);
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, b.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    for (const b of this.bolts) b.active = false;
    this.mesh.count = 0;
  }
}

export const bolts = new BoltPool();

const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();

/** Does the segment a→b pass within `radius` of `center`? */
export function segmentHitsSphere(a: THREE.Vector3, b: THREE.Vector3, center: THREE.Vector3, radius: number): boolean {
  _ab.subVectors(b, a);
  _ac.subVectors(center, a);
  const lenSq = _ab.lengthSq();
  const t = lenSq > 0 ? Math.max(0, Math.min(1, _ac.dot(_ab) / lenSq)) : 0;
  _ab.multiplyScalar(t).add(a);
  return _ab.distanceToSquared(center) <= radius * radius;
}
