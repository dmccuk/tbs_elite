import * as THREE from "three";
import { G, emit } from "./game";
import { TUNING } from "./config";
import { segmentHitsSphere, type Bolt } from "./weapons";
import { damageDrone, damageDrum, damageYacht, destroyMissile } from "./enemies";
import { RELAY_RADIUS, damageFighter, damageRelay, damageShuttleEngines, damageShuttleHull, shuttleHullCenter } from "./frontier";
import { damagePlayer, playerDodging } from "./player";

// Decides what each bolt hit this frame.

const _v = new THREE.Vector3();
const RELAY_HIT_RADIUS = RELAY_RADIUS * 0.8;
const SHUTTLE_HULL_RADIUS = 0.03;
let lastArmourPing = -10;

export function boltHit(b: Bolt): boolean {
  if (b.owner === "fx") return false;

  // Harren's shots only care about pirates (and scenery).
  if (b.owner === "ally") {
    for (const f of G.fighters) {
      if (f.alive && segmentHitsSphere(b.prev, b.pos, f.obj.position, f.radius + 0.008)) {
        damageFighter(f, b.damage, b.pos, false);
        return true;
      }
    }
    return hitRelay(b, false) || hitRock(b);
  }

  if (b.owner === "player") {
    for (const f of G.fighters) {
      if (f.alive && segmentHitsSphere(b.prev, b.pos, f.obj.position, f.radius + 0.008)) {
        damageFighter(f, b.damage, b.pos, true);
        registerHit();
        return true;
      }
    }
    const s = G.shuttle;
    if (s?.alive) {
      // Whichever zone the bolt reaches first takes the hit: from behind that's the
      // engine block, head-on it's the hull (with the people in it).
      const hull = shuttleHullCenter(_v);
      const hitsEngines = segmentHitsSphere(b.prev, b.pos, s.engines.obj.position, s.engines.radius);
      const hitsHull = segmentHitsSphere(b.prev, b.pos, hull, SHUTTLE_HULL_RADIUS);
      if (hitsEngines && (!hitsHull || b.prev.distanceToSquared(s.engines.obj.position) < b.prev.distanceToSquared(hull))) {
        damageShuttleEngines(b.damage, b.pos);
        registerHit();
        return true;
      }
      if (hitsHull) {
        damageShuttleHull(b.damage, b.pos);
        return true;
      }
    }
    const w = G.wingman;
    if (w && segmentHitsSphere(b.prev, b.pos, w.obj.position, w.radius)) {
      G.fx.flash(b.pos, 0.025, 0x66bbff, 0.12); // friendly shields
      return true;
    }
    if (hitRelay(b, false)) return true;
    for (const d of G.drones) {
      if (d.alive && segmentHitsSphere(b.prev, b.pos, d.obj.position, d.radius + 0.008)) {
        damageDrone(d, b.damage, b.pos);
        registerHit();
        return true;
      }
    }
    for (const m of G.missiles) {
      if (m.alive && m.doomed <= 0 && segmentHitsSphere(b.prev, b.pos, m.obj.position, m.radius + 0.01)) {
        destroyMissile(m, true);
        registerHit();
        return true;
      }
    }
    for (const d of G.drums) {
      if (d.alive && segmentHitsSphere(b.prev, b.pos, d.obj.position, d.radius + 0.006)) {
        damageDrum(d, b.damage);
        registerHit();
        return true;
      }
    }
    const c = G.corvette;
    if (c && c.alive && segmentHitsSphere(b.prev, b.pos, c.obj.position, c.radius * 0.8)) {
      // Pea-shooter vs warship armour: sparks and nothing else.
      G.fx.sparksAt(b.pos, 5, 0xffeeaa, 0.12, 0.004, 0.25);
      if (G.time - lastArmourPing > 6) {
        lastArmourPing = G.time;
        emit({ type: "armourPing" });
      }
      return true;
    }
    const y = G.yacht;
    if (y && y.alive && segmentHitsSphere(b.prev, b.pos, y.obj.position, y.radius * 0.8)) {
      G.fx.flash(b.pos, 0.03, 0x66bbff, 0.12); // bounces off the yacht's shields
      return true;
    }
    return hitRock(b);
  }

  // Enemy fire
  const p = G.player;
  if (p.alive && !playerDodging() && segmentHitsSphere(b.prev, b.pos, p.obj.position, p.radius + 0.012)) {
    damagePlayer(b.damage, b.prev);
    return true;
  }
  const y = G.yacht;
  if (y && y.alive && segmentHitsSphere(b.prev, b.pos, y.obj.position, y.radius)) {
    damageYacht(b.damage, b.pos);
    return true;
  }
  const w = G.wingman;
  if (w && segmentHitsSphere(b.prev, b.pos, w.obj.position, w.radius + 0.01)) {
    G.fx.flash(b.pos, 0.03, 0x66bbff, 0.15); // Harren's shields "hold" — he can't be lost
    return true;
  }
  return hitRelay(b, true);
}

/** Bolts into the Tessick-3 relay; only pirate fire actually damages it. */
function hitRelay(b: Bolt, damages: boolean): boolean {
  const r = G.relay;
  if (!r || !segmentHitsSphere(b.prev, b.pos, r.obj.position, RELAY_HIT_RADIUS)) return false;
  if (damages) damageRelay(TUNING.prologue.relayDamage, b.pos);
  else G.fx.sparksAt(b.pos, 4, 0xffddaa, 0.1, 0.003, 0.2);
  return true;
}

function registerHit() {
  G.stats.hits++;
  G.hitMarkerTime = G.time;
}

function hitRock(b: Bolt): boolean {
  for (const r of G.world.rocks) {
    if (Math.abs(r.pos.x - b.pos.x) > r.radius + 0.1 || Math.abs(r.pos.z - b.pos.z) > r.radius + 0.1) continue;
    if (segmentHitsSphere(b.prev, b.pos, r.pos, r.radius * 0.9)) {
      _v.subVectors(b.prev, r.pos).normalize().multiplyScalar(0.05);
      G.fx.sparksAt(b.pos, 4, 0xffddaa, 0.1, 0.003, 0.2, _v);
      return true;
    }
  }
  return false;
}
