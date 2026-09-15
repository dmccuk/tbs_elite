import * as THREE from "three";
import { G, emit, type Entity, type Player } from "./game";
import { SHIPS, TUNING, clamp, damp, lerp, rand, type ShipId, type ShipStats } from "./config";
import { createPlayerShip, type ShipModel } from "./models";
import { createSeagull } from "./models-frontier";
import { input } from "./input";
import { audio } from "./audio";
import { BASE_FOV, camera, isTouch, scene } from "./renderer";
import { bolts } from "./weapons";

// The player's ship — the MK-IV garbage hauler (Chapter 1) or a Seagull patrol
// fighter (Prologue): arcade flight model, guns, dodge roll, shields, match
// speed and the chase camera.
//
// Flight model: yaw turns around world "up" and pitch is clamped short of
// vertical, so the horizon always stays level and there is no roll to manage.

const P = TUNING.player;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, "YXZ");
const _muzzle = new THREE.Vector3();
const _right = new THREE.Vector3();
const _aim = { x: 0, y: 0 };

// Each ship's model is built once and swapped in when a mission starts.
const models: Partial<Record<ShipId, ShipModel>> = {};
let S: ShipStats = SHIPS.mk4;

/** Stats of the ship the player is flying now. */
export function shipStats(): ShipStats {
  return S;
}

function modelFor(id: ShipId): ShipModel {
  return (models[id] ??= id === "seagull" ? createSeagull() : createPlayerShip());
}

export function createPlayer(): Player {
  const model = modelFor("mk4");
  scene.add(model.root);
  const p: Player = {
    kind: "player",
    obj: model.root,
    model,
    vel: new THREE.Vector3(),
    radius: P.collisionRadius,
    hp: S.hull,
    maxHp: S.hull,
    alive: true,
    label: S.label,
    yaw: 0, pitch: 0, yawVel: 0, pitchVel: 0, bank: 0, aimYaw: 0, aimPitch: 0,
    throttle: P.startThrottle,
    speed: 0,
    shield: S.shield,
    maxShield: S.shield,
    matchSpeed: false,
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
    missiles: S.missiles,
    captured: false,
    forward: new THREE.Vector3(0, 0, -1),
  };
  return p;
}

/** Swap the player into another ship (on mission start). Call resetPlayer() after. */
export function setPlayerShip(id: ShipId) {
  const p = G.player;
  G.shipId = id;
  S = SHIPS[id];
  const model = modelFor(id);
  if (model !== p.model) {
    scene.remove(p.model.root);
    scene.add(model.root);
    p.model = model;
    p.obj = model.root;
  }
  p.label = S.label;
}

/** Start the player at `pos`, heading `yaw` (radians; 0 faces -Z). */
export function resetPlayer(p: Player, pos = new THREE.Vector3(), yaw = 0) {
  p.obj.position.copy(pos);
  p.yaw = p.aimYaw = yaw;
  p.pitch = p.yawVel = p.pitchVel = p.bank = p.aimPitch = 0;
  p.throttle = P.startThrottle;
  p.speed = S.maxSpeed * P.startThrottle;
  p.hp = p.maxHp = S.hull;
  p.shield = p.maxShield = S.shield;
  p.matchSpeed = false;
  p.alive = true;
  p.lastHitTime = -100;
  p.boostEnergy = P.boostMax;
  p.boosting = false;
  p.dodgeTime = p.dodgeCooldown = 0;
  p.strafe.set(0, 0, 0);
  p.containers = TUNING.mine.rackSize;
  p.reloadTimer = 0;
  p.missiles = S.missiles;
  p.captured = false;
  p.model.root.visible = true;
  setCargoVisible(true);
  applyOrientation(p);
  camQuat.copy(p.obj.quaternion);
}

/** Jump the player somewhere else mid-mission (the prologue's burn), keeping speed and state. */
export function teleportPlayer(pos: THREE.Vector3, yaw: number) {
  const p = G.player;
  p.obj.position.copy(pos);
  p.yaw = p.aimYaw = yaw;
  p.pitch = p.aimPitch = p.yawVel = p.pitchVel = 0;
  p.strafe.set(0, 0, 0);
  applyOrientation(p);
  camQuat.copy(p.obj.quaternion);
}

/** Place and orient the ship directly (the Kessler's arrestor field and catapult use this). */
export function setPlayerPose(pos: THREE.Vector3, yaw: number, pitch: number) {
  const p = G.player;
  p.obj.position.copy(pos);
  p.yaw = p.aimYaw = yaw;
  p.pitch = p.aimPitch = pitch;
  p.yawVel = p.pitchVel = 0;
  p.bank = 0;
  p.model.body.rotation.set(0, 0, 0);
  applyOrientation(p);
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

const ASSIST_COS = Math.cos(THREE.MathUtils.degToRad(P.aimAssistDeg));
const ENGINE_ASSIST_COS = Math.cos(THREE.MathUtils.degToRad(TUNING.prologue.shuttle.engineAssistDeg));
const _candidates: Entity[] = [];

function aimCandidates(): Entity[] {
  const list = _candidates;
  list.length = 0;
  for (const d of G.drones) if (d.alive) list.push(d);
  for (const m of G.missiles) if (m.alive && m.doomed <= 0) list.push(m);
  for (const d of G.drums) if (d.alive) list.push(d);
  for (const f of G.fighters) if (f.alive) list.push(f);
  const s = G.shuttle;
  if (s?.alive && s.state === "fleeing" && s.engines.alive) list.push(s.engines);
  return list;
}

/** Picks the target nearest the crosshair and computes where to lead it. */
function updateAimAssist(p: Player) {
  const range = S.bulletSpeed * S.bulletLife;
  let best: Entity | null = null;
  let bestScore = 0;
  for (const e of aimCandidates()) {
    _v.subVectors(e.obj.position, p.obj.position);
    const dist = _v.length();
    if (dist > range || dist < 0.02) continue;
    const dot = _v.dot(p.forward) / dist;
    // The shuttle's engines only pull shots from a narrow cone, so aim still matters.
    const cone = e.kind === "engines" ? ENGINE_ASSIST_COS : ASSIST_COS;
    if (dot <= cone) continue;
    const score = (dot - cone) / (1 - cone);
    if (score > bestScore) { bestScore = score; best = e; }
  }
  G.aimTarget = best;
  if (best) {
    // Two iterations of intercept time are plenty at these speeds.
    const speed = S.bulletSpeed + p.speed;
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
  p.gunCooldown = S.gunCooldown;
  const gun = p.model.guns[p.gunSide % p.model.guns.length];
  p.gunSide = 1 - p.gunSide;
  gun.getWorldPosition(_muzzle);
  _v.subVectors(G.aimPoint, _muzzle).normalize();
  // Never bend a shot more than the assist cone allows.
  if (_v.dot(p.forward) < Math.cos(THREE.MathUtils.degToRad(P.aimAssistDeg + 1))) _v.copy(p.forward);
  _v2.copy(_v).multiplyScalar(S.bulletSpeed).addScaledVector(p.forward, p.speed);
  bolts.fire(_muzzle, _v2, "player", S.gunDamage, S.bulletLife, S.boltColor, S.boltLength, S.boltWidth);
  G.fx.flash(_muzzle, 0.028, S.flashColor, 0.07, 1.4);
  G.stats.shots++;
  if (S.gunSound === "coilgun") audio.coilgun();
  else audio.laser();
}

// --- Per-frame update -------------------------------------------------------

export function updatePlayer(dt: number, controls: boolean) {
  const p = G.player;
  input.takeAimDelta(_aim); // always drain, so movement never banks up while dead
  if (!p.alive) {
    p.vel.multiplyScalar(Math.exp(-dt));
    p.obj.position.addScaledVector(p.vel, dt);
    return;
  }

  if (p.captured) {
    // The Kessler's arrestor field has the ship (kessler.ts moves it).
    p.boosting = false;
    p.matchSpeed = false;
    for (const g of p.model.glows) g.scale.setScalar(0.008);
    return;
  }

  // Steering. In mouse-aim mode the ship chases the aim circle, which the mouse
  // pushes around; keys, the touch stick and joystick-mode mouse steer directly.
  const aiming = controls && input.mouseAim && !input.keySteering;
  let steerX = controls ? input.steerX : 0;
  let steerY = controls ? input.steerY : 0;
  if (aiming) {
    p.aimYaw = p.yaw + clamp(p.aimYaw - _aim.x * P.mouseAimSensitivity - p.yaw, -P.mouseAimLead, P.mouseAimLead);
    p.aimPitch = clamp(p.pitch + clamp(p.aimPitch - _aim.y * P.mouseAimSensitivity - p.pitch, -P.mouseAimLead, P.mouseAimLead), -P.maxPitch, P.maxPitch);
    steerX = clamp((p.yaw - p.aimYaw) * P.mouseAimGain, -1, 1);
    steerY = clamp((p.aimPitch - p.pitch) * P.mouseAimGain, -1, 1);
  }

  // Throttle (touch players get a fixed cruise speed; boost is their accelerator).
  if (controls && !isTouch) {
    if (input.throttleUp) p.throttle += P.throttleRate * dt;
    if (input.throttleDown) p.throttle -= P.throttleRate * dt;
    if (input.throttleUp || input.throttleDown) p.matchSpeed = false; // manual throttle takes over
  } else if (controls) {
    p.throttle = G.touchThrottle;
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
  p.yawVel = lerp(p.yawVel, -steerX * S.yawRate * turnScale, damp(7, dt));
  p.pitchVel = lerp(p.pitchVel, steerY * S.pitchRate * turnScale, damp(7, dt));
  p.yaw += p.yawVel * dt;
  p.pitch = clamp(p.pitch + p.pitchVel * dt, -P.maxPitch, P.maxPitch);
  applyOrientation(p);
  // Whenever something else is steering, the aim circle rides on the nose.
  if (!aiming) { p.aimYaw = p.yaw; p.aimPitch = p.pitch; }

  // Speed. Match speed closes on the target and settles a little behind it.
  let targetSpeed = p.boosting ? S.boostSpeed : p.throttle * S.maxSpeed;
  if (p.matchSpeed) {
    const t = G.target;
    if (!controls || !t || !t.alive || t === p) p.matchSpeed = false;
    else if (!p.boosting) {
      const gap = t.obj.position.distanceTo(p.obj.position) - P.matchGap;
      targetSpeed = clamp(t.vel.length() + gap * 0.9, 0, S.maxSpeed);
    }
  }
  const accel = p.boosting ? S.accel * 2 : S.accel;
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
  const thrust = p.boosting ? 1.6 : 0.5 + (p.speed / S.maxSpeed) * 0.6;
  for (const g of p.model.glows) g.scale.setScalar(0.014 * thrust * rand(0.9, 1.1));
  for (const e of p.model.engines) {
    e.getWorldPosition(_v);
    const color = p.boosting ? 0xffcc66 : 0xff8833;
    G.fx.fire.emit(_v.x, _v.y, _v.z, p.vel.x * 0.6, p.vel.y * 0.6, p.vel.z * 0.6,
      p.boosting ? 0.3 : 0.16, 0.005 * thrust, 0.001, color, 0xff3300, 0.55);
  }

  // Shields recharge after a quiet spell.
  if (G.time - p.lastHitTime > P.shieldRegenDelay) p.shield = Math.min(p.maxShield, p.shield + P.shieldRegenRate * dt);

  // Container rack: the compactor slowly squeezes out replacements.
  if (S.special === "cargo" && p.containers < TUNING.mine.rackSize) {
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
  if (G.relay) test(G.relay.obj.position, G.relay.radius, 4);
  if (G.shuttle?.alive) test(G.shuttle.obj.position, G.shuttle.radius, 4);
}

// --- Chase camera -----------------------------------------------------------

const camQuat = new THREE.Quaternion();
const _offset = new THREE.Vector3();
const _shake = new THREE.Vector3();
let fov = BASE_FOV;
let bayBlend = 0;

export function updateCamera(dt: number, realDt: number) {
  const p = G.player;
  // Rotation lags a little behind the ship so turns feel weighty and the
  // ship swings visibly across the screen.
  if (p.alive) camQuat.slerp(p.obj.quaternion, damp(6.5, dt));
  const speedFactor = clamp(p.speed / S.maxSpeed, 0, 2);
  // Inside the Kessler's bay the camera tucks in close so it stays in the tunnel.
  const inBay = G.dock.inTunnel || p.captured;
  bayBlend = lerp(bayBlend, inBay ? 1 : 0, damp(4, realDt));
  const pull = p.alive ? lerp(0.2 + speedFactor * 0.012 + (p.boosting ? 0.03 : 0), 0.085, bayBlend) : 0.6;
  _offset.set(0, lerp(0.045, 0.016, bayBlend), pull).applyQuaternion(camQuat);
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
