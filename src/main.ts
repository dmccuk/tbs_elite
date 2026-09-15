import * as THREE from "three";
import { G, runScheduled, type MissionId } from "./game";
import { damp, lerp } from "./config";
import { backCamera, backScene, camera, composer, isTouch, projectionScale, renderFrame, renderer, scene, syncBackCamera } from "./renderer";
import { createWorld } from "./world";
import { Effects } from "./fx/effects";
import { bolts } from "./weapons";
import { createPlayer, resetPlayer, setPlayerShip, shipStats, updateCamera, updatePlayer } from "./player";
import { updateEnemies } from "./enemies";
import { updateFrontier } from "./frontier";
import { updateMissiles } from "./missiles";
import { updateMine } from "./cargo";
import { boltHit } from "./combat";
import {
  MISSIONS, MISSION_ORDER, controlsActive, desiredTimeScale, missionCompleted, restart, returnToSplash,
  startMission, suggestedMission, updateMission,
} from "./mission";
import { readBest } from "./missions/common";
import { currentResults, initHud, setHelpVisible, setPauseVisible, showCallout, updateHud } from "./hud";
import { input } from "./input";
import { initTip } from "./tip";
import { audio } from "./audio";

// The Black Ship — the Prologue and Chapter 1: Lingering Systems.
// Bootstraps the scene and runs the main loop. Game logic lives in:
//   mission.ts (dispatcher) + missions/ (one script per mission) · player.ts
//   enemies.ts (Chapter 1 ships) · frontier.ts (Prologue ships) · cargo.ts · combat.ts
//   world.ts (environment) · fx/ (particles, explosions) · hud.ts + overlay.ts · audio.ts · input.ts

G.fx = new Effects(scene);
scene.add(bolts.mesh);
G.world = createWorld();
G.player = createPlayer();
resetPlayer(G.player);
initHud();
if (isTouch) input.bindTouch();

// --- Splash / mission select ---------------------------------------------------------

const splash = document.getElementById("splash-screen");

/** Show a mission's ship and star system behind the splash. */
function previewMission(id: MissionId) {
  if (G.phase !== "splash") return;
  const m = MISSIONS[id];
  setPlayerShip(m.ship);
  G.world.setTheme(m.theme);
  resetPlayer(G.player, m.start.pos, m.start.yaw);
}

/** Badges, best scores and the suggested mission on the splash cards. */
function refreshSplash() {
  const suggested = suggestedMission();
  for (const id of MISSION_ORDER) {
    const done = missionCompleted(id);
    const badge = document.getElementById(`badge-${id}`);
    if (badge) {
      badge.textContent = done ? "Completed" : id === suggested ? "Start here" : "";
      badge.classList.toggle("on", done || id === suggested);
      badge.classList.toggle("done", done);
    }
    const best = readBest(MISSIONS[id].bestKey);
    const bestEl = document.getElementById(`best-${id}`);
    if (bestEl) bestEl.textContent = best > 0 ? `Best ${best.toLocaleString()}` : "";
    document.querySelector(`.mission-card[data-mission="${id}"]`)?.classList.toggle("suggested", id === suggested);
  }
  const name = document.getElementById("start-name");
  if (name) name.textContent = suggested === "prologue" ? "the Prologue" : "Chapter 1";
  previewMission(suggested);
}
refreshSplash();
initTip();

/** Which mission a splash click / key picks, and whether it's free flight. */
function missionFromEvent(e: Event): { id: MissionId; free: boolean } {
  const target = e.target as HTMLElement;
  if (target?.closest?.("[data-free]")) return { id: "prologue", free: true };
  const card = target?.closest?.("[data-mission]") as HTMLElement | null;
  if (card?.dataset.mission && card.dataset.mission in MISSIONS) return { id: card.dataset.mission as MissionId, free: false };
  if (e instanceof KeyboardEvent) {
    if (e.code === "KeyF") return { id: "prologue", free: true };
    if (e.code === "Digit1" || e.code === "Numpad1") return { id: MISSION_ORDER[0], free: false };
    if (e.code === "Digit2" || e.code === "Numpad2") return { id: MISSION_ORDER[1], free: false };
  }
  return { id: suggestedMission(), free: false };
}

/** Keys that move focus around the title screen rather than starting a mission. */
const NAV_KEYS = new Set(["Tab", "Shift", "Control", "Alt", "Meta", "CapsLock"]);

function dismissSplash(e: Event) {
  if (G.phase !== "splash") return;
  const target = e.target as HTMLElement;
  if (target?.closest?.("a")) return; // let the support link work
  if (e instanceof KeyboardEvent && NAV_KEYS.has(e.key)) return;
  // Clicks start a mission only from its row or buttons; any other key starts the suggested one.
  if (e.type === "click" && !target?.closest?.("[data-mission], [data-free]")) return;
  splash?.classList.add("hidden");
  renderer.domElement.focus();
  input.clearQueue();
  input.mouseSteering = false; // don't steer toward wherever the start click happened
  input.lostFocus = false;     // an alt-tab while on the splash shouldn't pause the new game
  input.lockPointer();
  if (isTouch) enterFullscreen();
  const pick = missionFromEvent(e);
  startMission(pick.id, false, pick.free);
}

// Hovering a card previews its ship and star system (desktop).
for (const card of Array.from(document.querySelectorAll<HTMLElement>(".mission-card"))) {
  const id = card.dataset.mission as MissionId;
  card.addEventListener("mouseenter", () => previewMission(id));
  card.addEventListener("focusin", () => previewMission(id));
}

/** Back to the mission select without reloading the page. */
function openMissionSelect() {
  setHelp(false);
  G.paused = false;
  audio.setPaused(false);
  setPauseVisible(false);
  input.unlockPointer();
  returnToSplash();
  refreshSplash();
  splash?.classList.remove("hidden");
}

function startNextMission() {
  const next = currentResults()?.next;
  if (!next) return;
  startMission(next.id, false);
  input.lockPointer();
}

/** Phones: hide the browser bars and hold landscape where allowed (Android; iPhone Safari has no page fullscreen). */
function enterFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  el.requestFullscreen({ navigationUI: "hide" })
    .then(() => orientation.lock?.("landscape"))
    .catch(() => { /* refused: keep playing in the normal browser window */ });
}
window.addEventListener("keydown", dismissSplash);
// "click" (not touchend) so scrolling the splash on a small phone doesn't start the game.
splash?.addEventListener("click", dismissSplash);

// --- Pause, help, mute, restart ---------------------------------------------------

function setPaused(v: boolean) {
  if (G.phase === "splash") return;
  G.paused = v;
  audio.setPaused(v);
  setPauseVisible(v && !G.helpOpen);
  if (v) input.unlockPointer();
  else if (!over()) input.lockPointer();
}

function setHelp(v: boolean) {
  G.helpOpen = v;
  setHelpVisible(v);
  if (v && !over()) setPaused(true);
  else setPauseVisible(G.paused);
}

function doRestart() {
  setHelp(false);
  setPaused(false);
  restart();
  input.lockPointer();
}

const over = () => G.phase === "complete" || G.phase === "failed";

function handleGlobalActions() {
  if (input.take("mute")) showCallout(audio.toggleMute() ? "SOUND OFF" : "SOUND ON", "#88ffcc", 0.8);
  if (G.phase === "splash") { input.clearQueue(); return; }

  if (input.lostFocus) {
    // Losing focus (or Esc releasing the mouse) pauses. Drop any Esc "pause"
    // press from the same moment so it doesn't immediately unpause again.
    input.lostFocus = false;
    input.take("pause");
    if (!G.paused && !over()) setPaused(true);
  }
  if (input.take("help")) setHelp(!G.helpOpen);
  if (input.take("pause")) {
    if (G.helpOpen) setHelp(false);
    else if (!over()) setPaused(!G.paused);
  }
  if (input.take("restart") && (G.paused || over())) doRestart();
  if (input.take("next") && over()) startNextMission();
  if (G.paused) input.clearQueue();
}

const click = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener("click", fn);
click("btn-resume", () => setPaused(false));
click("btn-restart", doRestart);
click("btn-retry", doRestart);
click("btn-next", startNextMission);
click("btn-menu", openMissionSelect);
click("btn-menu-pause", openMissionSelect);
click("btn-help", () => setHelp(true));
click("btn-help-close", () => setHelp(false));
click("btn-mute", () => showCallout(audio.toggleMute() ? "SOUND OFF" : "SOUND ON", "#88ffcc", 0.8));

function showSteeringMode() {
  const aim = input.steering === "aim";
  const btn = document.getElementById("btn-steering");
  const desc = document.getElementById("steering-desc");
  if (btn) btn.textContent = aim ? "MOUSE: AIM" : "MOUSE: CLASSIC";
  if (desc) desc.textContent = aim
    ? "Move the mouse to place the white circle — the ship turns to follow it."
    : "Classic joystick — the further the cursor is from centre, the faster you turn.";
}
showSteeringMode();
click("btn-steering", () => { input.toggleSteering(); showSteeringMode(); });
// Browsers need a gesture before audio; any tap/click also unlocks it, and a
// click on the game view recaptures the mouse if it was released.
window.addEventListener("pointerdown", (e) => {
  if (G.phase === "splash" || G.paused) return;
  audio.unlock();
  if (e.target === renderer.domElement && !over()) input.lockPointer();
});
// Keys count too — e.g. a player who started from the splash with Esc (not a
// gesture as far as audio is concerned) gets sound on their next key press.
window.addEventListener("keydown", () => {
  if (G.phase !== "splash" && !G.paused) audio.unlock();
});

// --- Main loop --------------------------------------------------------------------

const clock = new THREE.Clock();
let splashAngle = 0;
// Longest frame step we simulate. `?slowgpu` (dev only) raises it for headless test runs.
const MAX_DT = import.meta.env.DEV && new URLSearchParams(location.search).has("slowgpu") ? 0.1 : 0.05;

function splashCamera(dt: number) {
  // Slow orbit around the MK-IV behind the splash screen.
  splashAngle += dt * 0.12;
  const p = G.player.obj.position;
  camera.position.set(p.x + Math.sin(splashAngle) * 0.22, p.y + 0.05, p.z + Math.cos(splashAngle) * 0.22);
  // On wide screens frame the ship right of centre, clear of the title column.
  const shift = window.innerWidth > 760 ? 0.075 : 0;
  camera.lookAt(p.x - Math.cos(splashAngle) * shift, p.y + 0.01, p.z + Math.sin(splashAngle) * shift);
  camera.updateMatrixWorld();
}

/** Advances the game by one real-time step. Returns the simulated dt (0 while paused). */
function simulate(realDt: number): number {
  if (G.paused) return 0;
  const target = desiredTimeScale();
  G.timeScale = lerp(G.timeScale, target, damp(target < G.timeScale ? 12 : 3, realDt));
  const dt = realDt * G.timeScale;
  G.time += dt;
  runScheduled();
  updateMission(dt);
  updatePlayer(dt, controlsActive());
  updateMissiles(dt, controlsActive());
  updateEnemies(dt);
  updateFrontier(dt);
  updateMine(dt);
  bolts.update(dt, boltHit);
  G.fx.update(dt, camera, projectionScale());
  const p = G.player;
  audio.setEngine(p.speed / shipStats().maxSpeed, p.boosting, p.alive);
  return dt;
}

function frame() {
  requestAnimationFrame(frame);
  const realDt = Math.min(clock.getDelta(), MAX_DT);
  input.update();
  handleGlobalActions();

  // Camera first, so the world (lens flare) and HUD use this frame's view.
  if (G.phase === "splash") {
    splashCamera(realDt);
    syncBackCamera();
    G.fx.update(realDt, camera, projectionScale());
    G.world.update(realDt, clock.elapsedTime, G.player.vel);
  } else {
    const dt = simulate(realDt);
    updateCamera(dt, realDt);
    syncBackCamera();
    G.world.update(dt, G.time, G.player.vel);
  }
  updateHud(realDt);
  renderFrame();

  // Free the mouse for the results screen's buttons.
  if (over() && input.pointerLocked) input.unlockPointer();
  // One-shot presses that nothing used this frame are dropped, so a stray key
  // can't fire off an action much later.
  input.clearQueue();
}

frame();

// Dev-only handle for poking at game state from the console (stripped from builds).
// tick(seconds) fast-forwards the simulation without rendering, for automated tests.
if (import.meta.env.DEV) {
  (window as unknown as { __game: unknown }).__game = {
    G, input, audio, renderer, startMission, scene, backScene, camera, backCamera, composer, updateCamera, syncBackCamera,
    tick(seconds: number, beforeStep?: () => void) {
      for (let t = 0; t < seconds; t += 1 / 60) {
        input.update();
        beforeStep?.();
        simulate(1 / 60);
        updateCamera(1 / 60, 1 / 60);
      }
    },
  };
}
