import * as THREE from "three";
import { G, emit, type Entity, type Player } from "./game";
import { TUNING, clamp, damp, lerp, rand } from "./config";
import { createPlayerShip } from "./models";
import { input } from "./input";
import { audio } from "./audio";
import { BASE_FOV, camera, isTouch, scene } from "./renderer";
import { bolts } from "./weapons";

// The Space Refuse Collector MK-IV: arcade flight model, guns, dodge roll,
// shields and the chase camera.
//
// Flight model: yaw turns around world "up" and pitch is clamped short of
// vertical, so the horizon always stays level and there is no roll to manage.

const P = TUNING.player;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, "YXZ");
const _muzzle = new THREE.Vector3();
const _right = new THREE.Vector3();

export function createPlayer(): Player {
  const model = createPlayerShip();
  scene.add(model.root);
  const p: Player = {
    kind: "player",
    obj: model.root,
    model,
    vel: new THREE.Vector3(),
    radius: P.collisionRadius,
    hp: P.hull,
    maxHp: P.hull,
    alive: true,
    label: "MK-IV",
    yaw: 0, pitch: 0, yawVel: 0, pitchVel: 0, bank: 0,
    throttle: P.startThrottle,
    speed: 0,
    shield: P.shield,
    lastHitTime: -100,
    boostEnergy: P.boostMax,
    boosting: false,
    gunCooldown: 0,
    gunSide: 0,
    dodgeTime: 0,
    dodgeCooldown: 0,
    dodgeDir: 1,
    strafe: new THREE.Vector3(),
    containers: TUNING.mine.rackSize,
    reloadTimer: 0,
    forward: new THREE.Vector3(0, 0, -1),
  };
  return p;
}

export function resetPlayer(p: Player) {
  p.obj.position.set(0, 0, 0);
  p.yaw = p.pitch = p.yawVel = p.pitchVel = p.bank = 0;
  p.throttle = P.startThrottle;
  p.speed = P.maxSpeed * P.startThrottle;
  p.hp = P.hull;
  p.shield = P.shield;
  p.alive = true;
  p.lastHitTime = -100;
  p.boostEnergy = P.boostMax;
  p.boosting = false;
  p.dodgeTime = p.dodgeCooldown = 0;
  p.strafe.set(0, 0, 0);
  p.containers = TUNING.mine.rackSize;
  p.reloadTimer = 0;
  p.model.root.visible = true;
  setCargoVisible(true);
  applyOrientation(p);
  camQuat.copy(p.obj.quaternion);
}

export function setCargoVisible(visible: boolean) {
  for (const c of G.player.model.cargo) c.visible = visible;
}

function applyOrientation(p: Player) {
  _e.set(p.pitch, p.yaw, 0, "YXZ");
  p.obj.quaternion.setFromEuler(_e);
  p.forward.set(0, 0, -1).applyQuaternion(p.obj.quaternion);
}

/** Is the player invulnerable right now (mid dodge roll)? */
export function playerDodging(): boolean {
  return G.player.dodgeTime > 0;
}

export function damagePlayer(amount: number, from: THREE.Vector3) {
  const p = G.player;
  if (!p.alive) return;
  p.lastHitTime = G.time;
  G.damageDir.copy(from).sub(p.obj.position).normalize();
  G.damageTime = G.time;

  const absorbed = Math.min(p.shield, amount);
  p.shield -= absorbed;
  const through = amount - absorbed;
  if (absorbed > 0) {
    audio.shieldHit();
    G.fx.flash(_v.copy(from).sub(p.obj.position).setLength(0.03).add(p.obj.position), 0.05, 0x55aaff, 0.2);
  }
  if (through > 0) {
    p.hp -= through;
    audio.hullHit();
    G.fx.sparksAt(p.obj.position, 14, 0xffaa55, 0.25, 0.004, 0.4, p.vel);
    G.fx.shake(0.35);
  } else {
    G.fx.shake(0.12);
  }
  if (p.hp <= 0) killPlayer();
}

function killPlayer() {
  const p = G.player;
  p.hp = 0;
  p.alive = false;
  G.fx.explosion(p.obj.position, 0.12, "fire", p.vel);
  G.fx.explosion(_v.copy(p.obj.position).addScaledVector(p.forward, 0.03), 0.07, "fire");
  G.fx.shake(1);
  audio.bigBoom();
  p.model.root.visible = false;
}

// --- Aim assist -------------------------------------------------------------

function aimCandidates(): Entity[] {
  const list: Entity[] = [];
  for (const d of G.drones) if (d.alive) list.push(d);
  for (const m of G.missiles) if (m.alive && m.doomed <= 0) list.push(m);
  for (const d of G.drums) if (d.alive) list.push(d);
  return list;
}

/** Picks the target nearest the crosshair and computes where to lead it. */
function updateAimAssist(p: Player) {
  const cone = Math.cos(THREE.MathUtils.degToRad(P.aimAssistDeg));
  const range = P.bulletSpeed * P.bulletLife;
  let best: Entity | null = null;
  let bestDot = cone;
  for (const e of aimCandidates()) {
    _v.subVectors(e.obj.position, p.obj.position);
    const dist = _v.length();
    if (dist > range || dist < 0.02) continue;
    const dot = _v.dot(p.forward) / dist;
    if (dot > bestDot) { bestDot = dot; best = e; }
  }
  G.aimTarget = best;
  if (best) {
    // Two iterations of intercept time are plenty at these speeds.
    const speed = P.bulletSpeed + p.speed;
    let t = best.obj.position.distanceTo(p.obj.position) / speed;
    for (let i = 0; i < 2; i++) {
      G.aimPoint.copy(best.obj.position).addScaledVector(best.vel, t).addScaledVector(p.vel, -t * 0.5);
      t = G.aimPoint.distanceTo(p.obj.position) / speed;
    }
  } else {
    G.aimPoint.copy(p.obj.position).addScaledVector(p.forward, 2);
  }
}

function fireGuns(p: Player) {
  p.gunCooldown = P.gunCooldown;
  const gun = p.model.guns[p.gunSide];
  p.gunSide = 1 - p.gunSide;
  gun.getWorldPosition(_muzzle);
  _v.subVectors(G.aimPoint, _muzzle).normalize();
  // Never bend a shot more than the assist cone allows.
  if (_v.dot(p.forward) < Math.cos(THREE.MathUtils.degToRad(P.aimAssistDeg + 1))) _v.copy(p.forward);
  _v2.copy(_v).multiplyScalar(P.bulletSpeed).addScaledVector(p.forward, p.speed);
  bolts.fire(_muzzle, _v2, "player", 1, P.bulletLife, 0x44ffaa, 0.06, 0.0018);
  G.fx.flash(_muzzle, 0.018, 0x66ffbb, 0.06, 1.2);
  G.stats.shots++;
  audio.laser();
}

// --- Per-frame update -------------------------------------------------------

export function updatePlayer(dt: number, controls: boolean) {
  const p = G.player;
  if (!p.alive) {
    p.vel.multiplyScalar(Math.exp(-dt));
    p.obj.position.addScaledVector(p.vel, dt);
    return;
  }

  const steerX = controls ? input.steerX : 0;
  const steerY = controls ? input.steerY : 0;

  // Throttle (touch players get a fixed cruise speed; boost is their accelerator).
  if (controls && !isTouch) {
    if (input.throttleUp) p.throttle += P.throttleRate * dt;
    if (input.throttleDown) p.throttle -= P.throttleRate * dt;
  } else if (controls) {
    p.throttle = 0.7;
  } else {
    p.throttle = lerp(p.throttle, 0.25, damp(1, dt)); // coast while the results are up
  }
  p.throttle = clamp(p.throttle, 0, 1);

  // Boost with a small latch so it doesn't flicker at an empty tank.
  const wantBoost = controls && input.boost;
  if (wantBoost && !p.boosting && p.boostEnergy > 20) {
    p.boosting = true;
    audio.dodge();
    for (const e of p.model.engines) G.fx.flash(e.getWorldPosition(_v), 0.05, 0xffaa55, 0.25);
  }
  if (!wantBoost || p.boostEnergy <= 0) p.boosting = false;
  if (p.boosting) p.boostEnergy = Math.max(0, p.boostEnergy - P.boostDrain * dt);
  else p.boostEnergy = Math.min(P.boostMax, p.boostEnergy + P.boostRegen * dt);

  // Turning
  const turnScale = p.boosting ? 0.8 : 1;
  p.yawVel = lerp(p.yawVel, -steerX * P.yawRate * turnScale, damp(7, dt));
  p.pitchVel = lerp(p.pitchVel, steerY * P.pitchRate * turnScale, damp(7, dt));
  p.yaw += p.yawVel * dt;
  p.pitch = clamp(p.pitch + p.pitchVel * dt, -P.maxPitch, P.maxPitch);
  applyOrientation(p);

  // Speed
  const targetSpeed = p.boosting ? P.boostSpeed : p.throttle * P.maxSpeed;
  const accel = p.boosting ? P.accel * 2 : P.accel;
  if (p.speed < targetSpeed) p.speed = Math.min(targetSpeed, p.speed + accel * dt);
  else p.speed = Math.max(targetSpeed, p.speed - accel * dt);

  // Dodge roll
  p.dodgeCooldown -= dt;
  if (controls && p.dodgeCooldown <= 0) {
    const dir = input.take("dodgeLeft") ? -1 : input.take("dodgeRight") ? 1 : 0;
    if (dir !== 0) {
      p.dodgeDir = dir;
      p.dodgeTime = P.dodgeDuration;
      p.dodgeCooldown = P.dodgeCooldown;
      _right.set(1, 0, 0).applyQuaternion(p.obj.quaternion);
      p.strafe.addScaledVector(_right, dir * P.dodgeStrafe);
      audio.dodge();
    }
  } else {
    input.take("dodgeLeft");
    input.take("dodgeRight");
  }
  p.dodgeTime = Math.max(0, p.dodgeTime - dt);
  p.strafe.multiplyScalar(Math.exp(-4.5 * dt));

  p.vel.copy(p.forward).multiplyScalar(p.speed).add(p.strafe);
  p.obj.position.addScaledVector(p.vel, dt);

  // Visual bank into turns plus the dodge spin, applied to the body only.
  p.bank = lerp(p.bank, p.yawVel * 0.5, damp(6, dt));
  const rollProgress = p.dodgeTime > 0 ? 1 - p.dodgeTime / P.dodgeDuration : 0;
  const rollEase = rollProgress * rollProgress * (3 - 2 * rollProgress);
  p.model.body.rotation.z = p.bank - p.dodgeDir * rollEase * Math.PI * 2;
  p.model.body.rotation.x = p.pitchVel * 0.08;

  // Engine glow and exhaust trail scale with thrust.
  const thrust = p.boosting ? 1.6 : 0.5 + (p.speed / P.maxSpeed) * 0.6;
  for (const g of p.model.glows) g.scale.setScalar(0.014 * thrust * rand(0.9, 1.1));
  for (const e of p.model.engines) {
    e.getWorldPosition(_v);
    const color = p.boosting ? 0xffcc66 : 0xff8833;
    G.fx.fire.emit(_v.x, _v.y, _v.z, p.vel.x * 0.6, p.vel.y * 0.6, p.vel.z * 0.6,
      p.boosting ? 0.3 : 0.16, 0.005 * thrust, 0.001, color, 0xff3300, 0.55);
  }

  // Shields recharge after a quiet spell.
  if (G.time - p.lastHitTime > P.shieldRegenDelay) p.shield = Math.min(P.shield, p.shield + P.shieldRegenRate * dt);

  // Container rack: the compactor slowly squeezes out replacements.
  if (p.containers < TUNING.mine.rackSize) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) {
      p.containers++;
      setCargoVisible(true);
      audio.reload();
      emit({ type: "containerReady" });
      if (p.containers < TUNING.mine.rackSize) p.reloadTimer = TUNING.mine.reloadSeconds;
    }
  }

  // Guns
  updateAimAssist(p);
  p.gunCooldown -= dt;
  if (controls && input.fire && p.gunCooldown <= 0) fireGuns(p);

  collide(p, dt);
}

// --- Collisions with rocks and big ships -----------------------------------

let bumpCooldown = 0;

function collide(p: Player, dt: number) {
  bumpCooldown -= dt;
  const pos = p.obj.position;
  const test = (center: THREE.Vector3, radius: number, damage: number) => {
    const r = radius + p.radius;
    const dSq = pos.distanceToSquared(center);
    if (dSq > r * r) return;
    const d = Math.sqrt(dSq) || 0.0001;
    _v.subVectors(pos, center).divideScalar(d);
    pos.copy(center).addScaledVector(_v, r);
    if (bumpCooldown <= 0) {
      bumpCooldown = 0.6;
      p.speed *= 0.3;
      p.strafe.addScaledVector(_v, 0.4);
      if (damage > 0) damagePlayer(damage, center);
      else audio.shieldHit();
      G.fx.sparksAt(_v2.copy(pos).addScaledVector(_v, -p.radius), 20, 0xffcc88, 0.3, 0.004, 0.5);
    }
  };
  for (const rock of G.world.rocks) {
    if (Math.abs(rock.pos.x - pos.x) > 1.2 || Math.abs(rock.pos.z - pos.z) > 1.2) continue;
    test(rock.pos, rock.radius, 6);
  }
  if (G.yacht?.alive) test(G.yacht.obj.position, G.yacht.radius, 0); // the yacht's shields just nudge you off
  if (G.corvette?.alive) test(G.corvette.obj.position, G.corvette.radius, 6);
}

// --- Chase camera -----------------------------------------------------------

const camQuat = new THREE.Quaternion();
const _offset = new THREE.Vector3();
const _shake = new THREE.Vector3();
let fov = BASE_FOV;

export function updateCamera(dt: number, realDt: number) {
  const p = G.player;
  // Rotation lags a little behind the ship so turns feel weighty and the
  // ship swings visibly across the screen.
  if (p.alive) camQuat.slerp(p.obj.quaternion, damp(6.5, dt));
  const speedFactor = clamp(p.speed / P.maxSpeed, 0, 2);
  const pull = p.alive ? 0.2 + speedFactor * 0.012 + (p.boosting ? 0.03 : 0) : 0.6;
  _offset.set(0, 0.045, pull).applyQuaternion(camQuat);
  camera.position.copy(p.obj.position).add(_offset);
  camera.quaternion.copy(camQuat);
  if (dt > 0) camera.position.add(G.fx.shakeOffset(_shake).applyQuaternion(camQuat)); // frozen while paused

  const targetFov = BASE_FOV + (p.boosting ? 12 : 0) + speedFactor * 3;
  fov = lerp(fov, targetFov, damp(4, realDt));
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  // The HUD projects markers with this camera before the render updates it.
  camera.updateMatrixWorld();
}
