import * as THREE from "three";
import type { ShipModel } from "./models";
import type { ShuttleModel } from "./models-frontier";
import type { Effects } from "./fx/effects";
import type { World } from "./world";
import type { ShipId } from "./config";

// Shared game state. Logic lives in the other modules; this file only holds
// the data they all read and write, so there are no circular imports.

/** Playable missions (story order is MISSION_ORDER in mission.ts; "cruise" is the screensaver ride). */
export type MissionId = "academy" | "prologue" | "chapter1" | "cruise";

/**
 * Mission phases (a finite state machine), shared by every mission. Legal transitions:
 *
 *   splash ──pick a mission──▶ practice ──timer / Enter──▶ ambush ──intro done──▶ combat
 *   combat ──objective done──▶ victory ──outro──▶ rendezvous ──reach beacon──▶ complete
 *   practice | ambush | combat | victory | rendezvous ──player destroyed──▶ failed
 *   combat ──mission-specific loss──▶ failed
 *   complete | failed ──R──▶ practice (same mission, short, no tutorial)
 *   complete ──NEXT MISSION──▶ practice (next mission)   any ──MISSION SELECT──▶ splash
 *
 * Chapter 1: ambush = yacht + corvette warp in; combat until the corvette is
 *   crippled (loss: yacht destroyed); victory = corvette jumps away.
 * Prologue: practice = patrol with Harren; ambush = distress call + burn to
 *   Tessick-3; combat has sub-steps in G.step ("dogfight" → "runner" → "pursuit");
 *   losses: shuttle destroyed or jumps away; victory = shuttle surrenders.
 * Academy (GV-K707d): practice = the 10 s countdown; ambush = the silence before the
 *   contacts appear; combat = four Drazzan; the lights going out ends it as complete
 *   (the simulation is voided), being shot down or running dry as failed.
 * Cruise: splash ──Cruise──▶ cruise, which never ends (MISSION SELECT leaves it).
 *   No player controls: the autopilot flies laps out of and back into the Kessler.
 *
 * Pausing is a separate flag (G.paused), not a phase.
 */
export type Phase = "splash" | "practice" | "ambush" | "combat" | "victory" | "rendezvous" | "complete" | "failed" | "cruise";

export type EntityKind =
  | "player" | "yacht" | "corvette" | "drone" | "missile" | "drum"
  | "fighter" | "wingman" | "shuttle" | "engines" | "relay" | "bay";

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
  aimYaw: number;         // mouse-aim circle; the ship turns to follow it
  aimPitch: number;
  throttle: number;
  speed: number;
  shield: number;
  maxShield: number;
  /** Match speed with G.target (the Seagull's special). */
  matchSpeed: boolean;
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
  missiles: number;       // wing missiles left (Seagull)
  /** Coilgun rounds left (Infinity on ships without a magazine). */
  ammo: number;
  /** "Go cold" (the Academy sim's special): seconds of engines-off coasting left, and the recharge. */
  cold: number;
  coldCooldown: number;
  /** The Kessler's arrestor field is flying the ship (kessler.ts), not the player. */
  captured: boolean;
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

// --- Prologue entities ---------------------------------------------------------

export interface Fighter extends Entity {
  model: ShipModel;
  state: "circle" | "attack" | "break" | "flee";
  stateTimer: number;
  fireTimer: number;
  burstLeft: number;
  forward: THREE.Vector3;
  breakDir: THREE.Vector3;
  aimAt: Entity | null;   // who it is shooting at (player or Harren)
  orbit: number;          // angle around the relay while strafing it
  smokeTimer: number;
  fleeTime: number;
  /** Set on the Academy sim's Drazzan fighters, which drazzan.ts flies (the pirate AI leaves them alone). */
  alien?: DrazzanBrain;
}

/** A Drazzan fighter's own state (see drazzan.ts). */
export interface DrazzanBrain {
  mode: "converge" | "stalk" | "attack" | "break" | "blind" | "final";
  modeTime: number;
  /** Where it hangs around the player between runs (player-relative direction). */
  station: THREE.Vector3;
  crippled: boolean;
  /** 0-1 while it shimmers into existence. */
  appear: number;
  /** Hits taken during the current attack run (enough of them and it breaks off). */
  runHits: number;
}

export interface Wingman extends Entity {
  model: ShipModel;
  forward: THREE.Vector3;
  speed: number;
  fireTimer: number;
  gunSide: number;
  chase: Fighter | null;
}

export interface Shuttle extends Entity {
  model: ShuttleModel;
  /** The engine block as its own hit zone (kind "engines"); obj is kept at the block's world position. */
  engines: Entity;
  state: "docked" | "fleeing" | "disabled";
  forward: THREE.Vector3;
  speed: number;
  jumpTimer: number;
  turretTimer: number;
  smokeTimer: number;
}

/** A missile fired by the player (missiles.ts). */
export interface PlayerMissile {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  target: Entity;
  age: number;
  speed: number;
  lit: boolean;           // motor ignited (after dropping clear of the wing)
  evaded: boolean;        // the target has already tried its break turn
  smokeTimer: number;
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
  fighters: number;
  missilesFired: number;
  shots: number;
  hits: number;
}

export const emptyStats = (): Stats => ({ drones: 0, missiles: 0, drums: 0, minesLaunched: 0, mineHits: 0, fighters: 0, missilesFired: 0, shots: 0, hits: 0 });

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
  | { type: "containerReady" }
  | { type: "fighterKilled"; byPlayer: boolean; runner: boolean }
  | { type: "runnerEscaped" }
  | { type: "shuttleHullHit"; hp: number }
  | { type: "shuttleEnginesHit"; hp: number }
  | { type: "shuttleDisabled" }
  | { type: "shuttleDestroyed" }
  | { type: "shuttleJumped" }
  | { type: "dockCaptured"; speed: number }
  | { type: "dockLanded" }
  | { type: "dockOvershoot" }
  | { type: "dockScrape" }
  | { type: "dockLaunched" }
  | { type: "dockWaveOff" }
  | { type: "drazzanKilled"; left: number }
  | { type: "drazzanCrippled" }
  | { type: "drazzanFiring" }
  | { type: "wentCold" }
  | { type: "outOfRounds" };

export const G = {
  missionId: "prologue" as MissionId,
  shipId: "mk4" as ShipId,
  phase: "splash" as Phase,
  /** Mission-specific sub-step within a phase (e.g. the prologue's "dogfight" / "runner" / "pursuit"). */
  step: "",
  /** Prologue free flight: the patrol never ends until the player presses Enter. */
  freeFlight: false,
  /** Prologue landing practice: fly into the Kessler's hangar bay. */
  landingDrill: false,
  /** Cruise throttle for touch players (who have no W/S); eased off on a carrier approach. */
  touchThrottle: 0.7,
  /** The Cruise's autopilot is flying the ship (missions/cruise.ts), not the player. */
  autopilot: false,
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
  /** Next-step prompt under the crosshair during combat (walks through the cargo attack). */
  guide: "",
  guideTone: "" as "" | "info" | "wait" | "go",
  score: 0,
  stats: emptyStats(),
  missFeedbackGiven: false,

  player: null as unknown as Player,
  yacht: null as Yacht | null,
  corvette: null as Corvette | null,
  drones: [] as Drone[],
  missiles: [] as Missile[],
  drums: [] as Drum[],
  fighters: [] as Fighter[],
  wingman: null as Wingman | null,
  shuttle: null as Shuttle | null,
  /** Tessick-3 relay (prologue): hp is its integrity in %. */
  relay: null as Entity | null,
  /** The Kessler's hangar-bay entrance, for brackets, targeting and the guide (frontier only). */
  bay: null as Entity | null,
  /** Carrier landing state (kessler.ts). */
  dock: {
    state: "free" as "free" | "captured" | "landed" | "launching",
    entrySpeed: 0,      // km/s as the ship crossed the stern door
    entryOffset: 0,     // km off the bay centreline at entry
    scrapes: 0,
    rings: 0,           // approach rings flown through
    overshoot: false,   // came in too fast; the field let go
    inTunnel: false,    // inside the bay (the camera tucks in closer)
    approach: false,    // lined up behind the stern, within the approach zone
  },
  mine: null as Mine | null,
  playerMissiles: [] as PlayerMissile[],
  /** Missile seeker: what it's locking, how far along (0–1), and whether it's locked. */
  lock: { target: null as Entity | null, progress: 0, locked: false, refused: false },
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
