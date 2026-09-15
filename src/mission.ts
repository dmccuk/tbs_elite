import { G, emptyStats, type MissionId } from "./game";
import { SHIPS } from "./config";
import { input } from "./input";
import { audio } from "./audio";
import { scene } from "./renderer";
import { resetPlayer, setPlayerShip } from "./player";
import { clearEnemies } from "./enemies";
import { clearFrontier } from "./frontier";
import { clearMine } from "./cargo";
import { clearPlayerMissiles, rearmMissiles } from "./missiles";
import { bolts } from "./weapons";
import { hideBanners, hideResults, setMissionHud } from "./hud";
import { isCompleted, readBest, talk, type Mission } from "./missions/common";
import { chapter1 } from "./missions/chapter1";
import { prologue } from "./missions/prologue";

// Runs whichever mission is active. Each mission script lives in src/missions/
// and implements the Mission interface (missions/common.ts); this module owns
// starting, restarting and switching missions, plus the bits every mission
// shares (hull alarms, the special button, target locking).

export const MISSIONS: Record<MissionId, Mission> = { prologue, chapter1 };
/** Story order: the prologue comes before Chapter 1. */
export const MISSION_ORDER: MissionId[] = ["prologue", "chapter1"];

const LAST_KEY = "tbs-last-mission";

export const currentMission = () => MISSIONS[G.missionId];

let hullWarned = false;
let lastHullAlarm = 0;

/** Wipe every entity, effect, scheduled callback and stat. */
function clearAll() {
  clearEnemies();
  clearFrontier();
  clearMine();
  clearPlayerMissiles();
  bolts.clear();
  G.fx.clear();
  if (G.beacon) scene.remove(G.beacon);
  G.beacon = null;
  G.scheduled = [];
  G.events = [];
  G.comms = [];
  G.popups = [];
  G.score = 0;
  G.stats = emptyStats();
  G.combatTime = 0;
  G.timeScale = 1;
  G.missFeedbackGiven = false;
  G.target = null;
  G.aimTarget = null;
  G.paused = false;
  G.step = "";
  G.guide = "";
  G.guideTone = "";
  G.failReason = "";
  hullWarned = false;
  audio.stopVoice();
  hideResults();
  hideBanners();
  input.clearQueue();
  for (const m of Object.values(MISSIONS)) m.reset();
}

/**
 * Start (or restart) a mission. `short` skips the tutorial and shortens practice;
 * `free` starts the Prologue as free flight (fly around; Enter starts the mission).
 */
export function startMission(id: MissionId, short = false, free = false) {
  audio.unlock();
  clearAll();
  G.missionId = id;
  G.freeFlight = free && id === "prologue";
  const m = MISSIONS[id];
  setPlayerShip(m.ship);
  G.world.setTheme(m.theme);
  resetPlayer(G.player, m.start.pos, m.start.yaw);
  rearmMissiles();
  setMissionHud({ id, statusHtml: m.statusHtml, briefingHtml: m.briefingHtml(), special: SHIPS[m.ship].special, missiles: SHIPS[m.ship].missiles });
  try { localStorage.setItem(LAST_KEY, id); } catch { /* ignore */ }
  m.begin(short);
}

export function restart() {
  startMission(G.missionId, true, G.freeFlight);
}

/** The mission after the current one, if there is one. */
export function nextMissionId(): MissionId | null {
  const i = MISSION_ORDER.indexOf(G.missionId);
  return MISSION_ORDER[i + 1] ?? null;
}

/** Back to the splash / mission select, with the world cleared. */
export function returnToSplash() {
  clearAll();
  G.phase = "splash";
}

/** Which mission the splash should offer first: the first one not yet finished, else the last played. */
export function suggestedMission(): MissionId {
  const unfinished = MISSION_ORDER.find((id) => !missionCompleted(id));
  if (unfinished) return unfinished;
  try {
    const last = localStorage.getItem(LAST_KEY) as MissionId | null;
    if (last && last in MISSIONS) return last;
  } catch { /* ignore */ }
  return MISSION_ORDER[0];
}

/** Finished at least once (a saved best score counts, for players from before the prologue existed). */
export function missionCompleted(id: MissionId): boolean {
  return isCompleted(id) || readBest(MISSIONS[id].bestKey) > 0;
}

/** Per-frame: the special button, the mission script, hull alarms and target locking. */
export function updateMission(dt: number) {
  G.phaseTime += dt;
  const m = currentMission();

  if (input.take("cargo") && controlsActive()) m.special();
  m.update(dt);
  G.events.length = 0;

  // Player hull warnings
  const p = G.player;
  if (p.alive && p.hp < p.maxHp * 0.3 && controlsActive()) {
    if (!hullWarned) {
      hullWarned = true;
      talk(m.computer, "Hull integrity critical. Recommend not dying.", `${m.id === "prologue" ? "pro" : "c1"}_computer_hull_critical`);
    }
    if (G.time - lastHullAlarm > 2.5) {
      lastHullAlarm = G.time;
      audio.alarm();
    }
  }
  if (!p.alive && G.phase !== "failed" && G.phase !== "complete") m.fail("player");

  // Keep the lock on something sensible, and let Tab cycle through targets.
  if (G.target && !G.target.alive) G.target = null;
  if (!G.target) G.target = m.defaultTarget();
  if (input.take("target")) {
    const list = m.targets();
    if (list.length > 0) {
      const i = G.target ? list.indexOf(G.target) : -1;
      G.target = list[(i + 1) % list.length];
      audio.lock();
    }
  }
}

export function controlsActive(): boolean {
  return G.player.alive && (G.phase === "practice" || G.phase === "ambush" || G.phase === "combat" || G.phase === "victory" || G.phase === "rendezvous");
}

/** Desired simulation speed (slow motion moments are mission-specific). */
export function desiredTimeScale(): number {
  return currentMission().timeScale();
}
