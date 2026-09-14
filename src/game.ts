import * as THREE from "three";
import type { ShipModel } from "./models";
import type { Effects } from "./fx/effects";
import type { World } from "./world";

// Shared game state. Logic lives in the other modules; this file only holds
// the data they all read and write, so there are no circular imports.

/**
 * Mission phases (a finite state machine). Legal transitions:
 *
 *   splash ──any key──▶ practice ──timer / Enter──▶ ambush ──intro done──▶ combat
 *   combat ──corvette crippled──▶ victory ──corvette jumps away──▶ rendezvous
 *   rendezvous ──reach beacon──▶ complete
 *   practice | ambush | combat | victory | rendezvous ──player destroyed──▶ failed
 *   combat ──yacht destroyed──▶ failed
 *   complete | failed ──R──▶ practice (short, no tutorial)
 *
 * Pausing is a separate flag (G.paused), not a phase.
 */
export type Phase = "splash" | "practice" | "ambush" | "combat" | "victory" | "rendezvous" | "complete" | "failed";

export type EntityKind = "player" | "yacht" | "corvette" | "drone" | "missile" | "drum";

export interface Entity {
  kind: EntityKind;
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  radius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  label: string;
}

export interface Player extends Entity {
  model: ShipModel;
  yaw: number;
  pitch: number;
  yawVel: number;
  pitchVel: number;
  bank: number;
  throttle: number;
  speed: number;
  shield: number;
  lastHitTime: number;
  boostEnergy: number;
  boosting: boolean;
  gunCooldown: number;
  gunSide: number;
  dodgeTime: number;      // > 0 while rolling
  dodgeCooldown: number;
  dodgeDir: number;
  strafe: THREE.Vector3;
  containers: number;
  reloadTimer: number;    // counts down while the compactor makes a container
  forward: THREE.Vector3;
}

export interface Yacht extends Entity {
  model: ShipModel;
  u: number;              // position along the flight path, 0–1
  speedScale: number;
  pdCooldown: number;
  smokeTimer: number;
  warpT: number;          // seconds since it jumped in (drives the warp stretch)
  holdAt: THREE.Vector3 | null; // once set, leaves the path and parks here
}

export interface Corvette extends Entity {
  model: ShipModel;
  u: number;
  hits: number;
  missileTimer: number;
  cannonTimer: number;
  droneTimer: number;
  waves: number;
  enraged: boolean;
  crippled: boolean;
  warpT: number;
  jumpOut: number;        // > 0 while charging its escape jump; counts up
  pdFireTimer: number;
}

export interface Drone extends Entity {
  model: ShipModel;
  state: "launch" | "attack" | "break";
  stateTimer: number;
  fireTimer: number;
  breakDir: THREE.Vector3;
  forward: THREE.Vector3;
}

export interface Missile extends Entity {
  target: Entity;
  life: number;
  trailTimer: number;
  doomed: number;         // > 0: yacht point-defence has it; explodes when it reaches 0
  pdChecked: boolean;
  speed: number;
}

export interface Drum extends Entity {
  spin: THREE.Vector3;
}

export interface Mine {
  obj: THREE.Object3D;
  light: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  pdExposure: number;
  inRange: boolean;
  wasInRange: boolean;
  blink: number;
}

export interface CommsLine {
  speaker: string;
  text: string;
  color: string;
  time: number;
}

export interface Stats {
  drones: number;
  missiles: number;
  drums: number;
  minesLaunched: number;
  mineHits: number;
  shots: number;
  hits: number;
}

interface Scheduled { at: number; fn: () => void; }

/** Gameplay events raised by combat code and handled by the mission script. */
export type GameEvent =
  | { type: "mineLaunched" }
  | { type: "mineHit" }
  | { type: "mineMiss"; reason: "far" | "shot" | "lost"; distance: number }
  | { type: "missileVolley"; atPlayer: boolean }
  | { type: "dronesLaunched"; count: number }
  | { type: "droneKilled" }
  | { type: "drumKilled" }
  | { type: "armourPing" }
  | { type: "containerReady" };

export const G = {
  phase: "splash" as Phase,
  paused: false,
  helpOpen: false,
  /** Seconds of simulated time since the page loaded (stops while paused). */
  time: 0,
  phaseTime: 0,
  combatTime: 0,
  timeScale: 1,
  firstRun: true,
  practiceLeft: 0,
  tutorialStep: 0,
  tutorialDone: false,
  failReason: "",
  /** Objective line and control hint shown at the top of the HUD. */
  objective: "",
  hint: "",
  score: 0,
  stats: { drones: 0, missiles: 0, drums: 0, minesLaunched: 0, mineHits: 0, shots: 0, hits: 0 } as Stats,
  missFeedbackGiven: false,

  player: null as unknown as Player,
  yacht: null as Yacht | null,
  corvette: null as Corvette | null,
  drones: [] as Drone[],
  missiles: [] as Missile[],
  drums: [] as Drum[],
  mine: null as Mine | null,
  beacon: null as THREE.Object3D | null,
  target: null as Entity | null,
  /** Whatever the guns' aim assist is currently tracking, for the lead marker. */
  aimTarget: null as Entity | null,
  aimPoint: new THREE.Vector3(),

  fx: null as unknown as Effects,
  world: null as unknown as World,

  comms: [] as CommsLine[],
  scheduled: [] as Scheduled[],
  events: [] as GameEvent[],
  /** Floating score popups drawn by the HUD. */
  popups: [] as { pos: THREE.Vector3; text: string; color: string; life: number }[],
  /** Last direction damage came from (world space), for the HUD indicator. */
  damageDir: new THREE.Vector3(),
  damageTime: -10,
  hitMarkerTime: -10,
};

/** Run fn after `delay` seconds of game time. Cleared automatically on restart. */
export function schedule(delay: number, fn: () => void) {
  G.scheduled.push({ at: G.time + delay, fn });
}

export function runScheduled() {
  if (G.scheduled.length === 0) return;
  const due = G.scheduled.filter((s) => s.at <= G.time);
  if (due.length === 0) return;
  G.scheduled = G.scheduled.filter((s) => s.at > G.time);
  for (const s of due) s.fn();
}

export function emit(e: GameEvent) {
  G.events.push(e);
}

export function say(speaker: string, text: string, color = "#88ffcc") {
  G.comms.push({ speaker, text, color, time: G.time });
  if (G.comms.length > 4) G.comms.shift();
}

export function addScore(points: number, pos?: THREE.Vector3, color = "#ffdd66") {
  G.score += points;
  if (pos) G.popups.push({ pos: pos.clone(), text: `+${points}`, color, life: 1.2 });
}
