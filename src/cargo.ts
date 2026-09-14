import * as THREE from "three";
import { G, addScore, emit } from "./game";
import { SCORE, TUNING, rand } from "./config";
import { createCargoMine } from "./models";
import { scene } from "./renderer";
import { audio } from "./audio";
import { damagePlayer, setCargoVisible } from "./player";
import { damageDrum, destroyDrone, destroyMissile, hitCorvette } from "./enemies";

// The bio-waste container as an improvised mine. One button launches it, the
// same button detonates it. It homes gently on the corvette; while it is
// inside the blast radius time slows down so the player can hit the button.

const MN = TUNING.mine;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// Only one container flies at a time, so one model is reused for every launch.
let mineModel: ReturnType<typeof createCargoMine> | null = null;

export function launchMine(): boolean {
  const p = G.player;
  if (!p.alive || G.mine || p.containers <= 0) return false;
  const { root, light } = (mineModel ??= createCargoMine());
  root.rotation.set(0, 0, 0);
  p.model.cargo[0].getWorldPosition(root.position);
  root.quaternion.copy(p.obj.quaternion);
  scene.add(root);
  const down = _v.set(0, -1, 0).applyQuaternion(p.obj.quaternion);
  G.mine = {
    obj: root,
    light,
    vel: p.vel.clone().addScaledVector(p.forward, MN.launchSpeed).addScaledVector(down, 0.04),
    life: MN.life,
    pdExposure: 0,
    inRange: false,
    wasInRange: false,
    blink: 0,
  };
  p.containers--;
  if (p.reloadTimer <= 0) p.reloadTimer = MN.reloadSeconds;
  setCargoVisible(p.containers > 0);
  G.stats.minesLaunched++;
  audio.mineLaunch();
  G.fx.flash(root.position, 0.05, 0xffaa33, 0.25);
  G.fx.shake(0.12);
  emit({ type: "mineLaunched" });
  return true;
}

function removeMine() {
  if (G.mine) scene.remove(G.mine.obj);
  G.mine = null;
}

/** Blow the container. Called by the player or automatically on contact. */
export function detonateMine() {
  const mine = G.mine;
  if (!mine) return;
  const pos = mine.obj.position.clone();
  removeMine();
  audio.detonateClick();
  audio.bigBoom();
  G.fx.explosion(pos, 0.22, "mine", mine.vel);
  // The ring grows to the real blast radius so players learn the range.
  G.fx.shockwave(pos, MN.blastRadius, 0xffd466, 1.1);
  G.fx.shockwave(pos, MN.blastRadius, 0xffaa33, 1.3, _v.set(0, 1, 0));
  const pd = pos.distanceTo(G.player.obj.position);
  G.fx.shake(Math.max(0.25, 1 - pd / 4));

  for (const d of G.drones) if (d.alive && d.obj.position.distanceTo(pos) < MN.blastRadius * 0.8) destroyDrone(d, true);
  for (const m of G.missiles) if (m.alive && m.obj.position.distanceTo(pos) < MN.blastRadius * 0.8) destroyMissile(m, true);
  for (const d of G.drums) if (d.alive && d.obj.position.distanceTo(pos) < MN.blastRadius) damageDrum(d, 99);
  if (pd < 0.35) damagePlayer(25, pos);

  const c = G.corvette;
  if (c && c.alive && !c.crippled) {
    const dist = c.obj.position.distanceTo(pos);
    if (dist <= MN.blastRadius) {
      G.stats.mineHits++;
      addScore(SCORE.mineHit, c.obj.position, "#ffdd44");
      hitCorvette();
      emit({ type: "mineHit" });
    } else {
      emit({ type: "mineMiss", reason: "far", distance: dist - MN.blastRadius });
    }
  }
}

function fizzle(reason: "shot" | "lost") {
  const mine = G.mine;
  if (!mine) return;
  G.fx.explosion(mine.obj.position, 0.06, "fire", mine.vel);
  audio.explosion(0.1, 0.5);
  const c = G.corvette;
  const dist = c ? c.obj.position.distanceTo(mine.obj.position) : 0;
  removeMine();
  if (c && c.alive && !c.crippled) emit({ type: "mineMiss", reason, distance: dist });
}

export function updateMine(dt: number) {
  const mine = G.mine;
  if (!mine) return;
  mine.life -= dt;
  const pos = mine.obj.position;
  const c = G.corvette && G.corvette.alive && !G.corvette.crippled ? G.corvette : null;

  let speed = mine.vel.length();
  speed = Math.min(MN.maxSpeed, speed + 0.8 * dt);
  const dir = _v.copy(mine.vel).normalize();
  let dist = Infinity;
  if (c) {
    dist = pos.distanceTo(c.obj.position);
    const lead = dist / Math.max(speed, 0.1);
    const desired = _v2.copy(c.obj.position).addScaledVector(c.vel, lead).sub(pos).normalize();
    // Only home if the corvette is roughly ahead, so aim still matters.
    if (dir.dot(desired) > 0.3) {
      const angle = dir.angleTo(desired);
      if (angle > 1e-4) dir.lerp(desired, Math.min(1, (MN.turnRate * dt) / angle)).normalize();
    }
  }
  mine.vel.copy(dir).multiplyScalar(speed);
  pos.addScaledVector(mine.vel, dt);
  mine.obj.rotation.x += dt * 1.3;
  mine.obj.rotation.y += dt * 0.9;

  mine.inRange = dist <= MN.blastRadius;
  if (mine.inRange) mine.wasInRange = true;

  // Beacon blinks faster the closer it gets.
  mine.blink += dt * (mine.inRange ? 14 : c ? 4 + 10 / (1 + dist) : 3);
  const on = Math.sin(mine.blink) > 0;
  mine.light.scale.setScalar(on ? (mine.inRange ? 0.12 : 0.07) : 0.03);
  (mine.light.material as THREE.SpriteMaterial).color.setHex(mine.inRange ? 0x66ff66 : 0xffaa00).multiplyScalar(3);
  G.fx.sparks.emit(pos.x, pos.y, pos.z, rand(-0.02, 0.02), rand(-0.02, 0.02), rand(-0.02, 0.02), 0.35, 0.01, 0.001, 0xffcc55, 0xff5500, 0.8);

  if (c) {
    if (dist < c.radius * 0.6) { detonateMine(); return; }            // rammed the hull
    if (mine.pdExposure >= MN.pdKillTime) { fizzle("shot"); return; } // point-defence got it
    if (mine.wasInRange && !mine.inRange && dist > MN.blastRadius * 2) { fizzle("lost"); return; }
  }
  if (mine.life <= 0 || pos.distanceTo(G.player.obj.position) > 12) fizzle("lost");
}

export function clearMine() {
  removeMine();
}
