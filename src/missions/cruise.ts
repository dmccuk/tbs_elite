import * as THREE from "three";
import { G, schedule } from "../game";
import { clamp, damp, lerp, rand } from "../config";
import { driveShip } from "../player";
import { BAY_LINE, KESSLER_POS, dockAtCradle, launchFromKessler } from "../kessler";
import { hideBelt, setBeltPath, showBelt, updateBelt } from "../belt";
import { audio } from "../audio";
import { DECK } from "./landing";
import { STAPLES, setPhase, talk, type Mission, type Speaker } from "./common";
import { hideHarren, launchHarren, parkHarren, retrackHarren, updateHarren, type Track } from "./cruise-harren";

// Cruise: a screensaver ride. The Seagull catapults off the Kessler, flies a
// long loop out through an endless asteroid belt and comes back aboard, rests
// on the cradle for a bit, then goes out again, forever. Nobody's shooting.
// The autopilot here flies the ship; cinematic.ts films it (V changes the view)
// and belt.ts keeps the rocks out of its way.
//
// Each lap is a fresh ellipse that leaves the bow heading -Z and swings round
// to arrive behind the stern heading -Z again, with a gentle climb-and-dip and
// a lazy weave. Its first and last few km are pulled onto the bay's centreline
// so the ship leaves straight off the catapult and threads the approach rings.
//
// Somewhere in the middle of every lap Wyatt gets a bit lairy: ~45 km where he
// opens her up, hits the boost twice, throws in an aileron roll and slaloms
// round a line of "gate" rocks the belt plants on the path for him.

const COMPUTER: Speaker = { name: "SEAGULL COMPUTER", color: "#88ffcc", fx: "computer" };
const HARREN: Speaker = { name: "HARREN", color: "#ffaa66", fx: "radio" };

const CRUISE_SPEED = 0.5;   // km/s: a lap is 6-8 minutes
const SPRINT_SPEED = 1.5;   // km/s through the joyride…
const BOOST_SPEED = 2.05;   // …and on the boost (the Seagull's boost is 2.1)
const LAND_SPEED = 0.24;    // across the stern door (the arrestor holds anything under 0.35)
const BRAKE = 0.03;         // km/s² on the final approach
const BLEND = 6;            // km over which each end of a lap eases onto the centreline…
const DEPART = 1;           // …after this much dead straight off the bow
const ARRIVE = 3.5;         // …and before this much dead straight into the stern (all three rings)
const SLALOM = 0.22;        // km each side of the line through the joyride
const SLALOM_WAVE = 6;      // km per left-right swing
const SPRINT_CLEAR = 0.06;  // km from the path to the nearest rock surface in the joyride (normally belt.CORRIDOR)
const ROLL_LEN = 2.6;       // km for the aileron roll
const FIRST_LAUNCH = 5;     // seconds in the hangar before the first ride
const REST = 16;            // seconds on the cradle between rides
const HARREN_LEAD = 3;      // seconds Harren launches ahead of Wyatt

interface Lap {
  pts: THREE.Vector3[];
  cum: number[];
  length: number;
  /** Rock clearance per path point (km). */
  clear: number[];
  /** The joyride, as distances along the lap, and where in it he rolls. */
  sprint: { start: number; end: number; roll: number };
  /** Rocks planted on the line for the slalom. */
  gates: { pos: THREE.Vector3; radius: number }[];
}

let lap: Lap | null = null;
let s = 0;                  // distance flown along the lap (km)
let speed = 0;
let laps = 0;
let flying = false;
let prevYaw = 0;
let yawRate = 0;
let boosting = false;
let rollDir = 1;
let musings: string[] = [];
let lines = new Set<string>();

const _pos = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** 0 → 1 → 0 across the joyride, easing in and out at its ends. */
const sprintEnvelope = (u: number) => smooth(u / 0.12) * smooth((1 - u) / 0.14);

function buildLap(): Lap {
  const c = BAY_LINE.centre;
  const a = rand(40, 52);                 // how far out to starboard the loop reaches
  const b = rand(24, 31);                 // half its length along z
  const climb = rand(0.8, 2.2);
  const climbPhase = rand(0, Math.PI * 2);
  const weave = rand(0.6, 1.3);
  const weaves = Math.round(rand(4, 7));
  const N = 2400;
  const raw: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI * 2;
    // Tangent in the xz plane, for the weave's sideways offset.
    const tx = a * Math.sin(th), tz = -b * Math.cos(th);
    const tl = Math.hypot(tx, tz);
    const half = Math.sin(th / 2) ** 2; // 0 at the Kessler, 1 at the far end
    const w = weave * half * Math.sin(th * weaves);
    raw.push(new THREE.Vector3(
      c.x + a * (1 - Math.cos(th)) + (-tz / tl) * w,
      c.y + climb * half * Math.sin(th * 2 + climbPhase),
      c.z - b * Math.sin(th) + (tx / tl) * w,
    ));
  }
  const cumulative = (pts: THREE.Vector3[]) => {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    return cum;
  };
  const rawCum = cumulative(raw);
  const rawLen = rawCum[rawCum.length - 1];

  // The joyride: a slalom (plus a little bob) laid over the middle of the lap,
  // with a gate rock on the line at each swing's widest point.
  const s0 = rawLen * rand(0.3, 0.46);
  const s1 = s0 + rand(40, 50);
  const swings = Math.round((s1 - s0) / SLALOM_WAVE);
  const gates: Lap["gates"] = [];
  const clear: number[] = [];
  const side = new THREE.Vector3();
  const slalomed = raw.map((p, i) => {
    const u = (rawCum[i] - s0) / (s1 - s0);
    if (u <= 0 || u >= 1) { clear.push(-1); return p; }
    const env = sprintEnvelope(u);
    const phase = u * swings * Math.PI * 2;
    _t.subVectors(raw[Math.min(N, i + 1)], raw[Math.max(0, i - 1)]).normalize();
    side.crossVectors(_t, UP).normalize();
    clear.push(env > 0.2 ? SPRINT_CLEAR : -1);
    return p.clone().addScaledVector(side, SLALOM * env * Math.sin(phase)).addScaledVector(UP, 0.05 * env * Math.sin(phase * 1.5 + 1));
  });
  for (let k = 0; k < swings * 2; k++) {
    const u = (k + 0.5) / (swings * 2); // the widest point of each swing
    if (sprintEnvelope(u) < 0.9 || Math.random() < 0.15) continue;
    const d = s0 + u * (s1 - s0);
    const i = rawCum.findIndex((v) => v >= d);
    if (i > 0) gates.push({ pos: raw[i].clone(), radius: rand(0.08, 0.14) });
  }

  // Pull both ends onto the bay's centreline: out of the bow, in through the stern.
  const pts = slalomed.map((p, i) => {
    const d = rawCum[i];
    const w = smooth((d - DEPART) / BLEND) * smooth((rawLen - d - ARRIVE) / BLEND);
    const straight = d < rawLen / 2 ? _a.set(c.x, c.y, c.z - d) : _a.set(c.x, c.y, c.z + (rawLen - d));
    return new THREE.Vector3().lerpVectors(straight, p, w);
  });
  const cum = cumulative(pts);
  const at = (d: number) => cum[Math.max(0, rawCum.findIndex((v) => v >= d))];
  const start = at(s0), end = at(s1);
  return {
    pts, cum, length: cum[cum.length - 1], clear, gates,
    sprint: { start, end, roll: start + (end - start) * rand(0.46, 0.56) },
  };
}

function pointAt(l: Lap, dist: number, out: THREE.Vector3): THREE.Vector3 {
  const d = clamp(dist, 0, l.length);
  let lo = 0, hi = l.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (l.cum[mid] < d) lo = mid; else hi = mid;
  }
  const span = l.cum[hi] - l.cum[lo] || 1;
  return out.lerpVectors(l.pts[lo], l.pts[hi], (d - l.cum[lo]) / span);
}

/** The point `dist` km further along the ride from the ship (for the cameras). False when not flying a lap. */
export function aheadOnPath(dist: number, out: THREE.Vector3): boolean {
  if (!lap || !flying) return false;
  pointAt(lap, s + dist, out);
  return true;
}

/** 0-1: how far into the joyride Wyatt is (0 outside it). */
function joyride(): number {
  if (!lap || !flying) return 0;
  const { start, end } = lap.sprint;
  return s > start && s < end ? sprintEnvelope((s - start) / (end - start)) : 0;
}

/** In the joyride right now (the cameras pick livelier shots)? */
export const sprinting = () => joyride() > 0.05;

/** Km left before the stern door, on the way home. */
const toStern = () => (lap ? lap.length - s - (BAY_LINE.sternZ - BAY_LINE.centre.z) : Infinity);

/** The lap as Harren sees it: carrying on straight past the end, on to cradle 1. */
function trackFor(l: Lap): Track {
  return {
    length: l.length,
    pointAt: (d, out) => (d <= l.length ? pointAt(l, d, out) : pointAt(l, l.length, out).setZ(BAY_LINE.centre.z - (d - l.length))),
  };
}

/** Plan the next ride (while the ship sits in the hangar, so rocks shuffling out of the way aren't seen). */
function planLap() {
  lap = buildLap();
  setBeltPath(lap.pts, lap.clear, lap.gates);
  retrackHarren(trackFor(lap));
}

/** Off the catapult and out of the bow: the autopilot takes over. */
function startFlying() {
  if (!lap) planLap();
  const p = G.player;
  // Pick up the lap where the catapult left the ship (on the departure straight).
  s = clamp(BAY_LINE.centre.z - p.obj.position.z, 0, 5);
  speed = Math.max(p.speed, 0.3);
  prevYaw = p.yaw;
  yawRate = 0;
  flying = true;
  G.autopilot = true;
  boosting = false;
  rollDir = Math.random() < 0.5 ? -1 : 1;
  laps++;
  lines = new Set();
  if (laps === 1 || Math.random() < 0.35) {
    schedule(5, () => talk(STAPLES, "No pirates, no paperwork. Just me and the rocks.", "cruise_staples_launch"));
    schedule(9, () => talk(HARREN, "Harren, on your wing. Try not to fall asleep, Staples.", "cruise_harren_launch"));
  }
}

/** Say a line once per lap (`chance` of it at all). */
function once(key: string, chance: number, fn: () => void) {
  if (lines.has(key)) return;
  lines.add(key);
  if (Math.random() < chance) fn();
}

function fly(dt: number) {
  const l = lap!;
  const left = toStern();
  // Cruise, easing down from the catapult's kick. In the joyride: open her up
  // and hit the boost twice. Brake smoothly for the stern door.
  const sp = l.sprint;
  const u = (s - sp.start) / (sp.end - sp.start);
  const env = joyride();
  let target = lerp(CRUISE_SPEED, SPRINT_SPEED, env);
  const boost = env > 0.5 && ((u > 0.28 && u < 0.42) || (u > 0.66 && u < 0.78));
  if (boost) target = BOOST_SPEED;
  if (boost && !boosting) {
    audio.dodge();
    G.fx.shake(0.25);
  }
  boosting = boost;
  speed = speed < target ? Math.min(target, speed + (boost ? 1.4 : 0.6) * dt) : Math.max(target, speed - 0.45 * dt);
  const brakeV = Math.sqrt(LAND_SPEED * LAND_SPEED + 2 * BRAKE * Math.max(0, left));
  speed = Math.min(speed, brakeV);
  s = Math.min(l.length, s + speed * dt);
  pointAt(l, s, _pos);
  pointAt(l, s - 0.15, _a);
  pointAt(l, s + 0.15, _b);
  _t.subVectors(_b, _a).normalize();
  const yaw = Math.atan2(-_t.x, -_t.z);
  const pitch = Math.asin(clamp(_t.y, -1, 1));
  // Lean into turns (a positive yaw rate is a turn to port); knife-edge through the slalom.
  const dYaw = Math.atan2(Math.sin(yaw - prevYaw), Math.cos(yaw - prevYaw));
  prevYaw = yaw;
  yawRate = lerp(yawRate, dYaw / dt, damp(4, dt));
  const lean = lerp(0.55, 1.15, env);
  // One aileron roll somewhere in the middle of it.
  const r = (s - sp.roll) / ROLL_LEN;
  if (r > 0 && !lines.has("roll")) { lines.add("roll"); audio.dodge(); }
  const roll = r > 0 && r < 1 ? rollDir * Math.PI * 2 * smooth(r) : 0;
  driveShip(_pos, yaw, pitch, speed, clamp(yawRate * 12, -lean, lean), dt, roll, boosting);

  // A few words from the cockpit along the way, and the deck on the way home.
  const frac = s / l.length;
  if (frac > 0.2 && s < sp.start) once("mid", 0.6, sayMusing);
  if (env > 0.05) {
    once("lairy", laps === 1 ? 1 : 0.7, () => {
      talk(STAPLES, "Nobody's watching. Let's see what she's got.", "cruise_staples_lairy");
      schedule(3, () => talk(HARREN, "Oh, it's like that, is it? Race you!", "cruise_harren_race"));
    });
    if (u > 0.36) once("whoop", 0.6, () => talk(STAPLES, "Ha! Threaded it!", "cruise_staples_whoop"));
    if (u > 0.6) once("proximity", 0.5, () => talk(COMPUTER, "Proximity alert. Proximity alert. Rock.", "cruise_computer_proximity"));
  }
  if (s > sp.end) {
    once("sensible", 0.8, () => {
      talk(STAPLES, "Right. Sensible flying from here on. Nobody saw that.", "cruise_staples_sensible");
      schedule(3.5, () => talk(HARREN, "Show-off. I'm telling Caldwell.", "cruise_harren_show_off"));
    });
  }
  if (left < 9) once("harrenHome", 0.7, () => talk(HARREN, "I'll go first. Last one down buys the coffee.", "cruise_harren_home"));
  if (left < 7 && !lines.has("home")) {
    lines.add("home");
    talk(STAPLES, "Kessler, Seagull. Coming home.", "cruise_staples_home");
    schedule(3.5, () => talk(DECK, "Seagull, Kessler deck. You're cleared to land. Bay's hot, mind the paint.", "pro_deck_cleared"));
  }
  // Safety net: if the arrestor somehow missed us, clamp down on the cradle anyway.
  if (s >= l.length - 0.001 && G.dock.state === "free") {
    dockAtCradle();
    arrived();
  }
}

const MUSINGS: [string, string][] = [
  ["Say what you like about the Tessick-Varn. The view's free.", "cruise_staples_view"],
  ["Quiet out here. I could get used to quiet.", "cruise_staples_quiet"],
  ["Harren's gone quiet. That's either peace or a prank.", "cruise_staples_harren"],
  ["Should have brought a flask. Rookie mistake.", "cruise_staples_flask"],
];

function sayMusing() {
  if (musings.length === 0) musings = MUSINGS.map(([, id]) => id).sort(() => Math.random() - 0.5);
  const id = musings.pop()!;
  const line = MUSINGS.find(([, v]) => v === id)!;
  talk(STAPLES, line[0], line[1]);
}

/** Clamped on the cradle: rest, plan the next ride, go again (Harren off the catapult first). */
function arrived() {
  flying = false;
  G.autopilot = false;
  planLap();
  scheduleLaunch(REST);
}

function scheduleLaunch(delay: number) {
  schedule(delay - HARREN_LEAD, launchHarren);
  schedule(delay, launchFromKessler);
}

function handleEvents() {
  for (const e of G.events) {
    switch (e.type) {
      case "dockCaptured":
        G.autopilot = false;
        flying = false;
        if (Math.random() < 0.5) talk(DECK, "Mag-clamp field has you. Hands off the stick.", "pro_deck_captured");
        break;
      case "dockLanded":
        talk(DECK, "Clamps engaged. Welcome home, Staples.", "pro_deck_landed");
        arrived();
        break;
      case "dockLaunched":
        talk(DECK, "Catapult's charged. Go.", "pro_deck_launch");
        break;
      default:
        break;
    }
  }
}

// --- Mission -----------------------------------------------------------------------

export const cruise: Mission = {
  id: "cruise",
  title: "CRUISE",
  ship: "seagull",
  theme: "frontier",
  computer: COMPUTER,
  bestKey: "tbs-best-cruise",
  // Only used for the title-screen preview: just off the Kessler's stern quarter.
  start: { pos: new THREE.Vector3(KESSLER_POS.x - 0.35, KESSLER_POS.y + 0.12, KESSLER_POS.z + 0.9), yaw: 0 },
  statusHtml: '<div class="title">Seagull · Ninth Patrol Squadron</div><div>Tessick-Varn Frontier · off duty</div>',
  briefingHtml: () =>
    "Nothing to do. Wyatt and Harren launch off the Kessler, loop out through the belt (with a bit of showing off on the way) " +
    "and come home, then do it again. Press <b>1</b> for the view from behind, <b>2</b> for the cinematic cameras, <b>3</b> for the cockpit " +
    "(or <b>V</b> / tap VIEW to cycle). The mouse stays free, so it can run on a second screen.",

  begin() {
    setPhase("cruise");
    G.objective = G.hint = G.guide = "";
    G.world.setAsteroidsVisible(false);
    dockAtCradle();
    planLap();
    parkHarren(trackFor(lap!));
    showBelt(G.player.obj.position);
    scheduleLaunch(FIRST_LAUNCH);
  },

  reset() {
    lap = null;
    s = speed = 0;
    laps = 0;
    flying = boosting = false;
    lines = new Set();
    G.autopilot = false;
    hideBelt();
    hideHarren();
    G.world?.setAsteroidsVisible(true);
  },

  update(dt) {
    if (G.phase !== "cruise") return;
    handleEvents();
    // Off the catapult and clear of the bow: fly the lap.
    if (!flying && G.dock.state === "free" && G.player.obj.position.z < BAY_LINE.bowZ) startFlying();
    if (flying && G.dock.state === "free") fly(dt);
    updateHarren(dt, { out: flying, s, speed, joyride: joyride(), homeward: flying && toStern() < 9 });
    updateBelt(dt, G.player.obj.position);
  },

  special() { /* no controls on the ride */ },
  fail() { /* nothing can go wrong */ },
  timeScale: () => 1,
  targets: () => [],
  defaultTarget: () => null,
};
