import * as THREE from "three";
import { G, say, type Entity, type MissionId, type Phase } from "../game";
import { TUNING, type ShipId } from "../config";
import type { WorldTheme } from "../world";
import { isTouch, scene } from "../renderer";
import { input } from "../input";
import { audio, type VoiceFx } from "../audio";
import { createBeacon } from "../models";
import { shipStats } from "../player";

// Pieces every mission script shares: the Mission interface, the practice
// tutorial runner, the rendezvous beacon, best scores and completion flags.

export interface Speaker {
  name: string;
  color: string;
  /** How their recorded lines are processed (radio, cockpit, computer…). */
  fx: VoiceFx;
}

export const STAPLES: Speaker = { name: "STAPLES", color: "#ffcc66", fx: "cockpit" };

/**
 * A comms line: shows the text and, if public/voice/<voice>.mp3 exists, plays
 * the recording through the speaker's effect. See docs/voice-lines.md.
 */
export function talk(s: Speaker, text: string, voice?: string) {
  say(s.name, text, s.color);
  if (voice) audio.voice(voice, s.fx);
}

export interface Mission {
  id: MissionId;
  /** Shown in menus and on the results panel, e.g. "PROLOGUE". */
  title: string;
  ship: ShipId;
  theme: WorldTheme;
  /** Voice of the ship's computer (hull warnings etc.). */
  computer: Speaker;
  /** localStorage key for this mission's best score. */
  bestKey: string;
  /** Where the player starts and which way they face (yaw in radians; 0 faces -Z). */
  start: { pos: THREE.Vector3; yaw: number };
  /** Top-left status panel HTML. */
  statusHtml: string;
  /** Help menu "Mission Briefing" HTML. */
  briefingHtml: () => string;
  /** Called after the shared reset, to spawn things and enter the practice phase. */
  begin(short: boolean): void;
  /** Clear module-level state (called for every mission on each start). */
  reset(): void;
  /** Phase logic, event handling and the guide prompt; once per simulated frame. */
  update(dt: number): void;
  /** X / right-click / the touch special button. */
  special(): void;
  fail(reason: string): void;
  timeScale(): number;
  /** Tab-cycle order. */
  targets(): Entity[];
  /** What to lock when nothing is locked. */
  defaultTarget(): Entity | null;
}

/** Picks the right wording for keyboard or touch players. */
export const k = (desktop: string, touch: string) => (isTouch ? touch : desktop);

export function setPhase(p: Phase) {
  G.phase = p;
  G.phaseTime = 0;
}

// --- Practice tutorial ----------------------------------------------------------

export interface TutorialStep {
  text: () => string;
  done: (dt: number) => boolean;
}

let steerTime = 0;
let boostTime = 0;
let matchTime = 0;

export function resetTutorial(short: boolean, steps: number) {
  G.firstRun = !short;
  G.practiceLeft = short ? TUNING.retryPracticeSeconds : TUNING.practiceSeconds;
  G.tutorialStep = short ? steps : 0;
  G.tutorialDone = short;
  steerTime = boostTime = matchTime = 0;
}

/** Measured on the ship's turn rate, so every steering method counts. */
export function steered(dt: number): boolean {
  const p = G.player;
  const s = shipStats();
  if (Math.hypot(p.yawVel / s.yawRate, p.pitchVel / s.pitchRate) > 0.35) steerTime += dt;
  return steerTime > 0.8;
}

export function boosted(dt: number): boolean {
  const p = G.player;
  if (p.boosting) boostTime += dt;
  return boostTime > 0.4 || (!isTouch && Math.abs(p.throttle - TUNING.player.startThrottle) > 0.2 && boostTime > 0);
}

export function matched(dt: number): boolean {
  if (G.player.matchSpeed) matchTime += dt;
  return matchTime > 0.6;
}

export const shotSomething = () => G.stats.drums > 0 || G.stats.shots > 40;
export const dodged = () => G.player.dodgeTime > 0;

/**
 * Advances the practice tutorial and countdown. Calls onTutorialDone once when
 * the last step completes, and next() when practice is over (timer or Enter).
 */
export function runPractice(steps: TutorialStep[], dt: number, onTutorialDone: () => void, next: () => void) {
  G.practiceLeft -= dt;
  if (!G.tutorialDone && steps[G.tutorialStep].done(dt)) {
    G.tutorialStep++;
    audio.beep(true);
    if (G.tutorialStep >= steps.length) {
      G.tutorialDone = true;
      onTutorialDone();
    }
  }
  G.hint = G.tutorialDone ? k("Press <b>ENTER</b> to skip ahead", "Get ready…") : steps[G.tutorialStep].text();
  // First run: slow learners get a little longer, up to a limit.
  const tutorialBusy = !G.tutorialDone && G.phaseTime < TUNING.practiceMaxSeconds;
  if ((G.practiceLeft <= 0 && !tutorialBusy) || input.take("skip")) next();
}

// --- Rendezvous beacon ----------------------------------------------------------

let beaconModel: THREE.Group | null = null;

export function placeBeacon(pos: THREE.Vector3): THREE.Group {
  const beacon = (beaconModel ??= createBeacon());
  beacon.position.copy(pos);
  // Never park the beacon inside an asteroid, or it could be unreachable.
  for (const r of G.world.rocks) {
    const clear = r.radius + 0.35;
    const d = beacon.position.distanceTo(r.pos);
    if (d < clear) beacon.position.sub(r.pos).setLength(clear).add(r.pos);
  }
  scene.add(beacon);
  G.beacon = beacon;
  return beacon;
}

/** Animates the beacon; true once the player flies into it. */
export function beaconReached(dt: number): boolean {
  const b = G.beacon;
  if (!b) return false;
  b.rotation.y += dt * 1.5;
  b.scale.setScalar(1 + Math.sin(G.time * 4) * 0.12);
  return b.position.distanceTo(G.player.obj.position) < 0.3;
}

export function removeBeacon() {
  if (!G.beacon) return;
  G.fx.flash(G.beacon.position, 0.4, 0x00ff88, 0.6);
  scene.remove(G.beacon);
  G.beacon = null;
}

// --- Scores and progress ----------------------------------------------------------

/** Reads and (on a successful run) updates the best score under `key`. */
export function recordBest(key: string, score: number, success: boolean): { best: number; newBest: boolean } {
  let best = 0;
  try { best = Number(localStorage.getItem(key) ?? 0) || 0; } catch { /* storage blocked */ }
  const newBest = success && score > best;
  if (newBest) {
    best = score;
    try { localStorage.setItem(key, String(best)); } catch { /* ignore */ }
  }
  return { best, newBest };
}

export function readBest(key: string): number {
  try { return Number(localStorage.getItem(key) ?? 0) || 0; } catch { return 0; }
}

const doneKey = (id: MissionId) => `tbs-done-${id}`;

export function markCompleted(id: MissionId) {
  try { localStorage.setItem(doneKey(id), "1"); } catch { /* ignore */ }
}

export function isCompleted(id: MissionId): boolean {
  try { return localStorage.getItem(doneKey(id)) === "1"; } catch { return false; }
}

export function formatTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
