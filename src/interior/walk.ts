import * as THREE from "three";
import { clamp, damp } from "../config";
import { input } from "../input";

// First-person legs for the interior scenes. Everything in here is in METRES
// (the flight sim is in km): a deck is a few hundred metres across, Wyatt is
// 1.75 m tall and walks at about 3 m/s.
//
// Collision is deliberately simple: the walker is a circle in the floor plane
// pushed out of axis-aligned boxes, so you slide along walls and crates instead
// of sticking to them. Nothing here falls or jumps — the decks are flat.

export interface Solid {
  /** Half-extents and centre, in metres. */
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export const solid = (x0: number, z0: number, x1: number, z1: number, top = 4): Solid => ({
  min: new THREE.Vector3(Math.min(x0, x1), 0, Math.min(z0, z1)),
  max: new THREE.Vector3(Math.max(x0, x1), top, Math.max(z0, z1)),
});

const EYE = 1.75;
const RADIUS = 0.42;
const WALK = 3.7;   // m/s
const RUN = 7.4;
const _v = new THREE.Vector3();

export class Walker {
  pos = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  /** Metres per second right now (for head bob and footsteps). */
  speed = 0;
  private bob = 0;
  private vel = new THREE.Vector3();
  private aim = { x: 0, y: 0 };

  place(x: number, z: number, yaw: number) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.vel.set(0, 0, 0);
    this.bob = 0;
  }

  /**
   * Move, look and slide along `solids`. Returns the distance walked.
   * Looking needs the mouse captured; walking doesn't, so the two never fight
   * each other and the keys keep working if the pointer lock drops.
   */
  update(dt: number, solids: Solid[], controls: boolean): number {
    input.takeAimDelta(this.aim);
    if (controls && input.pointerLocked) {
      this.yaw -= this.aim.x * 0.0022;
      this.pitch = clamp(this.pitch - this.aim.y * 0.0022, -1.2, 1.2);
    }
    // Forward/back and strafe, in the direction you're facing.
    const fwd = controls ? input.walkY : 0;
    const side = controls ? input.walkX : 0;
    const want = _v.set(side, 0, -fwd);
    if (want.lengthSq() > 1) want.normalize();
    want.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const top = input.boost ? RUN : WALK;
    this.vel.lerp(want.multiplyScalar(top), damp(12, dt));
    if (this.vel.lengthSq() < 1e-5) this.vel.set(0, 0, 0);
    this.pos.addScaledVector(this.vel, dt);
    this.collide(solids);
    this.speed = this.vel.length();
    this.bob += this.speed * dt * 1.9;
    return this.speed * dt;
  }

  /** Dev/test: shove the walker by (dx, dz) through the same collision resolve. */
  nudge(dx: number, dz: number, solids: Solid[]) {
    this.pos.x += dx;
    this.pos.z += dz;
    this.collide(solids);
  }

  /** Push out of every box the walker's circle overlaps (shortest way out). */
  private collide(solids: Solid[]) {
    for (const s of solids) {
      const cx = clamp(this.pos.x, s.min.x, s.max.x);
      const cz = clamp(this.pos.z, s.min.z, s.max.z);
      const dx = this.pos.x - cx;
      const dz = this.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > RADIUS * RADIUS) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        this.pos.x = cx + (dx / d) * RADIUS;
        this.pos.z = cz + (dz / d) * RADIUS;
      } else {
        // Dead centre inside the box: out the nearest face.
        const left = this.pos.x - s.min.x, right = s.max.x - this.pos.x;
        const back = this.pos.z - s.min.z, front = s.max.z - this.pos.z;
        const m = Math.min(left, right, back, front);
        if (m === left) this.pos.x = s.min.x - RADIUS;
        else if (m === right) this.pos.x = s.max.x + RADIUS;
        else if (m === back) this.pos.z = s.min.z - RADIUS;
        else this.pos.z = s.max.z + RADIUS;
      }
    }
  }

  /** Put the camera at eye height, with a little bob while walking. */
  toCamera(cam: THREE.PerspectiveCamera) {
    const sway = Math.sin(this.bob) * 0.035 * Math.min(1, this.speed / WALK);
    const lift = Math.abs(Math.cos(this.bob)) * 0.03 * Math.min(1, this.speed / WALK);
    cam.position.set(this.pos.x, EYE + lift, this.pos.z);
    cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, sway * 0.5, "YXZ"));
    cam.updateMatrixWorld();
  }

  /** Where the walker is looking (unit vector). */
  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
  }
}
