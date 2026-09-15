import * as THREE from "three";
import { G, addScore, schedule, type Entity } from "../game";
import { SCORE, TUNING, formatDistance } from "../config";
import { audio } from "../audio";
import { scene } from "../renderer";
import { setCargoVisible } from "../player";
import { destroyDrone, destroyMissile, spawnCorvette, spawnDrums, spawnYacht } from "../enemies";
import { clearMine, detonateMine, launchMine } from "../cargo";
import { showBanner, showCallout, showResults, type Results } from "../hud";
import {
  STAPLES, beaconReached, boosted, dodged, formatTime, k, markCompleted, placeBeacon, recordBest,
  removeBeacon, resetTutorial, runPractice, setPhase, shotSomething, steered, talk, type Mission, type Speaker, type TutorialStep,
} from "./common";

// Chapter 1: Lingering Systems. Tutorial, ambush, combat, and both endings.
// See the Phase type in game.ts for the legal state transitions.

const KALON: Speaker = { name: "CMDR KALON", color: "#6ab8ff", fx: "radioFar" };
const COMPUTER: Speaker = { name: "MK-IV COMPUTER", color: "#88ffcc", fx: "computer" };
const HOSTILE: Speaker = { name: "HOSTILE", color: "#ff5555", fx: "pirate" };

// --- Practice (the quiet before the storm) ------------------------------------

const TUTORIAL: TutorialStep[] = [
  { text: () => k("Move the <b>MOUSE</b> to steer — or use <b>ARROW KEYS</b> / <b>A D</b>", "Drag on the <b>LEFT</b> side of the screen to steer"), done: steered },
  { text: () => k("Hold <b>SPACE</b> or <b>LEFT-CLICK</b> to fire. Blast those junk drums!", "Hold <b>FIRE</b> to shoot. Blast those junk drums!"), done: shotSomething },
  { text: () => k("<b>W / S</b> sets your speed. Hold <b>SHIFT</b> to boost", "Hold <b>BOOST</b> for a burst of speed"), done: boosted },
  { text: () => k("Tap <b>Q</b> or <b>E</b> to dodge-roll — you're untouchable mid-roll", "Tap <b>ROLL</b> to dodge — you're untouchable mid-roll"), done: dodged },
  {
    text: () => k("Press <b>X</b> to launch your cargo container, then <b>X</b> again to blow it up — the only thing that can hurt a warship", "Tap <b>CARGO</b> to launch the container, tap again to blow it up"),
    done: () => G.stats.minesLaunched > 0 && !G.mine,
  },
];

let lastYachtWarn = 1;
let firstEvents = new Set<string>();

function beginPractice(short: boolean) {
  setPhase("practice");
  resetTutorial(short, TUTORIAL.length);
  G.objective = short ? "STAND BY" : "ROUTINE WASTE RUN";
  G.hint = short ? "Ambush incoming…" : "";
  if (!short) {
    spawnDrums();
    talk(COMPUTER, "Waste run 4471. Container secured. Nothing ever happens out here.", "c1_computer_waste_run");
  } else {
    talk(COMPUTER, "Rewinding the tape. Same corvette, same bad day. Get ready.", "c1_computer_rewind");
  }
}

function updatePractice(dt: number) {
  runPractice(TUTORIAL, dt,
    () => talk(STAPLES, "Right. Now back to staring at the void for another eleven hours.", "c1_staples_void"),
    beginAmbush);
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
  talk(COMPUTER, "Warp signatures detected in the Lingering Systems!", "c1_computer_warp_signatures");

  schedule(1.2, () => { G.yacht = spawnYacht(); });
  schedule(2.8, () => {
    G.corvette = spawnCorvette();
    G.target = G.corvette;
    showBanner("HOSTILE VESSEL DETECTED! ROYAL YACHT UNDER ATTACK!", "#ff4444", 3);
  });
  schedule(4.2, () => {
    talk(KALON, "Mayday, mayday! This is the Royal Favor — a House Cayston corvette is on our tail! Anyone out there?", "c1_kalon_mayday");
  });
  schedule(5.2, beginCombat);
}

// --- Combat -------------------------------------------------------------------

function beginCombat() {
  setPhase("combat");
  G.combatTime = 0;
  G.objective = "PROTECT THE ROYAL FAVOR";
  G.hint = `Shoot down missiles &amp; drones · Hit the corvette with your cargo container <b>${TUNING.corvette.mineHitsToCripple} times</b>`;
  if (G.firstRun) schedule(0.8, () => showBanner(k("YOUR GUNS CAN'T HURT IT — HIT THE CORVETTE WITH YOUR CARGO CONTAINER", "HIT THE CORVETTE WITH YOUR CARGO!"), "#ffaa00", 4.5));
  schedule(2.5, () => {
    talk(STAPLES, "My guns won't scratch that thing… but a tonne of compacted bio-waste might.", "c1_staples_bio_waste");
  });
}

function updateCombat(dt: number) {
  G.combatTime += dt;
  const y = G.yacht;
  if (y && y.alive) {
    const h = y.hp / y.maxHp;
    if (h < 0.5 && lastYachtWarn > 0.5) {
      lastYachtWarn = 0.5;
      talk(KALON, "Hull at fifty percent! We can't take much more of this!", "c1_kalon_fifty_percent");
    } else if (h < 0.25 && lastYachtWarn > 0.25) {
      lastYachtWarn = 0.25;
      talk(KALON, "Hull critical! Staples, whatever you're planning — do it NOW!", "c1_kalon_hull_critical");
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
          talk(COMPUTER, "Missile lock on US. Shoot it down or dodge-roll at the last second.", "c1_computer_missile_lock");
          audio.alarm();
        } else if (once("volley")) {
          talk(KALON, "Incoming missiles! Shoot them down before they reach us!", "c1_kalon_incoming_missiles");
        }
        break;
      case "dronesLaunched":
        if (once("drones")) talk(COMPUTER, "Corvette launching attack drones. They seem to want you specifically.", "c1_computer_drones");
        break;
      case "droneKilled":
        if (once("droneKill")) talk(STAPLES, "Scratch one drone.", "c1_staples_scratch_one");
        break;
      case "armourPing":
        if (once("armour")) talk(COMPUTER, "Corvette armour rating: excessive. Guns ineffective. Suggest the cargo.", "c1_computer_armour");
        break;
      case "mineHit":
        onMineHit();
        break;
      case "mineMiss": {
        showCallout(e.reason === "shot" ? "SHOT DOWN" : "MISSED", "#ffaa00", 1.4);
        const reload = Math.ceil(G.player.reloadTimer);
        const next = G.player.containers > 0 ? "One container left on the rack." : `Compactor squeezing out another… ${reload}s.`;
        if (e.reason === "far") talk(COMPUTER, `Detonation outside blast radius — missed by ${formatDistance(e.distance)}. ${next}`, "c1_computer_missed");
        else if (e.reason === "shot") talk(COMPUTER, `Container shot down by point-defence. Detonate sooner! ${next}`, "c1_computer_shot_down");
        else talk(COMPUTER, `Container lost. Launch it closer to the corvette. ${next}`, "c1_computer_lost");
        if (G.player.containers <= 0) audio.voice("c1_computer_compacting", COMPUTER.fx);
        if (!G.missFeedbackGiven) {
          G.missFeedbackGiven = true;
          audio.radio("/voice_redford_failed.mp3");
        }
        break;
      }
      case "containerReady":
        if (G.phase === "combat") {
          talk(COMPUTER, "Compactor has produced a fresh container. Lovely.", "c1_computer_fresh_container");
          showCallout("CONTAINER READY", "#ffaa00", 1.2);
        }
        break;
      default:
        break;
    }
  }
}

function onMineHit() {
  const c = G.corvette;
  if (!c || G.phase !== "combat") return;
  if (c.crippled) {
    beginVictory();
    return;
  }
  showCallout("DIRECT HIT!", "#ffdd44", 1.6);
  const oneMore = TUNING.corvette.mineHitsToCripple - c.hits === 1;
  if (c.hits === 1) {
    talk(KALON, `Direct hit! Their shields are buckling — ${oneMore ? "one more should do it!" : "keep it up!"}`, oneMore ? "c1_kalon_direct_hit" : undefined);
    schedule(2.5, () => talk(HOSTILE, "Is that… garbage? You'll pay for that, hauler.", "c1_hostile_garbage"));
  } else {
    talk(KALON, "Their hull's breached — they're venting plasma! One more should do it!", "c1_kalon_breached");
    schedule(2.5, () => talk(HOSTILE, "All batteries! Kill that garbage scow NOW!", "c1_hostile_all_batteries"));
  }
  // Retaliation: an immediate drone wave, and from now on missiles come for you too.
  c.droneTimer = 1.5;
  c.missileTimer = Math.min(c.missileTimer, 4);
}

// --- Victory ------------------------------------------------------------------

function corvetteJumpsAway() {
  const c = G.corvette;
  if (!c || !c.alive) return;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(c.obj.quaternion);
  G.fx.warp(c.obj.position, fwd, 0.6);
  audio.warp();
  scene.remove(c.obj);
  c.alive = false;
  G.corvette = null;
}

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
  talk(COMPUTER, "Drone control link lost. Oh, look at them go.", "c1_computer_link_lost");
  G.drones.forEach((d, i) => schedule(0.6 + i * 0.35, () => destroyDrone(d, false)));
  G.missiles.forEach((m, i) => schedule(0.3 + i * 0.1, () => destroyMissile(m, false)));

  schedule(5.4, () => {
    corvetteJumpsAway();
    talk(HOSTILE, "This isn't over, Staples. House Cayston never forgets a face. Or a smell.", "c1_hostile_never_forgets");
  });

  schedule(6.5, () => {
    audio.radio("/voice_redford_complete.mp3");
    talk(KALON, "Resourceful work, Warrant Officer Staples. You've saved our VIP with those… creative tactics of yours.", "c1_kalon_resourceful");
  });
  schedule(12, beginRendezvous);
}

function beginRendezvous() {
  setPhase("rendezvous");
  const y = G.yacht;
  const base = y && y.alive ? y.obj.position : G.player.obj.position;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(y ? y.obj.quaternion : G.player.obj.quaternion);
  const beacon = placeBeacon(base.clone().addScaledVector(fwd, 0.9));
  if (y && y.alive) y.holdAt = beacon.position.clone().add(new THREE.Vector3(0.35, 0.1, 0));
  G.target = null;
  G.objective = "RENDEZVOUS WITH THE ROYAL FAVOR";
  G.hint = "Fly into the green beacon";
  showBanner("RENDEZVOUS COORDINATES RECEIVED: Set course for waypoint.", "#00ff88", 3.5);
  talk(KALON, "House Cayston has turned traitor. Join us, Staples — His Majesty will want to meet the pilot who throws garbage at warships.", "c1_kalon_join_us");
}

function complete() {
  setPhase("complete");
  removeBeacon();
  markCompleted("chapter1");
  audio.reload();
  showBanner("RENDEZVOUS COMPLETE. Welcome to the fleet, Warrant Officer.", "#00ff88", 3.5);
  G.objective = "MISSION COMPLETE";
  G.hint = "";
  schedule(2.5, () => showResults(buildResults(true)));
}

// --- Failure --------------------------------------------------------------------

function fail(reason: string) {
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
    schedule(1.5, () => talk(HOSTILE, "You just made a BIG mistake, garbage hauler. You're a traitor to House Cayston.", "c1_hostile_big_mistake"));
    // The corvette has what it came for, and leaves.
    schedule(4, () => {
      corvetteJumpsAway();
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
  const { best, newBest } = recordBest(chapter1.bestKey, G.score, success);
  const yachtLost = G.failReason === "yacht";

  return {
    success,
    title: success ? "INCOMING TRANSMISSION" : "⚠ TRANSMISSION LOST ⚠",
    header: success
      ? 'SOURCE: ROYAL STARSHIP "ROYAL FAVOR"<br>SENDER: Commander Redford Kalon'
      : yachtLost
        ? 'SOURCE: ROYAL STARSHIP "ROYAL FAVOR"<br>STATUS: NO RESPONSE'
        : "SOURCE: LINGERING SYSTEMS TRAFFIC CONTROL<br>STATUS: TRANSPONDER SIGNAL LOST",
    body: success
      ? "\"House Cayston has turned traitor. If you return to your station, Lieutenant-Commander Thomas Cayston will have you executed. Join us. His Majesty will want to meet the pilot who throws garbage at enemy warships.\""
      : yachtLost
        ? "The Royal Yacht has been destroyed. All hands lost, including the VIP delegation. House Cayston will use this incident as proof that refuse haulers cannot be trusted with royal protection duties."
        : "The Space Refuse Collector MK-IV has been destroyed. The Royal Favor is on its own. The waste-disposal union will be sending flowers.",
    rows,
    accuracy: s.shots > 0 ? Math.round((s.hits / s.shots) * 100) : 0,
    total: G.score,
    grade: success ? grade(G.score) : "F",
    rating: "REFUSE RATING",
    best,
    newBest,
    next: null,
  };
}

// Calibrated against a near-perfect test bot (~11,500 with 3 hits), so S takes real effort.
function grade(score: number): string {
  if (score >= 12000) return "S";
  if (score >= 9500) return "A";
  if (score >= 7500) return "B";
  if (score >= 5500) return "C";
  return "D";
}

// --- Cargo attack guide -----------------------------------------------------------
// A prompt under the crosshair that always says what to do next with the
// container: turn to the corvette → close in → launch → detonate on green.

const _toCorvette = new THREE.Vector3();
const GUIDE_ENTER_COS = Math.cos(THREE.MathUtils.degToRad(TUNING.mine.launchConeDeg));
const GUIDE_LEAVE_COS = Math.cos(THREE.MathUtils.degToRad(TUNING.mine.launchConeDeg + 8));
let facingCorvette = false; // latched with a little hysteresis so the text doesn't flicker

function updateGuide() {
  G.guide = "";
  G.guideTone = "";
  const p = G.player;
  if (G.phase === "rendezvous") {
    G.guide = "Fly into the green beacon";
    G.guideTone = "info";
    return;
  }
  const c = G.corvette;
  if (G.phase !== "combat" || !p.alive || !c?.alive || c.crippled) return;
  const key = k("<b>X</b>", "<b>CARGO</b>");
  const hits = `<span class="dim">Hits ${c.hits}/${TUNING.corvette.mineHitsToCripple}</span>`;

  if (G.mine) {
    if (G.mine.inRange) {
      G.guide = `<span class="step">4</span> Ring is <b class="go">GREEN</b> — DETONATE! Press ${key}`;
      G.guideTone = "go";
    } else {
      G.guide = `<span class="step">4</span> Container away… press ${key} when the ring turns <b class="go">GREEN</b>`;
      G.guideTone = "wait";
    }
    return;
  }
  if (p.containers <= 0) {
    G.guide = `Compactor making a new container… <b>${Math.ceil(p.reloadTimer)}s</b> — shoot down missiles meanwhile ${hits}`;
    G.guideTone = "info";
    return;
  }

  _toCorvette.subVectors(c.obj.position, p.obj.position);
  const dist = _toCorvette.length();
  const facing = _toCorvette.dot(p.forward) / dist;
  facingCorvette = facing > (facingCorvette ? GUIDE_LEAVE_COS : GUIDE_ENTER_COS);
  if (!facingCorvette) {
    G.guide = `<span class="step">1</span> Container ready — turn toward the <b class="red">CORVETTE</b> (red arrow) ${hits}`;
    G.guideTone = "info";
  } else if (dist > TUNING.mine.launchRange) {
    G.guide = `<span class="step">2</span> Close in — ${formatDistance(dist)} away, launch inside ${TUNING.mine.launchRange}km` +
      k(" · hold <b>SHIFT</b> to boost", " · hold <b>BOOST</b>");
    G.guideTone = "info";
  } else if (dist < 0.8) {
    G.guide = `Too close to launch safely — back off a little`;
    G.guideTone = "wait";
  } else {
    G.guide = `<span class="step">3</span> In range — LAUNCH! Press ${key}`;
    G.guideTone = "go";
  }
}

// --- Mission -----------------------------------------------------------------------

export const chapter1: Mission = {
  id: "chapter1",
  title: "CHAPTER 1: LINGERING SYSTEMS",
  ship: "mk4",
  theme: "lingering",
  computer: COMPUTER,
  bestKey: "tbs-best-score",
  start: { pos: new THREE.Vector3(0, 0, 0), yaw: 0 },
  statusHtml:
    '<div class="title">Space Refuse Collector MK-IV</div>' +
    '<div>Lingering Systems · <span class="warning">⚠ House Cayston Territory</span></div>' +
    '<div>Transponder: <span style="color:#ff4444">BLACK</span> · Permit: "Relief Courier"</div>',
  briefingHtml: () =>
    "A House Cayston corvette is hunting the Royal Yacht <i>Royal Favor</i>. Your guns can't dent its armour — but they can shoot down its missiles and drones. " +
    "To hurt the corvette: <b>1</b> turn toward it (follow the red arrow), <b>2</b> close to within 4 km, <b>3</b> launch your bio-waste container, " +
    "<b>4</b> when the ring around the corvette turns <b style=\"color:#66ff66\">green</b>, time slows down — detonate! " +
    `The prompt under your crosshair always shows the next step. ${TUNING.corvette.mineHitsToCripple} hits cripples it. ` +
    `Your compactor squeezes out a new container every ${TUNING.mine.reloadSeconds} seconds — keep the yacht alive in between.`,

  begin: beginPractice,

  reset() {
    lastYachtWarn = 1;
    firstEvents = new Set();
    facingCorvette = false;
  },

  update(dt) {
    switch (G.phase) {
      case "practice": updatePractice(dt); break;
      case "combat": updateCombat(dt); break;
      case "rendezvous": if (beaconReached(dt)) complete(); break;
      default: break;
    }
    handleEvents();
    updateGuide();
  },

  special() {
    if (G.mine) detonateMine();
    else if (!launchMine() && G.player.alive && G.player.containers <= 0) {
      audio.beep();
      showCallout(`RELOADING ${Math.ceil(G.player.reloadTimer)}s`, "#ffaa00", 0.9);
    }
  },

  fail,

  /** Slow motion while a container sits in blast range, and as the corvette breaks. */
  timeScale() {
    if (G.phase === "combat" && G.mine?.inRange) return TUNING.mine.slowMo;
    if (G.phase === "victory" && G.phaseTime < 1.5) return 0.35;
    return 1;
  },

  targets(): Entity[] {
    return [
      ...(G.corvette?.alive ? [G.corvette] : []),
      ...G.drones.filter((d) => d.alive),
      ...(G.yacht?.alive ? [G.yacht] : []),
    ];
  },

  defaultTarget: () => (G.corvette?.alive ? G.corvette : null),
};
