import * as THREE from "three";
import { G, schedule } from "../game";
import { formatDistance } from "../config";
import { shipStats, teleportPlayer } from "../player";
import { CAPTURE_MAX, distanceToBay, drillStart } from "../kessler";
import { showBanner, showResults, type Results } from "../hud";
import { formatTime, k, recordBest, setPhase, talk, type Speaker } from "./common";

// Prologue landing practice: bring the Seagull aboard the Kessler. Started from
// the Prologue card ("Landing practice"); the landing itself (rings, arrestor
// field, collisions) lives in kessler.ts. prologue.ts routes the dock events here.

/** The Kessler's flight deck on the radio. */
export const DECK: Speaker = { name: "KESSLER DECK", color: "#9ad0ff", fx: "radio" };

export function beginLandingDrill() {
  setPhase("combat");
  G.step = "landing";
  G.combatTime = 0;
  G.tutorialDone = true;
  const p = G.player;
  teleportPlayer(drillStart(new THREE.Vector3()), 0);
  p.throttle = 0.5;
  p.speed = shipStats().maxSpeed * 0.5;
  G.objective = "CARRIER LANDING · THE KESSLER";
  G.hint = k("Fly through the rings · hold <b>S</b> to slow below 350 m/s · fly into the bay",
    "Fly through the rings and into the bay · the throttle eases off on approach");
  talk(DECK, "Seagull, Kessler deck. You're cleared to land. Bay's hot, mind the paint.", "pro_deck_cleared");
}

export function completeDrill() {
  setPhase("complete");
  G.objective = "LANDED";
  G.hint = "";
  showBanner("CLAMPS ENGAGED · WELCOME ABOARD THE KESSLER", "#00ff88", 3.5);
  schedule(3.5, () => showResults(drillResults(true)));
}

export function drillResults(success: boolean): Results {
  const d = G.dock;
  const rows: [string, string][] = [];
  let score = 0;
  if (success) {
    const rings = d.rings * 200;
    const speed = Math.round(clamp01((CAPTURE_MAX - d.entrySpeed) / 0.2) * 500);
    const centre = Math.round(clamp01(1 - d.entryOffset / 0.05) * 500);
    const time = Math.max(0, Math.round((60 - G.combatTime) * 15));
    const scrapes = -150 * d.scrapes;
    rows.push(["Landed on cradle 2", "1000"]);
    rows.push([`Approach rings ${d.rings}/3`, `${rings}`]);
    rows.push([`Entry speed ${Math.round(d.entrySpeed * 1000)} m/s`, `${speed}`]);
    rows.push([`Off the centreline ${Math.round(d.entryOffset * 1000)} m`, `${centre}`]);
    if (d.scrapes) rows.push([`Scrapes × ${d.scrapes}`, `${scrapes}`]);
    rows.push([`Time ${formatTime(G.combatTime)}`, `${time}`]);
    score = Math.max(0, 1000 + rings + speed + centre + time + scrapes);
  }
  G.score = score;
  const g = success ? (score >= 2800 ? "S" : score >= 2300 ? "A" : score >= 1700 ? "B" : score >= 1200 ? "C" : "D") : "F";
  const { best, newBest } = recordBest("tbs-best-landing", score, success);
  const crashed = G.failReason === "player";
  return {
    success,
    title: "DECK REPORT",
    header: "SOURCE: THE KESSLER · FLIGHT DECK<br>PILOT: Patrol Pilot W. Staples",
    body: success
      ? g === "S" || g === "A" ? "Clean trap. The deck chief nodded, which for him is practically a medal."
        : g === "D" ? "You're aboard. That's the most anyone is prepared to say about it."
        : "Down in one piece. The deck crew will be repainting the stripes, but they've seen worse."
      : crashed ? "The Seagull didn't survive contact with the Kessler. Neither did the paintwork."
      : "You came in hot, the mag field let go, and you left through the bow door. The deck chief is filing a report. It's a long one.",
    rows,
    accuracy: -1, // no guns involved
    total: score,
    grade: g,
    rating: "DECK RATING",
    best,
    newBest,
    next: null,
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function landingGuide() {
  const d = G.dock;
  const p = G.player;
  const ms = Math.round(p.speed * 1000);
  if (d.state === "captured") { G.guide = "Mag-clamp field engaged — hands off the stick"; G.guideTone = "go"; return; }
  if (d.state === "landed") { G.guide = G.freeFlight ? k("Landed · <b>ENTER</b> to launch", "Landed · launching shortly") : "Clamps engaged"; G.guideTone = "go"; return; }
  if (d.state === "launching") { G.guide = "Catapult launch!"; G.guideTone = "go"; return; }
  const fast = p.speed > CAPTURE_MAX;
  const near = distanceToBay() < 0.65;
  const dist = distanceToBay();
  if (G.landingDrill && d.rings === 0 && dist > 2.6) {
    // Still on the long run in: speed only matters on final approach.
    G.guide = `<span class="step">1</span> Head for the Kessler — <b>${formatDistance(dist)}</b> · ${ms} m/s` + k(" · <b>SHIFT</b> boosts", "");
    G.guideTone = "info";
  } else if (G.landingDrill && d.rings < 3 && !near && !fast) {
    G.guide = `<span class="step">1</span> Fly through the approach rings — <b>${d.rings}/3</b> · ${ms} m/s`;
    G.guideTone = "info";
  } else if (fast) {
    G.guide = `<span class="step">2</span> Slow down — <b class="red">${ms} m/s</b>, land under ${Math.round(CAPTURE_MAX * 1000)} m/s` +
      k(" · hold <b>S</b>", " · easing off");
    G.guideTone = "wait";
  } else {
    G.guide = `<span class="step">3</span> Line up and fly into the bay — ${ms} m/s`;
    G.guideTone = "go";
  }
}
