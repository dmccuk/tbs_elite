import * as THREE from "three";
import { G, runScheduled } from "./game";
import { damp, lerp } from "./config";
import { camera, isTouch, projectionScale, renderFrame, renderer, scene, syncBackCamera } from "./renderer";
import { createWorld } from "./world";
import { Effects } from "./fx/effects";
import { bolts } from "./weapons";
import { createPlayer, resetPlayer, updateCamera, updatePlayer } from "./player";
import { updateEnemies } from "./enemies";
import { updateMine } from "./cargo";
import { boltHit } from "./combat";
import { controlsActive, desiredTimeScale, restart, startGame, updateMission } from "./mission";
import { initHud, setHelpVisible, setPauseVisible, showCallout, updateHud } from "./hud";
import { input } from "./input";
import { audio } from "./audio";

// The Black Ship — Chapter 1: Lingering Systems.
// Bootstraps the scene and runs the main loop. Game logic lives in:
//   mission.ts (story + phases) · player.ts · enemies.ts · cargo.ts · combat.ts
//   world.ts (environment) · fx/ (particles, explosions) · hud.ts · audio.ts · input.ts

G.fx = new Effects(scene);
scene.add(bolts.mesh);
G.world = createWorld();
G.player = createPlayer();
resetPlayer(G.player);
initHud();
if (isTouch) input.bindTouch();

// --- Splash ---------------------------------------------------------------------

const splash = document.getElementById("splash-screen");
try {
  const best = Number(localStorage.getItem("tbs-best-score") ?? 0);
  const el = document.getElementById("best-score");
  if (el && best > 0) el.textContent = `Your best score: ${best.toLocaleString()}`;
} catch { /* storage blocked */ }

function dismissSplash(e: Event) {
  if (G.phase !== "splash") return;
  if ((e.target as HTMLElement)?.closest?.("a")) return; // let the Ko-fi link work
  splash?.classList.add("hidden");
  renderer.domElement.focus();
  input.clearQueue();
  input.mouseSteering = false; // don't steer toward wherever the start click happened
  input.lostFocus = false;     // an alt-tab while on the splash shouldn't pause the new game
  input.lockPointer();
  startGame();
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
  if (G.paused) input.clearQueue();
}

const click = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener("click", fn);
click("btn-resume", () => setPaused(false));
click("btn-restart", doRestart);
click("btn-retry", doRestart);
click("btn-help", () => setHelp(true));
click("btn-help-close", () => setHelp(false));
click("btn-mute", () => showCallout(audio.toggleMute() ? "SOUND OFF" : "SOUND ON", "#88ffcc", 0.8));
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
  camera.lookAt(p.x, p.y + 0.01, p.z);
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
  updateEnemies(dt);
  updateMine(dt);
  bolts.update(dt, boltHit);
  G.fx.update(dt, camera, projectionScale());
  const p = G.player;
  audio.setEngine(p.speed / 0.9, p.boosting, p.alive);
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
    G, input, audio, renderer,
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
