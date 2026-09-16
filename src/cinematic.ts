import * as THREE from "three";
import { G } from "./game";
import { clamp, rand } from "./config";
import { camera } from "./renderer";
import { snapChaseCamera, updateCamera } from "./player";
import { forceCockpit } from "./cockpit";
import { BAY_LINE, KESSLER_POS } from "./kessler";
import { rockBeside, rockBlocks } from "./belt";
import { aheadOnPath, sprinting } from "./missions/cruise";
import { HARREN_SIDE, harrenFlying, harrenShip } from "./missions/cruise-harren";

// The Cruise's camera director. Three views, picked with 1 / 2 / 3 (V cycles):
//   chase      (1) the normal chase camera, behind the ship.
//   cinematic  (2) cuts between outside shots every ten seconds or so — tracking
//              shots off either wing, a slow orbit, a view back from ahead of
//              the nose, a high wide shot, a view over Harren's shoulder, and
//              static cameras planted on the path (some tucked behind a rock)
//              that the Seagulls fly past. The joyride gets livelier shots.
//              Around the Kessler it switches to set-ups there: beside the stern
//              for the approach, inside the hangar while she's clamped down, and
//              off the bow for the catapult launch.
//   cockpit    (3) the pilot's seat, all the way round.
// Every camera keeps clear of Harren's ship as well as the rocks.

export type CruiseView = "chase" | "cinematic" | "cockpit";
const VIEWS: CruiseView[] = ["chase", "cinematic", "cockpit"];
const VIEW_KEY = "tbs-cruise-view";

type Kind =
  | "none" | "chase" | "side" | "front" | "orbit" | "high" | "wing" | "flyby" | "rock"
  | "stern" | "hangar" | "deck" | "bow";

/** Shots the Kessler forces; the director leaves them as soon as they no longer apply. */
const FORCED = new Set<Kind>(["stern", "hangar", "deck", "bow"]);
/** Shots with a camera fixed in space. */
const STATIC = new Set<Kind>(["flyby", "rock", "stern", "hangar", "deck", "bow"]);

const POOL: [Kind, number][] = [
  ["chase", 1.6], ["side", 3], ["front", 1.4], ["orbit", 1.6], ["high", 1.1], ["flyby", 2.2], ["rock", 1.8],
];
/** The joyride: stay close and fast (Harren's chasing, so there's a view over his shoulder). */
const JOYRIDE_POOL: [Kind, number][] = [["chase", 3], ["wing", 2.5], ["flyby", 2], ["side", 1]];

let view: CruiseView = (() => {
  try {
    const v = localStorage.getItem(VIEW_KEY) as CruiseView | null;
    return v && VIEWS.includes(v) ? v : "cinematic";
  } catch { return "cinematic"; }
})();

const shot = { kind: "none" as Kind, t: 0, dur: 10, side: 1, a: 0, pos: new THREE.Vector3(), fov: 50 };
let lastSide = 1;
const camVel = new THREE.Vector3();
const frameQ = new THREE.Quaternion();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _look = new THREE.Vector3();

/** Local Kessler coordinates → world. */
const kessler = (x: number, y: number, z: number, out: THREE.Vector3) => out.set(x, y, z).add(KESSLER_POS);

export const cruiseView = () => view;
/** The shot on screen (for tests). */
export const currentShot = () => shot.kind;

const VIEW_NAMES: Record<CruiseView, string> = { chase: "1 · Behind the ship", cinematic: "2 · Cinematic cameras", cockpit: "3 · Cockpit" };

/** Name the current view on the Cruise's caption. */
function labelView() {
  const el = document.getElementById("cc-view");
  if (el) el.textContent = VIEW_NAMES[view];
}

export function cycleCruiseView(): CruiseView {
  return setCruiseView(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]);
}

/** Pick a view directly (1 / 2 / 3); it's remembered for next time. */
export function setCruiseView(v: CruiseView): CruiseView {
  view = v;
  try { localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ }
  shot.kind = "none"; // pick afresh when coming back to the cinematic view
  snapChaseCamera();
  labelView();
  return view;
}

/** Start over (every mission start). */
export function resetDirector() {
  shot.kind = "none";
  shot.t = 0;
  forceCockpit(null);
  setLetterbox(false);
  labelView();
}

/** How fast the camera is moving (the space dust streaks by this). */
export const cruiseCameraVelocity = () => camVel;

let letterbox = false;
function setLetterbox(on: boolean) {
  if (on === letterbox) return;
  letterbox = on;
  document.body.classList.toggle("letterbox", on);
}

/** A quick dip to black on each cut. */
function dip() {
  const el = document.getElementById("cut-fade");
  if (!el) return;
  el.classList.remove("dip");
  void el.offsetWidth;
  el.classList.add("dip");
}

/** Which Kessler shot the moment calls for, if any. */
function situation(): Kind | null {
  const d = G.dock;
  const p = G.player.obj.position;
  if (d.state === "captured") return "hangar";
  if (d.state === "landed") return shot.kind === "deck" || (shot.kind === "hangar" && shot.t > 8) ? "deck" : "hangar";
  if (d.state === "launching") return "bow";
  if (shot.kind === "bow" && p.z > BAY_LINE.bowZ - 3.6) return "bow"; // hold while she clears the bow
  const behind = p.z - BAY_LINE.sternZ;
  if (G.autopilot && behind > 0 && behind < 1.5 && Math.abs(p.x - BAY_LINE.centre.x) < 0.3) return "stern";
  return null;
}

let wasSprinting = false;

function pickNext(): Kind {
  const pool = sprinting() ? JOYRIDE_POOL : POOL;
  const options = pool.filter(([k]) => k !== shot.kind && (k !== "wing" || harrenFlying()));
  let roll = Math.random() * options.reduce((sum, [, w]) => sum + w, 0);
  for (const [k, w] of options) {
    roll -= w;
    if (roll <= 0) return k;
  }
  return "chase";
}

/** Field of view that keeps a ~60 m ship a sensible size at `dist` km. */
const fovFor = (dist: number, lo: number, hi: number) => clamp(THREE.MathUtils.radToDeg(2 * Math.atan(0.05 / Math.max(dist, 0.001))), lo, hi);

function shipFrame() {
  _f.set(0, 0, -1).applyQuaternion(frameQ);
  _r.set(1, 0, 0).applyQuaternion(frameQ);
  _u.set(0, 1, 0).applyQuaternion(frameQ);
}

/** Set up a new shot. Static cameras that would sit inside a rock fall back to the chase camera. */
function cut(kind: Kind) {
  const p = G.player;
  shot.kind = kind;
  shot.t = 0;
  shot.side = lastSide = -lastSide;
  shot.a = rand(0, Math.PI * 2);
  const joy = sprinting();
  shot.dur = kind === "chase" ? (joy ? rand(6, 9) : rand(9, 14)) : kind === "side" ? rand(10, 15) : kind === "front" ? rand(7, 10)
    : kind === "orbit" ? rand(12, 16) : kind === "high" ? rand(8, 11) : kind === "wing" ? rand(8, 12) : 14;
  shipFrame();
  switch (kind) {
    case "flyby": {
      // Planted on the path ~5 s ahead, a little off to the side away from Harren.
      const lead = clamp(p.speed * 5, 1.2, 8);
      if (!aheadOnPath(lead, _v) || !aheadOnPath(lead + 0.1, _w)) return cut("chase");
      _w.sub(_v).normalize();                         // path direction there
      _look.crossVectors(_w, _u).normalize();          // sideways
      const side = harrenFlying() ? -HARREN_SIDE : shot.side;
      const off = joy ? rand(0.035, 0.05) : rand(0.04, 0.1);
      shot.pos.copy(_v).addScaledVector(_look, side * off).addScaledVector(_u, rand(-0.01, 0.03));
      break;
    }
    case "rock": {
      // Up behind a rock beside the path, looking over it at the ship going by.
      let rock: ReturnType<typeof rockBeside> = null;
      for (const ahead of [3, 4, 5, 6]) {
        if (!aheadOnPath(ahead, _v)) break;
        rock = rockBeside(_v, 1.1);
        if (rock) break;
      }
      if (!rock) return cut("flyby");
      _w.subVectors(_v, rock.pos).normalize();         // rock → path
      shot.pos.copy(rock.pos).addScaledVector(_w, -(rock.radius + 0.03)).addScaledVector(_u, rock.radius * 2.1 + 0.01);
      break;
    }
    case "stern": kessler(-0.28, 0.1, 0.42, shot.pos); break;   // off the port quarter, behind the stern door
    case "hangar": kessler(0.06, 0.012, -0.2, shot.pos); break;   // inside, by the bow door, looking aft over Harren's cradle
    case "deck": kessler(-0.056, -0.036, -0.058, shot.pos); break; // low beside the cradle
    case "bow": kessler(0.5, 0.14, -2.6, shot.pos); break;        // out ahead of the bow: she flies the length of the shot
    case "chase": snapChaseCamera(); break;
    default: break;
  }
  if (STATIC.has(kind) && rockBlocks(shot.pos, 0.02)) return cut("chase");
  dip();
}

/** Is the camera about to sit inside Harren's ship? */
function nearHarren(pos: THREE.Vector3): boolean {
  const h = harrenShip();
  return !!h && h.position.distanceTo(pos) < 0.03;
}

/** Has a static camera's subject flown well past it? */
function passed(): boolean {
  const p = G.player;
  _v.subVectors(p.obj.position, shot.pos);
  return _v.dot(p.forward) > Math.max(0.25, p.speed * 2.5) || _v.length() > 4.5;
}

function track(offset: THREE.Vector3, lookAhead: number, fov: number) {
  const p = G.player.obj.position;
  camera.position.copy(p).add(offset);
  camera.lookAt(_look.copy(p).addScaledVector(_f, lookAhead));
  setFov(fov);
  camVel.copy(G.player.vel);
}

function setFov(fov: number) {
  if (Math.abs(camera.fov - fov) < 0.01) return;
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

/** Per frame in the Cruise, in place of updateCamera(). */
export function updateCruiseCamera(dt: number, realDt: number) {
  const p = G.player;
  frameQ.slerp(p.obj.quaternion, 1 - Math.exp(-1.5 * realDt));
  if (view !== "cinematic") {
    setLetterbox(false);
    forceCockpit(view === "cockpit");
    updateCamera(dt, realDt);
    camVel.copy(p.vel);
    return;
  }
  setLetterbox(true);
  if (shot.kind === "none") frameQ.copy(p.obj.quaternion);
  shot.t += dt;
  const want = situation();
  const joy = sprinting();
  if (want) {
    if (shot.kind !== want) cut(want);
  } else if (joy && !wasSprinting) {
    cut("chase"); // the boost kicks in: be right behind her for it
  } else if (shot.kind === "none" || FORCED.has(shot.kind) || shot.t > shot.dur || (STATIC.has(shot.kind) && passed())) {
    cut(pickNext());
  } else if (shot.kind === "wing" && (!harrenFlying() || !joy)) {
    cut(pickNext());
  }
  wasSprinting = joy;

  forceCockpit(false);
  shipFrame();
  const u = clamp(shot.t / shot.dur, 0, 1);
  const s = shot.side;
  const harren = harrenShip();
  // On Harren's side, stand off wider so both Seagulls are in the shot.
  const wide = !!harren && harrenFlying() && s === HARREN_SIDE;
  switch (shot.kind) {
    case "chase":
      updateCamera(dt, realDt);
      camVel.copy(p.vel);
      break;
    case "side": // off a wingtip, sliding slowly from the rear quarter to the front
      if (wide) {
        track(_v.set(0, 0, 0).addScaledVector(_r, s * 0.2).addScaledVector(_u, 0.03).addScaledVector(_f, -0.08 + u * 0.14), 0.012, 55);
        camera.lookAt(_look.lerpVectors(p.obj.position, harren!.position, 0.4));
      } else {
        track(_v.set(0, 0, 0).addScaledVector(_r, s * 0.075).addScaledVector(_u, 0.012).addScaledVector(_f, -0.06 + u * 0.11), 0.012, 50);
      }
      break;
    case "front": // out ahead of the nose, looking back at her
      track(_v.set(0, 0, 0).addScaledVector(_r, s * 0.025).addScaledVector(_u, 0.014).addScaledVector(_f, 0.12), 0, 45);
      break;
    case "orbit":
      shot.a += dt * 0.14 * s;
      track(_v.set(0, 0, 0).addScaledVector(_r, Math.sin(shot.a) * 0.13).addScaledVector(_f, Math.cos(shot.a) * 0.13).addScaledVector(_u, 0.04), 0, 50);
      break;
    case "high": // high and wide, looking down past her into the belt
      track(_v.set(0, 0, 0).addScaledVector(_r, s * 0.03).addScaledVector(_u, 0.13).addScaledVector(_f, -0.09), 0.05, 55);
      break;
    case "wing": // over Harren's shoulder, looking at Wyatt
      if (!harren) { cut("chase"); break; }
      _w.set(0, 0, 1).applyQuaternion(harren.quaternion);  // Harren's "behind"
      camera.position.copy(harren.position).addScaledVector(_w, 0.075).addScaledVector(_u, 0.03);
      camera.lookAt(_look.lerpVectors(harren.position, p.obj.position, 0.8));
      setFov(joy ? 55 : 48);
      camVel.copy(G.player.vel);
      break;
    default: {
      // Static cameras: follow the ship with a lens that keeps her framed.
      camera.position.copy(shot.pos);
      const dist = shot.pos.distanceTo(p.obj.position);
      if (shot.kind === "stern" || shot.kind === "bow") {
        // While the ship is near the bay door, frame both; otherwise just follow the ship.
        const door = _w.copy(BAY_LINE.centre).setZ(shot.kind === "stern" ? BAY_LINE.sternZ : BAY_LINE.bowZ);
        _v.subVectors(p.obj.position, shot.pos).normalize();
        _look.subVectors(door, shot.pos).normalize();
        const angle = THREE.MathUtils.radToDeg(_v.angleTo(_look));
        const both = clamp((85 - angle) / 35, 0, 1);
        _look.add(_v).normalize();                     // halfway between ship and door
        _v.lerp(_look, both).normalize().add(shot.pos);
        camera.lookAt(_v);
        setFov(THREE.MathUtils.lerp(fovFor(dist, 24, 60), clamp(angle * 1.3 + 12, 30, 72), both));
      } else {
        camera.lookAt(p.obj.position);
        setFov(shot.kind === "hangar" ? 46 : shot.kind === "deck" ? 58 : fovFor(dist, 14, 60));
      }
      camVel.set(0, 0, 0);
    }
  }
  // Never leave a camera inside a rock or in Harren's lap.
  if (shot.kind !== "chase" && ((!STATIC.has(shot.kind) && rockBlocks(camera.position, 0.004)) || (shot.kind !== "wing" && nearHarren(camera.position)))) cut("chase");
  camera.updateMatrixWorld();
}
