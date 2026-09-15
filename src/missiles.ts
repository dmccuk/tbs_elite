import * as THREE from "three";
import { G, say, type Drum, type Entity, type Fighter, type PlayerMissile } from "./game";
import { SHIPS, TUNING, rand } from "./config";
import { createMissile, type ShipModel } from "./models";
import { scene } from "./renderer";
import { audio } from "./audio";
import { input } from "./input";
import { damageDrum, faceDirection, volumeAt } from "./enemies";
import { damageFighter } from "./frontier";
import { showCallout } from "./hud";

// The Seagull's wing missiles: a seeker that locks after holding the nose on a
// target, the missiles themselves (drop clear, light the motor, home in), and
// the four rounds visible on the wing rails. Only ships with SHIPS[id].missiles
// carry any; the MK-IV garbage hauler has none.

const MS = TUNING.missiles;
const LOCK_COS = Math.cos(THREE.MathUtils.degToRad(MS.lockConeDeg));
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();

// Rail positions under the Seagull's wings (body space, nose toward -Z), in firing order.
const RAILS: [number, number, number][] = [
  [-0.0175, -0.0042, 0.004], [0.0175, -0.0042, 0.004],
  [-0.0115, -0.0036, 0.002], [0.0115, -0.0036, 0.002],
];
const RAIL_SCALE = 0.32;   // missiles drawn on the rails…
const FLIGHT_SCALE = 0.55; // …and a little larger in flight so they read on screen

const rails = new WeakMap<ShipModel, THREE.Object3D[]>();
let beepTimer = 0;
let seekerComputer = "pro_computer";
const lastCallout = new Map<string, number>();

/** A computer callout (voice only; the HUD shows the state), at most once per `gap` seconds. */
function callout(id: string, gap: number) {
  if (G.time - (lastCallout.get(id) ?? -99) < gap) return;
  lastCallout.set(id, G.time);
  audio.voice(`${seekerComputer}_${id}`, "computer");
}

const maxMissiles = () => SHIPS[G.shipId].missiles;

/** Refill the rails (mission start, and again when the Prologue's fight begins). */
export function rearmMissiles() {
  const p = G.player;
  p.missiles = maxMissiles();
  seekerComputer = G.missionId === "prologue" ? "pro_computer" : "c1_computer";
  if (p.missiles === 0) return;
  let list = rails.get(p.model);
  if (!list) {
    list = RAILS.slice(0, p.missiles).map(([x, y, z]) => {
      const m = createMissile();
      m.scale.setScalar(RAIL_SCALE);
      m.position.set(x, y, z);
      m.traverse((o) => { if ((o as THREE.Sprite).isSprite) o.visible = false; }); // no exhaust glow on the rail
      p.model.body.add(m);
      return m;
    });
    rails.set(p.model, list);
  }
  for (const m of list) m.visible = true;
}

/** Can the seeker lock this? Pirates and practice buoys; never the shuttle (people aboard). */
function lockable(e: Entity): boolean {
  return e.alive && (e.kind === "fighter" || e.kind === "drum");
}

function inSeekerCone(e: Entity): boolean {
  const p = G.player;
  _v.subVectors(e.obj.position, p.obj.position);
  const d = _v.length();
  return d < MS.lockRange && d > 0.05 && _v.dot(p.forward) / d > LOCK_COS;
}

/** The locked target if it's still in the cone, else whatever lockable thing sits nearest the nose. */
function pickCandidate(): Entity | null {
  const p = G.player;
  const t = G.target;
  if (t && lockable(t) && inSeekerCone(t)) return t;
  let best: Entity | null = null;
  let bestDot = LOCK_COS;
  const consider = (e: Entity) => {
    if (!lockable(e)) return;
    _v.subVectors(e.obj.position, p.obj.position);
    const d = _v.length();
    if (d > MS.lockRange || d < 0.05) return;
    const dot = _v.dot(p.forward) / d;
    if (dot > bestDot) { bestDot = dot; best = e; }
  };
  for (const f of G.fighters) consider(f);
  for (const d of G.drums) consider(d);
  return best;
}

function launch(target: Entity) {
  const p = G.player;
  const index = maxMissiles() - p.missiles;
  const rail = rails.get(p.model)?.[index];
  const obj = createMissile();
  obj.scale.setScalar(FLIGHT_SCALE);
  if (rail) {
    rail.getWorldPosition(obj.position);
    rail.visible = false;
  } else obj.position.copy(p.obj.position);
  obj.quaternion.copy(p.obj.quaternion);
  scene.add(obj);
  const down = _v.set(0, -1, 0).applyQuaternion(p.obj.quaternion);
  G.playerMissiles.push({
    obj, target, age: 0, speed: p.speed, lit: false, evaded: false, smokeTimer: 0,
    vel: p.vel.clone().addScaledVector(down, 0.12),
  });
  p.missiles--;
  G.stats.missilesFired++;
  audio.missileRelease();
  G.fx.shake(0.1);
  // A fresh lock is needed for the next shot.
  G.lock.progress = 0;
  G.lock.locked = false;
  if (p.missiles === 0) {
    say("SEAGULL COMPUTER", "Missiles depleted. Coilgun only.", "#88ffcc");
    callout("missiles_depleted", 30);
  } else if (p.missiles === 1) callout("last_missile", 20);
  else callout("missile_away", 3);
}

function detonate(m: PlayerMissile, hit: Entity | null) {
  const pos = m.obj.position;
  scene.remove(m.obj);
  G.fx.explosion(pos, hit ? 0.06 : 0.035, "fire", m.vel);
  audio.explosion(0.12, volumeAt(pos));
  if (!hit) return;
  if (hit.kind === "fighter") {
    damageFighter(hit as Fighter, MS.damage, pos, true);
    if (!hit.alive) callout("target_destroyed", 6);
  } else if (hit.kind === "drum") {
    damageDrum(hit as Drum, 99);
  }
}

function updateFlight(m: PlayerMissile, dt: number): boolean {
  m.age += dt;
  const pos = m.obj.position;
  if (m.age < MS.dropTime) {
    // Falling clear of the rail.
    pos.addScaledVector(m.vel, dt);
    return true;
  }
  if (!m.lit) {
    m.lit = true;
    G.fx.flash(pos, 0.04, 0xffcc77, 0.2);
    audio.missileIgnite(volumeAt(pos));
  }
  const t = m.target.alive ? m.target : null;
  m.speed = Math.min(MS.speed, m.speed + MS.accel * dt);
  _dir.copy(m.vel).normalize();
  if (t) {
    const dist = pos.distanceTo(t.obj.position);
    if (dist < t.radius + MS.fuse) { detonate(m, t); return false; }
    // Lead the target, then turn toward it at a limited rate.
    const desired = _v.copy(t.obj.position).addScaledVector(t.vel, dist / Math.max(m.speed, 0.5)).sub(pos).normalize();
    const angle = _dir.angleTo(desired);
    if (angle > 1e-4) _dir.lerp(desired, Math.min(1, (MS.turnRate * dt) / angle)).normalize();
    // Pirates try a break turn when one gets close (they're not quick enough, mostly).
    if (!m.evaded && dist < MS.evadeRange && t.kind === "fighter") {
      m.evaded = true;
      const f = G.fighters.find((x) => x === t);
      if (f && f.state === "attack") {
        f.state = "break";
        f.stateTimer = rand(0.8, 1.4);
        f.breakDir.randomDirection().addScaledVector(f.forward, 0.3).normalize();
      }
    }
  }
  m.vel.copy(_dir).multiplyScalar(m.speed);
  pos.addScaledVector(m.vel, dt);
  faceDirection(m.obj, _dir);

  // Motor flame and a smoke trail.
  const tail = _v2.copy(pos).addScaledVector(_dir, -0.014);
  G.fx.fire.emit(tail.x, tail.y, tail.z, 0, 0, 0, 0.16, 0.012, 0.003, 0xfff0b0, 0xff5a1a, 0.9);
  m.smokeTimer -= dt;
  if (m.smokeTimer <= 0) {
    m.smokeTimer = 0.025;
    G.fx.smoke.emit(tail.x, tail.y, tail.z, rand(-0.008, 0.008), rand(-0.008, 0.008), rand(-0.008, 0.008), 1.4, 0.01, 0.04, 0x9a9a9a, 0x3a3a3a, 0.45, 0.4);
  }
  if (m.age > MS.life) { detonate(m, null); return false; }
  return true;
}

/** Per frame: fly the missiles, run the seeker, and handle F / middle-click / MSL. */
export function updateMissiles(dt: number, controls: boolean) {
  G.playerMissiles = G.playerMissiles.filter((m) => updateFlight(m, dt));

  const p = G.player;
  const lock = G.lock;
  const pressed = input.take("missile");
  if (!controls || !p.alive || maxMissiles() === 0) {
    lock.target = null;
    lock.progress = 0;
    lock.locked = lock.refused = false;
    if (pressed && controls) {
      audio.beep();
      showCallout("NO MISSILES FITTED", "#ffaa00", 1);
    }
    return;
  }

  // Seeker. The shuttle can be targeted, but never locked: there are people aboard.
  const t = G.target;
  lock.refused = !!t && (t.kind === "engines" || t.kind === "shuttle") && inSeekerCone(t);
  const candidate = p.missiles > 0 ? pickCandidate() : null;
  if (candidate !== lock.target) {
    if (lock.locked) callout("lock_broken", 5);
    lock.target = candidate;
    lock.progress = 0;
    lock.locked = false;
  }
  if (candidate) {
    lock.progress = Math.min(1, lock.progress + dt / MS.lockTime);
    beepTimer -= dt;
    if (!lock.locked && lock.progress >= 1) {
      lock.locked = true;
      beepTimer = 0.45;
      audio.lockTone();
      callout("missile_lock", 5);
    } else if (beepTimer <= 0) {
      beepTimer = lock.locked ? 0.45 : 0.3 - lock.progress * 0.2;
      if (lock.locked) audio.lockTone();
      else audio.lockChirp(lock.progress);
    }
  }

  if (!pressed) return;
  if (p.missiles <= 0) {
    audio.beep();
    showCallout("NO MISSILES LEFT", "#ffaa00", 1);
  } else if (lock.locked && lock.target) {
    launch(lock.target);
  } else if (lock.refused) {
    audio.beep();
    showCallout("NO LOCK — PEOPLE ABOARD", "#ff5555", 1.4);
    callout("no_lock_hostages", 12);
  } else {
    audio.beep();
    showCallout("NO LOCK", "#ffaa00", 0.9);
    callout("no_lock", 6);
  }
}

export function clearPlayerMissiles() {
  for (const m of G.playerMissiles) scene.remove(m.obj);
  G.playerMissiles = [];
  G.lock.target = null;
  G.lock.progress = 0;
  G.lock.locked = G.lock.refused = false;
  lastCallout.clear();
}
