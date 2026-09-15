import * as THREE from "three";
import { G, addScore, emit, type Fighter } from "./game";
import { SCORE, TUNING, clamp, damp, lerp, rand } from "./config";
import { createDrazzan, type DrazzanModel } from "./models-drazzan";
import { scene } from "./renderer";
import { audio } from "./audio";
import { bolts } from "./weapons";
import { faceDirection, volumeAt } from "./enemies";

// The Academy sim's Drazzan squadron (GV-K707d). They're Fighters in G.fighters
// (so targeting, aim assist, the radar and brackets all just work) with an
// `alien` brain that this module flies; the pirate AI in frontier.ts skips them.
//
// How they hunt, from the story: no formation, just a fluid pack. Between runs
// each one stalks a station around the player; the squadron orders attack runs,
// often two at once from above and below (a pincer), more often as they lose
// ships. They open fire early, break off when they pass or get hit hard, and
// while the player's engines are cold they lose him and overshoot. The first one
// knocked down hard has its forward sensor array shot out: it limps off to the
// edge of the scope, repairing, and comes back when it's the last one left.
// The last one standing can't be finished — the simulation isn't allowed to end
// that way (missions/academy.ts cuts the power instead).

const D = TUNING.academy.drazzan;
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _prev = new THREE.Vector3();
const models: DrazzanModel[] = [];

/** Spawn order, kept after they die (for the HUD pips). */
let squad: Fighter[] = [];
let attackClock = 0;
let kills = 0;
/** Where the player was when he went cold: that's all they have to aim at. */
const lastSeen = new THREE.Vector3();
const lastSeenVel = new THREE.Vector3();
let firstShot = false;

export const drazzanAlive = () => G.fighters.filter((f) => f.alien && f.alive);
export const drazzanSquad = () => squad;

export function resetDrazzan() {
  squad = [];
  attackClock = 0;
  kills = 0;
  firstShot = false;
}

/** Four contacts, four vectors: port low, starboard high, two dead ahead at staggered heights and ranges. */
export function spawnDrazzan() {
  const p = G.player;
  const vectors: [number, number, number, number][] = [
    [-1, -0.35, -0.35, 1.0],
    [1, 0.42, -0.25, 1.05],
    [-0.12, 0.16, -1, 0.9],
    [0.16, -0.2, -1, 1.2],
  ];
  squad = [];
  vectors.forEach(([x, y, z, range], i) => {
    const model = (models[i] ??= createDrazzan());
    const dir = new THREE.Vector3(x, y, z).normalize().applyQuaternion(p.obj.quaternion);
    model.root.position.copy(p.obj.position).addScaledVector(dir, TUNING.academy.contactRange * range);
    const forward = dir.clone().negate();
    faceDirection(model.root, forward);
    model.body.rotation.set(0, 0, 0);
    model.eye.material.color.setHex(0xff2030).multiplyScalar(3.2);
    model.root.scale.setScalar(0.01);
    scene.add(model.root);
    const f: Fighter = {
      kind: "fighter", obj: model.root, model, vel: forward.clone().multiplyScalar(D.attackSpeed), radius: 0.034,
      hp: D.hp, maxHp: D.hp, alive: true, label: "DRAZZAN FIGHTER",
      state: "attack", stateTimer: 0, fireTimer: rand(0.3, 1.2), burstLeft: 0, forward,
      breakDir: new THREE.Vector3(), aimAt: p, orbit: rand(0, 20), smokeTimer: 0, fleeTime: 0, // orbit: jink phase
      alien: { mode: "attack", modeTime: 0, station: dir.clone(), crippled: false, appear: 0, runHits: 0 },
    };
    // The opening, as in the story: one opens fire early, two come in as a pincer a moment
    // later, and the fourth hangs back to see how the prey reacts.
    if (i < 2) { f.alien!.mode = "stalk"; f.alien!.modeTime = -2.5; }
    if (i === 3) { f.alien!.mode = "stalk"; f.alien!.modeTime = -8; }
    G.fighters.push(f);
    squad.push(f);
    G.fx.flash(model.root.position, 0.08, 0xb060ff, 0.35);
  });
  attackClock = D.attackGap * 1.5;
  kills = 0;
  lastSeen.copy(p.obj.position);
}

// --- Damage -----------------------------------------------------------------------

export function damageDrazzan(f: Fighter, amount: number, at: THREE.Vector3) {
  const b = f.alien;
  if (!f.alive || !b) return;
  const alive = drazzanAlive();
  f.hp -= amount;
  G.fx.sparksAt(at, 12, 0xff88cc, 0.28, 0.005, 0.3, f.vel);
  G.fx.flash(at, 0.03, 0xff66cc, 0.1);
  // The sensor array: the first one knocked down hard, with others still flying, goes blind.
  if (!b.crippled && f.hp > 0 && f.hp <= f.maxHp * D.crippleAt && alive.length === 3 && !alive.some((o) => o.alien?.crippled)) {
    b.crippled = true;
    setMode(f, "blind");
    (f.model as DrazzanModel).eye.material.color.setHex(0x331015);
    G.fx.sparksAt(f.obj.position, 30, 0xff3355, 0.4, 0.006, 0.5, f.vel);
    G.fx.flash(f.obj.position, 0.07, 0xff2244, 0.3);
    emit({ type: "drazzanCrippled" });
  } else if (b.mode === "attack" && ++b.runHits >= 4 && Math.random() < 0.5) {
    // Resistance: they respect prey that fights back — take enough of it and they reassess, come round again.
    setMode(f, "break");
  }
  // The last one standing can't die: the simulation isn't allowed to end that way.
  if (alive.length === 1) f.hp = Math.max(1, f.hp);
  if (f.hp <= 0) destroyDrazzan(f);
}

function destroyDrazzan(f: Fighter) {
  if (!f.alive) return;
  f.alive = false;
  scene.remove(f.obj);
  G.fx.explosion(f.obj.position, 0.1, "fire", f.vel);
  G.fx.flash(f.obj.position, 0.12, 0xb060ff, 0.4);
  audio.explosion(0.16, volumeAt(f.obj.position));
  G.stats.fighters++;
  addScore(SCORE.academy.kill, f.obj.position);
  kills++;
  emit({ type: "drazzanKilled", left: drazzanAlive().length });
}

// --- Flying -----------------------------------------------------------------------

function setMode(f: Fighter, mode: NonNullable<Fighter["alien"]>["mode"]) {
  const b = f.alien!;
  b.mode = mode;
  b.modeTime = 0;
  b.runHits = 0;
  f.state = mode === "break" ? "break" : mode === "blind" ? "flee" : "attack";
  if (mode === "break") {
    // Pull away past the player, up or down and to one side.
    f.breakDir.copy(f.forward).addScaledVector(_v.randomDirection(), 0.9).addScaledVector(UP, rand(-0.5, 0.5)).normalize();
  }
  if (mode === "stalk") b.station.randomDirection().addScaledVector(UP, rand(-0.3, 0.3)).normalize();
}

/** Order the next attack run: one fighter, or a pincer from above and below. */
function orderAttacks(list: Fighter[]) {
  const ready = list.filter((f) => !f.alien!.crippled && f.alien!.mode === "stalk" && f.alien!.modeTime > 1);
  if (ready.length === 0) return;
  const p = G.player;
  ready.sort((a, b) => a.obj.position.distanceToSquared(p.obj.position) - b.obj.position.distanceToSquared(p.obj.position));
  const pincer = ready.length >= 2 && Math.random() < 0.45 + kills * 0.2;
  for (const f of pincer ? ready.slice(0, 2) : ready.slice(0, 1)) setMode(f, "attack");
  attackClock = D.attackGap * (1 - kills * 0.18) * rand(0.8, 1.2);
}

function steer(forward: THREE.Vector3, desired: THREE.Vector3, rate: number, dt: number) {
  const angle = forward.angleTo(desired);
  if (angle > 1e-4) forward.lerp(desired, Math.min(1, (rate * dt) / angle)).normalize();
}

function fire(f: Fighter, aim: THREE.Vector3, spread: number) {
  const gun = f.model.guns[f.burstLeft % f.model.guns.length].getWorldPosition(_v2);
  const shot = _v3.copy(aim);
  shot.x += rand(-spread, spread); shot.y += rand(-spread, spread); shot.z += rand(-spread, spread);
  bolts.fire(gun, shot.normalize().multiplyScalar(D.boltSpeed).add(f.vel), "enemy", D.boltDamage, 1.1, 0xd04dff, 0.06, 0.0028);
  audio.enemyShot(volumeAt(f.obj.position) * 0.55);
  if (!firstShot) {
    firstShot = true;
    emit({ type: "drazzanFiring" });
  }
}

export function updateDrazzan(dt: number) {
  const list = drazzanAlive();
  if (list.length === 0 || dt <= 0) return;
  const p = G.player;
  const hunting = G.phase === "combat" && p.alive;
  const cold = p.cold > 0;
  if (!cold) {
    lastSeen.copy(p.obj.position);
    lastSeenVel.copy(p.vel);
  } else {
    lastSeen.addScaledVector(lastSeenVel, dt); // dead reckoning on where he was going
  }
  attackClock -= dt;
  if (hunting && !cold && attackClock <= 0) orderAttacks(list);
  const last = list.length === 1;

  for (const f of list) {
    const b = f.alien!;
    const pos = f.obj.position;
    b.modeTime += dt;
    // Shimmering into existence: "like predators emerging from tall grass".
    if (b.appear < 1) {
      b.appear = Math.min(1, b.appear + dt / 0.9);
      f.obj.scale.setScalar(0.25 + 0.75 * b.appear);
      f.obj.visible = b.appear > 0.95 || Math.random() < 0.35 + b.appear * 0.6;
    }
    const desired = _v;
    let speed = D.speed;
    let turn = D.turnRate;
    const toPlayer = _prev.subVectors(p.obj.position, pos);
    const dist = toPlayer.length();

    // The blinded one comes back for the end: slowly, unevenly, but committed.
    if (b.mode === "blind" && (last || b.modeTime > D.repairSeconds)) {
      setMode(f, "final");
      (f.model as DrazzanModel).eye.material.color.setHex(0xff2030).multiplyScalar(1.2);
    }

    switch (b.mode) {
      case "stalk": {
        // Hang off at a station ~1.8 km out, drifting round the player.
        b.station.applyAxisAngle(UP, dt * 0.25);
        desired.copy(p.obj.position).addScaledVector(b.station, 1.8).sub(pos);
        const d = desired.length();
        desired.normalize();
        speed = d > 0.6 ? D.speed : D.speed * 0.8;
        if (!hunting) break;
        if (b.modeTime > 7 && !cold) setMode(f, "attack"); // don't wait for orders forever
        break;
      }
      case "attack":
      case "final": {
        // Lead the target (or where he was, if he's gone cold).
        const target = cold ? lastSeen : p.obj.position;
        const tvel = cold ? lastSeenVel : p.vel;
        const lead = dist / (D.boltSpeed + speed * 0.9); // their own speed carries the rounds too
        desired.copy(target).addScaledVector(tvel, lead).sub(pos).normalize();
        speed = b.mode === "final" ? D.speed * 0.9 : D.attackSpeed;
        if (b.mode === "final") {
          // Sensors half-recovered: an uneven approach, and looser shooting.
          desired.addScaledVector(_v2.set(Math.sin(G.time * 2.3), Math.cos(G.time * 1.7), 0).applyQuaternion(f.obj.quaternion), 0.12).normalize();
          turn *= 0.7;
        }
        if (!hunting) { desired.copy(f.forward); break; }
        // Lost him in the cold, or committed past him: break off.
        if ((cold && b.modeTime > 0.4) || dist < D.passRange || b.modeTime > 8) {
          setMode(f, "break");
          break;
        }
        f.fireTimer -= dt;
        const facing = f.forward.dot(desired);
        if (f.burstLeft <= 0 && f.fireTimer <= 0 && dist < D.fireRange && facing > 0.93) f.burstLeft = D.burstShots;
        if (f.burstLeft > 0 && f.fireTimer <= 0) {
          f.burstLeft--;
          f.fireTimer = f.burstLeft > 0 ? D.burstGap : D.burstCooldown * rand(0.8, 1.2) * (1 - kills * 0.12);
          fire(f, desired, cold ? D.coldSpread : b.mode === "final" ? D.spread * 3 : D.spread);
        }
        break;
      }
      case "break":
        desired.copy(f.breakDir);
        speed = D.attackSpeed;
        if (b.modeTime > 1.6) setMode(f, b.crippled ? "final" : "stalk"); // the blinded one only comes back one way
        break;
      case "blind": {
        // Out to the edge of the scope, circling while it repairs. Smoking, eye dark.
        b.station.applyAxisAngle(UP, dt * 0.18);
        desired.copy(p.obj.position).addScaledVector(b.station, 5).sub(pos).normalize();
        speed = D.speed * 0.6;
        turn *= 0.5;
        break;
      }
      default:
        desired.copy(f.forward);
    }

    // Don't stack up on each other.
    for (const o of list) {
      if (o === f) continue;
      const sep = _v2.subVectors(pos, o.obj.position);
      const l = sep.length();
      if (l < 0.2 && l > 0) desired.addScaledVector(sep, ((0.2 - l) * 6) / l);
    }
    desired.normalize();

    const before = _v3.copy(f.forward);
    steer(f.forward, desired, turn, dt);
    const turnSide = before.cross(f.forward).y / dt;
    f.vel.copy(f.forward).multiplyScalar(speed);
    // Jinking: never flying straight while manoeuvring, so a lead shot from range
    // misses. Committed to an attack run (or right on top of you) they steady up:
    // that's the window to shoot.
    const committed = (b.mode === "attack" && dist < D.fireRange + 0.4) || dist < 0.4;
    // They know when they're in someone's sights, and jink harder for it.
    const targeted = dist < 3.5 && p.forward.dot(_v2.subVectors(pos, p.obj.position).normalize()) > 0.985;
    const amp = b.mode === "blind" ? 0.08 : committed ? D.jinkCommitted : b.mode === "final" ? 0.22 : D.jink * (targeted ? 1.35 : 1);
    f.orbit += dt;
    _v2.set(1, 0, 0).applyQuaternion(f.obj.quaternion).multiplyScalar(Math.sin(f.orbit * 2.4) * amp);
    f.vel.add(_v2);
    _v2.set(0, 1, 0).applyQuaternion(f.obj.quaternion).multiplyScalar(Math.sin(f.orbit * 1.7 + 1.3) * amp * 0.6);
    f.vel.add(_v2);
    pos.addScaledVector(f.vel, dt);
    faceDirection(f.obj, f.forward);
    // They bank hard — and the blinded one wobbles.
    const wobble = b.crippled ? Math.sin(G.time * 5) * 0.25 : 0;
    f.model.body.rotation.z = lerp(f.model.body.rotation.z, clamp(-turnSide * 0.9, -1.3, 1.3) + wobble, damp(6, dt));

    for (const e of f.model.engines) {
      e.getWorldPosition(_v2);
      G.fx.fire.emit(_v2.x, _v2.y, _v2.z, 0, 0, 0, 0.18, 0.011, 0.002, 0xc070ff, 0x5a10ff, 0.7);
    }
    if (b.crippled) {
      f.smokeTimer -= dt;
      if (f.smokeTimer <= 0) {
        f.smokeTimer = 0.05;
        G.fx.smoke.emit(pos.x, pos.y, pos.z, rand(-0.01, 0.01), 0.01, rand(-0.01, 0.01), 1.4, 0.012, 0.05, 0x554455, 0x221a22, 0.5, 0.3);
      }
      const eye = (f.model as DrazzanModel).eye;
      if (b.mode === "blind") eye.visible = Math.random() < 0.15; // sparking, mostly dead
      else eye.visible = true;
    }
  }
}
