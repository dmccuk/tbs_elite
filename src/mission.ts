import * as THREE from "three";
import { G, addScore, say, schedule, type Phase } from "./game";
import { SCORE, TUNING, formatDistance } from "./config";
import { input } from "./input";
import { audio } from "./audio";
import { isTouch, scene } from "./renderer";
import { resetPlayer, setCargoVisible } from "./player";
import { clearEnemies, destroyDrone, destroyMissile, spawnCorvette, spawnDrums, spawnYacht } from "./enemies";
import { clearMine, detonateMine, launchMine } from "./cargo";
import { bolts } from "./weapons";
import { createBeacon } from "./models";
import { hideBanners, hideResults, showBanner, showCallout, showResults, type Results } from "./hud";

// Chapter 1 mission script: tutorial, ambush, combat, and both endings.
// See the Phase type in game.ts for the legal state transitions.

const KALON = { name: "CMDR KALON", color: "#6ab8ff" };
const COMPUTER = { name: "MK-IV COMPUTER", color: "#88ffcc" };
const HOSTILE = { name: "HOSTILE", color: "#ff5555" };
const STAPLES = { name: "STAPLES", color: "#ffcc66" };

const BEST_KEY = "tbs-best-score";

/** Picks the right wording for keyboard or touch players. */
const k = (desktop: string, touch: string) => (isTouch ? touch : desktop);

function setPhase(p: Phase) {
  G.phase = p;
  G.phaseTime = 0;
}

// --- Start / restart ----------------------------------------------------------

export function startGame() {
  audio.unlock();
  beginPractice(false);
}

export function restart() {
  clearEnemies();
  clearMine();
  bolts.clear();
  G.fx.clear();
  if (G.beacon) scene.remove(G.beacon);
  G.beacon = null;
  G.scheduled = [];
  G.events = [];
  G.comms = [];
  G.popups = [];
  G.score = 0;
  G.stats = { drones: 0, missiles: 0, drums: 0, minesLaunched: 0, mineHits: 0, shots: 0, hits: 0 };
  G.combatTime = 0;
  G.timeScale = 1;
  G.missFeedbackGiven = false;
  G.target = null;
  G.paused = false;
  audio.stopVoice();
  hideResults();
  hideBanners();
  resetPlayer(G.player);
  input.clearQueue();
  beginPractice(true);
}

// --- Practice (the quiet before the storm) ------------------------------------

const TUTORIAL = [
  { text: () => k("Move the <b>MOUSE</b> to steer — or use <b>ARROW KEYS</b> / <b>A D</b>", "Drag on the <b>LEFT</b> side of the screen to steer") },
  { text: () => k("Hold <b>SPACE</b> or <b>LEFT-CLICK</b> to fire. Blast those junk drums!", "Hold <b>FIRE</b> to shoot. Blast those junk drums!") },
  { text: () => k("<b>W / S</b> sets your speed. Hold <b>SHIFT</b> to boost", "Hold <b>BOOST</b> for a burst of speed") },
  { text: () => k("Tap <b>Q</b> or <b>E</b> to dodge-roll — you're untouchable mid-roll", "Tap <b>ROLL</b> to dodge — you're untouchable mid-roll") },
  { text: () => k("Press <b>X</b> to launch your cargo container, then <b>X</b> again to blow it up", "Tap <b>CARGO</b> to launch the container, tap again to blow it up") },
];

let steerTime = 0;
let boostTime = 0;
let lastYachtWarn = 1;
let lastHullAlarm = 0;
let hullWarned = false;
let firstEvents = new Set<string>();

function beginPractice(short: boolean) {
  setPhase("practice");
  G.firstRun = !short;
  G.practiceLeft = short ? TUNING.retryPracticeSeconds : TUNING.practiceSeconds;
  G.tutorialStep = short ? TUTORIAL.length : 0;
  G.tutorialDone = short;
  steerTime = boostTime = 0;
  lastYachtWarn = 1;
  hullWarned = false;
  firstEvents = new Set();
  G.objective = short ? "STAND BY" : "ROUTINE WASTE RUN";
  G.hint = short ? "Ambush incoming…" : "";
  if (!short) {
    spawnDrums();
    say(COMPUTER.name, "Waste run 4471. Container secured. Nothing ever happens out here.", COMPUTER.color);
  } else {
    say(COMPUTER.name, "Rewinding the tape. Same corvette, same bad day. Get ready.", COMPUTER.color);
  }
}

function updatePractice(dt: number) {
  G.practiceLeft -= dt;
  const p = G.player;

  if (!G.tutorialDone) {
    const step = G.tutorialStep;
    let done = false;
    if (step === 0) {
      if (Math.hypot(input.steerX, input.steerY) > 0.35) steerTime += dt;
      done = steerTime > 0.8;
    } else if (step === 1) {
      done = G.stats.drums > 0 || G.stats.shots > 40;
    } else if (step === 2) {
      if (p.boosting) boostTime += dt;
      done = boostTime > 0.4 || (!isTouch && Math.abs(p.throttle - TUNING.player.startThrottle) > 0.2 && boostTime > 0);
    } else if (step === 3) {
      done = p.dodgeTime > 0;
    } else if (step === 4) {
      done = G.stats.minesLaunched > 0 && !G.mine;
    }
    if (done) {
      G.tutorialStep++;
      audio.beep(true);
      if (G.tutorialStep >= TUTORIAL.length) {
        G.tutorialDone = true;
        say(STAPLES.name, "Right. Now back to staring at the void for another eleven hours.", STAPLES.color);
      }
    }
  }
  G.hint = G.tutorialDone ? k("Press <b>ENTER</b> to skip ahead", "Get ready…") : TUTORIAL[G.tutorialStep].text();

  // First run: give slow learners a little longer, but never more than a minute.
  const tutorialBusy = !G.tutorialDone && G.phaseTime < 60;
  if ((G.practiceLeft <= 0 && !tutorialBusy) || input.take("skip")) beginAmbush();
}

// --- Ambush -------------------------------------------------------------------

function beginAmbush() {
  setPhase("ambush");
  G.objective = "⚠ WARP SIGNATURES DETECTED";
  G.hint = "";
  for (const d of G.drums) scene.remove(d.obj);
  G.drums = [];
  // Whatever was used in practice, start the fight with a full rack.
  G.player.containers = TUNING.mine.rackSize;
  G.player.reloadTimer = 0;
  setCargoVisible(true);
  audio.alarm();
  schedule(0.4, () => audio.alarm());
  showBanner("⚠ EMERGENCY: WARP SIGNATURES DETECTED ⚠", "#ff4444", 2.8);
  audio.radio("/voice_redford_alert.mp3");
  say(COMPUTER.name, "Warp signatures detected in the Lingering Systems!", COMPUTER.color);

  schedule(1.2, () => { G.yacht = spawnYacht(); });
  schedule(2.8, () => {
    G.corvette = spawnCorvette();
    G.target = G.corvette;
    showBanner("HOSTILE VESSEL DETECTED! ROYAL YACHT UNDER ATTACK!", "#ff4444", 3);
  });
  schedule(4.2, () => {
    say(KALON.name, "Mayday, mayday! This is the Royal Favor — a House Cayston corvette is on our tail! Anyone out there?", KALON.color);
  });
  schedule(5.2, beginCombat);
}

// --- Combat -------------------------------------------------------------------

function beginCombat() {
  setPhase("combat");
  G.combatTime = 0;
  G.objective = "PROTECT THE ROYAL FAVOR";
  G.hint = k("Fly at the corvette and press <b>X</b> to launch cargo", "Fly at the corvette and tap <b>CARGO</b>");
  schedule(2.5, () => {
    say(STAPLES.name, "My guns won't scratch that thing… but a tonne of compacted bio-waste might.", STAPLES.color);
  });
}

function updateCombat(dt: number) {
  G.combatTime += dt;
  const y = G.yacht;
  if (y && y.alive) {
    const h = y.hp / y.maxHp;
    if (h < 0.5 && lastYachtWarn > 0.5) {
      lastYachtWarn = 0.5;
      say(KALON.name, "Hull at fifty percent! We can't take much more of this!", KALON.color);
    } else if (h < 0.25 && lastYachtWarn > 0.25) {
      lastYachtWarn = 0.25;
      say(KALON.name, "Hull critical! Staples, whatever you're planning — do it NOW!", KALON.color);
      audio.alarm();
    }
  }
  if (y && !y.alive) fail("yacht");
}

function handleEvents() {
  const once = (key: string) => {
    if (firstEvents.has(key)) return false;
    firstEvents.add(key);
    return true;
  };
  for (const e of G.events) {
    switch (e.type) {
      case "missileVolley":
        if (e.atPlayer && once("missileAtPlayer")) {
          say(COMPUTER.name, "Missile lock on US. Shoot it down or dodge-roll at the last second.", COMPUTER.color);
          audio.alarm();
        } else if (once("volley")) {
          say(KALON.name, "Incoming missiles! Shoot them down before they reach us!", KALON.color);
        }
        break;
      case "dronesLaunched":
        if (once("drones")) say(COMPUTER.name, "Corvette launching attack drones. They seem to want you specifically.", COMPUTER.color);
        break;
      case "droneKilled":
        if (once("droneKill")) say(STAPLES.name, "Scratch one drone.", STAPLES.color);
        break;
      case "armourPing":
        if (once("armour")) say(COMPUTER.name, "Corvette armour rating: excessive. Guns ineffective. Suggest the cargo.", COMPUTER.color);
        break;
      case "mineLaunched":
        if (G.phase === "combat") G.hint = k("Container away! Press <b>X</b> when the ring turns <b style='color:#6f6'>GREEN</b>", "Container away! Tap <b>CARGO</b> when the ring turns <b style='color:#6f6'>GREEN</b>");
        break;
      case "mineHit":
        onMineHit();
        break;
      case "mineMiss": {
        showCallout(e.reason === "shot" ? "SHOT DOWN" : "MISSED", "#ffaa00", 1.4);
        const reload = Math.ceil(G.player.reloadTimer);
        const next = G.player.containers > 0 ? "One container left on the rack." : `Compactor squeezing out another… ${reload}s.`;
        if (e.reason === "far") say(COMPUTER.name, `Detonation outside blast radius — missed by ${formatDistance(e.distance)}. ${next}`, COMPUTER.color);
        else if (e.reason === "shot") say(COMPUTER.name, `Container shot down by point-defence. Detonate sooner! ${next}`, COMPUTER.color);
        else say(COMPUTER.name, `Container lost. Launch it closer to the corvette. ${next}`, COMPUTER.color);
        if (!G.missFeedbackGiven) {
          G.missFeedbackGiven = true;
          audio.radio("/voice_redford_failed.mp3");
        }
        G.hint = k("Launch another container with <b>X</b>", "Tap <b>CARGO</b> to launch another");
        break;
      }
      case "containerReady":
        if (G.phase === "combat") {
          say(COMPUTER.name, "Compactor has produced a fresh container. Lovely.", COMPUTER.color);
          G.hint = k("Container ready! Fly at the corvette and press <b>X</b>", "Container ready! Fly at the corvette and tap <b>CARGO</b>");
        }
        break;
      default:
        break;
    }
  }
  G.events.length = 0;
}

function onMineHit() {
  const c = G.corvette;
  if (!c || G.phase !== "combat") return;
  if (c.crippled) {
    beginVictory();
    return;
  }
  const left = TUNING.corvette.mineHitsToCripple - c.hits;
  showCallout("DIRECT HIT!", "#ffdd44", 1.6);
  if (c.hits === 1) {
    say(KALON.name, "Direct hit! Their shields are buckling — keep it up!", KALON.color);
    schedule(2.5, () => say(HOSTILE.name, "Is that… garbage? You'll pay for that, hauler.", HOSTILE.color));
  } else {
    say(KALON.name, "Their hull's breached — they're venting plasma! One more should do it!", KALON.color);
    schedule(2.5, () => say(HOSTILE.name, "All batteries! Kill that garbage scow NOW!", HOSTILE.color));
  }
  G.hint = k(`${left} more hit${left > 1 ? "s" : ""} to cripple it — the compactor is making another container`,
    `${left} more hit${left > 1 ? "s" : ""} — the compactor is making another container`);
  // Retaliation: an immediate drone wave, and from now on missiles come for you too.
  c.droneTimer = 1.5;
  c.missileTimer = Math.min(c.missileTimer, 4);
}

// --- Victory ------------------------------------------------------------------

function beginVictory() {
  if (G.phase !== "combat") return;
  setPhase("victory");
  addScore(SCORE.cripple, G.corvette?.obj.position, "#ffdd44");
  G.objective = "CORVETTE CRIPPLED";
  G.hint = "";
  showCallout("CORVETTE CRIPPLED!", "#ffdd44", 2.5);
  showBanner("HOSTILE VESSEL DAMAGED! Enemy initiating emergency jump!", "#ffaa00", 4);
  audio.radio("/voice_redford_damaged.mp3");

  // The drones lose their control link and pop one by one.
  say(COMPUTER.name, "Drone control link lost. Oh, look at them go.", COMPUTER.color);
  G.drones.forEach((d, i) => schedule(0.6 + i * 0.35, () => destroyDrone(d, false)));
  G.missiles.forEach((m, i) => schedule(0.3 + i * 0.1, () => destroyMissile(m, false)));

  schedule(5.4, () => {
    const c = G.corvette;
    if (c) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(c.obj.quaternion);
      G.fx.warp(c.obj.position, fwd, 0.6);
      audio.warp();
      scene.remove(c.obj);
      c.alive = false;
      G.corvette = null;
    }
    say(HOSTILE.name, "This isn't over, Staples. House Cayston never forgets a face. Or a smell.", HOSTILE.color);
  });

  schedule(6.5, () => {
    audio.radio("/voice_redford_complete.mp3");
    say(KALON.name, "Resourceful work, Warrant Officer Staples. You've saved our VIP with those… creative tactics of yours.", KALON.color);
  });
  schedule(12, beginRendezvous);
}

let beaconModel: THREE.Group | null = null;

function beginRendezvous() {
  setPhase("rendezvous");
  const y = G.yacht;
  const beacon = (beaconModel ??= createBeacon());
  const base = y && y.alive ? y.obj.position : G.player.obj.position;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(y ? y.obj.quaternion : G.player.obj.quaternion);
  beacon.position.copy(base).addScaledVector(fwd, 0.9);
  // Never park the beacon inside an asteroid, or it could be unreachable.
  for (const r of G.world.rocks) {
    const clear = r.radius + 0.35;
    const d = beacon.position.distanceTo(r.pos);
    if (d < clear) beacon.position.sub(r.pos).setLength(clear).add(r.pos);
  }
  scene.add(beacon);
  G.beacon = beacon;
  if (y && y.alive) y.holdAt = beacon.position.clone().add(new THREE.Vector3(0.35, 0.1, 0));
  G.target = null;
  G.objective = "RENDEZVOUS WITH THE ROYAL FAVOR";
  G.hint = "Fly into the green beacon";
  showBanner("RENDEZVOUS COORDINATES RECEIVED: Set course for waypoint.", "#00ff88", 3.5);
  say(KALON.name, "House Cayston has turned traitor. Join us, Staples — His Majesty will want to meet the pilot who throws garbage at warships.", KALON.color);
}

function updateRendezvous(dt: number) {
  const b = G.beacon;
  if (!b) return;
  b.rotation.y += dt * 1.5;
  b.scale.setScalar(1 + Math.sin(G.time * 4) * 0.12);
  if (b.position.distanceTo(G.player.obj.position) < 0.3) complete();
}

function complete() {
  setPhase("complete");
  if (G.beacon) {
    G.fx.flash(G.beacon.position, 0.4, 0x00ff88, 0.6);
    scene.remove(G.beacon);
    G.beacon = null;
  }
  audio.reload();
  showBanner("RENDEZVOUS COMPLETE. Welcome to the fleet, Warrant Officer.", "#00ff88", 3.5);
  G.objective = "MISSION COMPLETE";
  G.hint = "";
  schedule(2.5, () => showResults(buildResults(true)));
}

// --- Failure --------------------------------------------------------------------

function fail(reason: "yacht" | "player") {
  if (G.phase === "failed" || G.phase === "complete") return;
  // Cancel pending story beats (e.g. the victory/rendezvous sequence).
  G.scheduled = [];
  G.events.length = 0;
  setPhase("failed");
  G.failReason = reason;
  G.timeScale = 1;
  clearMine();
  G.objective = "MISSION FAILED";
  G.hint = "";
  if (reason === "yacht") {
    showBanner("⚠ ROYAL FAVOR DESTROYED ⚠", "#ff4444", 3.5);
    schedule(1.5, () => say(HOSTILE.name, "You just made a BIG mistake, garbage hauler. You're a traitor to House Cayston.", HOSTILE.color));
    // The corvette has what it came for, and leaves.
    schedule(4, () => {
      const c = G.corvette;
      if (c && c.alive) {
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(c.obj.quaternion);
        G.fx.warp(c.obj.position, fwd, 0.6);
        audio.warp();
        scene.remove(c.obj);
        c.alive = false;
        G.corvette = null;
      }
      for (const d of G.drones) destroyDrone(d, false);
    });
  } else {
    showBanner("HULL BREACH. SYSTEMS CRITICAL. ALL HANDS LOST.", "#ff4444", 3.5);
  }
  schedule(4.5, () => showResults(buildResults(false)));
}

// --- Results --------------------------------------------------------------------

function buildResults(success: boolean): Results {
  const s = G.stats;
  const rows: [string, string][] = [
    [`Drones destroyed × ${s.drones}`, `${s.drones * SCORE.drone}`],
    [`Missiles intercepted × ${s.missiles}`, `${s.missiles * SCORE.missile}`],
    [`Container hits × ${s.mineHits}`, `${s.mineHits * SCORE.mineHit}`],
  ];
  if (s.drums) rows.unshift([`Junk drums × ${s.drums}`, `${s.drums * SCORE.drum}`]);

  if (success) {
    rows.push(["Corvette crippled", `${SCORE.cripple}`]);
    const yachtHull = Math.round(G.yacht?.hp ?? 0);
    const playerHull = Math.round(G.player.hp);
    const timeBonus = Math.max(0, Math.round((SCORE.parTime - G.combatTime) * SCORE.timeBonusPerSecond));
    rows.push([`Royal Favor hull ${yachtHull}%`, `${yachtHull * SCORE.yachtHullPoint}`]);
    rows.push([`Your hull ${playerHull}%`, `${playerHull * SCORE.playerHullPoint}`]);
    rows.push([`Time ${formatTime(G.combatTime)}`, `${timeBonus}`]);
    G.score += yachtHull * SCORE.yachtHullPoint + playerHull * SCORE.playerHullPoint + timeBonus;
  }
  const accuracy = s.shots > 0 ? Math.round((s.hits / s.shots) * 100) : 0;

  let best = 0;
  try { best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0; } catch { /* ignore */ }
  const newBest = success && G.score > best;
  if (newBest) {
    best = G.score;
    try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* ignore */ }
  }

  return {
    success,
    reason: G.failReason as "yacht" | "player",
    rows,
    accuracy,
    total: G.score,
    grade: success ? grade(G.score) : "F",
    best,
    newBest,
  };
}

// Calibrated against a near-perfect test bot (~11,500), so S takes real effort.
function grade(score: number): string {
  if (score >= 12000) return "S";
  if (score >= 9500) return "A";
  if (score >= 7500) return "B";
  if (score >= 5500) return "C";
  return "D";
}

function formatTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// --- Per-frame ------------------------------------------------------------------

/** Handles the cargo button and phase logic. Called once per simulated frame. */
export function updateMission(dt: number) {
  G.phaseTime += dt;

  if (input.take("cargo") && controlsActive()) {
    if (G.mine) detonateMine();
    else if (!launchMine() && G.player.alive && G.player.containers <= 0) {
      audio.beep();
      showCallout(`RELOADING ${Math.ceil(G.player.reloadTimer)}s`, "#ffaa00", 0.9);
    }
  }

  switch (G.phase) {
    case "practice": updatePractice(dt); break;
    case "combat": updateCombat(dt); break;
    case "rendezvous": updateRendezvous(dt); break;
    default: break;
  }
  handleEvents();

  // Player hull warnings
  const p = G.player;
  if (p.alive && p.hp < p.maxHp * 0.3 && controlsActive()) {
    if (!hullWarned) {
      hullWarned = true;
      say(COMPUTER.name, "Hull integrity critical. Recommend not dying.", COMPUTER.color);
    }
    if (G.time - lastHullAlarm > 2.5) {
      lastHullAlarm = G.time;
      audio.alarm();
    }
  }
  if (!p.alive && G.phase !== "failed" && G.phase !== "complete") fail("player");

  // Keep the lock on something sensible, and let Tab cycle hostiles.
  if (G.target && !G.target.alive) G.target = null;
  if (!G.target && G.corvette?.alive) G.target = G.corvette;
  if (input.take("target")) cycleTarget();
}

export function controlsActive(): boolean {
  return G.player.alive && (G.phase === "practice" || G.phase === "ambush" || G.phase === "combat" || G.phase === "victory" || G.phase === "rendezvous");
}

function cycleTarget() {
  const list = [
    ...(G.corvette?.alive ? [G.corvette] : []),
    ...G.drones.filter((d) => d.alive),
    ...(G.yacht?.alive ? [G.yacht] : []),
  ];
  if (list.length === 0) return;
  const i = G.target ? list.indexOf(G.target as never) : -1;
  G.target = list[(i + 1) % list.length];
  audio.lock();
}

/** Desired simulation speed: slow motion while a container sits in blast range. */
export function desiredTimeScale(): number {
  if (G.phase === "combat" && G.mine?.inRange) return TUNING.mine.slowMo;
  if (G.phase === "victory" && G.phaseTime < 1.5) return 0.35;
  return 1;
}
