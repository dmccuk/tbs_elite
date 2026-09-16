import * as THREE from "three";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { camera as flightCamera, composer, isTouch, renderer, setWorldPassesEnabled } from "../renderer";
import { input } from "../input";
import { audio } from "../audio";
import { buildDeck, type Deck } from "./deck";
import { buildCorridor } from "./corridor";
import { buildBridge } from "./bridge";
import type { Hotspot, Section } from "./types";
import { Walker } from "./walk";

// Walking around inside the Kessler. A separate scene and camera (metres, not
// km) rendered in place of the sky and the world; the flight sim is untouched
// underneath, so stepping into a Seagull just starts a mission as usual.
//
// Sections: 1 the hangar deck (cradles, clutter, the flight ops console you
// launch from), 2 the main corridor and ready room, 3 the bridge.

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 4000);
const walker = new Walker();
const _v = new THREE.Vector3();
const _to = new THREE.Vector3();

let pass: RenderPass | null = null;
let deck: Deck | null = null;
let sections: Section[] = [];
/** Rebuilt each frame: the fixed walls plus whichever doors are still shut. */
let solids: ReturnType<typeof collectSolids> = [];
let active = false;
let time = 0;
let stepDistance = 0;
let near: Hotspot | null = null;
let onLaunch: ((id: "cruise" | "prologue", variant: "mission" | "free" | "landing") => void) | null = null;

const $ = (id: string) => document.getElementById(id);

export const interiorActive = () => active;

/** main.ts hands us the way to start a flight from the console. */
export function setLaunchHandler(fn: typeof onLaunch) {
  onLaunch = fn;
}

function collectSolids() {
  const list = sections.flatMap((s) => s.solids);
  for (const s of sections) for (const d of s.doors) if (d.open < 0.6) list.push(d.solid);
  return list;
}

function ensureBuilt() {
  if (deck) return;
  deck = buildDeck();
  const corridor = buildCorridor();
  const bridge = buildBridge();
  sections = [deck, corridor, bridge];
  scene.add(deck.root, corridor.root, bridge.root);
  pass = new RenderPass(scene, camera);
  // Straight after the world passes, before the NaN scrub and bloom.
  composer.insertPass(pass, 5);
  pass.enabled = false;
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
}

/** Step aboard: the hangar deck, by the cradles. */
export function enterDeck() {
  ensureBuilt();
  active = true;
  if (pass) pass.enabled = true;
  setWorldPassesEnabled(false);
  document.body.classList.add("walking");
  document.body.dataset.phase = "interior";
  walker.place(deck!.spawn.x, deck!.spawn.z, deck!.spawn.yaw);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  walker.toCamera(camera);
  showMenu(false);
  say("The deck crew have left you to it.");
}

export function exitInterior() {
  if (!active) return;
  active = false;
  if (pass) pass.enabled = false;
  setWorldPassesEnabled(true);
  document.body.classList.remove("walking");
  showMenu(false);
  setPrompt("");
}

/** The nearest thing worth pressing E on, if you're looking at it. */
function findHotspot(): Hotspot | null {
  if (!sections.length) return null;
  walker.forward(_v);
  let best: Hotspot | null = null;
  let bestScore = 0;
  for (const h of sections.flatMap((s) => s.hotspots)) {
    _to.subVectors(h.pos, camera.position);
    const dist = _to.length();
    if (dist > h.range) continue;
    const facing = _to.normalize().dot(_v);
    if (facing < 0.45) continue;
    const score = facing / Math.max(1, dist);
    if (score > bestScore) { bestScore = score; best = h; }
  }
  return best;
}

function setPrompt(text: string) {
  const el = $("interior-prompt");
  if (!el) return;
  el.innerHTML = text;
  el.classList.toggle("visible", text !== "");
}

/** A line of deck chatter along the bottom of the screen. */
let sayUntil = 0;
function say(text: string) {
  const el = $("interior-say");
  if (!el) return;
  el.textContent = text;
  el.classList.add("visible");
  sayUntil = performance.now() + 4500;
}

function showMenu(on: boolean) {
  $("flight-menu")?.classList.toggle("visible", on);
  if (on) input.unlockPointer();
  else if (active && !isTouch) input.lockPointer();
}

const menuOpen = () => !!$("flight-menu")?.classList.contains("visible");

function use(h: Hotspot) {
  switch (h.id) {
    case "launch":
      audio.beep(true);
      showMenu(true);
      break;
    case "wyatt":
      say("Your Seagull. Fuelled, armed, and someone's cleaned the canopy.");
      audio.beep();
      break;
    case "harren":
      say("Harren's bird. He's painted the tips orange again.");
      audio.beep();
      break;
    case "corridor":
      say("Stores. Sealed, and nobody's looking for the key.");
      audio.beep();
      break;
    case "backToDeck":
      say("The hangar deck is through there.");
      break;
    case "plan":
      say("Patrol plan 4471: two loops of the belt, nothing on the board. Same as yesterday.");
      audio.beep();
      break;
    // --- The bridge ---
    case "chair":
      say("The Old Man's chair. Warm, even. Best leave it be.");
      audio.beep();
      break;
    case "helm":
      say("Helm's on station keeping. The Kessler holds herself better than anyone flies her.");
      audio.beep(true);
      break;
    case "nav":
      say("Nav plot: leg two of 4471. Forty-one hours to the turn, and nothing between here and it.");
      audio.beep(true);
      break;
    case "sensors":
      say("Passive only. Out here, listening is the whole job.");
      audio.beep();
      break;
    case "comms":
      say("Traffic log: a freighter's engine complaint, and somebody's mother. Nothing for us.");
      audio.beep();
      break;
    case "plot":
      say("The belt, drawn small enough to look tidy.");
      audio.beep(true);
      break;
    case "viewscreen":
      say("Forward camera. Dust, dark, and forty-two kilometres of it.");
      audio.beep();
      break;
    case "viewport":
      say("The belt goes by. You could watch it all watch.");
      audio.beep();
      break;
    case "plaque":
      say("KES-114 Kessler. Ninth Patrol, Tessick-Varn. Somebody polishes it.");
      audio.beep();
      break;
    default:
      if (h.id.startsWith("door:")) {
        const door = sections.flatMap((s) => s.doors).find((d) => `door:${d.id}` === h.id);
        if (door?.locked) {
          audio.beep();
          say(door.id === "mess" ? "Mess deck: sealed for now." : "Quarters: sealed for now.");
        }
      }
      break;
  }
}

/** Per frame while walking (real seconds: nothing in here runs on game time). */
export function updateInterior(dt: number) {
  if (!active || !deck) return;
  time += dt;
  const controls = !menuOpen();   // walking works either way; looking needs the mouse captured
  solids = collectSolids();
  stepDistance += walker.update(dt, solids, controls);
  if (stepDistance > 1.9) {
    stepDistance = 0;
    audio.footstep();
  }
  walker.toCamera(camera);
  for (const s of sections) s.update?.(time, walker.pos);

  near = controls ? findHotspot() : null;
  setPrompt(near ? `<b>E</b> ${near.label}` : menuOpen() || input.pointerLocked ? "" : "<b>Click</b> to look around");
  if (near && input.take("use")) use(near);
  if (sayUntil && performance.now() > sayUntil) {
    sayUntil = 0;
    $("interior-say")?.classList.remove("visible");
  }
  // Keep the flight camera roughly in step, so a launch doesn't jump.
  flightCamera.updateMatrixWorld();
}

/** Wire up the flight menu's buttons (called once at startup). */
export function initInteriorUI() {
  for (const btn of Array.from(document.querySelectorAll<HTMLElement>("#flight-menu [data-flight]"))) {
    btn.addEventListener("click", () => {
      const [id, variant] = (btn.dataset.flight ?? "").split(":");
      showMenu(false);
      if (id === "close") return;
      onLaunch?.(id as "cruise" | "prologue", (variant ?? "mission") as "mission" | "free" | "landing");
    });
  }
}

/** Esc / the pause key while walking: close the menu, else leave the deck. */
export function interiorEscape(): "menu" | "leave" {
  if (menuOpen()) {
    showMenu(false);
    return "menu";
  }
  return "leave";
}

/** Dev-only: what the deck thinks it has (used by the tests). */
export function deckDebug() {
  return {
    solids: collectSolids().length,
    sample: deck?.solids.slice(0, 3).map((s) => [s.min.x, s.min.z, s.max.x, s.max.z]),
    spawn: deck?.spawn,
    eye: camera.position.toArray().map((v) => +v.toFixed(2)),
    pos: [+walker.pos.x.toFixed(2), +walker.pos.z.toFixed(2)],
    yaw: +walker.yaw.toFixed(3),
    speed: +walker.speed.toFixed(2),
    doors: sections.flatMap((s) => s.doors).map((d) => `${d.id}:${d.locked ? "locked" : d.open.toFixed(2)}`),
  };
}

/** Dev-only: run one interior frame with a fixed dt (tests drive this directly). */
export function interiorTick(dt: number) {
  updateInterior(dt);
}

/** Dev-only: walk from (x,z) toward (tx,tz) in small steps and report where we end up. */
export function walkProbe(x: number, z: number, tx: number, tz: number, steps = 400) {
  if (!sections.length) return null;
  walker.place(x, z, 0);
  const dx = (tx - x) / steps;
  const dz = (tz - z) / steps;
  const boxes = collectSolids();
  for (let i = 0; i < steps; i++) walker.nudge(dx, dz, boxes);
  return { x: +walker.pos.x.toFixed(2), z: +walker.pos.z.toFixed(2) };
}

/** Dev-only: drop the walker somewhere (used by the screenshot tests). */
export function walkTo(x: number, z: number, yaw: number) {
  walker.place(x, z, yaw);
  walker.toCamera(camera);
}

void renderer;
