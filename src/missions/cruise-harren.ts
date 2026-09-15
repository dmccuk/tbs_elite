import * as THREE from "three";
import { G } from "../game";
import { clamp, damp, lerp, rand } from "../config";
import { createSeagull } from "../models-frontier";
import type { ShipModel } from "../models";
import { scene } from "../renderer";
import { audio } from "../audio";

// Harren on the Cruise. His Seagull (orange stripes, as in the Prologue) flies
// the same lap as Wyatt, kinematically: a distance along the path plus a
// sideways offset. He launches first off cradle 1 (just ahead of Wyatt's cradle
// 2), sits in loose formation off the right wing, drops in behind to chase Wyatt
// through the joyride's slalom, and on the way home pulls ahead to land first.

/** How the lap looks to Harren: `pointAt` carries on straight along -Z past the lap's end (to cradle 1). */
export interface Track {
  pointAt(dist: number, out: THREE.Vector3): THREE.Vector3;
  length: number;
}

/** What Wyatt is doing, each frame. */
export interface Lead {
  out: boolean;       // Wyatt is off the catapult and flying the lap
  s: number;          // Wyatt's distance along the lap
  speed: number;
  joyride: number;    // 0-1 envelope of the joyride (0 outside it)
  homeward: boolean;  // on the way in: Harren goes ahead to land first
}

type State = "parked" | "launching" | "flying" | "landing";

const PARK = 0.14;                    // cradle 1, ahead of cradle 2 where the lap starts
const CRADLE_DROP = -0.033;           // cradle height below the bay's centreline
const FORMATION = { side: 0.09, up: -0.012, gap: 0.08 };  // off the right wing, a nose ahead
const CHASE_GAP = -0.4;               // behind Wyatt through the slalom
const LANDING_GAP = 2;                // ahead of Wyatt on the way home
const LAUNCH_SPEED = 1.0;
const UP = new THREE.Vector3(0, 1, 0);

let model: ShipModel | null = null;
const h = {
  state: "parked" as State,
  d: PARK,
  stop: PARK,
  speed: 0,
  side: 0,
  prevYaw: 0,
  yawRate: 0,
  bank: 0,
  track: null as Track | null,
};

const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();
const _side = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, "YXZ");

/** Harren's ship, if he's out (for the cameras). */
export const harrenShip = (): THREE.Object3D | null => (model?.root.visible ? model.root : null);
/** Harren sits off this side of Wyatt in formation (+1 = starboard). */
export const HARREN_SIDE = 1;
export const harrenFlying = () => h.state === "flying" || h.state === "landing";

/** Put Harren on cradle 1 at the start of `track` (the start of the Cruise, and after every landing). */
export function parkHarren(track: Track) {
  model ??= createSeagull(0xcc6622);
  if (!model.root.parent) scene.add(model.root);
  model.root.visible = true;
  h.track = track;
  h.state = "parked";
  h.d = h.stop = PARK;
  h.speed = h.side = h.yawRate = h.bank = 0;
  place(0);
}

/** A new lap planned while he's parked: same cradle, new track. */
export function retrackHarren(track: Track) {
  if (h.state !== "parked") return;
  h.track = track;
  h.d = h.stop = PARK;
}

export function launchHarren() {
  if (h.state !== "parked") return;
  h.state = "launching";
  h.speed = 0.1;
  audio.missileIgnite(0.6);
}

export function hideHarren() {
  if (model) model.root.visible = false;
  h.track = null;
  h.state = "parked";
}

export function updateHarren(dt: number, lead: Lead) {
  const t = h.track;
  if (!t || !model?.root.visible || dt <= 0) return;
  let wantSide = 0;
  switch (h.state) {
    case "parked":
      h.speed = 0;
      break;
    case "launching":
      h.speed = Math.min(LAUNCH_SPEED, h.speed + 2.2 * dt);
      if (h.d > 1.2) h.state = "flying";
      break;
    case "flying": {
      // Hold station on Wyatt: in formation, or tucked in behind him for the slalom.
      const chase = smooth(lead.joyride / 0.15);
      let gap = lerp(FORMATION.gap, CHASE_GAP, chase);
      // Coming back up from behind: hang back until he's out to the side, then pull alongside.
      if (h.d < lead.s && h.side < FORMATION.side * 0.85) gap = Math.min(gap, -0.16);
      follow(lead, gap, dt);
      // Stay on the line near the Kessler and in the slalom (the rocks come close
      // there), but only slide across once he's dropped well back: never onto Wyatt.
      const clearBehind = smooth((lead.s - h.d - 0.1) / 0.12);
      const onLine = h.d < 3 ? 1 : lead.joyride > 0 ? clearBehind : 0;
      wantSide = FORMATION.side * (1 - onLine);
      if (lead.homeward) {
        h.state = "landing";
        h.stop = t.length + PARK;
      }
      break;
    }
    case "landing": {
      follow(lead, LANDING_GAP, dt);
      // Brake for the door, then onto cradle 1.
      const left = h.stop - h.d;
      const inBay = 0.38;
      const vmax = left > inBay ? Math.sqrt(0.2 * 0.2 + 2 * 0.03 * (left - inBay)) : Math.sqrt(2 * 0.0526 * left) + 0.002;
      h.speed = Math.min(h.speed, vmax);
      if (left < 0.0005) {
        h.state = "parked";
        h.d = h.stop;
        h.speed = 0;
        audio.missileRelease(); // the clamps bite
      }
      break;
    }
  }
  h.side = lerp(h.side, wantSide, damp(0.6, dt));
  h.d = Math.min(h.d + h.speed * dt, h.state === "landing" || h.state === "parked" ? h.stop : Infinity);
  place(dt);
}

/** Speed that closes on `gap` km ahead of Wyatt, a little faster or slower than him. */
function follow(lead: Lead, gap: number, dt: number) {
  const err = lead.s + gap - h.d;
  // Until Wyatt's off the catapult too, just cruise out and wait for him.
  const want = !lead.out ? 0.5 : clamp(lead.speed + err * 0.8, Math.max(0.15, lead.speed - 0.3), lead.speed + 0.35);
  h.speed = h.speed < want ? Math.min(want, h.speed + 1.6 * dt) : Math.max(want, h.speed - 1.2 * dt);
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function place(dt: number) {
  const t = h.track!;
  const m = model!;
  t.pointAt(h.d, _p);
  t.pointAt(h.d - 0.15, _a);
  t.pointAt(h.d + 0.15, _b);
  _t.subVectors(_b, _a).normalize();
  _side.crossVectors(_t, UP).normalize();
  _p.addScaledVector(_side, h.side * HARREN_SIDE).addScaledVector(UP, FORMATION.up * (h.side / FORMATION.side));
  // Sink onto the cradle near either end.
  const near = Math.max(clamp(1 - Math.abs(h.d - PARK) / 0.25, 0, 1), clamp(1 - Math.abs(h.d - h.stop) / 0.25, 0, 1));
  _p.y += CRADLE_DROP * near;
  m.root.position.copy(_p);
  const yaw = Math.atan2(-_t.x, -_t.z);
  const pitch = Math.asin(clamp(_t.y, -1, 1));
  if (dt > 0) {
    const dYaw = Math.atan2(Math.sin(yaw - h.prevYaw), Math.cos(yaw - h.prevYaw));
    h.yawRate = lerp(h.yawRate, dYaw / dt, damp(4, dt));
  }
  h.prevYaw = yaw;
  h.bank = lerp(h.bank, clamp(h.yawRate * 12, -1.1, 1.1), damp(3, dt || 1));
  _e.set(pitch, yaw, 0);
  m.root.quaternion.setFromEuler(_e);
  m.body.rotation.set(0, 0, h.bank);
  // Engines: glow and exhaust with thrust.
  const moving = h.state !== "parked";
  const thrust = moving ? 0.5 + h.speed * 0.5 : 0.2;
  for (const g of m.glows) g.scale.setScalar(0.014 * thrust * rand(0.9, 1.1));
  if (moving && dt > 0) {
    _t.multiplyScalar(h.speed * 0.6);
    for (const e of m.engines) {
      e.getWorldPosition(_a);
      G.fx.fire.emit(_a.x, _a.y, _a.z, _t.x, _t.y, _t.z, h.speed > 1.2 ? 0.28 : 0.16, 0.005 * thrust, 0.001, h.speed > 1.7 ? 0xffcc66 : 0xff8833, 0xff3300, 0.55);
    }
  }
}
