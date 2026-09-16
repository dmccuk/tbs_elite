import * as THREE from "three";
import { rand } from "../config";
import { canvasTex, std } from "../model-kit";
import { solid } from "./walk";
import { emissive, RoomKit, signTex } from "./parts";
import { BRIDGE_DOOR } from "./corridor";
import type { Section } from "./types";

// Section 3: the Kessler's bridge, at the forward end of the main corridor.
//
// She's a carrier, not a cruiser: the bow is armour and cargo, so there is no
// forward glass. The watch conns her off a wall of screens, and the only real
// window is the long port-side viewport looking out over the belt. That window
// also happens to face away from every other interior section, so nothing of the
// hangar can stray into the view. METRES.

const ROOM = { x0: -114, x1: -90, z0: 30, z1: 56, h: 4.6 };
const CX = (ROOM.x0 + ROOM.x1) / 2;          // -102
const WIN = { z0: 33, z1: 53, yBot: 1.2, yTop: 3.0 };

// ---------------------------------------------------------------- screens ---

function plotTex() {
  return canvasTex(512, 256, (c) => {
    c.fillStyle = "#05101a";
    c.fillRect(0, 0, 512, 256);
    c.strokeStyle = "rgba(90,180,220,0.18)";
    c.lineWidth = 1;
    for (let x = 0; x < 512; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 256); c.stroke(); }
    for (let y = 0; y < 256; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(512, y); c.stroke(); }
    // The patrol lap: the same ellipse the Cruise flies.
    c.strokeStyle = "#66ffcc";
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(256, 130, 170, 82, 0, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([4, 6]);
    c.strokeStyle = "rgba(102,255,204,0.35)";
    c.beginPath();
    c.ellipse(256, 130, 205, 104, 0, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    // Us, and the belt scattered around.
    c.fillStyle = "#e8b21c";
    c.beginPath();
    c.moveTo(430, 130); c.lineTo(418, 124); c.lineTo(418, 136); c.closePath(); c.fill();
    c.fillStyle = "rgba(150,170,190,0.55)";
    for (let i = 0; i < 70; i++) c.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
    c.fillStyle = "#9ad0ff";
    c.font = "17px 'Share Tech Mono', monospace";
    c.fillText("PATROL PLAN 4471", 14, 26);
    c.fillText("LEG 2 OF 2", 14, 46);
    c.fillText("CONTACTS  0", 14, 238);
    c.fillText("KES-114", 420, 26);
  });
}

function viewTex() {
  return canvasTex(1024, 320, (c) => {
    c.fillStyle = "#04070c";
    c.fillRect(0, 0, 1024, 320);
    c.fillStyle = "rgba(190,215,255,0.9)";
    for (let i = 0; i < 420; i++) c.fillRect(Math.random() * 1024, Math.random() * 320, 1.4, 1.4);
    // Belt haze across the middle, and a few rocks near enough to resolve.
    const haze = c.createLinearGradient(0, 120, 0, 210);
    haze.addColorStop(0, "rgba(120,110,95,0)");
    haze.addColorStop(0.5, "rgba(140,126,104,0.3)");
    haze.addColorStop(1, "rgba(120,110,95,0)");
    c.fillStyle = haze;
    c.fillRect(0, 120, 1024, 90);
    for (let i = 0; i < 16; i++) {
      const x = Math.random() * 1024, y = 140 + Math.random() * 50, r = 3 + Math.random() * 13;
      c.fillStyle = `rgba(${90 + Math.random() * 40 | 0},${82 + Math.random() * 30 | 0},70,0.85)`;
      c.beginPath();
      c.ellipse(x, y, r, r * (0.6 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2);
      c.fill();
    }
    // Camera furniture.
    c.strokeStyle = "rgba(102,255,204,0.55)";
    c.lineWidth = 2;
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(512 + s * 30, 165); c.lineTo(512 + s * 70, 165); c.stroke();
    }
    c.beginPath(); c.moveTo(512, 135); c.lineTo(512, 155); c.stroke();
    c.strokeRect(40, 30, 944, 260);
    c.fillStyle = "#66ffcc";
    c.font = "22px 'Share Tech Mono', monospace";
    c.fillText("FWD CAM 1", 56, 60);
    c.fillText("BRG 000 / 004", 56, 268);
    c.fillText("RNG 42.6 KM", 800, 268);
    c.fillStyle = "#e8b21c";
    c.fillText("STATION KEEPING", 800, 60);
  });
}

function scopeTex() {
  return canvasTex(256, 256, (c) => {
    c.fillStyle = "#050d12";
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = "rgba(102,255,204,0.35)";
    c.lineWidth = 1.5;
    for (const r of [34, 68, 102]) { c.beginPath(); c.arc(128, 128, r, 0, Math.PI * 2); c.stroke(); }
    c.beginPath(); c.moveTo(128, 20); c.lineTo(128, 236); c.moveTo(20, 128); c.lineTo(236, 128); c.stroke();
    c.strokeStyle = "rgba(102,255,204,0.8)";
    c.beginPath(); c.moveTo(128, 128); c.lineTo(212, 74); c.stroke();
    c.fillStyle = "rgba(150,170,190,0.6)";
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 100;
      c.fillRect(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 2.5, 2.5);
    }
    c.fillStyle = "#9ad0ff";
    c.font = "14px 'Share Tech Mono', monospace";
    c.fillText("PASSIVE", 12, 20);
  });
}

function boardTex() {
  return canvasTex(256, 512, (c) => {
    c.fillStyle = "#0a1016";
    c.fillRect(0, 0, 256, 512);
    c.fillStyle = "#e8b21c";
    c.font = "bold 26px 'Big Shoulders Display', Impact, sans-serif";
    c.fillText("SHIP STATE", 14, 34);
    const rows = ["REACTOR", "DRIVE", "TRIM", "LIFE SUP", "HANGAR", "MAG FIELD", "COMMS", "SENSORS", "STORES", "WATER"];
    c.font = "16px 'Share Tech Mono', monospace";
    rows.forEach((label, i) => {
      const y = 76 + i * 42;
      c.fillStyle = "#8fa3b8";
      c.fillText(label, 14, y);
      const good = i !== 4 && i !== 9;
      c.fillStyle = good ? "rgba(102,255,204,0.25)" : "rgba(232,178,28,0.25)";
      c.fillRect(14, y + 8, 228, 12);
      c.fillStyle = good ? "#66ffcc" : "#e8b21c";
      c.fillRect(14, y + 8, 228 * (good ? 0.78 + Math.random() * 0.2 : 0.42), 12);
    });
    c.fillStyle = "#e8b21c";
    c.font = "15px 'Share Tech Mono', monospace";
    c.fillText("HANGAR: 2 BIRDS COLD", 14, 498);
  });
}

function plaqueTex() {
  return canvasTex(512, 160, (c) => {
    c.fillStyle = "#1a1409";
    c.fillRect(0, 0, 512, 160);
    c.strokeStyle = "#c9a24a";
    c.lineWidth = 4;
    c.strokeRect(10, 10, 492, 140);
    c.fillStyle = "#e8c66c";
    c.textAlign = "center";
    c.font = "bold 52px 'Big Shoulders Display', Impact, sans-serif";
    c.fillText("KESSLER", 256, 70);
    c.font = "22px 'Share Tech Mono', monospace";
    c.fillStyle = "#c9a24a";
    c.fillText("KES-114 · NINTH PATROL", 256, 106);
    c.fillText("TESSICK-VARN", 256, 134);
  });
}

// ------------------------------------------------------------------ vista ---

/** Stars, the brown dwarf and a slowly drifting belt, all out to port. */
function buildVista(root: THREE.Group) {
  const stars = new THREE.BufferGeometry();
  const pts = new Float32Array(2400 * 3);
  for (let i = 0; i < 2400; i++) {
    pts[i * 3] = rand(-400, -3200);
    pts[i * 3 + 1] = rand(-900, 900);
    pts[i * 3 + 2] = rand(-1800, 1800);
  }
  stars.setAttribute("position", new THREE.BufferAttribute(pts, 3));
  root.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xbfd8ff, size: 1.8, sizeAttenuation: false })));

  // The brown dwarf: a dull ember low on the port quarter.
  const dwarf = new THREE.Mesh(new THREE.PlaneGeometry(620, 620), new THREE.MeshBasicMaterial({
    map: canvasTex(256, 256, (c) => {
      const g = c.createRadialGradient(128, 128, 10, 128, 128, 126);
      g.addColorStop(0, "rgba(255,186,124,1)");
      g.addColorStop(0.28, "rgba(198,98,48,1)");
      g.addColorStop(0.52, "rgba(96,38,22,0.75)");
      g.addColorStop(1, "rgba(40,16,10,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 256);
    }),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  dwarf.position.set(-2600, 90, -420);
  dwarf.rotation.y = Math.PI / 2;
  root.add(dwarf);

  // The belt. Hung off a pivot at the ship so it drifts aft without ever wrapping.
  const pivot = new THREE.Object3D();
  root.add(pivot);
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), std(0x5f574d, 1, 0), 260);
  const d = new THREE.Object3D();
  for (let i = 0; i < 260; i++) {
    const out = rand(340, 2100);
    d.position.set(-out, rand(-70, 70) + out * 0.012, rand(-1100, 1100));
    d.rotation.set(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3));
    const s = rand(1.6, 17);
    d.scale.set(s, s * rand(0.6, 1.1), s * rand(0.7, 1.2));
    d.updateMatrix();
    rocks.setMatrixAt(i, d.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  pivot.add(rocks);
  return pivot;
}

// ----------------------------------------------------------------- bridge ---

export function buildBridge(): Section {
  const kit = new RoomKit([12, 13], [14, 2]);
  const add = kit.add.bind(kit);
  const box = kit.box;
  const { trim, pipe, strip } = kit;
  const dark = std(0x333a44, 0.65, 0.5);
  const metal = std(0x6a7078, 0.5, 0.75);
  const seat = std(0x2b2f3a, 0.9, 0.1);
  const flicker: THREE.MeshBasicMaterial[] = [];

  // --- Shell. The port wall is built by hand, around the viewport. ---
  kit.shell(ROOM, [{ side: "z1", at: BRIDGE_DOOR.x - CX, width: BRIDGE_DOOR.width }], ["x0"]);
  kit.solids.push(solid(ROOM.x0 - 0.12, ROOM.z0, ROOM.x0 + 0.12, ROOM.z1, ROOM.h));

  const wx = ROOM.x0;
  const winLen = WIN.z1 - WIN.z0, winMid = (WIN.z0 + WIN.z1) / 2;
  add(box(0.2, WIN.yBot, winLen), kit.wallMat, wx, WIN.yBot / 2, winMid);                       // sill
  add(box(0.2, ROOM.h - WIN.yTop, winLen), kit.wallMat, wx, (ROOM.h + WIN.yTop) / 2, winMid);   // header
  add(box(0.2, ROOM.h, WIN.z0 - ROOM.z0), kit.wallMat, wx, ROOM.h / 2, (ROOM.z0 + WIN.z0) / 2);
  add(box(0.2, ROOM.h, ROOM.z1 - WIN.z1), kit.wallMat, wx, ROOM.h / 2, (WIN.z1 + ROOM.z1) / 2);
  for (const z of [WIN.z0, 38, 43, 48, WIN.z1]) add(box(0.3, WIN.yTop - WIN.yBot, 0.36), trim, wx + 0.04, (WIN.yBot + WIN.yTop) / 2, z);
  add(box(0.34, 0.16, winLen), trim, wx + 0.06, WIN.yBot, winMid);                              // sill capping
  // A breath of glass, so the window isn't a hole in the wall.
  const pane = add(new THREE.PlaneGeometry(winLen, WIN.yTop - WIN.yBot), new THREE.MeshBasicMaterial({
    color: 0x9ec6ff, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false,
  }), wx + 0.14, (WIN.yBot + WIN.yTop) / 2, winMid);
  pane.rotation.y = Math.PI / 2;
  // Handrail, and a box to keep you a pace back from it.
  for (const y of [0.62, 1.05]) add(new THREE.CylinderGeometry(0.045, 0.045, winLen, 8).rotateX(Math.PI / 2), metal, wx + 0.85, y, winMid);
  for (let z = WIN.z0; z <= WIN.z1; z += 4) add(box(0.09, 1.05, 0.09), metal, wx + 0.85, 0.52, z);
  kit.solids.push(solid(wx + 0.7, WIN.z0, wx + 1, WIN.z1, 1.05));
  kit.hotspot("viewport", wx + 1.6, 1.6, winMid, 5, "Port viewport");

  const pivot = buildVista(kit.root);

  // --- Forward bulkhead: the main viewscreen and two repeaters ---
  add(box(11.4, 3.6, 0.3), dark, CX, 2.4, ROOM.z0 + 0.22);
  add(new THREE.PlaneGeometry(10.4, 3), emissive(viewTex()), CX, 2.4, ROOM.z0 + 0.39);
  for (const [dx, tex] of [[-7.2, plotTex()], [7.2, scopeTex()]] as const) {
    add(box(4.2, 2.4, 0.28), dark, CX + dx, 2.3, ROOM.z0 + 0.21);
    add(new THREE.PlaneGeometry(3.6, 2), emissive(tex), CX + dx, 2.3, ROOM.z0 + 0.37);
  }
  add(new THREE.PlaneGeometry(4, 0.5), emissive(signTex("CONN")), CX, 4.25, ROOM.z0 + 0.37);
  kit.hotspot("viewscreen", CX, 1.7, ROOM.z0 + 3, 6, "Main viewscreen");

  /** One watch station: a desk, a raked panel and a lit screen. Yaw 0 faces forward. */
  function station(id: string, label: string, x: number, z: number, yaw: number, tex: THREE.Texture, w = 2.4) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    kit.root.add(g);
    add(box(w, 0.95, 0.9), dark, 0, 0.475, 0, g);
    add(box(w + 0.24, 0.12, 1.15), trim, 0, 1.02, 0, g);
    const back = add(box(w, 1.15, 0.18), dark, 0, 1.62, -0.44, g);
    back.rotation.x = 0.26;
    const screen = add(new THREE.PlaneGeometry(w - 0.35, 0.95), emissive(tex), 0, 1.64, -0.33, g);
    screen.rotation.x = 0.26;
    add(new THREE.PlaneGeometry(1.5, 0.3), emissive(signTex(label)), 0, 2.32, -0.5, g);
    // Operator's stool.
    add(new THREE.CylinderGeometry(0.28, 0.3, 0.1, 12), seat, 0, 0.62, 1.05, g);
    add(new THREE.CylinderGeometry(0.07, 0.11, 0.62, 8), metal, 0, 0.31, 1.05, g);
    const s = Math.abs(Math.sin(yaw)) > 0.5;
    kit.solids.push(s ? solid(x - 0.75, z - w / 2 - 0.2, x + 0.75, z + w / 2 + 0.2, 1.1)
      : solid(x - w / 2 - 0.2, z - 0.75, x + w / 2 + 0.2, z + 0.75, 1.1));
    // Stand on the operator's side of the desk to use it.
    const ox = x + Math.sin(yaw) * 1.5, oz = z + Math.cos(yaw) * 1.5;
    kit.hotspot(id, ox, 1.3, oz, 2.6, label);
  }

  station("helm", "HELM", CX - 3.5, 36, 0, plotTex());
  station("nav", "NAV", CX + 3.5, 36, 0, scopeTex());
  station("sensors", "SENSORS", ROOM.x1 - 1.6, 38.5, -Math.PI / 2, scopeTex(), 2.2);
  station("comms", "COMMS", ROOM.x1 - 1.6, 45.5, -Math.PI / 2, plotTex(), 2.2);

  // --- The command dais, aft of the helm, looking at the screens ---
  const cz = 42.5;
  add(box(4.4, 0.34, 3.6), metal, CX, 0.17, cz);
  add(box(4.8, 0.1, 4), trim, CX, 0.36, cz);
  kit.solids.push(solid(CX - 2.4, cz - 2, CX + 2.4, cz + 2, 0.4));
  add(new THREE.CylinderGeometry(0.34, 0.46, 0.5, 12), metal, CX, 0.61, cz);
  add(box(1.05, 0.18, 1.05), seat, CX, 0.94, cz);
  const backRest = add(box(0.95, 0.95, 0.18), seat, CX, 1.5, cz + 0.5);
  backRest.rotation.x = -0.12;
  add(box(0.7, 0.26, 0.2), seat, CX, 2.06, cz + 0.42);      // headrest
  const armLamp = new THREE.MeshBasicMaterial({ color: 0x66ffcc });
  for (const s of [-1, 1]) {
    add(box(0.16, 0.14, 0.8), seat, CX + s * 0.58, 1.2, cz - 0.05);
    add(box(0.14, 0.04, 0.3), armLamp, CX + s * 0.58, 1.29, cz - 0.3);
  }
  kit.hotspot("chair", CX, 1.4, cz - 1.9, 3.2, "The captain's chair");

  // --- Plot table amidships ---
  const pz = 49.5;
  add(box(3.6, 0.14, 2.1), dark, CX, 0.94, pz);
  for (const [dx, dz] of [[-1.5, -0.8], [1.5, -0.8], [-1.5, 0.8], [1.5, 0.8]] as const) add(box(0.14, 0.94, 0.14), metal, CX + dx, 0.47, pz + dz);
  add(new THREE.PlaneGeometry(3.2, 1.8), emissive(plotTex()), CX, 1.02, pz).rotation.x = -Math.PI / 2;
  kit.solids.push(solid(CX - 1.9, pz - 1.2, CX + 1.9, pz + 1.2, 1));
  kit.hotspot("plot", CX, 1.1, pz, 3, "Plot table");

  // --- Aft bulkhead: ship-state board, the plaque, a fire locker ---
  add(box(2.6, 4.4, 0.24), dark, CX - 7.5, 2.2, ROOM.z1 - 0.22);
  add(new THREE.PlaneGeometry(2.1, 3.9), emissive(boardTex()), CX - 7.5, 2.2, ROOM.z1 - 0.37).rotation.y = Math.PI;
  const plaque = add(new THREE.PlaneGeometry(3.2, 1), emissive(plaqueTex()), CX + 6, 2.3, ROOM.z1 - 0.2);
  plaque.rotation.y = Math.PI;
  kit.hotspot("plaque", CX + 6, 1.7, ROOM.z1 - 2, 3.4, "Ship's plaque");
  add(box(0.9, 1.8, 0.5), std(0x8a2f22, 0.75, 0.2), CX + 9.5, 0.9, ROOM.z1 - 0.5);
  kit.solids.push(solid(CX + 9, ROOM.z1 - 0.9, CX + 10, ROOM.z1 - 0.2, 1.8));

  // --- Overhead: conduit, cable trays, strip lights (one of them tired) ---
  for (const x of [CX - 8, CX, CX + 8]) {
    for (let z = ROOM.z0 + 3; z < ROOM.z1; z += 6) {
      const s = add(box(2.8, 0.1, 0.44), strip, x, ROOM.h - 0.16, z);
      if (x === CX + 8 && z > 45) flicker.push(s.material as THREE.MeshBasicMaterial);
    }
  }
  for (const x of [CX - 10.5, CX + 10.5]) {
    add(new THREE.CylinderGeometry(0.12, 0.12, ROOM.z1 - ROOM.z0, 8).rotateX(Math.PI / 2), pipe, x, ROOM.h - 0.5, (ROOM.z0 + ROOM.z1) / 2);
    add(new THREE.CylinderGeometry(0.08, 0.08, ROOM.z1 - ROOM.z0, 8).rotateX(Math.PI / 2), pipe, x, ROOM.h - 0.78, (ROOM.z0 + ROOM.z1) / 2);
    add(box(0.5, 0.36, ROOM.z1 - ROOM.z0), trim, x - 0.8, ROOM.h - 0.34, (ROOM.z0 + ROOM.z1) / 2);
  }

  // --- Lighting: pools over the stations, the rest left in the half-dark ---
  for (const [x, z, i] of [[CX, 36, 62], [CX, 44, 52], [CX, 51, 52], [ROOM.x0 + 5, 43, 44], [ROOM.x1 - 4, 42, 44]] as const) {
    const p = new THREE.PointLight(0xffe6c0, i, 26, 2);
    p.position.set(x, 3, z);         // kept off the deckhead, or it burns a hot spot into it
    kit.root.add(p);
  }
  // A cold wash off the viewport, so the port side reads as "outside".
  const cold = new THREE.PointLight(0x7fa8d8, 34, 22, 2);
  cold.position.set(ROOM.x0 + 1.4, 2.4, (WIN.z0 + WIN.z1) / 2);
  kit.root.add(cold);

  // Deck markings: a walkway from the door to the dais.
  for (let z = ROOM.z1 - 2; z > cz + 2; z -= 2.2) add(box(0.4, 0.05, 1.1), std(0x2f7fb8, 0.7, 0.2), BRIDGE_DOOR.x, 0.03, z);

  return {
    root: kit.root,
    solids: kit.solids,
    hotspots: kit.hotspots,
    doors: kit.doors,
    update(t, walker) {
      kit.updateDoors(walker);
      pivot.rotation.y = t * 0.0075;               // the belt sliding aft
      for (const m of flicker) {
        m.opacity = Math.sin(t * 13 + m.id) > -0.9 ? 1 : 0.4;
        m.transparent = true;
      }
    },
  };
}
