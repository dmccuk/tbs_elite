import * as THREE from "three";
import { rand } from "../config";
import { createSeagull } from "../models-frontier";
import { canvasTex, lit, std } from "../model-kit";
import { solid, type Solid } from "./walk";
import { DECK_DOOR } from "./corridor";
import type { Hotspot, Section } from "./types";

// The Kessler's hangar deck, at walking scale: one 400 m section of the tunnel
// that runs her length, with the two Seagull cradles, the deck crew's clutter,
// the launch console and the way aft to the rest of the ship.
//
// METRES in here (the flight sim is in km), so the ship models are scaled up by
// 1000 when they're parked on the deck.

export interface Deck extends Section {
  /** Start position and heading. */
  spawn: { x: number; z: number; yaw: number };
}

const W = 85;      // half-width of the bay (the tunnel is 170 m across)
const H = 24;      // deckhead height (the bay above the cradles is taller, but this is the working deck)
const Z0 = -200;   // forward bulkhead
const Z1 = 200;    // aft: the stern door

function deckTexture() {
  return canvasTex(512, 512, (c) => {
    c.fillStyle = "#4d525a";
    c.fillRect(0, 0, 512, 512);
    c.strokeStyle = "rgba(0,0,0,0.55)";
    c.lineWidth = 3;
    for (let i = 0; i <= 512; i += 128) { c.strokeRect(i, 0, 128, 512); c.strokeRect(0, i, 512, 128); }
    c.fillStyle = "rgba(255,255,255,0.045)";
    for (let i = 0; i < 300; i++) c.fillRect(Math.random() * 512, Math.random() * 512, 6, 3);
    c.fillStyle = "rgba(20,16,10,0.5)";
    for (let i = 0; i < 25; i++) c.fillRect(Math.random() * 512, Math.random() * 512, 30 + Math.random() * 60, 12);
  });
}

function wallTexture() {
  return canvasTex(512, 512, (c) => {
    c.fillStyle = "#59606a";
    c.fillRect(0, 0, 512, 512);
    c.strokeStyle = "rgba(0,0,0,0.45)";
    c.lineWidth = 2;
    for (let y = 0; y <= 512; y += 64) c.strokeRect(0, y, 512, 64);
    for (let x = 0; x <= 512; x += 170) c.strokeRect(x, 0, 170, 512);
    c.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 120; i++) c.fillRect(Math.random() * 512, Math.random() * 512, 4, 2);
    // Rust streaks under the seams.
    c.fillStyle = "rgba(90,60,30,0.25)";
    for (let i = 0; i < 18; i++) c.fillRect(Math.random() * 512, Math.random() * 512, 5, 40 + Math.random() * 70);
  });
}

function signTexture(text: string, sub = "") {
  return canvasTex(512, 128, (c) => {
    c.fillStyle = "#12161a";
    c.fillRect(0, 0, 512, 128);
    c.fillStyle = "#e8b21c";
    c.font = "bold 64px 'Big Shoulders Display', Impact, sans-serif";
    c.textAlign = "center";
    c.fillText(text, 256, sub ? 62 : 84);
    if (sub) {
      c.fillStyle = "#9ad0ff";
      c.font = "28px 'Share Tech Mono', monospace";
      c.fillText(sub, 256, 104);
    }
  });
}

export function buildDeck(): Deck {
  const root = new THREE.Group();
  const solids: Solid[] = [];
  const hotspots: Hotspot[] = [];
  const flicker: THREE.Material[] = [];

  const deckMat = std(0xffffff, 0.85, 0.3, { map: tiled(deckTexture(), (W * 2) / 10, (Z1 - Z0) / 10) }); // one texture = 10 m, four 2.5 m plates
  const wallMat = std(0xffffff, 0.8, 0.45, { map: tiled(wallTexture(), (Z1 - Z0) / 12, H / 12) });   // 12 m of panels per tile
  const trim = std(0x262a30, 0.7, 0.6);
  const metal = std(0x6a7078, 0.5, 0.75);
  const yellow = std(0xb8901c, 0.7, 0.25);
  const strip = lit(0xfff0d0, 0.62);
  const screenOn = lit(0x66ffcc, 1.2);
  const glass = lit(0xbfe0ff, 0.8);

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    root.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  // --- Shell: deck, ceiling, side walls, bulkheads ---
  const floor = add(new THREE.PlaneGeometry(W * 2, Z1 - Z0), deckMat, 0, 0, (Z0 + Z1) / 2);
  floor.rotation.x = -Math.PI / 2;
  const ceiling = add(new THREE.PlaneGeometry(W * 2, Z1 - Z0), trim, 0, H, (Z0 + Z1) / 2);
  ceiling.rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    const wall = add(new THREE.PlaneGeometry(Z1 - Z0, H), wallMat, s * W, H / 2, (Z0 + Z1) / 2);
    wall.rotation.y = -s * Math.PI / 2;
    if (s === 1) {
      solids.push(solid(s * W, Z0, s * (W + 4), Z1, H));
    } else {
      // Port side: a doorway through to the main corridor.
      const d0 = DECK_DOOR.z - DECK_DOOR.width / 2;
      const d1 = DECK_DOOR.z + DECK_DOOR.width / 2;
      solids.push(solid(-W, Z0, -W - 4, d0, H));
      solids.push(solid(-W, d1, -W - 4, Z1, H));
      // Frame it, and cap the opening off above head height.
      add(box(0.6, H - DECK_DOOR.height, DECK_DOOR.width), trim, -W + 0.3, DECK_DOOR.height + (H - DECK_DOOR.height) / 2, DECK_DOOR.z);
      for (const e of [-1, 1]) add(box(0.7, DECK_DOOR.height, 0.5), yellow, -W + 0.35, DECK_DOOR.height / 2, DECK_DOOR.z + e * (DECK_DOOR.width / 2));
      add(box(0.7, 0.4, DECK_DOOR.width + 1), yellow, -W + 0.35, DECK_DOOR.height, DECK_DOOR.z);
      // Lit sign over the doorway, facing back into the bay, so it's findable.
      const doorSign = add(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: signTexture("MAIN CORRIDOR", "BRIDGE · MESS · QUARTERS"), toneMapped: false }), -W + 0.8, 6.2, DECK_DOOR.z);
      doorSign.rotation.y = Math.PI / 2;
      const arrow = new THREE.PointLight(0xffe6c0, 900, 60, 2);
      arrow.position.set(-W + 6, 7, DECK_DOOR.z);
      root.add(arrow);
      hotspots.push({ id: "corridorDoor", pos: new THREE.Vector3(-W + 1.5, 1.6, DECK_DOOR.z), range: 9, label: "Main corridor" });
    }
  }
  // Forward bulkhead: the tunnel carries on, behind a mesh gate.
  add(new THREE.PlaneGeometry(W * 2, H), wallMat, 0, H / 2, Z0);
  solids.push(solid(-W, Z0 - 4, W, Z0, H));
  add(box(26, 14, 1), trim, 0, 7, Z0 + 0.6);
  add(box(28, 1.4, 1.4), yellow, 0, 14.4, Z0 + 0.6);
  // Aft: the stern door, open on space, with the mag-field shimmer across it.
  add(new THREE.PlaneGeometry(W * 2, H), wallMat, 0, H / 2, Z1).rotation.y = Math.PI;
  solids.push(solid(-W, Z1, W, Z1 + 4, H));
  const doorW = 34, doorH = 18;
  add(box(doorW + 4, 2, 1.2), yellow, 0, doorH + 1, Z1 - 0.8);
  for (const s of [-1, 1]) add(box(2, doorH + 2, 1.2), yellow, s * (doorW / 2 + 1), doorH / 2, Z1 - 0.8);
  const field = add(new THREE.PlaneGeometry(doorW, doorH), new THREE.MeshBasicMaterial({
    color: 0x3aa0ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false,
  }), 0, doorH / 2, Z1 - 1.2);
  // Stars beyond the door, so the bay reads as open to space.
  const starGeo = new THREE.BufferGeometry();
  const stars = new Float32Array(1200 * 3);
  for (let i = 0; i < 1200; i++) {
    stars[i * 3] = rand(-400, 400);
    stars[i * 3 + 1] = rand(-200, 300);
    stars[i * 3 + 2] = Z1 + rand(60, 900);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(stars, 3));
  root.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbfd8ff, size: 1.6, sizeAttenuation: true })));

  // --- Lighting rig: strips down the ceiling, plus a few real lights ---
  for (let z = Z0 + 20; z < Z1; z += 40) {
    for (const x of [-46, 0, 46]) {
      const s = add(box(3, 0.5, 26), strip, x, H - 1.2, z);
      if (Math.random() < 0.12) flicker.push(s.material as THREE.Material);
    }
    add(box(W * 2, 0.6, 1.2), trim, 0, H - 2, z + 20);
  }
  const key = new THREE.DirectionalLight(0xfff0d8, 1.25);
  key.position.set(60, 120, -80);
  root.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.5);
  fill.position.set(-80, 50, 120);
  root.add(fill, fill.target);
  root.add(new THREE.HemisphereLight(0xa8bcd4, 0x2a2e34, 1.15));
  // A few real lamps for pools of light on the plating.
  for (const z of [-140, -40, 60, 160]) for (const x of [-40, 40]) {
    const p = new THREE.PointLight(0xffd9a0, 4200, 150, 2);
    p.position.set(x, H - 8, z);
    root.add(p);
  }

  // --- Deck markings: centreline, cradle boxes, walkways ---
  const paint = (w: number, d: number, x: number, z: number, mat: THREE.Material = yellow) => {
    const m = add(new THREE.PlaneGeometry(w, d), mat, x, 0.02, z);
    m.rotation.x = -Math.PI / 2;
    return m;
  };
  for (let z = Z0 + 10; z < Z1; z += 14) paint(0.55, 6, 0, z);
  for (const [cx, cz] of [[-30, -40], [-30, 70]] as const) {
    for (const [w, d, x, zz] of [[46, 0.5, cx, cz - 22], [46, 0.5, cx, cz + 22], [0.5, 44, cx - 23, cz], [0.5, 44, cx + 23, cz]] as const) paint(w, d, x, zz);
  }
  // A painted route from the cradles to the corridor door: dashes aft, then a turn to port.
  for (let z = -10; z < DECK_DOOR.z - 8; z += 8) paint(0.45, 4, -62, z, std(0x2f7fb8, 0.7, 0.2));
  for (let x = -62; x > -W + 4; x -= 6) paint(4, 0.45, x, DECK_DOOR.z - 4, std(0x2f7fb8, 0.7, 0.2));
  paint(0.45, 4.5, -62, DECK_DOOR.z - 6, std(0x2f7fb8, 0.7, 0.2));

  // Safety walkway stripes along both walls.
  for (const s of [-1, 1]) for (const dx of [-1.1, 1.1]) paint(0.3, Z1 - Z0 - 20, s * (W - 6) + dx, (Z0 + Z1) / 2, std(0xb8b2a0, 0.9, 0.2));

  // --- Two Seagulls on their cradles (the models are in km: scale up) ---
  const parked: THREE.Group[] = [];
  [["wyatt", -30, -40, 0xffffff], ["harren", -30, 70, 0xcc6622]].forEach(([id, x, z, stripe]) => {
    const ship = createSeagull(stripe as number);
    ship.root.scale.setScalar(1000);
    // Parked and cold: no engine glow, no nav lights, and the lit parts (canopy,
    // nozzle embers) dimmed — at 1000x they would glare across the whole deck.
    ship.root.traverse((o) => {
      if ((o as THREE.Sprite).isSprite) { o.visible = false; return; }
      const mesh = o as THREE.Mesh;
      const mat = mesh.material as THREE.MeshBasicMaterial | undefined;
      if (mesh.isMesh && mat?.isMeshBasicMaterial) {
        const dim = mat.clone();
        dim.color.multiplyScalar(0.18);
        mesh.material = dim;
      }
    });
    ship.root.position.set(x as number, 5.2, z as number);
    ship.root.rotation.y = Math.PI; // nose forward, toward the bow
    root.add(ship.root);
    parked.push(ship.root);
    // Cradle, chocks and a boarding ladder.
    add(box(30, 1.4, 12), metal, x as number, 0.7, z as number);
    for (const dz of [-9, 9]) add(box(26, 3, 2.4), trim, x as number, 2.4, (z as number) + dz);
    const ladder = add(box(1.2, 7, 0.4), metal, (x as number) + 7, 3.5, (z as number) - 3);
    ladder.rotation.x = 0.12;
    solids.push(solid((x as number) - 16, (z as number) - 11, (x as number) + 16, (z as number) + 11, 9));
    hotspots.push({ id: id as string, pos: new THREE.Vector3((x as number) + 9, 2, (z as number) - 4), range: 9, label: id === "wyatt" ? "Your Seagull" : "Harren's Seagull" });
  });

  // --- Launch console by Wyatt's cradle ---
  const console3d = new THREE.Group();
  console3d.position.set(-8, 0, -40);
  root.add(console3d);
  const consoleBase = new THREE.Mesh(box(4, 1.2, 2.4), metal);
  consoleBase.position.y = 0.6;
  console3d.add(consoleBase);
  const desk = new THREE.Mesh(box(4.4, 0.3, 2.8), trim);
  desk.position.y = 1.3;
  console3d.add(desk);
  const panel = new THREE.Mesh(box(3.6, 1.8, 0.25), trim);
  panel.position.set(0, 2.3, -0.8);
  panel.rotation.x = -0.25;
  console3d.add(panel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.5), screenOn);
  screen.position.set(0, 2.32, -0.62);
  screen.rotation.x = -0.25;
  console3d.add(screen);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: signTexture("FLIGHT OPS", "CRADLE 2 · LAUNCH AUTHORITY"), toneMapped: false }));
  sign.position.set(-8, 6, -40 - 3.4);
  sign.rotation.y = Math.PI;
  root.add(sign);
  solids.push(solid(-10.5, -42, -5.5, -38, 3));
  hotspots.push({ id: "launch", pos: new THREE.Vector3(-8, 1.6, -37), range: 6, label: "Flight ops console" });

  // --- Deck clutter: crates, drums, bowsers, a crane, railings ---
  const crate = box(1.7, 1.5, 1.7);
  for (let i = 0; i < 26; i++) {
    const x = rand(-W + 12, W - 12);
    const z = rand(Z0 + 20, Z1 - 30);
    if (Math.abs(x + 30) < 22 && (Math.abs(z + 40) < 18 || Math.abs(z - 70) < 18)) continue; // keep the cradles clear
    const stack = 1 + (Math.random() < 0.4 ? 1 : 0);
    for (let s = 0; s < stack; s++) add(crate, s ? trim : metal, x, 0.75 + s * 1.5, z).rotation.y = rand(-0.3, 0.3);
    solids.push(solid(x - 1, z - 1, x + 1, z + 1, 3));
  }
  for (let i = 0; i < 14; i++) {
    const x = rand(-W + 10, W - 10);
    const z = rand(Z0 + 20, Z1 - 20);
    add(new THREE.CylinderGeometry(0.33, 0.33, 0.95, 12), i % 3 ? yellow : trim, x, 0.48, z);
    solids.push(solid(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 1));
  }
  // Overhead gantry crane on rails.
  for (const s of [-1, 1]) {
    add(box(3, 2, Z1 - Z0 - 20), metal, s * (W - 10), H - 4, (Z0 + Z1) / 2);
    for (const z of [-120, 0, 120]) {
      add(box(1.2, H - 5, 1.2), metal, s * (W - 10), (H - 5) / 2, z);
      solids.push(solid(s * (W - 10) - 0.7, z - 0.7, s * (W - 10) + 0.7, z + 0.7, 6));
    }
  }
  const craneZ = 20;
  add(box(W * 2 - 20, 2.4, 3.2), metal, 0, H - 5.5, craneZ);
  add(box(4, 3.4, 4), trim, -20, H - 8.5, craneZ);
  add(box(0.4, 7, 0.4), metal, -20, H - 13.5, craneZ);
  add(box(3, 1.2, 3), yellow, -20, H - 17.5, craneZ);
  // Railings along the walkways.
  // (Port side: the railing stops either side of the corridor doorway.)
  const gate0 = DECK_DOOR.z - 4, gate1 = DECK_DOOR.z + 4;
  for (const s of [-1, 1]) {
    for (let z = Z0 + 20; z < Z1 - 20; z += 12) {
      if (s < 0 && z + 12 > gate0 && z < gate1) continue;
      add(box(0.12, 1.1, 0.12), metal, s * (W - 9), 0.55, z);
      add(box(0.12, 0.1, 12), metal, s * (W - 9), 1.1, z + 6);
      add(box(0.12, 0.1, 12), metal, s * (W - 9), 0.6, z + 6);
    }
    if (s > 0) solids.push(solid(s * (W - 9.3), Z0 + 20, s * (W - 8.7), Z1 - 20, 1.1));
    else {
      solids.push(solid(-(W - 9.3), Z0 + 20, -(W - 8.7), gate0, 1.1));
      solids.push(solid(-(W - 9.3), gate1, -(W - 8.7), Z1 - 20, 1.1));
    }
  }

  // --- Aft port corner: the way into the rest of the ship ---
  const doorX = -W + 14, doorZ = 150;
  add(box(10, 0.8, 1.4), yellow, doorX, 6.4, doorZ - 3.5);
  const hatch = add(box(9, 6, 0.6), trim, doorX, 3, doorZ - 3.6);
  const hatchSign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.8), new THREE.MeshBasicMaterial({ map: signTexture("MAIN CORRIDOR", "BRIDGE · MESS · QUARTERS"), toneMapped: false }));
  hatchSign.position.set(doorX, 7.6, doorZ - 3.4);
  root.add(hatchSign);
  add(new THREE.PlaneGeometry(8.6, 5.6), glass, doorX, 3, doorZ - 3.3).visible = false;
  solids.push(solid(doorX - 5, doorZ - 4.2, doorX + 5, doorZ - 3, 6));
  hotspots.push({ id: "corridor", pos: new THREE.Vector3(doorX, 1.6, doorZ - 5.5), range: 6, label: "Stores hatch (sealed)" });
  void hatch;

  // Deck office up on the starboard wall, windows lit.
  const office = new THREE.Group();
  office.position.set(W - 12, 12, -100);
  root.add(office);
  office.add(new THREE.Mesh(box(8, 7, 26), metal));
  const win = new THREE.Mesh(new THREE.PlaneGeometry(22, 2.6), glass);
  win.position.set(-4.1, 1.4, 0);
  win.rotation.y = -Math.PI / 2;
  office.add(win);
  solids.push(solid(W - 16, -113, W, -87, 12));

  return {
    root,
    solids,
    hotspots,
    doors: [],
    spawn: { x: -8, z: -18, yaw: Math.PI },
    update(t: number) {
      (field.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(t * 2.2) * 0.03;
      for (const m of flicker) {
        const on = Math.sin(t * 17 + m.id) > -0.85;
        (m as THREE.MeshBasicMaterial).opacity = on ? 1 : 0.25;
        (m as THREE.MeshBasicMaterial).transparent = true;
      }
      for (const p of parked) p.rotation.y = Math.PI; // parked ships stay put
    },
  };
}

function tiled(tex: THREE.Texture, x: number, y: number) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(x, y);
  return tex;
}
