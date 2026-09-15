import * as THREE from "three";
import { G, say, schedule, type Entity, type Fighter } from "../game";
import { SCORE, TUNING, formatDistance } from "../config";
import { audio } from "../audio";
import { input } from "../input";
import { isTouch, scene } from "../renderer";
import { shipStats, teleportPlayer } from "../player";
import { rearmMissiles } from "../missiles";
import {
  RELAY_POS, harrenKill, placeWingman, spawnBuoys, spawnFighters, spawnRelay,
  spawnShuttleDocked, spawnWingman, undockShuttle,
} from "../frontier";
import { showBanner, showCallout, showResults, type Results } from "../hud";
import {
  STAPLES, beaconReached, boosted, dodged, formatTime, k, markCompleted, matched, placeBeacon, recordBest,
  removeBeacon, resetTutorial, runPractice, setPhase, shotSomething, steered, talk, type Mission, type Speaker, type TutorialStep,
} from "./common";

// Prologue. Before Wyatt piloted the waste hauler, Patrol Pilot Wyatt Staples
// flew a Seagull with the Ninth Patrol Squadron. A pirate raid on the Tessick-3
// relay: down the fighters, then stop the cargo shuttle without destroying it —
// there are eleven kidnapped workers in its hold. See docs/prologue-tessick3-spec.md.
//
// Phases: practice (patrol with Harren) → ambush (distress call, burn to the
// relay) → combat (G.step: dogfight → runner → pursuit) → victory (the shuttle
// surrenders) → rendezvous (hold position on it) → complete.

const COMPUTER: Speaker = { name: "SEAGULL COMPUTER", color: "#88ffcc", fx: "computer" };
const HARREN: Speaker = { name: "HARREN", color: "#ffaa66", fx: "radio" };          // on your wing: clean squad radio
const CALDWELL: Speaker = { name: "LT CALDWELL", color: "#6ab8ff", fx: "radioFar" }; // relayed via the Kessler
const PIRATE: Speaker = { name: "PIRATE", color: "#ff5555", fx: "pirate" };
const RELAY: Speaker = { name: "TESSICK-3", color: "#c8c8c8", fx: "interference" }; // a relay under attack
const SHUTTLE: Speaker = { name: "SHUTTLE", color: "#ff9977", fx: "pirate" };
const BAY = { name: "SHUTTLE BAY", color: "#a8a8a8" };                              // narration: text only

const START = new THREE.Vector3(0, 0, 26);
const ARRIVE = new THREE.Vector3(0.6, 0.35, 3.2); // after the burn, 3 km off the relay
const WORKERS = 11;

const _v = new THREE.Vector3();
const _right = new THREE.Vector3();

/** Yaw that points the nose from `from` toward `to` (0 faces -Z). */
const yawToward = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

function wingSlot(pos: THREE.Vector3, yaw: number, out: THREE.Vector3) {
  _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  return out.copy(pos).addScaledVector(_right, 0.14).add(_v.set(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(0.1));
}

const forwardOf = (yaw: number) => new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));

// --- Practice: Sector Two patrol ----------------------------------------------

const TUTORIAL: TutorialStep[] = [
  { text: () => k("Move the <b>MOUSE</b> to steer — or use <b>ARROW KEYS</b> / <b>A D</b>", "Drag on the <b>LEFT</b> side of the screen to steer"), done: steered },
  { text: () => k("Hold <b>SPACE</b> or <b>LEFT-CLICK</b> to fire the coilgun. Tag those nav buoys!", "Hold <b>FIRE</b> for the coilgun. Tag those nav buoys!"), done: shotSomething },
  { text: () => k("<b>W / S</b> sets your speed. Hold <b>SHIFT</b> to boost", "Hold <b>BOOST</b> for a burst of speed"), done: boosted },
  { text: () => k("Tap <b>Q</b> or <b>E</b> to dodge-roll — you're untouchable mid-roll", "Tap <b>ROLL</b> to dodge — you're untouchable mid-roll"), done: dodged },
  { text: () => k("Press <b>X</b> to <b>MATCH SPEED</b> with Harren — you'll want it for chasing things", "Tap <b>MATCH</b> to match speed with Harren — handy for chasing"), done: matched },
  {
    text: () => k("Hold your nose on a buoy until it shows <b>LOCK</b>, then press <b>F</b> to fire a missile", "Hold your nose on a buoy until it shows <b>LOCK</b>, then tap <b>MSL</b>"),
    done: () => G.stats.missilesFired > 0,
  },
];

let firstEvents = new Set<string>();
let harrenScheduled = false;
let reloadPending = false;
let hullWarn = 1;

function beginPractice(short: boolean) {
  setPhase("practice");
  resetTutorial(short, TUTORIAL.length);
  G.step = "";
  spawnRelay();
  const yaw = 0;
  spawnWingman(wingSlot(START, yaw, new THREE.Vector3()), forwardOf(yaw));
  G.target = G.wingman;
  if (G.freeFlight) {
    // Nothing happens until the player asks for it.
    G.tutorialDone = true;
    G.objective = "FREE FLIGHT · TESSICK-VARN FRONTIER";
    spawnBuoys(START);
    talk(HARREN, "Again? Fine. Stay on my wing.", "pro_harren_again");
    return;
  }
  G.objective = short ? "STAND BY" : "SECTOR TWO PATROL";
  G.hint = short ? "Distress call incoming…" : "";
  if (!short) {
    spawnBuoys(START);
    talk(CALDWELL, "Stay on his wing, follow his lead, don't do anything creative, and come back alive.", "pro_caldwell_wing");
    schedule(3, () => talk(COMPUTER, "Sector Two patrol, hour three. Scanner returns: clean. Coffee: cold.", "pro_computer_patrol"));
    schedule(7, () => talk(HARREN, "Same route as yesterday. Try to look surprised if anything happens.", "pro_harren_same_route"));
  } else {
    talk(HARREN, "Again? Fine. Stay on my wing.", "pro_harren_again");
  }
}

function updatePractice(dt: number) {
  if (G.freeFlight) {
    G.hint = k("Fly anywhere · <b>ENTER</b> starts the mission · <b>P</b> → MISSIONS to leave",
      "Fly anywhere · pause → MISSIONS to leave");
    // Fresh targets whenever the last buoy goes, somewhere ahead of the player.
    if (G.drums.every((d) => !d.alive)) spawnBuoys(G.player.obj.position.clone().addScaledVector(G.player.forward, 1.5));
    // And the rails reload a few seconds after the last missile goes.
    if (G.player.missiles === 0 && G.playerMissiles.length === 0 && !reloadPending) {
      reloadPending = true;
      schedule(6, () => {
        reloadPending = false;
        if (!G.freeFlight) return;
        rearmMissiles();
        showCallout("MISSILES RELOADED", "#88ffcc", 1.2);
        audio.voice("pro_computer_missiles_reloaded", COMPUTER.fx);
      });
    }
    if (input.take("skip")) {
      G.freeFlight = false;
      beginDistress();
    }
    return;
  }
  runPractice(TUTORIAL, dt,
    () => talk(STAPLES, "Quirks logged. She rattles on the port side. Good to know.", "pro_staples_quirks"),
    beginDistress);
}

// --- Ambush: distress call and the burn ----------------------------------------

function beginDistress() {
  setPhase("ambush");
  G.scheduled = []; // drop any patrol small talk still queued up
  G.objective = "⚠ DISTRESS CALL — TESSICK-3";
  G.hint = "";
  for (const d of G.drums) scene.remove(d.obj);
  G.drums = [];
  G.player.matchSpeed = false;
  G.target = null;
  rearmMissiles(); // whatever practice used, the fight starts with full rails
  audio.alarm();
  schedule(0.4, () => audio.alarm());
  showBanner("⚠ DISTRESS: TESSICK-3 RELAY UNDER ATTACK ⚠", "#ff4444", 3);
  talk(RELAY, "—raid in progress—three fighters—a shuttle at the dock—they're taking the cells—please—", "pro_relay_distress");
  schedule(2, () => talk(HARREN, "Seven minutes out. Close enough. Burn.", "pro_harren_burn"));
  schedule(2.4, () => showCallout("BURNING FOR TESSICK-3", "#88ccff", 1.4));
  schedule(3.6, burn);
  schedule(5, beginCombat);
}

/** Seven minutes of sublight, skipped: arrive 3 km off the relay, pointed at it. */
function burn() {
  const p = G.player;
  G.fx.warp(p.obj.position, p.forward, 0.25);
  const yaw = yawToward(ARRIVE, RELAY_POS);
  teleportPlayer(ARRIVE, yaw);
  p.speed = Math.max(p.speed, shipStats().maxSpeed * 0.7);
  placeWingman(wingSlot(ARRIVE, yaw, new THREE.Vector3()), forwardOf(yaw));
  spawnFighters();
  spawnShuttleDocked();
  G.fx.warp(ARRIVE, p.forward, 0.25);
  G.fx.shake(0.3);
  audio.warp();
  talk(COMPUTER, "On station. Three bandits on the relay. One cargo shuttle docked.", "pro_computer_on_station");
}

// --- Combat: dogfight → runner → pursuit ----------------------------------------

function beginCombat() {
  setPhase("combat");
  G.step = "dogfight";
  G.combatTime = 0;
  G.objective = "DEFEND TESSICK-3";
  G.hint = "Destroy the pirate fighters · then stop the shuttle — <b>don't destroy it</b>";
  schedule(1.2, () => talk(PIRATE, "Frontier patrol? Out here? Light 'em up.", "pro_pirate_light_em_up"));
}

const alive = () => G.fighters.filter((f) => f.alive);

function onFighterKilled(byPlayer: boolean, runner: boolean) {
  if (runner) {
    talk(HARREN, "Nice shooting. Now the shuttle — it's moving!", "pro_harren_nice_shooting");
    schedule(1, beginPursuit);
    return;
  }
  if (G.step !== "dogfight") return;
  if (byPlayer && firstEvent("firstKill")) talk(STAPLES, "One.", "pro_staples_one");
  const left = alive();
  // "The second pirate broke left and ran straight into Harren's firing arc."
  if (left.length >= 2 && !harrenScheduled) {
    harrenScheduled = true;
    schedule(TUNING.prologue.harrenAssistDelay, () => {
      const pool = alive();
      if (G.step !== "dogfight" || pool.length < 2) return;
      const victim = pool.find((f) => f !== G.target) ?? pool[0];
      talk(HARREN, "He broke into my arc. Rude not to.", "pro_harren_arc");
      harrenKill(victim);
    });
  }
  if (left.length === 1) beginRunner(left[0]);
  else if (left.length === 0) schedule(1, beginPursuit);
}

function beginRunner(f: Fighter) {
  G.step = "runner";
  f.state = "flee";
  f.fleeTime = 0;
  G.target = f;
  showCallout("HE'S RUNNING!", "#ffaa00", 1.4);
  talk(COMPUTER, "Last bandit disengaging toward the jump point.", "pro_computer_disengaging");
  schedule(1.2, () => talk(STAPLES, "Not today.", "pro_staples_not_today"));
}

function beginPursuit() {
  if (G.step === "pursuit" || G.phase !== "combat") return;
  G.step = "pursuit";
  undockShuttle();
  G.target = G.shuttle?.engines ?? null;
  G.objective = "STOP THE SHUTTLE";
  G.hint = "Shoot the <b>ENGINES</b> — there are people aboard";
  showBanner("SHUTTLE RUNNING FOR THE JUMP POINT — DISABLE ITS ENGINES", "#ffaa00", 4);
  talk(CALDWELL, "Shuttle's running, Staples. Intel says they're carrying people. Engines only.", "pro_caldwell_engines_only");
}

function firstEvent(key: string) {
  if (firstEvents.has(key)) return false;
  firstEvents.add(key);
  return true;
}

function handleEvents() {
  for (const e of G.events) {
    switch (e.type) {
      case "fighterKilled":
        onFighterKilled(e.byPlayer, e.runner);
        break;
      case "runnerEscaped":
        talk(HARREN, "He's gone. Forget him — the shuttle's moving!", "pro_harren_hes_gone");
        schedule(0.5, beginPursuit);
        break;
      case "shuttleEnginesHit":
        if (firstEvent("engineHit")) talk(COMPUTER, "Engine hits confirmed. Keep it on the block.", "pro_computer_engine_hits");
        if (e.hp < TUNING.prologue.shuttle.engineHp * 0.5 && firstEvent("engineHalf")) talk(HARREN, "She's slowing. Keep at it.", "pro_harren_slowing");
        break;
      case "shuttleHullHit": {
        const h = e.hp / TUNING.prologue.shuttle.hullHp;
        if (h < 0.7 && hullWarn > 0.7) {
          hullWarn = 0.7;
          talk(COMPUTER, "Shuttle hull stress rising. There are people in there.", "pro_computer_hull_stress");
        } else if (h < 0.35 && hullWarn > 0.35) {
          hullWarn = 0.35;
          showCallout("CAREFUL — HULL!", "#ff4444", 1.2);
          talk(HARREN, "Hull's failing! Engines, Staples — ENGINES!", "pro_harren_hull_failing");
          audio.alarm();
        }
        break;
      }
      case "shuttleDisabled":
        beginSurrender();
        break;
      case "shuttleDestroyed":
        fail("shuttle");
        break;
      case "shuttleJumped":
        fail("escaped");
        break;
      default:
        break;
    }
  }
}

// --- Victory: the shuttle yields --------------------------------------------------

function beginSurrender() {
  if (G.phase !== "combat") return;
  setPhase("victory");
  G.step = "";
  G.objective = "SHUTTLE DISABLED";
  G.hint = "";
  G.player.matchSpeed = false;
  showCallout("ENGINES DISABLED!", "#ffdd44", 2.2);
  // Anyone left flying bails out through the jump point.
  for (const f of alive()) {
    schedule(1.5, () => {
      if (!f.alive) return;
      f.alive = false;
      G.fx.warp(f.obj.position, f.forward, 0.08);
      scene.remove(f.obj);
    });
  }
  schedule(1, () => talk(SHUTTLE, "We yield! We yield — drive's dead, don't shoot!", "pro_shuttle_we_yield"));
  schedule(3.2, () => talk(HARREN, "Hold position on her, Staples. I'll dock and take a look.", "pro_harren_hold_position"));
  schedule(5, beginRendezvous);
}

function beginRendezvous() {
  setPhase("rendezvous");
  const s = G.shuttle;
  const base = s?.alive ? s.obj.position : G.player.obj.position;
  _right.set(1, 0, 0).applyQuaternion(s?.alive ? s.obj.quaternion : G.player.obj.quaternion);
  placeBeacon(base.clone().addScaledVector(_right, 0.3).add(_v.set(0, 0.08, 0)));
  G.target = null;
  G.objective = "HOLD POSITION ON THE SHUTTLE";
  G.hint = "Fly into the green beacon";
}

function complete() {
  setPhase("complete");
  removeBeacon();
  markCompleted("prologue");
  audio.reload();
  G.objective = "TESSICK-3 SECURE";
  G.hint = "";
  showBanner(`TESSICK-3 SECURE · ${WORKERS} WORKERS RESCUED`, "#00ff88", 4);
  talk(HARREN, "…Staples. You'll want to see this. Eleven of them. In a freight hold.", "pro_harren_eleven");
  schedule(2.6, () => talk(STAPLES, "Get them home.", "pro_staples_get_them_home"));
  schedule(4.4, () => say(BAY.name, "A woman about your mother's age looks up at you. She says nothing. She doesn't need to.", BAY.color));
  schedule(7.5, () => showResults(buildResults(true)));
}

// --- Failure --------------------------------------------------------------------

function fail(reason: string) {
  if (G.phase === "failed" || G.phase === "complete") return;
  G.scheduled = [];
  G.events.length = 0;
  setPhase("failed");
  G.failReason = reason;
  G.timeScale = 1;
  G.step = "";
  G.objective = "MISSION FAILED";
  G.hint = "";
  if (reason === "shuttle") {
    showBanner("⚠ SHUTTLE DESTROYED ⚠", "#ff4444", 3.5);
    schedule(1.5, () => talk(HARREN, "…Staples. There were people in there.", "pro_harren_people"));
  } else if (reason === "escaped") {
    showBanner("⚠ SHUTTLE JUMPED OUT ⚠", "#ff4444", 3.5);
    schedule(1.5, () => talk(HARREN, "They're gone. Eleven more names for the ledger.", "pro_harren_ledger"));
  } else {
    showBanner("SEAGULL DOWN. ENGAGEMENT CASUALTY.", "#ff4444", 3.5);
  }
  schedule(3.5, () => {
    for (const f of alive()) {
      f.alive = false;
      G.fx.warp(f.obj.position, f.forward, 0.08);
      scene.remove(f.obj);
    }
  });
  schedule(4.5, () => showResults(buildResults(false)));
}

// --- Results --------------------------------------------------------------------

function buildResults(success: boolean): Results {
  const S = SCORE.prologue;
  const s = G.stats;
  const rows: [string, string][] = [];
  if (s.drums) rows.push([`Nav buoys × ${s.drums}`, `${s.drums * S.buoy}`]);
  rows.push([`Pirate fighters × ${s.fighters}`, `${s.fighters * S.fighter}`]);
  if (firstEvents.has("runnerCaught")) rows.push(["Caught the runner", `${S.runner}`]);
  if (success) {
    rows.push(["Shuttle engines disabled", `${S.engines}`]);
    const relay = Math.round(G.relay?.hp ?? 0);
    const hull = Math.round(G.player.hp);
    const timeBonus = Math.max(0, Math.round((S.parTime - G.combatTime) * SCORE.timeBonusPerSecond));
    rows.push([`Workers rescued × ${WORKERS}`, `${WORKERS * S.rescued}`]);
    rows.push([`Relay integrity ${relay}%`, `${relay * S.relayPoint}`]);
    rows.push([`Your hull ${hull}%`, `${hull * S.playerHullPoint}`]);
    rows.push([`Time ${formatTime(G.combatTime)}`, `${timeBonus}`]);
    G.score += WORKERS * S.rescued + relay * S.relayPoint + hull * S.playerHullPoint + timeBonus;
  }
  const { best, newBest } = recordBest(prologue.bestKey, G.score, success);
  const reason = G.failReason;

  return {
    success,
    title: success ? "FUTURE POSTING ASSIGNMENT" : reason === "player" ? "⚠ TRANSMISSION LOST ⚠" : "ENGAGEMENT REPORT",
    header: success
      ? "<i>Fifty-one kills later…</i><br>SOURCE: THIRD FLEET PERSONNEL · RE: PETTY OFFICER WYATT STAPLES"
      : reason === "player"
        ? "SOURCE: NINTH PATROL SQUADRON<br>STATUS: TRANSPONDER SIGNAL LOST"
        : "SOURCE: NINTH PATROL SQUADRON · TESSICK-3<br>FILED BY: Lt First Class Edren Caldwell",
    body: success
      ? "\"Upon completion of current deployment (Ninth Patrol Squadron, Tessick-Varn Frontier), report to Third Fleet, Second Frontier Corps. " +
        "Assignment: <b>Lingering Systems</b>. Vessel designation: <b>Compost Hauler</b>.\"<br><br>" +
        "Somebody had pulled strings. Wyatt read it twice, then finished his stew."
      : reason === "player"
        ? "Engagement casualty, cause: hostile fire. Harren flew home alone, and the report was filed the same way as all the others."
        : reason === "shuttle"
          ? "The shuttle broke apart under fire. Eleven people the Principality will never name. Caldwell filed the report without expression."
          : "The shuttle made its jump. Eleven workers, gone wherever pirates take the people they steal. Another entry for the ledger.",
    rows,
    accuracy: s.shots > 0 ? Math.round((s.hits / s.shots) * 100) : 0,
    total: G.score,
    grade: success ? grade(G.score) : "F",
    rating: "PATROL RATING",
    best,
    newBest,
    next: success ? { id: "chapter1", label: isTouch ? "NEXT: CHAPTER 1 ▶" : "[N] NEXT: CHAPTER 1 ▶" } : null,
  };
}

// Calibrated against a test bot that aims through the aim circle (~7,500 with 20–35 s of
// combat and almost no damage taken), so S needs a fast, clean run.
function grade(score: number): string {
  if (score >= 7600) return "S";
  if (score >= 6600) return "A";
  if (score >= 5600) return "B";
  if (score >= 4600) return "C";
  return "D";
}

// --- Guide prompt ------------------------------------------------------------------

const clock = (t: number) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.max(0, Math.ceil(t)) % 60).padStart(2, "0")}`;

function updateGuide() {
  G.guide = "";
  G.guideTone = "";
  const p = G.player;
  if (G.phase === "rendezvous") {
    G.guide = "Fly into the green beacon next to the shuttle";
    G.guideTone = "info";
    return;
  }
  if (G.phase !== "combat" || !p.alive) return;
  const match = k(" · <b>X</b> matches speed", " · tap <b>MATCH</b>");
  const fire = k("<b>F</b>", "<b>MSL</b>");
  const missile = p.missiles <= 0 ? ""
    : G.lock.locked ? ` · <b class="go">LOCKED</b> — ${fire} fires a missile (${p.missiles} left)`
    : ` · hold your nose on one to lock a missile (${p.missiles} left)`;

  if (G.step === "dogfight") {
    const n = alive().length;
    G.guide = `<span class="step">1</span> Destroy the pirate fighters — <b>${n} left</b>${missile}`;
    G.guideTone = G.lock.locked ? "go" : "info";
  } else if (G.step === "runner") {
    const f = alive().find((x) => x.state === "flee");
    if (!f) return;
    const d = f.obj.position.distanceTo(p.obj.position);
    G.guide = `<span class="step">2</span> He's running! Chase him down — ${formatDistance(d)}${d > 1.5 ? match : ""}${missile}`;
    G.guideTone = d < 2 || G.lock.locked ? "go" : "wait";
  } else if (G.step === "pursuit") {
    const s = G.shuttle;
    if (!s?.alive) return;
    const d = s.obj.position.distanceTo(p.obj.position);
    const jump = `<b>jumps in ${clock(s.jumpTimer)}</b>`;
    const hull = s.hp < s.maxHp * 0.5 ? ` · <b class="red">HULL ${Math.round((s.hp / s.maxHp) * 100)}%</b>` : "";
    if (d > 1.4) {
      G.guide = `<span class="step">3</span> Catch the shuttle — ${formatDistance(d)} · ${jump}${match}`;
      G.guideTone = "wait";
    } else {
      G.guide = `<span class="step">4</span> Shoot the <b>ENGINES</b> (orange bracket) — not the hull! · ${jump}${hull}`;
      G.guideTone = "go";
    }
  }
}

// --- Mission -----------------------------------------------------------------------

export const prologue: Mission = {
  id: "prologue",
  title: "PROLOGUE",
  ship: "seagull",
  theme: "frontier",
  computer: COMPUTER,
  bestKey: "tbs-best-prologue",
  start: { pos: START, yaw: 0 },
  statusHtml:
    '<div class="title">Seagull · Ninth Patrol Squadron</div>' +
    '<div>Tessick-Varn Frontier · Sector Two</div>' +
    '<div>Pilot: Patrol Pilot W. Staples · Wing: <span style="color:#ffaa66">Harren</span></div>',
  briefingHtml: () =>
    "Pirates are stripping the Tessick-3 relay: three fighters and a cargo shuttle. Your Seagull's coilgun kills fighters in three hits — " +
    "Harren will take one of them. When the last fighter runs, chase it down. Then the shuttle bolts for the jump point: " +
    `shoot its <b>ENGINES</b> (orange bracket), not the hull — there are ${WORKERS} kidnapped workers inside. ` +
    "Press <b>X</b> (or tap MATCH) to match speed with whatever you've targeted; Tab changes target. " +
    "You carry four missiles: hold your nose on a pirate until it shows <b>LOCK</b>, then press <b>F</b> (or tap MSL). " +
    "The seeker won't lock the shuttle.",

  begin: beginPractice,

  reset() {
    firstEvents = new Set();
    harrenScheduled = false;
    reloadPending = false;
    hullWarn = 1;
  },

  update(dt) {
    switch (G.phase) {
      case "practice": updatePractice(dt); break;
      case "combat": G.combatTime += dt; break;
      case "rendezvous": if (beaconReached(dt)) complete(); break;
      default: break;
    }
    // Remember a caught runner for the results screen.
    for (const e of G.events) if (e.type === "fighterKilled" && e.runner && e.byPlayer) firstEvents.add("runnerCaught");
    handleEvents();
    updateGuide();
  },

  special() {
    const p = G.player;
    if (!p.alive) return;
    if (p.matchSpeed) {
      p.matchSpeed = false;
      audio.beep();
      showCallout("MATCH OFF", "#88ccff", 0.8);
      return;
    }
    const t = G.target;
    if (!t || !t.alive) {
      audio.beep();
      showCallout(k("NO TARGET — PRESS TAB", "NO TARGET"), "#ffaa00", 1);
      return;
    }
    p.matchSpeed = true;
    audio.lock();
    showCallout(`MATCHING ${t.label}`, "#88ccff", 1);
  },

  fail,

  timeScale() {
    if (G.phase === "victory" && G.phaseTime < 1.2) return 0.4;
    return 1;
  },

  targets(): Entity[] {
    const list: Entity[] = alive();
    if (G.shuttle?.alive && G.shuttle.state === "fleeing" && G.shuttle.engines.alive) list.unshift(G.shuttle.engines);
    if (G.wingman) list.push(G.wingman);
    return list;
  },

  defaultTarget(): Entity | null {
    if (G.phase === "practice") return G.wingman;
    if (G.phase !== "combat") return null;
    if (G.step === "pursuit") return G.shuttle?.engines.alive ? G.shuttle.engines : null;
    // Nearest pirate.
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const f of alive()) {
      const d = f.obj.position.distanceTo(G.player.obj.position);
      if (d < bestD) { bestD = d; best = f; }
    }
    return best;
  },
};

