import * as THREE from "three";
import { G, schedule, type Entity } from "../game";
import { SCORE, TUNING } from "../config";
import { audio } from "../audio";
import { input } from "../input";
import { isTouch } from "../renderer";
import { toggleCold } from "../player";
import { drazzanAlive, drazzanSquad, resetDrazzan, spawnDrazzan } from "../drazzan";
import { setScreensDead } from "../cockpit";
import { showBanner, showCallout, showResults, type Results } from "../hud";
import { STAPLES, formatTime, k, markCompleted, recordBest, setPhase, talk, type Mission, type Speaker } from "./common";

// Academy Days: simulation GV-K707d (from Academy Days, Part 3). Second year at
// the Academy. Instructor Beaumont-Hale, embarrassed by the commoner novice who
// beat his fighter in one minute thirty-one, sends Wyatt into the graded combat
// simulation nobody beats: four Drazzan fighters, open space, no cover, and a
// coilgun with a limited magazine.
//
// Phases: practice (the ten-second countdown) → ambush (nothing on the scope:
// "that's how the Drazzan operate") → combat (four contacts from four vectors).
// It can't be won. When the last Drazzan is damaged and in Wyatt's sights, the
// power goes out: red emergency lights, the klaxon, the sim dissolving into
// static, the evacuation call. The result is void — but everyone saw it.
// Losses: shot down, or out of rounds long enough for the proctor to call it.

const PROCTOR: Speaker = { name: "BEAUMONT-HALE", color: "#d8c27a", fx: "radio" };
const SIM: Speaker = { name: "SIMULATION", color: "#88ffcc", fx: "computer" };
const PA: Speaker = { name: "STATION PA", color: "#ff5555", fx: "pa" };

const A = TUNING.academy;
const S = SCORE.academy;
/** The chamber's empty sector: well away from anything else in the world (the sim theme hides it all anyway). */
const START = new THREE.Vector3(260, 0, 260);
const EVACUATE = "ALL NOVICES, VACATE SIMULATION CHAMBERS IMMEDIATELY. EMERGENCY PROTOCOLS IN EFFECT. THIS IS NOT A DRILL.";

let lines = new Set<string>();
let cutHold = 0;
let dryTime = 0;
/** The lights going out (or the sim ending some other way): a timeline on the real clock, since the world is frozen. */
let ending: { at: number; kind: "void" | "destroyed" | "discretion"; stage: number; lastKlaxon: number; results: Results | null } | null = null;
let snapshot = { time: 0, kills: 0, shield: 0, hull: 0, rounds: 0, crippled: false };

const once = (key: string) => (lines.has(key) ? false : (lines.add(key), true));

// --- DOM effects: the boot-up, the static, the emergency lights ----------------------------

const $ = (id: string) => document.getElementById(id);
let staticCtx: CanvasRenderingContext2D | null = null;
let staticImage: ImageData | null = null;

function drawStatic(alpha: number) {
  const c = $("sim-static") as HTMLCanvasElement | null;
  if (!c) return;
  c.style.opacity = alpha.toFixed(2);
  if (alpha <= 0) return;
  staticCtx ??= c.getContext("2d");
  if (!staticCtx) return;
  staticImage ??= staticCtx.createImageData(c.width, c.height);
  const d = staticImage.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (Math.random() * 190) | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  staticCtx.putImageData(staticImage, 0, 0);
}

function clearEffects() {
  document.body.classList.remove("sim-dead", "sim-alert", "sim-boot", "sim-black");
  drawStatic(0);
  const t = $("sim-alert-text");
  if (t) t.textContent = "";
  setScreensDead(false);
}

// --- Phases -----------------------------------------------------------------------

function begin(short: boolean) {
  setPhase("practice");
  // First time: the proctor's briefing (~16 s recorded; the HUD counts his last ten). Retries: a short count.
  G.practiceLeft = short ? 5 : A.countdown + 8;
  G.tutorialDone = true;
  G.firstRun = !short;
  G.objective = "SIMULATION GV-K707d";
  document.body.classList.remove("sim-boot");
  void document.body.offsetWidth;
  document.body.classList.add("sim-boot"); // stars first, then the void fills in around them
  schedule(3, () => document.body.classList.remove("sim-boot"));
  if (short) talk(SIM, "Scenario reset. GV-K707d.", "aca_sim_reset");
  else {
    schedule(1.2, () => talk(PROCTOR,
      "Novice Staples, the scenario will commence in ten seconds. You are facing a standard Drazzan patrol squadron. " +
      "Engage and survive as long as you are able. The simulation will terminate upon your destruction or at the proctor's discretion.",
      "aca_proctor_briefing"));
  }
}

function beginSilence() {
  setPhase("ambush");
  G.objective = "SCENARIO LIVE";
  talk(SIM, "Scenario GV-K707d. Commencing.", "aca_sim_commence");
  // After the sim's call (~5.5 s recorded), and before the contacts appear.
  schedule(5.8, () => talk(STAPLES, "Nothing on the scope. That's how they want it.", "aca_staples_nothing"));
}

function contacts() {
  setPhase("combat");
  G.combatTime = 0;
  G.objective = "DRAZZAN PATROL SQUADRON";
  spawnDrazzan();
  audio.alarm();
  showCallout("CONTACTS", "#ff4455", 1.2);
  talk(SIM, "Contacts. Four. Multiple vectors.", "aca_sim_contacts");
}

/** The last Drazzan, damaged and in his sights: the lights go out. */
function checkCut(dt: number) {
  const alive = drazzanAlive();
  const p = G.player;
  if (alive.length !== 1 || !p.alive) { cutHold = 0; return; }
  const f = alive[0];
  const to = f.obj.position.clone().sub(p.obj.position);
  const dist = to.length();
  const onNose = to.normalize().dot(p.forward) > Math.cos(THREE.MathUtils.degToRad(A.cutAimDeg));
  if (f.hp <= f.maxHp * 0.5 && onNose && dist < 3.5) cutHold += dt;
  else cutHold = Math.max(0, cutHold - dt * 0.5);
  if (cutHold >= A.cutHold) endSimulation("void");
}

function endSimulation(kind: "void" | "destroyed" | "discretion") {
  if (ending) return;
  const p = G.player;
  snapshot = {
    time: G.combatTime,
    kills: G.stats.fighters,
    shield: Math.round((p.shield / p.maxShield) * 100),
    hull: Math.round(Math.max(0, p.hp)),
    rounds: Number.isFinite(p.ammo) ? p.ammo : 0,
    crippled: drazzanSquad().some((f) => f.alien?.crippled),
  };
  ending = { at: performance.now(), kind, stage: 0, lastKlaxon: 0, results: null };
  if (kind === "void") {
    setPhase("complete");
    G.step = "blackout";
    markCompleted("academy");
    audio.stopVoice();
    audio.cutMusic(true);
    audio.powerDown();
    document.body.classList.add("sim-dead", "sim-alert");
    setScreensDead(true);
  } else {
    setPhase("failed");
    G.failReason = kind;
    G.step = "terminated";
    audio.simStatic();
    if (kind === "destroyed") talk(PROCTOR, "Simulation terminated. As expected. Dismissed, Novice.", "aca_proctor_expected");
    else talk(PROCTOR, "That will do. Scenario terminated at the proctor's discretion.", "aca_proctor_discretion");
  }
}

/** Runs every frame once the simulation has ended (on the real clock: the world is frozen). */
function runEnding() {
  const e = ending!;
  const t = (performance.now() - e.at) / 1000;
  if (e.kind === "void") {
    // Emergency lights and the klaxon.
    if (performance.now() - e.lastKlaxon > 1100 && !e.results) {
      e.lastKlaxon = performance.now();
      audio.klaxon();
    }
    // The simulation freezes, then collapses into grey static, then the displays die.
    if (t > 0.35 && t < 2) {
      if (e.stage === 0) { e.stage = 1; audio.simStatic(); }
      drawStatic(t < 1.5 ? Math.min(1, (t - 0.35) * 1.6) : Math.max(0, 1 - (t - 1.5) * 2.2));
    } else if (t >= 2 && e.stage < 2) {
      e.stage = 2;
      drawStatic(0);
      document.body.classList.add("sim-black");
    }
    if (t > 2.3 && e.stage < 3) {
      e.stage = 3;
      const el = $("sim-alert-text");
      if (el) el.textContent = EVACUATE;
      talk(PA, "All novices, vacate simulation chambers immediately. Emergency protocols in effect. This is not a drill.", "aca_pa_evacuate");
    }
    // The evacuation call runs ~8.5 s; a beat of klaxon after it, then Wyatt, then the report.
    if (t > 11.8 && e.stage < 4) {
      e.stage = 4;
      talk(STAPLES, "I had him.", "aca_staples_had_him");
    }
    if (t > 14.5 && !e.results) {
      e.results = voidResults();
      showResults(e.results);
      const el = $("sim-alert-text");
      if (el) el.textContent = "";
    }
  } else {
    // Shot down / called off: the sim just dissolves.
    if (t < 1.8) drawStatic(Math.min(0.85, t * 1.2));
    else if (e.stage === 0) {
      e.stage = 1;
      drawStatic(0);
      showBanner(e.kind === "destroyed" ? "SIMULATION TERMINATED · PILOT DESTROYED" : "SIMULATION TERMINATED · PROCTOR'S DISCRETION", "#ff4444", 3);
    }
    if (t > 4.5 && !e.results) {
      e.results = failResults(e.kind);
      showResults(e.results);
    }
  }
}

// --- Results -----------------------------------------------------------------------

function unofficialScore(): { rows: [string, string][]; score: number } {
  const s = snapshot;
  const rows: [string, string][] = [];
  const kills = s.kills * S.kill;
  const cripple = s.crippled ? S.cripple : 0;
  const time = Math.max(0, Math.round((S.parTime - s.time) * S.timeBonusPerSecond));
  rows.push([`Drazzan destroyed ${s.kills} / 4`, `${kills}`]);
  if (s.crippled) rows.push(["Sensor array shot out", `${cripple}`]);
  rows.push([`Engagement ${formatTime(s.time)}`, `${time}`]);
  rows.push([`Shields ${s.shield}%`, `${s.shield * S.shieldPoint}`]);
  rows.push([`Hull ${s.hull}%`, `${s.hull * S.hullPoint}`]);
  rows.push([`Rounds left ${s.rounds}`, `${s.rounds * S.roundsPoint}`]);
  const score = kills + cripple + time + s.shield * S.shieldPoint + s.hull * S.hullPoint + s.rounds * S.roundsPoint;
  return { rows, score };
}

function grade(score: number): string {
  if (score >= 4300) return "S";
  if (score >= 3700) return "A";
  if (score >= 3100) return "B";
  if (score >= 2500) return "C";
  return "D";
}

function accuracy() {
  const s = G.stats;
  return s.shots > 0 ? Math.round((s.hits / s.shots) * 100) : 0;
}

function voidResults(): Results {
  const { rows, score } = unofficialScore();
  G.score = score;
  const { best, newBest } = recordBest(academy.bestKey, score, true);
  const t = formatTime(snapshot.time);
  return {
    success: true,
    status: "[ SIMULATION VOID · NO RECORD ]",
    title: "SIMULATION VOID",
    header: "GV-K707d · SIMULATION CHAMBER 3 · LOGGED: INCOMPLETE<br>CAUSE: a faulty CO₂ reader, three sections away",
    body:
      `${t}. Three confirmed kills. One Drazzan fighter, damaged and alone, heading straight into his firing solution. ` +
      "Nobody believed the carbon dioxide reader. Nobody said so.<br><br>" +
      "The score doesn't exist. But one hundred and twelve novices were in that observation room, and not one of them will forget what they saw.",
    rows,
    accuracy: accuracy(),
    total: score,
    grade: grade(score),
    rating: "UNOFFICIAL GRADE",
    best,
    newBest,
    next: { id: "prologue", label: isTouch ? "NEXT: PROLOGUE ▶" : "[N] NEXT: PROLOGUE ▶" },
  };
}

function failResults(kind: "destroyed" | "discretion"): Results {
  const { rows, score } = unofficialScore();
  G.score = score;
  const { best, newBest } = recordBest(academy.bestKey, score, false);
  return {
    success: false,
    status: "[ SIMULATION TERMINATED ]",
    title: "SIMULATION TERMINATED",
    header: `GV-K707d · SIMULATION CHAMBER 3<br>RESULT: ${kind === "destroyed" ? "PILOT DESTROYED" : "TERMINATED AT THE PROCTOR'S DISCRETION"} · ${formatTime(snapshot.time)}`,
    body: kind === "destroyed"
      ? "Beaumont-Hale logged it without comment. The commoner lasted about as long as the commoner was supposed to. By dinner, the whole year group knew the number."
      : "Out of rounds, with Drazzan still on the scope. Beaumont-Hale ended it the moment it became convenient, which was the whole point of that clause.",
    rows,
    accuracy: accuracy(),
    total: score,
    grade: "F",
    rating: "UNOFFICIAL GRADE",
    best,
    newBest,
    next: null,
  };
}

// --- Events and the guide ------------------------------------------------------------

function handleEvents() {
  for (const e of G.events) {
    switch (e.type) {
      case "drazzanFiring":
        if (once("premature")) talk(STAPLES, "Premature. Exactly what I'd do.", "aca_staples_premature");
        break;
      case "drazzanKilled":
        showCallout("KILL CONFIRMED", "#ff4455", 1.2);
        audio.beep(true);
        if (e.left === 3 && once("firstBlood")) talk(STAPLES, "First blood. Three to go.", "aca_staples_first_blood");
        else talk(SIM, "Kill confirmed.", "aca_sim_kill");
        break;
      case "drazzanCrippled":
        showCallout("SENSORS DOWN", "#ffaa44", 1.2);
        talk(SIM, "Hostile sensor array disabled.", "aca_sim_crippled");
        break;
      case "wentCold":
        if (once("cold")) talk(SIM, "Engines cold.", "aca_sim_cold");
        break;
      case "outOfRounds":
        talk(SIM, "Magazine empty.", "aca_sim_empty");
        break;
      default:
        break;
    }
  }
  const p = G.player;
  if (G.phase !== "combat") return;
  if (Number.isFinite(p.ammo) && p.ammo <= 40 && p.ammo > 0 && once("ammoLow")) talk(SIM, "Ammunition low.", "aca_sim_ammo_low");
  if (p.alive && p.shield < p.maxShield * 0.15 && once("shields")) talk(SIM, "Shields critical.", "aca_sim_shields");
  const alive = drazzanAlive();
  if (alive.length === 1 && alive[0].alien?.crippled && alive[0].alien.mode === "final" && once("oneLeft")) {
    talk(STAPLES, "Only one of them left.", "aca_staples_one_left");
  }
}

function updateGuide() {
  G.guide = "";
  G.guideTone = "";
  const p = G.player;
  if (G.phase !== "combat" || !p.alive) return;
  const alive = drazzanAlive();
  const threat = alive.some((f) => f.alien?.mode === "attack" && f.obj.position.distanceTo(p.obj.position) < 1.4);
  if (p.ammo <= 0) {
    G.guide = "Magazine empty — stay alive";
    G.guideTone = "wait";
  } else if (alive.length === 1 && alive[0].hp <= alive[0].maxHp * 0.5) {
    G.guide = "One left, and it's hurt — line it up";
    G.guideTone = "go";
  } else if (threat && p.cold <= 0 && p.coldCooldown <= 0) {
    G.guide = k("Attack run incoming — <b>X</b> go cold, or <b>Q</b>/<b>E</b> roll", "Attack run incoming — <b>COLD</b> or <b>ROLL</b>");
    G.guideTone = "go";
  } else if (G.combatTime < 25) {
    G.guide = k("They're faster than you. Make every round count · <b>X</b> goes cold when they commit", "They're faster than you · <b>COLD</b> when they commit");
    G.guideTone = "info";
  }
}

// --- Mission -----------------------------------------------------------------------

export const academy: Mission = {
  id: "academy",
  title: "ACADEMY DAYS",
  ship: "academy",
  theme: "sim",
  computer: SIM,
  bestKey: "tbs-best-academy",
  start: { pos: START, yaw: 0 },
  statusHtml:
    '<div class="title">Academy Simulation · Chamber 3</div>' +
    '<div>Scenario GV-K707d · <span class="warning">Drazzan patrol squadron</span></div>' +
    '<div>Novice W. Staples · Proctor: Instr. Beaumont-Hale</div>',
  briefingHtml: () =>
    "Instructor Beaumont-Hale has put you in GV-K707d: a graded combat simulation against a Drazzan patrol squadron. Nobody beats it. " +
    "Four fighters, faster and more agile than your Seagull, in open space with no cover. Your coilgun's magazine is limited, so make hits count. " +
    "Press <b>X</b> (or tap COLD) to go cold: the engines cut and you coast on momentum, and the Drazzan lose track of you. " +
    "A couple of seconds later (or press again) the manoeuvring thrusters kick you sideways. Q / E roll as usual.",

  begin,

  reset() {
    lines = new Set();
    cutHold = dryTime = 0;
    ending = null;
    resetDrazzan();
    clearEffects();
  },

  update(dt) {
    switch (G.phase) {
      case "practice":
        G.practiceLeft -= dt;
        G.hint = k("Limited rounds · <b>X</b> goes cold · <b>ENTER</b> to start", "Limited rounds · <b>COLD</b> cuts your engines");
        if (G.practiceLeft <= 0 || input.take("skip")) beginSilence();
        break;
      case "ambush":
        G.hint = "";
        if (G.phaseTime > A.silence) contacts();
        break;
      case "combat": {
        G.combatTime += dt;
        G.hint = "";
        checkCut(dt);
        const p = G.player;
        dryTime = p.ammo <= 0 ? dryTime + dt : 0;
        if (dryTime > A.discretion && drazzanAlive().length > 0) endSimulation("discretion");
        break;
      }
      default:
        break;
    }
    handleEvents();
    updateGuide();
    if (ending) runEnding();
  },

  special() {
    const r = toggleCold();
    if (r === "recharging") showCallout("THRUSTERS RECHARGING", "#88ccff", 0.8);
  },

  fail(reason) {
    if (reason === "player") endSimulation("destroyed");
  },

  // Frozen solid the moment the lights go out.
  timeScale: () => (G.step === "blackout" ? 0 : 1),

  targets(): Entity[] {
    return drazzanAlive();
  },

  defaultTarget(): Entity | null {
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const f of drazzanAlive()) {
      if (f.alien?.mode === "blind") continue;
      const d = f.obj.position.distanceTo(G.player.obj.position);
      if (d < bestD) { bestD = d; best = f; }
    }
    return best;
  },
};
