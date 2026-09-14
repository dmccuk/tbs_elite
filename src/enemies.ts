import * as THREE from "three";
import { G, addScore, emit, type Corvette, type Drone, type Drum, type Entity, type Missile, type Yacht } from "./game";
import { SCORE, TUNING, damp, rand } from "./config";
import { createCorvette, createDrone, createDrum, createMissile, createRoyalYacht, type ShipModel } from "./models";
import { scene } from "./renderer";
import { audio } from "./audio";
import { bolts } from "./weapons";
import { damagePlayer, playerDodging } from "./player";

// The Royal Favor, the Black Ship corvette, its drones and missiles.

const C = TUNING.corvette;
const M = TUNING.missile;
const D = TUNING.drone;
const UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _q = new THREE.Quaternion();

// The yacht's evasive loop through the combat area (km). The corvette follows
// the same path a little behind, so the fight always stays nearby.
export const flightPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0.6, -6.5),
  new THREE.Vector3(5, 1.6, -9),
  new THREE.Vector3(9.5, 0.2, -5.5),
  new THREE.Vector3(8.5, -1.4, 1),
  new THREE.Vector3(3.5, -0.6, 5.5),
  new THREE.Vector3(-3.5, 1.1, 4.5),
  new THREE.Vector3(-8.5, 2.0, -0.5),
  new THREE.Vector3(-6.5, 0.6, -7),
], true, "centripetal");
const PATH_LENGTH = flightPath.getLength();
/** Where on the loop the yacht jumps in: crossing ahead of the player's start. */
export const YACHT_START_U = 0.93;

/** Point the object's nose (-Z) along dir. */
export function faceDirection(obj: THREE.Object3D, dir: THREE.Vector3, t = 1, up = UP) {
  _mat.lookAt(ORIGIN, dir, up);
  _q.setFromRotationMatrix(_mat);
  if (t >= 1) obj.quaternion.copy(_q);
  else obj.quaternion.slerp(_q, t);
}

function wrapU(u: number) {
  return ((u % 1) + 1) % 1;
}

function warpStretch(body: THREE.Object3D, t: number) {
  const k = Math.max(0, 1 - t / 0.45);
  body.scale.set(1 - k * 0.6, 1 - k * 0.6, 1 + k * k * 14);
}

// --- Spawning ---------------------------------------------------------------

// The big ships are built once and reused on every restart — each build makes
// dozens of geometries and canvas textures that would otherwise pile up on the GPU.
let yachtModel: ShipModel | null = null;
let corvetteModel: ShipModel | null = null;

export function spawnYacht(): Yacht {
  const model = (yachtModel ??= createRoyalYacht());
  model.body.scale.set(1, 1, 1);
  scene.add(model.root);
  const y: Yacht = {
    kind: "yacht", obj: model.root, model, vel: new THREE.Vector3(),
    radius: 0.2, hp: TUNING.yacht.hull, maxHp: TUNING.yacht.hull, alive: true, label: "ROYAL FAVOR",
    u: YACHT_START_U, speedScale: 1, pdCooldown: 0, smokeTimer: 0, warpT: 0, holdAt: null,
  };
  placeOnPath(y.obj, y.u, 0, 0);
  G.fx.warp(y.obj.position, flightPath.getTangentAt(y.u), 0.25);
  audio.warp();
  return y;
}

export function spawnCorvette(): Corvette {
  const model = (corvetteModel ??= createCorvette());
  model.body.scale.set(1, 1, 1);
  scene.add(model.root);
  const yu = G.yacht ? G.yacht.u : YACHT_START_U;
  const c: Corvette = {
    kind: "corvette", obj: model.root, model, vel: new THREE.Vector3(),
    radius: 0.42, hp: 1, maxHp: 1, alive: true, label: "HOUSE CAYSTON CORVETTE",
    u: wrapU(yu - C.trailGap / PATH_LENGTH),
    hits: 0, missileTimer: 5, cannonTimer: 3, droneTimer: C.droneFirstWave, waves: 0,
    enraged: false, crippled: false, warpT: 0, jumpOut: 0, pdFireTimer: 0,
  };
  placeOnPath(c.obj, c.u, 0, 0);
  G.fx.warp(c.obj.position, flightPath.getTangentAt(c.u), 0.6);
  G.fx.shake(0.4);
  audio.warp();
  return c;
}

function placeOnPath(obj: THREE.Object3D, u: number, side: number, lift: number) {
  const pos = flightPath.getPointAt(u);
  const tan = flightPath.getTangentAt(u);
  const right = _v3.crossVectors(tan, UP).normalize();
  obj.position.copy(pos).addScaledVector(right, side).addScaledVector(UP, lift);
  faceDirection(obj, tan);
}

export function spawnDrums() {
  const count = 7;
  for (let i = 0; i < count; i++) {
    const obj = createDrum();
    const a = (i / (count - 1) - 0.5) * 1.4;
    const dist = rand(1.2, 3.2);
    obj.position.set(Math.sin(a) * dist, rand(-0.35, 0.45), -Math.cos(a) * dist);
    obj.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    scene.add(obj);
    G.drums.push({
      kind: "drum", obj, vel: new THREE.Vector3(rand(-0.01, 0.01), rand(-0.01, 0.01), rand(-0.01, 0.01)),
      radius: 0.03, hp: 2, maxHp: 2, alive: true, label: "JUNK DRUM",
      spin: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)),
    });
  }
}

function spawnDrone(from: THREE.Vector3, dir: THREE.Vector3) {
  const model = createDrone();
  model.root.position.copy(from);
  faceDirection(model.root, dir);
  scene.add(model.root);
  const d: Drone = {
    kind: "drone", obj: model.root, model, vel: dir.clone().multiplyScalar(D.speed),
    radius: 0.028, hp: D.hp, maxHp: D.hp, alive: true, label: "ATTACK DRONE",
    state: "launch", stateTimer: rand(0.7, 1.2), fireTimer: rand(1, 2),
    breakDir: new THREE.Vector3(), forward: dir.clone(),
  };
  G.drones.push(d);
  G.fx.flash(from, 0.06, 0xff4433, 0.25);
}

export function launchDroneWave(count: number) {
  const c = G.corvette;
  if (!c || !c.alive) return;
  const room = Math.max(0, C.maxDrones - G.drones.filter((d) => d.alive).length);
  const n = Math.min(count, room);
  if (n === 0) return;
  const bay = c.model.bay!.getWorldPosition(new THREE.Vector3());
  const down = _v.set(0, -1, 0).applyQuaternion(c.obj.quaternion);
  for (let i = 0; i < n; i++) {
    const dir = new THREE.Vector3().copy(down).multiplyScalar(0.7)
      .addScaledVector(_v2.set(0, 0, -1).applyQuaternion(c.obj.quaternion), 0.5)
      .add(new THREE.Vector3(rand(-0.5, 0.5), rand(-0.2, 0.2), rand(-0.5, 0.5)))
      .normalize();
    spawnDrone(bay.clone().addScaledVector(dir, 0.05 + i * 0.03), dir);
  }
  audio.missileLaunch(0.6);
  emit({ type: "dronesLaunched", count: n });
}

export function fireMissileVolley(size: number, atPlayer: number) {
  const c = G.corvette;
  if (!c || !c.alive || c.crippled) return;
  const fwd = _v2.set(0, 0, -1).applyQuaternion(c.obj.quaternion).clone();
  for (let i = 0; i < size; i++) {
    const pod = c.model.pods[i % c.model.pods.length];
    const from = pod.getWorldPosition(new THREE.Vector3());
    const outward = from.clone().sub(c.obj.position).normalize();
    const target: Entity | null = i < atPlayer && G.player.alive ? G.player : G.yacht?.alive ? G.yacht : null;
    if (!target) continue;
    const obj = createMissile();
    obj.position.copy(from);
    const vel = outward.multiplyScalar(0.25).addScaledVector(fwd, 0.25).add(new THREE.Vector3(rand(-0.08, 0.08), rand(0, 0.12), rand(-0.08, 0.08)));
    faceDirection(obj, _v.copy(vel).normalize());
    scene.add(obj);
    G.missiles.push({
      kind: "missile", obj, vel, radius: 0.02, hp: 1, maxHp: 1, alive: true, label: "MISSILE",
      target, life: M.life, trailTimer: 0, doomed: 0, pdChecked: false, speed: vel.length(),
    });
    G.fx.flash(from, 0.05, 0xffaa55, 0.2);
    G.fx.smoke.emit(from.x, from.y, from.z, 0, 0, 0, 1.2, 0.03, 0.1, 0x777777, 0x333333, 0.5, 0.5);
  }
  audio.missileLaunch(volumeAt(c.obj.position));
  emit({ type: "missileVolley", atPlayer: atPlayer > 0 });
}

/** Rough distance attenuation for sounds relative to the player. */
export function volumeAt(pos: THREE.Vector3): number {
  const d = pos.distanceTo(G.player.obj.position);
  return Math.max(0.05, Math.min(1, 1.2 / (1 + d * 0.5)));
}

// --- Damage -----------------------------------------------------------------

export function damageDrone(d: Drone, amount: number, at: THREE.Vector3) {
  if (!d.alive) return;
  d.hp -= amount;
  G.fx.sparksAt(at, 6, 0xffcc88, 0.2, 0.004, 0.25, d.vel);
  if (d.hp <= 0) destroyDrone(d, true);
}

export function destroyDrone(d: Drone, byPlayer: boolean) {
  if (!d.alive) return;
  d.alive = false;
  scene.remove(d.obj);
  G.fx.explosion(d.obj.position, 0.05, "fire", d.vel);
  audio.explosion(0.1, volumeAt(d.obj.position));
  if (byPlayer) {
    G.stats.drones++;
    addScore(SCORE.drone, d.obj.position);
    emit({ type: "droneKilled" });
  }
}

export function destroyMissile(m: Missile, byPlayer: boolean) {
  if (!m.alive) return;
  m.alive = false;
  scene.remove(m.obj);
  G.fx.explosion(m.obj.position, 0.025, "fire", m.vel);
  audio.explosion(0.05, volumeAt(m.obj.position) * 0.7);
  if (byPlayer) {
    G.stats.missiles++;
    addScore(SCORE.missile, m.obj.position, "#ffaa55");
  }
}

export function damageDrum(d: Drum, amount: number) {
  if (!d.alive) return;
  d.hp -= amount;
  G.fx.sparksAt(d.obj.position, 5, 0xffcc88, 0.15, 0.003, 0.25);
  if (d.hp <= 0) {
    d.alive = false;
    scene.remove(d.obj);
    G.fx.explosion(d.obj.position, 0.035, "fire");
    audio.explosion(0.06, 0.6);
    G.stats.drums++;
    addScore(SCORE.drum, d.obj.position, "#88ffcc");
    emit({ type: "drumKilled" });
  }
}

export function damageYacht(amount: number, at: THREE.Vector3) {
  const y = G.yacht;
  if (!y || !y.alive) return;
  // Once the corvette is crippled the fight is won; stray shots just spark.
  if (G.phase !== "combat") {
    G.fx.flash(at, 0.04, 0x66bbff, 0.15);
    return;
  }
  y.hp = Math.max(0, y.hp - amount);
  G.fx.explosion(at, 0.03 + amount * 0.006, "fire", y.vel);
  if (y.hp <= 0) {
    y.alive = false;
    const p = y.obj.position.clone();
    G.fx.explosion(p, 0.35, "plasma", y.vel);
    for (let i = 0; i < 5; i++) {
      G.fx.explosion(_v.randomDirection().multiplyScalar(0.2).add(p), rand(0.08, 0.18), "fire", y.vel);
    }
    G.fx.shake(0.5 * volumeAt(p));
    audio.bigBoom();
    scene.remove(y.obj);
  }
}

/** A container blast caught the corvette. Returns true when it is crippled. */
export function hitCorvette(): boolean {
  const c = G.corvette;
  if (!c || c.crippled) return false;
  c.hits++;
  const p = c.obj.position;
  for (let i = 0; i < 4; i++) {
    G.fx.explosion(_v.randomDirection().multiplyScalar(0.25).add(p), rand(0.08, 0.16), "fire", c.vel);
  }
  if (c.hits >= C.mineHitsToCripple) {
    c.crippled = true;
    c.jumpOut = 0;
    return true;
  }
  c.enraged = true;
  return false;
}

// --- Per-frame updates --------------------------------------------------------

export function updateEnemies(dt: number) {
  updateYacht(dt);
  updateCorvette(dt);
  updateDrones(dt);
  updateMissiles(dt);
  for (const d of G.drums) {
    if (!d.alive) continue;
    d.obj.position.addScaledVector(d.vel, dt);
    d.obj.rotation.x += d.spin.x * dt;
    d.obj.rotation.y += d.spin.y * dt;
  }
  G.drones = G.drones.filter((d) => d.alive);
  G.missiles = G.missiles.filter((m) => m.alive);
  G.drums = G.drums.filter((d) => d.alive);
}

const _prev = new THREE.Vector3();

function updateYacht(dt: number) {
  const y = G.yacht;
  if (!y || !y.alive) return;
  y.warpT += dt;
  warpStretch(y.model.body, y.warpT);
  _prev.copy(y.obj.position);

  if (y.holdAt) {
    // Parked at the rendezvous: ease in and turn to face the player.
    _v.subVectors(y.holdAt, y.obj.position);
    const d = _v.length();
    if (d > 0.01) y.obj.position.addScaledVector(_v.normalize(), Math.min(d, 0.25 * dt));
    faceDirection(y.obj, _v2.subVectors(G.player.obj.position, y.obj.position).normalize(), damp(0.5, dt));
  } else {
    y.u = wrapU(y.u + (TUNING.yacht.speed * y.speedScale * dt) / PATH_LENGTH);
    const pos = flightPath.getPointAt(y.u);
    const tan = flightPath.getTangentAt(y.u);
    const right = _v3.crossVectors(tan, UP).normalize();
    // Gentle evasive weave around the path.
    const t = G.time;
    pos.addScaledVector(right, Math.sin(t * 0.6) * 0.18).addScaledVector(UP, Math.sin(t * 0.45) * 0.12);
    y.obj.position.copy(pos);
    // Bank into the curve.
    const ahead = flightPath.getTangentAt(wrapU(y.u + 0.01));
    const turn = _v2.crossVectors(tan, ahead).y;
    const bankedUp = _v.copy(UP).addScaledVector(right, -turn * 25).normalize();
    faceDirection(y.obj, tan, damp(3, dt), bankedUp);
  }
  y.vel.subVectors(y.obj.position, _prev).divideScalar(Math.max(dt, 1e-4));

  // Engine glow flicker
  for (const g of y.model.glows) g.scale.setScalar(0.09 * rand(0.92, 1.08));
  for (const e of y.model.engines) {
    e.getWorldPosition(_v);
    G.fx.fire.emit(_v.x, _v.y, _v.z, 0, 0, 0, 0.5, 0.04, 0.005, 0x88ccff, 0x2255ff, 0.5);
  }

  // Visible damage: smoke, then fire.
  const health = y.hp / y.maxHp;
  y.smokeTimer -= dt;
  if (health < 0.65 && y.smokeTimer <= 0) {
    y.smokeTimer = 0.04 + health * 0.1;
    _v.set(rand(-0.06, 0.06), rand(0, 0.04), rand(-0.2, 0.2)).applyQuaternion(y.obj.quaternion).add(y.obj.position);
    G.fx.smoke.emit(_v.x, _v.y, _v.z, rand(-0.02, 0.02), 0.02, rand(-0.02, 0.02), 2.2, 0.04, 0.16, 0x444444, 0x222222, 0.5, 0.3);
    if (health < 0.35) G.fx.fire.emit(_v.x, _v.y, _v.z, 0, 0, 0, 0.4, 0.035, 0.01, 0xffaa44, 0xff3300, 0.8);
  }
  y.pdCooldown -= dt;
}

function updateCorvette(dt: number) {
  const c = G.corvette;
  if (!c || !c.alive) return;
  c.warpT += dt;
  _prev.copy(c.obj.position);

  if (c.crippled) {
    // Adrift, burning, and spooling up an emergency jump.
    c.jumpOut += dt;
    c.vel.multiplyScalar(Math.exp(-0.6 * dt));
    c.obj.position.addScaledVector(c.vel, dt);
    c.obj.rotateZ(dt * 0.15);
    if (Math.random() < dt * 10) {
      _v.set(rand(-0.12, 0.12), rand(-0.05, 0.08), rand(-0.4, 0.3)).applyQuaternion(c.obj.quaternion).add(c.obj.position);
      G.fx.fire.emit(_v.x, _v.y, _v.z, 0, 0.02, 0, 0.6, 0.06, 0.02, 0xffaa44, 0xff2200, 0.9);
      G.fx.smoke.emit(_v.x, _v.y, _v.z, rand(-0.03, 0.03), 0.03, rand(-0.03, 0.03), 3, 0.08, 0.3, 0x333333, 0x111111, 0.6, 0.2);
    }
    if (Math.random() < dt * 1.5) G.fx.explosion(_v, rand(0.04, 0.09), "fire", c.vel);
    // Stretch into hyperspace at the end of the charge.
    const charge = c.jumpOut - 4.5;
    if (charge > 0) c.model.body.scale.set(1 - Math.min(0.6, charge), 1 - Math.min(0.6, charge), 1 + charge * charge * 40);
    for (const g of c.model.glows) g.scale.setScalar(0.15 * (1 + Math.max(0, charge) * 4) * rand(0.9, 1.1));
    return;
  }

  warpStretch(c.model.body, c.warpT);
  const yachtAlive = G.yacht?.alive ?? false;
  const yu = G.yacht ? G.yacht.u : c.u;
  const targetU = wrapU(yu - C.trailGap / PATH_LENGTH);
  // Close the gap smoothly if it drifted (e.g. while the yacht is parked).
  const du = ((targetU - c.u + 1.5) % 1) - 0.5;
  c.u = wrapU(c.u + du * damp(0.5, dt) + (TUNING.yacht.speed * dt) / PATH_LENGTH * (yachtAlive ? 1 : 0.3));
  const pos = flightPath.getPointAt(c.u);
  const tan = flightPath.getTangentAt(c.u);
  const right = _v3.crossVectors(tan, UP).normalize();
  const t = G.time;
  pos.addScaledVector(right, Math.sin(t * 0.35) * 0.35).addScaledVector(UP, 0.15 + Math.cos(t * 0.27) * 0.2);
  c.obj.position.copy(pos);
  c.vel.subVectors(c.obj.position, _prev).divideScalar(Math.max(dt, 1e-4));

  // Face the yacht (its guns point forward), else fly along the path.
  const aimAt = yachtAlive ? _v.subVectors(G.yacht!.obj.position, c.obj.position).normalize() : tan;
  faceDirection(c.obj, aimAt, damp(1.5, dt));

  for (const g of c.model.glows) g.scale.setScalar(0.15 * rand(0.9, 1.1));
  for (const e of c.model.engines) {
    e.getWorldPosition(_v);
    G.fx.fire.emit(_v.x, _v.y, _v.z, 0, 0, 0, 0.45, 0.05, 0.006, 0xff7744, 0xff1100, 0.5);
  }

  if (G.phase !== "combat") return;

  // Missile volleys at the yacht (and the player, once provoked).
  c.missileTimer -= dt;
  if (c.missileTimer <= 0 && yachtAlive) {
    const max = C.volleyMax + c.hits;
    const size = C.volleyMin + Math.floor(Math.random() * (max - C.volleyMin + 1));
    fireMissileVolley(size, c.hits);
    c.missileTimer = C.missileInterval * (1 - c.hits * 0.12) * rand(0.85, 1.15);
  }

  // Forward cannons pound the yacht.
  c.cannonTimer -= dt;
  if (c.cannonTimer <= 0 && yachtAlive) {
    c.cannonTimer = C.cannonInterval * rand(0.8, 1.2);
    const y = G.yacht!;
    for (const gun of c.model.guns) {
      const from = gun.getWorldPosition(new THREE.Vector3());
      const flight = from.distanceTo(y.obj.position) / 2.2;
      const aim = _v.copy(y.obj.position).addScaledVector(y.vel, flight).sub(from).normalize();
      aim.x += rand(-0.01, 0.01); aim.y += rand(-0.01, 0.01);
      bolts.fire(from, aim.normalize().multiplyScalar(2.2), "enemy", C.cannonDamage, 4, 0xff3322, 0.14, 0.006);
      G.fx.flash(from, 0.08, 0xff4422, 0.12);
    }
    audio.enemyShot(volumeAt(c.obj.position));
  }

  // Drone waves
  c.droneTimer -= dt;
  if (c.droneTimer <= 0) {
    c.droneTimer = C.droneWaveInterval * (1 - c.hits * 0.15);
    c.waves++;
    launchDroneWave(Math.min(1 + c.waves + c.hits, 4));
  }

  // Point-defence against an incoming container.
  const mine = G.mine;
  if (mine) {
    const d = mine.obj.position.distanceTo(c.obj.position);
    if (d < TUNING.mine.pdRadius) {
      mine.pdExposure += dt;
      c.pdFireTimer -= dt;
      if (c.pdFireTimer <= 0) {
        c.pdFireTimer = 0.06;
        const from = c.model.guns[Math.floor(Math.random() * 2)].getWorldPosition(new THREE.Vector3());
        const dir = _v.subVectors(mine.obj.position, from).normalize();
        dir.x += rand(-0.03, 0.03); dir.y += rand(-0.03, 0.03);
        bolts.fire(from, dir.normalize().multiplyScalar(4), "fx", 0, d / 4, 0xff6644, 0.05, 0.002);
      }
    }
  }
}

function updateDrones(dt: number) {
  const p = G.player;
  for (const d of G.drones) {
    if (!d.alive) continue;
    const pos = d.obj.position;
    const desired = _v;
    if (d.state === "launch") {
      desired.copy(d.forward);
      d.stateTimer -= dt;
      if (d.stateTimer <= 0) d.state = "attack";
    } else if (d.state === "break") {
      desired.copy(d.breakDir);
      d.stateTimer -= dt;
      if (d.stateTimer <= 0) d.state = "attack";
    } else {
      const dist = pos.distanceTo(p.obj.position);
      const lead = dist / D.boltSpeed;
      desired.copy(p.obj.position).addScaledVector(p.vel, lead).sub(pos).normalize();
      if (dist < 0.28 || !p.alive) {
        d.state = "break";
        d.stateTimer = rand(1.2, 2.2);
        d.breakDir.randomDirection().addScaledVector(d.forward, 0.6).normalize();
      }
      d.fireTimer -= dt;
      if (p.alive && d.fireTimer <= 0 && dist < D.fireRange && d.forward.dot(desired) > 0.97) {
        d.fireTimer = D.fireCooldown * rand(0.8, 1.3);
        const from = d.model.guns[0].getWorldPosition(_v2);
        const shot = _v3.copy(desired);
        shot.x += rand(-0.025, 0.025); shot.y += rand(-0.025, 0.025); shot.z += rand(-0.025, 0.025);
        bolts.fire(from, shot.normalize().multiplyScalar(D.boltSpeed).add(d.vel), "enemy", D.boltDamage, 1.2, 0xff4433, 0.05, 0.0025);
        audio.enemyShot(volumeAt(pos) * 0.6);
      }
    }
    // Keep drones from stacking on top of each other.
    for (const o of G.drones) {
      if (o === d || !o.alive) continue;
      const sep = _v2.subVectors(pos, o.obj.position);
      const l = sep.length();
      if (l < 0.15 && l > 0) desired.addScaledVector(sep, (0.15 - l) * 8 / l);
    }
    desired.normalize();

    // Turn toward the desired heading at a limited rate.
    const angle = d.forward.angleTo(desired);
    const maxTurn = D.turnRate * dt;
    if (angle > 1e-4) d.forward.lerp(desired, Math.min(1, maxTurn / angle)).normalize();
    const turnSide = _v3.crossVectors(d.forward, desired).y;
    d.vel.copy(d.forward).multiplyScalar(D.speed);
    pos.addScaledVector(d.vel, dt);
    faceDirection(d.obj, d.forward);
    d.model.body.rotation.z = THREE.MathUtils.lerp(d.model.body.rotation.z, -turnSide * 6, damp(5, dt));

    const e = d.model.engines[0].getWorldPosition(_v2);
    G.fx.fire.emit(e.x, e.y, e.z, 0, 0, 0, 0.25, 0.018, 0.002, 0xff6644, 0xff1100, 0.7);
  }
}

function updateMissiles(dt: number) {
  for (const m of G.missiles) {
    if (!m.alive) continue;
    m.life -= dt;
    if (m.doomed > 0) {
      m.doomed -= dt;
      if (m.doomed <= 0) { destroyMissile(m, false); continue; }
    }
    if (m.life <= 0) { destroyMissile(m, false); continue; }

    const pos = m.obj.position;
    const target = m.target.alive ? m.target : null;
    m.speed = Math.min(M.speed, m.speed + 0.5 * dt);
    const dir = _v.copy(m.vel).normalize();
    if (target) {
      const dist = pos.distanceTo(target.obj.position);
      const desired = _v2.copy(target.obj.position).addScaledVector(target.vel, (dist / M.speed) * 0.5).sub(pos).normalize();
      const angle = dir.angleTo(desired);
      if (angle > 1e-4) dir.lerp(desired, Math.min(1, (M.turnRate * dt) / angle)).normalize();

      // The yacht's own point-defence gets one chance at each missile.
      if (target.kind === "yacht" && !m.pdChecked && dist < 0.9) {
        m.pdChecked = true;
        if (Math.random() < TUNING.yacht.pdChance) {
          m.doomed = 0.3;
          const from = target.obj.position;
          for (let i = 0; i < 3; i++) {
            const shot = _v3.subVectors(pos, from).normalize().multiplyScalar(3);
            bolts.fire(from, shot, "fx", 0, dist / 3, 0x66bbff, 0.05, 0.002);
          }
        }
      }

      if (dist < target.radius + 0.015) {
        if (target.kind === "player" && playerDodging()) {
          // Rolled clear — the missile overshoots.
        } else {
          m.alive = false;
          scene.remove(m.obj);
          if (target.kind === "yacht") damageYacht(M.damageYacht, pos);
          else if (target.kind === "player") {
            damagePlayer(M.damagePlayer, pos);
            G.fx.explosion(pos, 0.03, "fire");
          }
          audio.explosion(0.08, volumeAt(pos));
          continue;
        }
      }
    }
    m.vel.copy(dir).multiplyScalar(m.speed);
    pos.addScaledVector(m.vel, dt);
    faceDirection(m.obj, dir);

    // Smoke and flame trail
    const tail = _v2.copy(pos).addScaledVector(dir, -0.03);
    G.fx.fire.emit(tail.x, tail.y, tail.z, 0, 0, 0, 0.18, 0.016, 0.004, 0xffcc66, 0xff4400, 0.9);
    m.trailTimer -= dt;
    if (m.trailTimer <= 0) {
      m.trailTimer = 0.03;
      G.fx.smoke.emit(tail.x, tail.y, tail.z, rand(-0.01, 0.01), rand(-0.01, 0.01), rand(-0.01, 0.01), 1.6, 0.012, 0.05, 0x888888, 0x333333, 0.45, 0.4);
    }
  }
}

export function clearEnemies() {
  if (G.yacht) scene.remove(G.yacht.obj);
  if (G.corvette) scene.remove(G.corvette.obj);
  for (const d of G.drones) scene.remove(d.obj);
  for (const m of G.missiles) scene.remove(m.obj);
  for (const d of G.drums) scene.remove(d.obj);
  G.yacht = null;
  G.corvette = null;
  G.drones = [];
  G.missiles = [];
  G.drums = [];
}
