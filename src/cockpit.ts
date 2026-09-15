import * as THREE from "three";
import { G } from "./game";
import { SHIPS, TUNING } from "./config";
import { ClearDepthPass, camera, composer } from "./renderer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SUN_DIR } from "./backdrop";

// Cockpit view (V). The camera sits at the pilot's eye and the cockpit (canopy
// frame, dashboard, three live screens) is drawn over the world from its own
// small scene and a fixed camera, after a depth clear, so it can never clip
// into scenery. Units in the cockpit scene are arbitrary (the dash sits about
// one unit ahead of the eye); only its lighting follows the world, so the sun
// swings across the dash as you turn.

export type View = "chase" | "cockpit";
const VIEW_KEY = "tbs-view";

/** Pilot's eye in ship-local km (nose toward -Z), just under each canopy. */
const EYE: Record<string, THREE.Vector3> = {
  seagull: new THREE.Vector3(0, 0.0052, -0.0075),
  mk4: new THREE.Vector3(0, 0.0095, -0.034),
};

let view: View = (() => {
  try { return localStorage.getItem(VIEW_KEY) === "cockpit" ? "cockpit" : "chase"; } catch { return "chase"; }
})();
/** The Cruise's camera director decides for itself (null = the player's choice). */
let forced: boolean | null = null;

const cockpitScene = new THREE.Scene();
const cockpitCamera = new THREE.PerspectiveCamera(camera.fov, camera.aspect, 0.05, 20);
const sun = new THREE.DirectionalLight(0xdce8ff, 1.6);
const _inv = new THREE.Quaternion();
const _v = new THREE.Vector3();
let depthPass: ClearDepthPass | null = null;
let drawPass: RenderPass | null = null;
const screens: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture }[] = [];
let screenTimer = 0;
let sweep = 0;

export const cockpitView = () => view;

export function toggleView(): View {
  return setView(view === "chase" ? "cockpit" : "chase");
}

export function setView(v: View): View {
  view = v;
  try { localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ }
  return view;
}

export function forceCockpit(on: boolean | null) {
  forced = on;
}

/** Is the cockpit being drawn right now (cockpit view, in a mission, ship intact)? */
export function inCockpit(): boolean {
  return (forced ?? view === "cockpit") && G.phase !== "splash" && G.player.alive;
}

/** Pilot's-eye offset for the current ship (ship-local km). */
export function eyeOffset(out: THREE.Vector3): THREE.Vector3 {
  return out.copy(EYE[G.shipId] ?? EYE.seagull);
}

function screen() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 160;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = { ctx: c.getContext("2d")!, tex };
  screens.push(s);
  return s;
}

function build() {
  const metal = new THREE.MeshStandardMaterial({ color: 0x5a616b, roughness: 0.7, metalness: 0.35, emissive: 0x0c1014 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x6a717b, roughness: 0.5, metalness: 0.5, emissive: 0x080a0c });
  const trim = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.85, metalness: 0.3, emissive: 0x050607 });
  const root = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    root.add(m);
    return m;
  };
  const tube = (pts: [number, number, number][], r: number) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, r, 8), frame));
  };

  // Canopy: the windscreen bow across the top of the view, two swept pillars
  // down to the dash corners, and sills running back along each side.
  tube([[-1.3, 0.52, -0.75], [-0.6, 0.66, -0.98], [0, 0.69, -1.02], [0.6, 0.66, -0.98], [1.3, 0.52, -0.75]], 0.028);
  for (const s of [-1, 1]) {
    tube([[s * 1.18, -0.3, -1.0], [s * 1.2, 0.12, -0.96], [s * 1.12, 0.5, -0.82], [s * 0.95, 0.75, -0.5]], 0.034);
    tube([[s * 1.18, -0.33, -1.02], [s * 1.35, -0.34, -0.5], [s * 1.4, -0.35, 0]], 0.04);
  }

  // Dashboard: the glare shield's lip, then the instrument face tilted back toward the pilot.
  add(new THREE.BoxGeometry(2.5, 0.05, 0.34), trim, 0, -0.3, -1.12);
  add(new THREE.BoxGeometry(2.5, 0.75, 0.05), metal, 0, -0.66, -0.97, -0.28);
  // Side consoles.
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.5, 0.2, 1.1), metal, s * 1.25, -0.72, -0.55);

  // Three screens: scanner, flight, weapons.
  for (const x of [-0.56, 0, 0.56]) {
    const s = screen();
    const mat = new THREE.MeshBasicMaterial({ map: s.tex, color: 0xd8d8d8 });
    add(new THREE.BoxGeometry(0.46, 0.3, 0.02), trim, x, -0.47, -0.955, -0.28);
    add(new THREE.PlaneGeometry(0.4, 0.25), mat, x, -0.47, -0.94, -0.28);
  }
  // A strip of status lamps under the glare shield.
  const lamp = (c: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.4) });
  const lamps = [lamp(0x33ff88), lamp(0x33ff88), lamp(0xffaa22), lamp(0x33ff88), lamp(0x3399ff), lamp(0x33ff88)];
  lamps.forEach((m, i) => add(new THREE.BoxGeometry(0.05, 0.018, 0.01), m, -0.4 + i * 0.16, -0.335, -1.0));

  cockpitScene.add(root);
  cockpitScene.add(new THREE.HemisphereLight(0x8494b4, 0x1a1d24, 1.6));
  cockpitScene.add(sun, sun.target);
  const glow = new THREE.PointLight(0x66ffcc, 0.5, 2.5);
  glow.position.set(0, -0.3, -0.7);
  cockpitScene.add(glow);
}

/** Add the cockpit passes to the composer, after the main scene and before bloom. */
export function initCockpit() {
  build();
  depthPass = new ClearDepthPass();
  drawPass = new RenderPass(cockpitScene, cockpitCamera);
  drawPass.clear = false;
  // Passes so far: backdrop, depth clear, main scene, NaN scrub, bloom, output.
  composer.insertPass(depthPass, 3);
  composer.insertPass(drawPass, 4);
  depthPass.enabled = drawPass.enabled = false;
}

function drawScreens() {
  const p = G.player;
  const [scanner, flight, weapons] = screens;
  const W = 256, H = 160;
  {
    // Scanner: sweep, range rings and blips relative to the nose (8 km range).
    const c = scanner.ctx;
    c.fillStyle = "#020806"; c.fillRect(0, 0, W, H);
    c.strokeStyle = "rgba(0,255,136,0.35)"; c.lineWidth = 1;
    for (const r of [24, 48, 72]) { c.beginPath(); c.arc(128, 80, r, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = "rgba(0,255,136,0.14)";
    c.beginPath(); c.moveTo(128, 80); c.arc(128, 80, 72, sweep, sweep + 0.5); c.fill();
    _inv.copy(p.obj.quaternion).invert();
    const blip = (pos: THREE.Vector3, color: string) => {
      _v.subVectors(pos, p.obj.position).applyQuaternion(_inv);
      const x = 128 + _v.x * 9, y = 80 + _v.z * 9;
      if (Math.hypot(x - 128, y - 80) > 72) return;
      c.fillStyle = color; c.fillRect(x - 2.5, y - 2.5, 5, 5);
    };
    for (const f of G.fighters) if (f.alive) blip(f.obj.position, "#ff4455");
    for (const d of G.drones) if (d.alive) blip(d.obj.position, "#ff4455");
    if (G.yacht?.alive) blip(G.yacht.obj.position, "#4aa8ff");
    if (G.corvette?.alive) blip(G.corvette.obj.position, "#ff4455");
    if (G.shuttle?.alive) blip(G.shuttle.obj.position, "#ffffff");
    if (G.wingman) blip(G.wingman.obj.position, "#4aa8ff");
    if (G.bay) blip(G.bay.obj.position, "#88ffcc");
    c.fillStyle = "#00ff88";
    c.beginPath(); c.moveTo(128, 75); c.lineTo(132, 84); c.lineTo(124, 84); c.fill();
  }
  {
    // Flight: speed and throttle, then shield, hull and boost (the HUD's bottom bars move here).
    const c = flight.ctx;
    c.fillStyle = "#020806"; c.fillRect(0, 0, W, H);
    c.textAlign = "center";
    c.fillStyle = "#00ff88"; c.font = "bold 40px monospace";
    c.fillText(String(Math.round(p.speed * 1000)), 128, 40);
    c.font = "13px monospace"; c.fillStyle = "#88ffcc";
    c.fillText(`M/S · ${p.boosting ? "BOOST" : p.matchSpeed ? "MATCHING" : `THROTTLE ${Math.round(p.throttle * 100)}%`}`, 128, 58);
    const bar = (y: number, frac: number, col: string, label: string) => {
      c.fillStyle = "rgba(255,255,255,0.08)"; c.fillRect(64, y, 168, 11);
      c.fillStyle = col; c.fillRect(64, y, 168 * Math.max(0, Math.min(1, frac)), 11);
      c.fillStyle = "#cfe"; c.font = "11px monospace"; c.textAlign = "left"; c.fillText(label, 16, y + 10);
    };
    bar(80, p.shield / p.maxShield, "#55bbff", "SHIELD");
    bar(104, p.hp / p.maxHp, p.hp < p.maxHp * 0.3 ? "#ff4444" : "#00ff88", "HULL");
    bar(128, p.boostEnergy / TUNING.player.boostMax, "#ffaa00", "BOOST");
  }
  {
    // Weapons: the missile rails and seeker (Seagull) or the cargo rack (MK-IV), and the special.
    const c = weapons.ctx;
    c.fillStyle = "#020806"; c.fillRect(0, 0, W, H);
    c.textAlign = "center";
    const max = SHIPS[G.shipId].missiles;
    if (max > 0) {
      c.fillStyle = "#ffcc88"; c.font = "13px monospace"; c.fillText("MISSILES", 128, 20);
      for (let i = 0; i < max; i++) {
        const x = 128 - (max * 34) / 2 + i * 34 + 8;
        c.fillStyle = i < p.missiles ? "#e2e6ea" : "rgba(255,255,255,0.1)";
        c.fillRect(x, 30, 18, 50);
        if (i < p.missiles) { c.fillStyle = "#ff5533"; c.fillRect(x, 30, 18, 10); }
      }
      const lock = G.lock;
      c.font = "bold 20px monospace";
      c.fillStyle = lock.locked ? "#ff3344" : lock.target ? "#ffaa00" : "#44665a";
      c.fillText(lock.locked ? "LOCK" : lock.target ? `SEEK ${Math.round(lock.progress * 100)}%` : "STANDBY", 128, 108);
      c.font = "13px monospace"; c.fillStyle = p.matchSpeed ? "#88ccff" : "#44665a";
      c.fillText(p.matchSpeed ? "MATCH SPEED ON" : "MATCH SPEED OFF", 128, 140);
    } else {
      c.fillStyle = "#ffcc88"; c.font = "13px monospace"; c.fillText("CARGO RACK", 128, 22);
      for (let i = 0; i < TUNING.mine.rackSize; i++) {
        c.fillStyle = i < p.containers ? "#d8a820" : "rgba(255,255,255,0.1)";
        c.fillRect(128 - TUNING.mine.rackSize * 22 + i * 44 + 5, 36, 34, 40);
      }
      c.font = "bold 18px monospace"; c.fillStyle = G.mine ? "#66ff66" : p.containers > 0 ? "#d8a820" : "#44665a";
      c.fillText(G.mine ? "CONTAINER AWAY" : p.containers > 0 ? "CARGO READY" : `COMPACTING ${Math.ceil(p.reloadTimer)}s`, 128, 116);
    }
  }
  for (const s of screens) s.tex.needsUpdate = true;
}

/** Per frame, after the main camera is placed: passes on/off, ship model visibility, lighting, screens. */
export function updateCockpit(realDt: number) {
  const on = inCockpit();
  if (depthPass && drawPass) depthPass.enabled = drawPass.enabled = on;
  G.player.model.root.visible = !on && G.player.alive;
  // The dash screens stand in for the HUD's bottom bars and scanner.
  if (document.body.classList.contains("cockpit") !== on) document.body.classList.toggle("cockpit", on);
  if (!on) return;
  if (cockpitCamera.fov !== camera.fov || cockpitCamera.aspect !== camera.aspect) {
    cockpitCamera.fov = camera.fov;
    cockpitCamera.aspect = camera.aspect;
    cockpitCamera.updateProjectionMatrix();
  }
  // The world's sun, seen from inside the cockpit (the hangar's roof blocks it).
  _inv.copy(camera.quaternion).invert();
  sun.position.copy(SUN_DIR).applyQuaternion(_inv).multiplyScalar(10);
  sun.intensity = G.dock.inTunnel ? 0.25 : 1.6;
  sweep = (sweep + realDt * 2.4) % (Math.PI * 2);
  screenTimer -= realDt;
  if (screenTimer <= 0) {
    screenTimer = 0.1;
    drawScreens();
  }
}
