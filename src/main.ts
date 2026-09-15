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
import { updateDrazzan } from "./drazzan";
import { updateMissiles } from "./missiles";
import { updateKessler } from "./kessler";
import { updateMine } from "./cargo";
import { boltHit } from "./combat";
import {
  MISSIONS, MISSION_ORDER, controlsActive, desiredTimeScale, missionCompleted, restart, returnToSplash,
  startMission, suggestedMission, updateMission, type Variant,
} from "./mission";
import { readBest } from "./missions/common";
import { currentResults, initHud, setHelpVisible, setPauseVisible, showCallout, showCruiseCaption, showSoundState, updateHud } from "./hud";
import { input } from "./input";
import { forceCockpit, initCockpit, setView, toggleView, updateCockpit } from "./cockpit";
import { cruiseCameraVelocity, currentShot, cycleCruiseView, setCruiseView, updateCruiseCamera } from "./cinematic";
import { harrenShip } from "./missions/cruise-harren";
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
initCockpit();
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
  if (name) name.textContent = suggested === "prologue" ? "the Prologue" : suggested === "academy" ? "Academy Days" : "Chapter 1";
  previewMission(suggested);
}
refreshSplash();
initTip();

/** Which mission a splash click / key picks, and which way to play it. */
function missionFromEvent(e: Event): { id: MissionId; variant: Variant } {
  const target = e.target as HTMLElement;
  const alt = target?.closest?.("[data-variant]") as HTMLElement | null;
  if (alt) return { id: "prologue", variant: alt.dataset.variant as Variant };
  const card = target?.closest?.("[data-mission]") as HTMLElement | null;
  if (card?.dataset.mission && card.dataset.mission in MISSIONS) return { id: card.dataset.mission as MissionId, variant: "mission" };
  if (e instanceof KeyboardEvent) {
    if (e.code === "KeyF") return { id: "prologue", variant: "free" };
    if (e.code === "KeyL") return { id: "prologue", variant: "landing" };
    if (e.code === "KeyC") return { id: "cruise", variant: "mission" };
    if (e.code === "Digit1" || e.code === "Numpad1") return { id: MISSION_ORDER[0], variant: "mission" };
    if (e.code === "Digit2" || e.code === "Numpad2") return { id: MISSION_ORDER[1], variant: "mission" };
    if (e.code === "Digit3" || e.code === "Numpad3") return { id: MISSION_ORDER[2], variant: "mission" };
  }
  return { id: suggestedMission(), variant: "mission" };
}

/** Keys that move focus around the title screen rather than starting a mission. */
const NAV_KEYS = new Set(["Tab", "Shift", "Control", "Alt", "Meta", "CapsLock"]);

function dismissSplash(e: Event) {
  if (G.phase !== "splash") return;
  const target = e.target as HTMLElement;
  if (target?.closest?.("a")) return; // let the support link work
  if (e instanceof KeyboardEvent && (NAV_KEYS.has(e.key) || e.code === "KeyM")) return; // M mutes, it doesn't start a mission
  // Clicks start a mission only from its row or buttons; any other key starts the suggested one.
  if (e.type === "click" && !target?.closest?.("[data-mission], [data-variant]")) return;
  splash?.classList.add("hidden");
  renderer.domElement.focus();
  input.clearQueue();
  input.mouseSteering = false; // don't steer toward wherever the start click happened
  input.lostFocus = false;     // an alt-tab while on the splash shouldn't pause the new game
  const pick = missionFromEvent(e);
  if (pick.id !== "cruise") input.lockPointer(); // the Cruise leaves the mouse free
  if (isTouch) enterFullscreen();
  startMission(pick.id, false, pick.variant);
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
  else if (wantsMouse()) input.lockPointer();
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
  if (wantsMouse()) input.lockPointer();
}

const over = () => G.phase === "complete" || G.phase === "failed";
/** Does the game want the mouse captured? Not on the results screen, and never in the Cruise (it runs hands-off, e.g. on a second display). */
const wantsMouse = () => !over() && G.phase !== "cruise";

function handleGlobalActions() {
  if (input.take("mute")) toggleSound(true);
  if (G.phase === "splash") { input.clearQueue(); return; }

  if (input.lostFocus) {
    // Losing focus (or Esc releasing the mouse) pauses. Drop any Esc "pause"
    // press from the same moment so it doesn't immediately unpause again.
    // The Cruise keeps running: clicking over to another window is the point of it.
    input.lostFocus = false;
    if (G.phase !== "cruise") {
      input.take("pause");
      if (!G.paused && !over()) setPaused(true);
    }
  }
  handleViewKeys();
  if (input.take("help")) setHelp(!G.helpOpen);
  if (input.take("pause")) {
    if (G.helpOpen) setHelp(false);
    else if (!over()) setPaused(!G.paused);
  }
  if (input.take("restart") && (G.paused || over())) doRestart();
  if (input.take("next") && over()) startNextMission();
  if (G.paused) input.clearQueue();
}

/** V cycles the views; 1 / 2 / 3 pick one (behind / cinematic / cockpit; missions have no cinematic view). */
function handleViewKeys() {
  const cruise = G.phase === "cruise";
  const pick = input.take("view1") ? "chase" : input.take("view2") ? "cinematic" : input.take("view3") ? "cockpit" : null;
  if (cruise) {
    if (input.take("view")) cycleCruiseView();
    else if (pick) setCruiseView(pick);
    else return;
    showCruiseCaption();
    return;
  }
  let v: "chase" | "cockpit" | null = null;
  if (input.take("view")) v = toggleView();
  else if (pick === "chase" || pick === "cockpit") v = setView(pick);
  if (v) showCallout(v === "cockpit" ? "COCKPIT VIEW" : "CHASE VIEW", "#88ffcc", 0.9);
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
click("btn-mute", () => toggleSound(true));

/** M, the pause menu's SOUND button and the speaker icons all switch sound on and off. */
function toggleSound(callout: boolean) {
  audio.unlock(); // a click on the icon counts as the gesture that starts audio
  const muted = audio.toggleMute();
  showSoundState(muted);
  if (callout && G.phase !== "splash" && G.phase !== "cruise") showCallout(muted ? "SOUND OFF" : "SOUND ON", "#88ffcc", 0.8);
}
for (const el of Array.from(document.querySelectorAll<HTMLElement>(".sound-toggle"))) {
  el.addEventListener("click", (e) => {
    e.stopPropagation(); // not a mission pick on the title screen
    toggleSound(false);
    el.blur();          // so Space / Enter don't press it again
  });
}
showSoundState(audio.muted);

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
  if (e.target === renderer.domElement && wantsMouse()) input.lockPointer();
});
// The Cruise leaves the mouse free, and hides the cursor over the game when it stops moving.
let lastMouseMove = performance.now();
window.addEventListener("pointermove", () => {
  lastMouseMove = performance.now();
  if (document.body.classList.contains("idle-cursor")) document.body.classList.remove("idle-cursor");
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

/** The Cruise films itself; everything else uses the chase / cockpit camera. */
function placeCamera(dt: number, realDt: number) {
  if (G.phase === "cruise") {
    updateCruiseCamera(dt, realDt);
  } else {
    forceCockpit(null);
    updateCamera(dt, realDt);
  }
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
  updateKessler(dt);
  updateMissiles(dt, controlsActive() && !G.player.captured);
  updateEnemies(dt);
  updateFrontier(dt);
  updateDrazzan(dt);
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
    placeCamera(dt, realDt);
    syncBackCamera();
    G.world.update(dt, G.time, G.phase === "cruise" ? cruiseCameraVelocity() : G.player.vel);
  }
  updateCockpit(realDt);
  updateHud(realDt);
  renderFrame();

  // Free the mouse for the results screen's buttons (and always in the Cruise).
  if (!wantsMouse() && G.phase !== "splash" && input.pointerLocked) input.unlockPointer();
  const idle = G.phase === "cruise" && !G.paused && performance.now() - lastMouseMove > 2500;
  if (idle !== document.body.classList.contains("idle-cursor")) document.body.classList.toggle("idle-cursor", idle);
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
    placeCamera, updateCockpit, cycleCruiseView, toggleView, currentShot, harrenShip,
    tick(seconds: number, beforeStep?: () => void) {
      for (let t = 0; t < seconds; t += 1 / 60) {
        input.update();
        beforeStep?.();
        simulate(1 / 60);
        placeCamera(1 / 60, 1 / 60);
      }
    },
  };
}
