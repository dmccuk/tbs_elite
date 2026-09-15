import * as THREE from "three";
import { G } from "./game";
import { COLORS } from "./config";

// The HUD's Elite-style scanner (with height stalks), drawn on its own canvas.

const RADAR_RANGE = 8; // km
const _rel = new THREE.Vector3();
const _inv = new THREE.Quaternion();

export function drawRadar() {
  const canvas = document.getElementById("radar-canvas") as HTMLCanvasElement | null;
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

  for (const l of G.world.landmarks) blip(l.obj.position, l.color, l.label);
  for (const d of G.drums) if (d.alive) blip(d.obj.position, "#88ffcc", "", 2);
  for (const m of G.missiles) if (m.alive) blip(m.obj.position, COLORS.missile, "", 1.5);
  for (const d of G.drones) if (d.alive) blip(d.obj.position, COLORS.hostile, "DRN", 2);
  if (G.yacht?.alive) blip(G.yacht.obj.position, COLORS.ally, "RYL", 3.5);
  if (G.corvette?.alive) blip(G.corvette.obj.position, "#ff2222", "HST", 4);
  if (G.relay) blip(G.relay.obj.position, "#c8c8c8", "T-3", 3.5);
  if (G.wingman) blip(G.wingman.obj.position, COLORS.ally, "HRN", 2.5);
  for (const f of G.fighters) if (f.alive) blip(f.obj.position, COLORS.hostile, f.state === "flee" ? "RUN" : "PIR", 2.5);
  if (G.shuttle?.alive) blip(G.shuttle.obj.position, "#ffffff", "SHT", 3.5);
  if (G.mine) blip(G.mine.obj.position, COLORS.cargo, "CRG", 2.5);
  if (G.beacon) blip(G.beacon.position, COLORS.rendezvous, "RDV", 3.5);

  rc.fillStyle = COLORS.hud;
  rc.beginPath();
  rc.moveTo(c, c - 5); rc.lineTo(c + 4, c + 4); rc.lineTo(c - 4, c + 4); rc.closePath();
  rc.fill();
  rc.font = "9px 'Share Tech Mono', monospace";
  rc.fillText(`${RADAR_RANGE}km`, 6, S - 6);
}
