import * as THREE from "three";
import { G, type Entity } from "./game";
import { COLORS, TUNING, formatDistance } from "./config";
import { camera, isTouch } from "./renderer";
import { input } from "./input";

// Heads-up display. DOM panels are updated only when their values change;
// everything that tracks 3D positions is drawn on one overlay canvas.

const $ = (id: string) => document.getElementById(id);

let overlay: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let W = 0;
let H = 0;
let DPR = 1;

export function initHud() {
  overlay = document.createElement("canvas");
  overlay.id = "overlay-canvas";
  document.body.appendChild(overlay);
  ctx = overlay.getContext("2d")!;
  resize();
  window.addEventListener("resize", resize);
  document.body.classList.toggle("touch", isTouch);
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  overlay.width = Math.round(W * DPR);
  overlay.height = Math.round(H * DPR);
  overlay.style.width = `${W}px`;
  overlay.style.height = `${H}px`;
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
  reason: "yacht" | "player";
  rows: [string, string][];
  accuracy: number;
  total: number;
  grade: string;
  best: number;
  newBest: boolean;
}

export function showResults(r: Results) {
  const panel = $("results");
  if (!panel) return;
  panel.classList.toggle("failed", !r.success);
  setText("results-title", r.success ? "INCOMING TRANSMISSION" : "⚠ TRANSMISSION LOST ⚠");
  setHtml("results-header", r.success
    ? 'SOURCE: ROYAL STARSHIP "ROYAL FAVOR"<br>SENDER: Commander Redford Kalon'
    : r.reason === "yacht"
      ? 'SOURCE: ROYAL STARSHIP "ROYAL FAVOR"<br>STATUS: NO RESPONSE'
      : "SOURCE: LINGERING SYSTEMS TRAFFIC CONTROL<br>STATUS: TRANSPONDER SIGNAL LOST");
  setHtml("results-body", r.success
    ? "\"House Cayston has turned traitor. If you return to your station, Lieutenant-Commander Thomas Cayston will have you executed. Join us. His Majesty will want to meet the pilot who throws garbage at enemy warships.\""
    : r.reason === "yacht"
      ? "The Royal Yacht has been destroyed. All hands lost, including the VIP delegation. House Cayston will use this incident as proof that refuse haulers cannot be trusted with royal protection duties."
      : "The Space Refuse Collector MK-IV has been destroyed. The Royal Favor is on its own. The waste-disposal union will be sending flowers.");
  const rows = r.rows.map(([a, b]) => `<div class="row"><span>${a}</span><span>${b}</span></div>`).join("");
  setHtml("results-rows", rows + `<div class="row dim"><span>Gun accuracy</span><span>${r.accuracy}%</span></div>`);
  setText("results-total", r.total.toLocaleString());
  setText("results-grade", r.grade);
  setText("results-status", r.success ? "[ MISSION COMPLETE ]" : "[ MISSION FAILED ]");
  setText("results-best", r.newBest ? "★ NEW BEST SCORE ★" : r.best > 0 ? `Best: ${r.best.toLocaleString()}` : "");
  setText("btn-retry", r.success ? (isTouch ? "PLAY AGAIN" : "[R] PLAY AGAIN") : (isTouch ? "RETRY MISSION" : "[R] RETRY MISSION"));
  panel.classList.add("visible");
}

export function hideResults() {
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
  if (!playing) { ctx.clearRect(0, 0, overlay.width, overlay.height); return; }

  const p = G.player;
  setText("speed-value", Math.round(p.speed * 1000).toString());
  setText("throttle-value", p.boosting ? "BST" : Math.round(p.throttle * 100).toString());
  setText("score-value", G.score.toLocaleString());

  setHtml("objective-title", G.objective);
  setHtml("objective-hint", G.hint);

  // Practice countdown
  const practice = G.phase === "practice";
  setClass("practice-timer", "visible", practice);
  if (practice) {
    const t = Math.max(0, Math.ceil(G.practiceLeft));
    setText("practice-timer", G.firstRun ? `SYSTEM QUIET  ·  ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}` : `AMBUSH IN ${t}`);
  }

  // Player bars
  setStyle("shield-fill", "width", `${(p.shield / TUNING.player.shield) * 100}%`);
  setStyle("hull-fill", "width", `${(p.hp / p.maxHp) * 100}%`);
  setStyle("boost-fill", "width", `${(p.boostEnergy / TUNING.player.boostMax) * 100}%`);
  setClass("hull-fill", "critical", p.hp < p.maxHp * 0.3);

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

  // Mission status: yacht hull and corvette armour
  const y = G.yacht;
  const c = G.corvette;
  const showStatus = !!(y || c) && G.phase !== "complete" && G.phase !== "failed";
  setClass("mission-status", "visible", showStatus);
  if (showStatus) {
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
    const extra = t.kind === "corvette"
      ? `Container hits: ${G.corvette?.hits ?? 0}/${TUNING.corvette.mineHitsToCripple} · Guns ineffective`
      : t.kind === "yacht" ? `Hull: ${Math.round((t.hp / t.maxHp) * 100)}%`
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

// --- Overlay canvas -----------------------------------------------------------------

const _p = new THREE.Vector3();
const _cam = new THREE.Vector3();

interface Screen { x: number; y: number; on: boolean; dist: number; }

function project(pos: THREE.Vector3): Screen {
  _p.copy(pos).project(camera);
  const behind = _p.z > 1;
  let x = (_p.x * 0.5 + 0.5) * W;
  let y = (-_p.y * 0.5 + 0.5) * H;
  if (behind) { x = W - x; y = H - y; }
  const on = !behind && x >= 0 && x <= W && y >= 0 && y <= H;
  return { x, y, on, dist: pos.distanceTo(camera.position) };
}

function pixelRadius(worldRadius: number, dist: number) {
  const scale = (H / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  return (worldRadius * scale) / Math.max(dist, 0.001);
}

function brackets(x: number, y: number, r: number, color: string, lw = 2) {
  const l = Math.max(5, r * 0.45);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.moveTo(x + sx * r, y + sy * (r - l));
    ctx.lineTo(x + sx * r, y + sy * r);
    ctx.lineTo(x + sx * (r - l), y + sy * r);
  }
  ctx.stroke();
}

function label(text: string, x: number, y: number, color: string, size = 11, align: CanvasTextAlign = "left") {
  ctx.font = `${size}px 'Share Tech Mono', monospace`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Arrow on the screen edge pointing at something off-screen. */
function edgeArrow(s: Screen, color: string, text: string, size = 12) {
  const cx = W / 2;
  const cy = H / 2;
  let dx = s.x - cx;
  let dy = s.y - cy;
  if (dx === 0 && dy === 0) dy = 1;
  const margin = isTouch ? 70 : 46;
  const sx = (cx - margin) / Math.abs(dx || 1e-6);
  const sy = (cy - margin) / Math.abs(dy || 1e-6);
  const k = Math.min(sx, sy);
  const x = cx + dx * k;
  const y = cy + dy * k;
  const a = Math.atan2(dy, dx);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.6, -size * 0.7);
  ctx.lineTo(-size * 0.25, 0);
  ctx.lineTo(-size * 0.6, size * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (text) {
    const lx = x - Math.cos(a) * 26;
    const ly = y - Math.sin(a) * 26;
    label(text, lx, ly + 4, color, 11, "center");
  }
}

function drawEntity(e: Entity, color: string, name: string | null, opts: { minR?: number; health?: boolean; arrow?: boolean; arrowSize?: number } = {}) {
  const s = project(e.obj.position);
  const dist = e.obj.position.distanceTo(G.player.obj.position);
  if (s.on) {
    const r = Math.max(opts.minR ?? 12, pixelRadius(e.radius, s.dist) * 1.1);
    const locked = G.target === e;
    brackets(s.x, s.y, r, color, locked ? 2.5 : 1.5);
    if (locked) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (name) {
      label(name, s.x + r + 6, s.y - 3, color, 12);
      label(formatDistance(dist), s.x + r + 6, s.y + 11, color, 11);
    }
    if (opts.health) {
      const w = Math.max(40, r * 1.6);
      const h = e.hp / e.maxHp;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(s.x - w / 2, s.y + r + 6, w, 4);
      ctx.fillStyle = h < 0.3 ? "#ff4444" : color;
      ctx.fillRect(s.x - w / 2, s.y + r + 6, w * h, 4);
    }
  } else if (opts.arrow) {
    edgeArrow(s, color, name ? `${name.split(" ")[0]} ${formatDistance(dist)}` : "", opts.arrowSize);
  }
  return s;
}

let pulse = 0;

function drawOverlay(realDt: number) {
  pulse += realDt;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const p = G.player;
  if (!p.alive) return;

  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 3;

  // Drums, missiles, drones, yacht, corvette, beacon
  for (const d of G.drums) if (d.alive) drawEntity(d, "#88ffcc", null, { minR: 9 });
  for (const m of G.missiles) {
    if (!m.alive) continue;
    const atMe = m.target === p;
    const s = project(m.obj.position);
    if (s.on) {
      const blink = atMe && Math.sin(pulse * 20) > 0;
      ctx.strokeStyle = atMe ? (blink ? "#ff2222" : "#ffffff") : COLORS.missile;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 7); ctx.lineTo(s.x + 7, s.y); ctx.lineTo(s.x, s.y + 7); ctx.lineTo(s.x - 7, s.y); ctx.closePath();
      ctx.stroke();
      if (atMe) label("LOCK", s.x + 10, s.y + 4, "#ff4444", 11);
    } else if (atMe) {
      edgeArrow(s, "#ff3333", "MISSILE", 10);
    }
  }
  for (const d of G.drones) if (d.alive) drawEntity(d, COLORS.hostile, null, { minR: 10, arrow: G.target === d, arrowSize: 9 });
  if (G.yacht?.alive) drawEntity(G.yacht, COLORS.ally, "ROYAL FAVOR", { minR: 18, health: true, arrow: true });
  const c = G.corvette;
  let corvetteScreen: Screen | null = null;
  if (c?.alive) corvetteScreen = drawEntity(c, COLORS.hostile, c.crippled ? "CRIPPLED" : "HOSTILE CORVETTE", { minR: 22, arrow: true, arrowSize: 15 });

  if (G.beacon) {
    const s = project(G.beacon.position);
    const dist = G.beacon.position.distanceTo(p.obj.position);
    if (s.on) {
      const r = 22 + Math.sin(pulse * 5) * 4;
      ctx.strokeStyle = COLORS.rendezvous;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.stroke();
      label("RENDEZVOUS", s.x + r + 8, s.y - 3, COLORS.rendezvous, 13);
      label(formatDistance(dist), s.x + r + 8, s.y + 12, COLORS.rendezvous, 11);
    } else edgeArrow(s, COLORS.rendezvous, `RDV ${formatDistance(dist)}`, 15);
  }

  // Container: marker, and the blast-radius ring around the corvette.
  const mine = G.mine;
  if (mine) {
    const s = project(mine.obj.position);
    if (s.on) {
      ctx.strokeStyle = mine.inRange ? "#66ff66" : COLORS.cargo;
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x - 6, s.y - 6, 12, 12);
      label("CRG", s.x + 10, s.y + 4, ctx.strokeStyle as string, 11);
    }
    if (c?.alive && corvetteScreen?.on) {
      const r = pixelRadius(TUNING.mine.blastRadius, corvetteScreen.dist);
      ctx.strokeStyle = mine.inRange ? "rgba(102,255,102,0.9)" : "rgba(255,170,0,0.55)";
      ctx.lineWidth = mine.inRange ? 3 : 1.5;
      ctx.setLineDash(mine.inRange ? [] : [6, 6]);
      ctx.beginPath();
      ctx.arc(corvetteScreen.x, corvetteScreen.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (mine.inRange) {
      const flash = Math.sin(pulse * 14) > -0.3;
      if (flash) {
        ctx.font = "900 34px Orbitron, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#66ff66";
        ctx.fillText(isTouch ? "DETONATE!" : "DETONATE!  [X]", W / 2, H * 0.34);
      }
    } else if (c?.alive) {
      const d = mine.obj.position.distanceTo(c.obj.position);
      label(`CONTAINER → CORVETTE  ${formatDistance(d)}`, W / 2, H * 0.34, COLORS.cargo, 14, "center");
    }
  }

  // Gun convergence crosshair, lead marker, hit marker.
  const aimAhead = _cam.copy(p.obj.position).addScaledVector(p.forward, 2);
  const cross = project(aimAhead);
  if (cross.on) {
    const hit = G.time - G.hitMarkerTime < 0.15;
    ctx.strokeStyle = COLORS.hud;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cross.x, cross.y, 12, 0, Math.PI * 2);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(cross.x + dx * 16, cross.y + dy * 16);
      ctx.lineTo(cross.x + dx * 24, cross.y + dy * 24);
    }
    ctx.stroke();
    ctx.fillStyle = COLORS.hud;
    ctx.fillRect(cross.x - 1, cross.y - 1, 2, 2);
    if (hit) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        ctx.moveTo(cross.x + dx * 6, cross.y + dy * 6);
        ctx.lineTo(cross.x + dx * 12, cross.y + dy * 12);
      }
      ctx.stroke();
    }
  }
  if (G.aimTarget) {
    const s = project(G.aimPoint);
    if (s.on) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Mouse steering reticle
  if (!isTouch && input.mouseSteering && (G.phase !== "complete" && G.phase !== "failed")) {
    const mx = input.mouseX;
    const my = input.mouseY;
    ctx.strokeStyle = "rgba(0,255,136,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, H / 2);
    ctx.lineTo(mx, my);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,255,136,0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mx, my, 7, 0, Math.PI * 2);
    ctx.stroke();
    const dead = Math.min(W, H) * 0.38 * 0.07;
    ctx.strokeStyle = "rgba(0,255,136,0.15)";
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, dead, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Direction of the last hit, as a red arc around the centre.
  const since = G.time - G.damageTime;
  if (since < 0.9) {
    const local = _cam.copy(G.damageDir).applyQuaternion(camera.quaternion.clone().invert());
    const a = Math.atan2(-local.y, local.x);
    ctx.strokeStyle = `rgba(255,50,50,${(1 - since / 0.9).toFixed(2)})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.22, a - 0.35, a + 0.35);
    ctx.stroke();
  }

  // Floating score popups
  for (const pop of G.popups) {
    pop.life -= realDt;
    const s = project(pop.pos);
    if (!s.on) continue;
    const t = 1 - pop.life / 1.2;
    ctx.globalAlpha = Math.max(0, 1 - t * t);
    ctx.font = "700 15px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = pop.color;
    ctx.fillText(pop.text, s.x, s.y - 20 - t * 30);
    ctx.globalAlpha = 1;
  }
  G.popups = G.popups.filter((pp) => pp.life > 0);

  // Floating touch stick
  if (input.stick.active) {
    ctx.strokeStyle = "rgba(0,255,136,0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(input.stick.baseX, input.stick.baseY, 55, 0, Math.PI * 2);
    ctx.stroke();
    const dx = input.stick.x - input.stick.baseX;
    const dy = input.stick.y - input.stick.baseY;
    const d = Math.min(55, Math.hypot(dx, dy));
    const a = Math.atan2(dy, dx);
    ctx.fillStyle = "rgba(0,255,136,0.7)";
    ctx.beginPath();
    ctx.arc(input.stick.baseX + Math.cos(a) * d, input.stick.baseY + Math.sin(a) * d, 24, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

// --- Radar: Elite-style scanner with height stalks ------------------------------------

const RADAR_RANGE = 8; // km
const _rel = new THREE.Vector3();
const _inv = new THREE.Quaternion();

function drawRadar() {
  const canvas = $("radar-canvas") as HTMLCanvasElement | null;
  const rc = canvas?.getContext("2d");
  if (!canvas || !rc) return;
  // The canvas is 2× its CSS size for crispness; draw in CSS pixels.
  rc.setTransform(2, 0, 0, 2, 0, 0);
  const S = canvas.width / 2;
  const c = S / 2;
  const R = S / 2 - 6;
  rc.clearRect(0, 0, S, S);
  rc.fillStyle = "rgba(0, 20, 15, 0.55)";
  rc.beginPath();
  rc.arc(c, c, R + 4, 0, Math.PI * 2);
  rc.fill();
  rc.strokeStyle = "rgba(0,255,136,0.25)";
  rc.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    rc.beginPath();
    rc.arc(c, c, (R / 3) * i, 0, Math.PI * 2);
    rc.stroke();
  }
  rc.beginPath();
  rc.moveTo(c, c - R); rc.lineTo(c, c + R);
  rc.moveTo(c - R, c); rc.lineTo(c + R, c);
  rc.stroke();
  // Field-of-view wedge
  rc.fillStyle = "rgba(0,255,136,0.06)";
  rc.beginPath();
  rc.moveTo(c, c);
  rc.arc(c, c, R, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6);
  rc.fill();

  const p = G.player;
  _inv.copy(p.obj.quaternion).invert();
  const blip = (pos: THREE.Vector3, color: string, text: string, size = 3) => {
    _rel.subVectors(pos, p.obj.position).applyQuaternion(_inv);
    const dist = _rel.length();
    const scale = R / RADAR_RANGE;
    let x = _rel.x * scale;
    let y = _rel.z * scale;
    const h = -_rel.y * scale * 0.6;
    const flat = Math.hypot(x, y);
    const edge = flat > R;
    if (edge) { x = (x / flat) * R; y = (y / flat) * R; }
    const bx = c + x;
    const by = c + y;
    rc.strokeStyle = color;
    rc.fillStyle = color;
    rc.lineWidth = 1;
    if (!edge && Math.abs(h) > 1) {
      rc.beginPath();
      rc.moveTo(bx, by);
      rc.lineTo(bx, by + h);
      rc.stroke();
    }
    const dy = edge ? by : by + h;
    if (edge) {
      rc.beginPath();
      rc.arc(bx, dy, size, 0, Math.PI * 2);
      rc.stroke();
    } else {
      rc.fillRect(bx - size, dy - size / 2, size * 2, size);
    }
    if (text) {
      rc.font = "9px 'Share Tech Mono', monospace";
      rc.fillText(text, bx + size + 3, dy + 3);
    }
    return dist;
  };

  const w = G.world;
  blip(w.stationAlpha.position, "#ff6600", "ST1");
  blip(w.stationBeta.position, "#ff8800", "ST2");
  blip(w.derelict.position, "#888888", "DRL");
  for (const d of G.drums) if (d.alive) blip(d.obj.position, "#88ffcc", "", 2);
  for (const m of G.missiles) if (m.alive) blip(m.obj.position, COLORS.missile, "", 1.5);
  for (const d of G.drones) if (d.alive) blip(d.obj.position, COLORS.hostile, "DRN", 2);
  if (G.yacht?.alive) blip(G.yacht.obj.position, COLORS.ally, "RYL", 3.5);
  if (G.corvette?.alive) blip(G.corvette.obj.position, "#ff2222", "HST", 4);
  if (G.mine) blip(G.mine.obj.position, COLORS.cargo, "CRG", 2.5);
  if (G.beacon) blip(G.beacon.position, COLORS.rendezvous, "RDV", 3.5);

  rc.fillStyle = COLORS.hud;
  rc.beginPath();
  rc.moveTo(c, c - 5); rc.lineTo(c + 4, c + 4); rc.lineTo(c - 4, c + 4); rc.closePath();
  rc.fill();
  rc.font = "9px 'Share Tech Mono', monospace";
  rc.fillText(`${RADAR_RANGE}km`, 6, S - 6);
}
