import * as THREE from "three";
import { G, type Entity } from "./game";
import { COLORS, TUNING, formatDistance } from "./config";
import { camera, isTouch } from "./renderer";
import { input } from "./input";

// The HUD's overlay canvas: everything that tracks 3D positions — target
// brackets, off-screen arrows, the crosshair and lead marker, the aim circle,
// the container's blast ring, score popups and the touch stick.

let overlay: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let W = 0;
let H = 0;
let DPR = 1;

export function initOverlay() {
  overlay = document.createElement("canvas");
  overlay.id = "overlay-canvas";
  document.body.appendChild(overlay);
  ctx = overlay.getContext("2d")!;
  resize();
  window.addEventListener("resize", resize);
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

export function clearOverlay() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, overlay.width, overlay.height);
}

const _p = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _aimEuler = new THREE.Euler();

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

function drawEntity(e: Entity, color: string, name: string | null, opts: { minR?: number; health?: boolean; arrow?: boolean; arrowSize?: number; dist?: boolean; above?: boolean } = {}) {
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
    if (name && opts.above) {
      label(name, s.x, s.y - r - 6, color, 11, "center");
    } else if (name) {
      label(name, s.x + r + 6, s.y - 3, color, 12);
      if (opts.dist !== false) label(formatDistance(dist), s.x + r + 6, s.y + 11, color, 11);
    }
    if (opts.health) {
      const w = Math.max(40, r * 1.6);
      const h = Math.max(0, e.hp) / e.maxHp;
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

export function drawOverlay(realDt: number) {
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

  // Prologue: the relay, Harren, the pirates and the shuttle (hull + engine block).
  if (G.relay && G.phase !== "complete" && G.phase !== "failed") drawEntity(G.relay, "#c8c8c8", "TESSICK-3", { minR: 20 });
  if (G.wingman) drawEntity(G.wingman, COLORS.ally, "HARREN", { minR: 10, dist: false, arrow: G.target === G.wingman, arrowSize: 10 });
  for (const f of G.fighters) {
    if (!f.alive) continue;
    const runner = f.state === "flee";
    drawEntity(f, COLORS.hostile, runner ? "RUNNER" : null, { minR: 12, health: true, arrow: runner || G.target === f, arrowSize: runner ? 14 : 11 });
  }
  const sh = G.shuttle;
  if (sh?.alive) {
    const fleeing = sh.state === "fleeing";
    const name = fleeing ? "SHUTTLE · PEOPLE ABOARD" : sh.state === "disabled" ? "SHUTTLE (DISABLED)" : null;
    drawEntity(sh, fleeing ? "#ffffff" : COLORS.neutral, name, { minR: 18, health: fleeing, arrow: fleeing, arrowSize: 15 });
    if (fleeing && sh.engines.alive) drawEntity(sh.engines, COLORS.cargo, "ENGINES", { minR: 8, health: true, above: true });
  }

  // Container ready and lined up: a pulsing launch ring on the corvette.
  if (G.guideTone === "go" && !G.mine && c && corvetteScreen?.on) {
    const r = Math.max(34, pixelRadius(c.radius, corvetteScreen.dist) * 1.6) + Math.sin(pulse * 8) * 5;
    ctx.strokeStyle = COLORS.cargo;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(corvetteScreen.x, corvetteScreen.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "900 16px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.cargo;
    ctx.fillText(isTouch ? "LAUNCH CARGO" : "[X] LAUNCH CARGO", corvetteScreen.x, corvetteScreen.y - r - 10);
  }

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

  // Missile seeker: a diamond that closes in as the lock builds, red when locked.
  const lock = G.lock;
  if (lock.target?.alive && p.missiles > 0) {
    const s = project(lock.target.obj.position);
    if (s.on) {
      const base = Math.max(16, pixelRadius(lock.target.radius, s.dist) * 1.4);
      const r = base + (1 - lock.progress) * 36;
      const col = lock.locked ? "#ff3344" : "#ffaa00";
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.PI / 4 + (lock.locked ? 0 : (1 - lock.progress) * 1.2));
      ctx.strokeStyle = col;
      ctx.lineWidth = lock.locked ? 2.5 : 1.5;
      const l = r * 0.45;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.moveTo(sx * r, sy * (r - l));
        ctx.lineTo(sx * r, sy * r);
        ctx.lineTo(sx * (r - l), sy * r);
      }
      ctx.stroke();
      ctx.restore();
      if (lock.locked && Math.sin(pulse * 10) > -0.2) label("LOCK", s.x, s.y - r * 1.45 - 4, col, 13, "center");
    }
  }
  // Our missiles in flight.
  for (const m of G.playerMissiles) {
    const s = project(m.obj.position);
    if (!s.on) continue;
    ctx.fillStyle = "#ffe9a8";
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - 4); ctx.lineTo(s.x + 4, s.y); ctx.lineTo(s.x, s.y + 4); ctx.lineTo(s.x - 4, s.y); ctx.closePath();
    ctx.fill();
  }

  // Mouse-aim circle: where the ship is turning to. The gun crosshair chases it.
  const flying = G.phase !== "complete" && G.phase !== "failed";
  if (input.mouseAim && flying) {
    _aimEuler.set(p.aimPitch, p.aimYaw, 0, "YXZ");
    _cam.set(0, 0, -2).applyEuler(_aimEuler).add(p.obj.position);
    const s = project(_cam);
    if (s.on) {
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
    }
  }

  // Joystick-mode mouse reticle
  if (!isTouch && !input.mouseAim && input.mouseSteering && flying) {
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
