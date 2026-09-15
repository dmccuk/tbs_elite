import { G, type MissionId } from "./game";
import { SHIPS, TUNING, formatDistance, type ShipStats } from "./config";
import { isTouch } from "./renderer";
import { drawRadar } from "./radar";
import { clearOverlay, drawOverlay, initOverlay } from "./overlay";

// Heads-up display. DOM panels are updated only when their values change;
// everything that tracks 3D positions is drawn on the overlay canvas (overlay.ts).

const $ = (id: string) => document.getElementById(id);

export function initHud() {
  initOverlay();
  document.body.classList.toggle("touch", isTouch);
}

// --- Cached DOM writes ----------------------------------------------------------

const cache = new Map<string, string>();
function setText(id: string, value: string) {
  if (cache.get(id) === value) return;
  cache.set(id, value);
  const el = $(id);
  if (el) el.textContent = value;
}
function setHtml(id: string, value: string) {
  const key = `html:${id}`;
  if (cache.get(key) === value) return;
  cache.set(key, value);
  const el = $(id);
  if (el) el.innerHTML = value;
}
function setStyle(id: string, prop: "width" | "opacity" | "display", value: string) {
  const key = `${prop}:${id}`;
  if (cache.get(key) === value) return;
  cache.set(key, value);
  const el = $(id);
  if (el) el.style[prop] = value;
}
function setClass(id: string, cls: string, on: boolean) {
  const key = `class:${id}:${cls}`;
  const v = on ? "1" : "0";
  if (cache.get(key) === v) return;
  cache.set(key, v);
  $(id)?.classList.toggle(cls, on);
}

// --- Banner and callout ------------------------------------------------------------

let bannerUntil = 0;
let calloutUntil = 0;

export function showBanner(text: string, color = "#ff4444", seconds = 3) {
  const el = $("banner");
  if (!el) return;
  el.textContent = text;
  el.style.color = color;
  el.style.borderColor = color;
  el.classList.remove("visible");
  void el.offsetWidth; // restart the CSS animation
  el.classList.add("visible");
  bannerUntil = performance.now() + seconds * 1000;
}

export function showCallout(text: string, color = "#ffdd44", seconds = 1.5) {
  const el = $("callout");
  if (!el) return;
  el.textContent = text;
  el.style.color = color;
  el.classList.remove("visible");
  void el.offsetWidth;
  el.classList.add("visible");
  calloutUntil = performance.now() + seconds * 1000;
}

export function hideBanners() {
  $("banner")?.classList.remove("visible");
  $("callout")?.classList.remove("visible");
  bannerUntil = calloutUntil = 0;
}

// --- Results panel ---------------------------------------------------------------

export interface Results {
  success: boolean;
  title: string;
  header: string;       // HTML
  body: string;         // HTML
  rows: [string, string][];
  accuracy: number;
  total: number;
  grade: string;
  rating: string;       // label over the grade, e.g. "REFUSE RATING"
  best: number;
  newBest: boolean;
  /** Offer a button straight into the next mission. */
  next: { id: MissionId; label: string } | null;
}

let resultsShown: Results | null = null;

/** The results currently on screen (main.ts reads `next` for the NEXT MISSION button). */
export const currentResults = () => resultsShown;

export function showResults(r: Results) {
  const panel = $("results");
  if (!panel) return;
  resultsShown = r;
  panel.classList.toggle("failed", !r.success);
  setText("results-title", r.title);
  setHtml("results-header", r.header);
  setHtml("results-body", r.body);
  const rows = r.rows.map(([a, b]) => `<div class="row"><span>${a}</span><span>${b}</span></div>`).join("");
  setHtml("results-rows", rows + (r.accuracy >= 0 ? `<div class="row dim"><span>Gun accuracy</span><span>${r.accuracy}%</span></div>` : ""));
  setText("results-total", r.total.toLocaleString());
  setText("results-grade", r.grade);
  setText("results-rating", r.rating);
  setText("results-status", r.success ? "[ MISSION COMPLETE ]" : "[ MISSION FAILED ]");
  setText("results-best", r.newBest ? "★ NEW BEST SCORE ★" : r.best > 0 ? `Best: ${r.best.toLocaleString()}` : "");
  setText("btn-retry", r.success ? (isTouch ? "PLAY AGAIN" : "[R] PLAY AGAIN") : (isTouch ? "RETRY MISSION" : "[R] RETRY MISSION"));
  setStyle("btn-next", "display", r.next ? "" : "none");
  if (r.next) setText("btn-next", r.next.label);
  panel.classList.add("visible");
}

/** Per-mission HUD text: status panel, help briefing and what the special button is called. */
export function setMissionHud(m: { id: MissionId; statusHtml: string; briefingHtml: string; special: ShipStats["special"]; missiles: number }) {
  document.body.dataset.mission = m.id;
  document.body.dataset.special = m.special;
  document.body.dataset.missiles = String(m.missiles);
  setHtml("status-panel", m.statusHtml);
  setHtml("help-briefing", m.briefingHtml);
  setText("legend-special", m.special === "cargo" ? "launch / detonate cargo" : "match speed");
  setText("help-special", m.special === "cargo" ? "Launch cargo, press again to detonate" : "Match speed with your target (press again to stop)");
  setText("help-special-touch", m.special === "cargo" ? "Launch the container, tap again to detonate" : "Match speed with your target");
  setText("help-special-touch-key", m.special === "cargo" ? "CARGO" : "MATCH");
  setText("btn-cargo", m.special === "cargo" ? "CARGO" : "MATCH");
}

export function hideResults() {
  resultsShown = null;
  $("results")?.classList.remove("visible");
}

export function setPauseVisible(v: boolean) {
  $("pause-overlay")?.classList.toggle("visible", v);
}

export function setHelpVisible(v: boolean) {
  $("help-menu")?.classList.toggle("visible", v);
}

// --- Per-frame update --------------------------------------------------------------

export function updateHud(realDt: number) {
  const now = performance.now();
  if (bannerUntil && now > bannerUntil) { $("banner")?.classList.remove("visible"); bannerUntil = 0; }
  if (calloutUntil && now > calloutUntil) { $("callout")?.classList.remove("visible"); calloutUntil = 0; }

  if (document.body.dataset.phase !== G.phase) document.body.dataset.phase = G.phase;
  const playing = G.phase !== "splash";
  setClass("hud", "active", playing);
  if (!playing) { clearOverlay(); return; }

  const p = G.player;
  setText("speed-value", Math.round(p.speed * 1000).toString());
  setText("throttle-value", p.boosting ? "BST" : p.matchSpeed ? "MTC" : Math.round(p.throttle * 100).toString());
  setText("score-value", G.score.toLocaleString());

  setHtml("objective-title", G.objective);
  setHtml("objective-hint", G.hint);
  setHtml("guide", G.guide);
  setClass("guide", "visible", G.guide !== "");
  for (const tone of ["info", "wait", "go"] as const) setClass("guide", tone, G.guideTone === tone);

  // Practice countdown
  const practice = G.phase === "practice";
  setClass("practice-timer", "visible", practice && !G.freeFlight);
  if (practice) {
    const t = Math.max(0, Math.ceil(G.practiceLeft));
    setText("practice-timer", G.firstRun ? `SYSTEM QUIET  ·  ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}` : `${G.missionId === "prologue" ? "DISTRESS CALL" : "AMBUSH"} IN ${t}`);
  }

  // Player bars
  setStyle("shield-fill", "width", `${(p.shield / p.maxShield) * 100}%`);
  setStyle("hull-fill", "width", `${(p.hp / p.maxHp) * 100}%`);
  setStyle("boost-fill", "width", `${(p.boostEnergy / TUNING.player.boostMax) * 100}%`);
  setClass("hull-fill", "critical", p.hp < p.maxHp * 0.3);

  if (G.shipId === "mk4") updateCargoBox();
  else updateMatchBox();
  updateMissileBox();
  if (G.missionId === "prologue") updatePrologueStatus();
  else updateChapter1Status();

  // Comms log (newest last), each line fades after a while.
  const lines = G.comms.filter((l) => G.time - l.time < 14);
  setHtml("comms", lines.map((l) => {
    const age = G.time - l.time;
    const op = age > 11 ? Math.max(0, 1 - (age - 11) / 3) : 1;
    return `<div class="comm" style="opacity:${op.toFixed(2)}"><span class="who" style="color:${l.color}">${l.speaker}:</span> ${l.text}</div>`;
  }).join(""));

  // Target info panel
  const t = G.target;
  setClass("target-info", "visible", !!t && t.alive);
  if (t && t.alive) {
    setText("target-name", t.label);
    setText("target-dist", formatDistance(t.obj.position.distanceTo(p.obj.position)));
    const pct = (e: { hp: number; maxHp: number }) => `${Math.round((Math.max(0, e.hp) / e.maxHp) * 100)}%`;
    const extra = t.kind === "corvette" ? `Container hits: ${G.corvette?.hits ?? 0}/${TUNING.corvette.mineHitsToCripple} · Guns ineffective`
      : t.kind === "yacht" ? `Hull: ${pct(t)}`
      : t.kind === "engines" ? `Engines: ${pct(t)} · Hull: ${G.shuttle ? pct(G.shuttle) : "—"}`
      : t.kind === "wingman" ? "Pilot Third Class Harren"
      : t.kind === "bay" ? `Land under 350 m/s · you: ${Math.round(p.speed * 1000)} m/s`
      : `Hull: ${Math.max(0, t.hp)}/${t.maxHp}`;
    setText("target-extra", extra);
  }

  // Damage and low-hull vignettes
  const since = G.time - G.damageTime;
  setStyle("damage-vignette", "opacity", since < 0.6 ? (0.7 * (1 - since / 0.6)).toFixed(2) : "0");
  setClass("lowhull-vignette", "visible", p.alive && p.hp < p.maxHp * 0.3);

  drawOverlay(realDt);
  drawRadar();
}

// --- Special-ability box (right of the player bars) -----------------------------------

function updateCargoBox() {
  const p = G.player;
  // Container rack: filled pips plus reload progress on the next one.
  const rack = TUNING.mine.rackSize;
  let pips = "";
  for (let i = 0; i < rack; i++) {
    if (i < p.containers) pips += '<div class="pip full"></div>';
    else if (i === p.containers) {
      const prog = 1 - Math.max(0, p.reloadTimer) / TUNING.mine.reloadSeconds;
      pips += `<div class="pip"><div class="pip-fill" style="height:${Math.round(prog * 20) * 5}%"></div></div>`;
    } else pips += '<div class="pip"></div>';
  }
  setHtml("cargo-pips", pips);
  setText("cargo-label", G.mine ? "CONTAINER AWAY" : p.containers > 0 ? "CARGO READY" : `COMPACTING ${Math.ceil(p.reloadTimer)}s`);
  setClass("cargo-label", "armed", !!G.mine);
  if (isTouch) {
    // Phones hide the rack panel, so the CARGO button shows its own state.
    setText("btn-cargo", G.mine ? "BLOW!" : p.containers > 0 ? "CARGO" : `${Math.ceil(p.reloadTimer)}s`);
    setClass("btn-cargo", "armed", !!G.mine);
    setClass("btn-cargo", "empty", !G.mine && p.containers <= 0);
  }
}

/** Missile rails: one pip per missile left, and the seeker state. */
function updateMissileBox() {
  const max = SHIPS[G.shipId].missiles;
  if (max === 0) return;
  const p = G.player;
  let pips = "";
  for (let i = 0; i < max; i++) pips += `<span class="mpip${i < p.missiles ? " on" : ""}"></span>`;
  setHtml("missile-pips", pips);
  const lock = G.lock;
  const key = isTouch ? "MSL" : "F";
  setText("missile-label", p.missiles <= 0 ? "MISSILES OUT"
    : lock.locked ? `LOCKED — ${key}` : lock.target ? `LOCKING ${Math.round(lock.progress * 100)}%` : lock.refused ? "NO LOCK: CIVILIANS" : "MISSILES");
  setClass("missile-box", "locked", lock.locked && p.missiles > 0);
  if (isTouch) {
    setClass("btn-missile", "armed", lock.locked && p.missiles > 0);
    setClass("btn-missile", "empty", p.missiles <= 0);
  }
}

function updateMatchBox() {
  const p = G.player;
  setHtml("cargo-pips", "");
  setText("cargo-label", p.matchSpeed ? "MATCHING SPEED" : isTouch ? "MATCH: OFF" : "[X] MATCH SPEED");
  setClass("cargo-label", "armed", p.matchSpeed);
  if (isTouch) {
    setText("btn-cargo", p.matchSpeed ? "MATCH ✓" : "MATCH");
    setClass("btn-cargo", "armed", p.matchSpeed);
    setClass("btn-cargo", "empty", false);
  }
}

// --- Mission status bar (top centre) ---------------------------------------------------

const over = () => G.phase === "complete" || G.phase === "failed";

function updateChapter1Status() {
  const y = G.yacht;
  const c = G.corvette;
  const showStatus = !!(y || c) && !over();
  setClass("mission-status", "visible", showStatus);
  if (!showStatus) return;
  const yh = y ? Math.max(0, y.hp / y.maxHp) : 0;
  setStyle("yacht-fill", "width", `${yh * 100}%`);
  setClass("yacht-fill", "critical", yh < 0.3);
  setText("yacht-pct", y ? `${Math.round(yh * 100)}%` : "—");
  const hitsLeft = c ? TUNING.corvette.mineHitsToCripple - c.hits : 0;
  let cp = "";
  for (let i = 0; i < TUNING.corvette.mineHitsToCripple; i++) cp += `<span class="cpip${i < hitsLeft ? " on" : ""}"></span>`;
  setHtml("corvette-pips", cp);
  setText("corvette-state", !c ? "GONE" : c.crippled ? "CRIPPLED" : c.enraged ? "DAMAGED" : "ARMOURED");
}

function updatePrologueStatus() {
  const r = G.relay;
  const s = G.shuttle;
  const showStatus = !!r && (G.phase === "combat" || G.phase === "victory" || G.phase === "rendezvous");
  setClass("mission-status", "visible", showStatus);
  if (!showStatus) return;
  const rh = r ? r.hp / r.maxHp : 0;
  setStyle("relay-fill", "width", `${rh * 100}%`);
  setText("relay-pct", `${Math.round(rh * 100)}%`);
  const pursuit = G.step === "pursuit" || G.phase !== "combat";
  setClass("pirates-block", "hidden", pursuit);
  setClass("shuttle-block", "hidden", !pursuit);
  if (!pursuit) {
    const alive = G.fighters.filter((f) => f.alive).length;
    let pips = "";
    for (let i = 0; i < 3; i++) pips += `<span class="cpip${i < alive ? " on" : ""}"></span>`;
    setHtml("pirate-pips", pips);
  } else if (s) {
    setStyle("engine-fill", "width", `${(s.engines.hp / s.engines.maxHp) * 100}%`);
    const hull = s.alive ? s.hp / s.maxHp : 0;
    setStyle("shull-fill", "width", `${hull * 100}%`);
    setClass("shull-fill", "critical", hull < 0.5);
    const t = Math.max(0, Math.ceil(s.jumpTimer));
    setText("jump-time", s.state === "fleeing" ? `JUMP ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}` : s.state === "disabled" ? "DRIVE DEAD" : "DOCKED");
  }
}
