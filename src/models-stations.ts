import * as THREE from "three";
import {
  V, box, std, lit, panelMat, add, rod, light, group, bakeParts, addParts, hazardMat, lazy, Trusses,
} from "./model-kit";

// The Lingering Systems' two big stations (Chapter 1). Built at the same level
// of detail as the Tessick-3 relay but several times the size: these are the
// landmarks of the system, so they read as places rather than props.
//
//  - Halvern Ring: a spun habitat ring on six spokes around a hub stack, with
//    docking arms, a freighter alongside, solar wings and comm dishes. ~3.4 km.
//  - Cawley Yards: an ore refinery and repair dock — a long keel of processing
//    blocks and tanks, a gantry dock with a hull in the cradle, and a flare. ~3.8 km.
//
// 1 unit = 1 km. Both face -Z like everything else.

const kit = lazy(() => ({
  hull: panelMat({ base: "#8d9099", seam: "rgba(20,24,30,0.8)", variance: 0.16, grime: 1.3, windows: "#ffd79a", windowDensity: 0.3, repeat: [3, 2] }, 0.6, 0.55),
  plated: panelMat({ base: "#6e737d", seam: "rgba(16,18,24,0.85)", variance: 0.22, grime: 1.6, windows: "#ffcf8a", windowDensity: 0.14, repeat: [4, 2] }, 0.65, 0.6),
  struct: std(0x565b66, 0.55, 0.75),
  dark: std(0x24272d, 0.5, 0.8),
  tank: std(0x9aa0a8, 0.45, 0.7),
  solar: std(0x1b2b52, 0.35, 0.65, { emissive: 0x0a1428, emissiveIntensity: 0.5 }),
  radiator: std(0xaeb4bc, 0.4, 0.6),
  window: lit(0xffcf8a, 1.4),
  glass: lit(0xbfe0ff, 1.5),
  flare: lit(0xff7a2a, 2.2),
}));

const cyl = (rTop: number, rBottom: number, h: number, seg = 20) => new THREE.CylinderGeometry(rTop, rBottom, h, seg);

/** A stack of lit windows down a flank. */
function windowRow(parent: THREE.Object3D, mat: THREE.Material, count: number, w: number, h: number, x: number, y: number, z: number, step: number, along: "x" | "z") {
  for (let i = 0; i < count; i++) {
    const d = (i - (count - 1) / 2) * step;
    add(parent, box(along === "x" ? w : 0.004, h, along === "x" ? 0.004 : w), mat, x + (along === "x" ? d : 0), y, z + (along === "z" ? d : 0));
  }
}

// ---------------------------------------------------------------------------
// Halvern Ring — habitat and trade ring, the system's main port.

export function createRingStation(): { root: THREE.Group; ring: THREE.Group } {
  const k = kit();
  const g = new THREE.Group();
  const t = new Trusses();
  const R = 1.5;            // ring radius
  const SEGS = 26;

  // Hub stack: command drum, crew decks, docking collars top and bottom.
  add(g, cyl(0.26, 0.26, 0.44, 24), k.hull);
  add(g, cyl(0.3, 0.3, 0.06, 24), k.struct, 0, 0.16, 0);
  add(g, cyl(0.3, 0.3, 0.06, 24), k.struct, 0, -0.16, 0);
  add(g, cyl(0.17, 0.26, 0.14, 24), k.plated, 0, 0.29, 0);
  add(g, cyl(0.26, 0.17, 0.14, 24), k.plated, 0, -0.29, 0);
  add(g, cyl(0.1, 0.1, 0.12, 16), k.dark, 0, 0.41, 0);
  add(g, cyl(0.1, 0.1, 0.12, 16), k.dark, 0, -0.41, 0);
  add(g, new THREE.TorusGeometry(0.105, 0.012, 8, 20).rotateX(Math.PI / 2), k.struct, 0, 0.47, 0);
  // Control-room windows around the drum (a band, not a lamp).
  add(g, cyl(0.263, 0.263, 0.022, 24), lit(0xbfe0ff, 0.5), 0, 0.08, 0);

  // Spine through the hub. The ring and its spokes are built in their own group,
  // which spins; everything else stays put.
  t.lattice(V(0, -0.9, 0), V(0, 0.9, 0), 0.05, 14, 0.008);
  const ring = new THREE.Group();
  const spin = new Trusses();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const dir = V(Math.cos(a), 0, Math.sin(a));
    spin.lattice(dir.clone().multiplyScalar(0.28), dir.clone().multiplyScalar(R - 0.12), 0.035, 9, 0.007);
    // A lift car part-way along each spoke.
    add(ring, box(0.05, 0.05, 0.05), k.dark, dir.x * (0.5 + (i % 3) * 0.3), 0, dir.z * (0.5 + (i % 3) * 0.3));
  }

  // The ring itself: panelled segments rather than a smooth band, with window
  // strips, a taller module every few bays, and rails top and bottom.
  const segAngle = (Math.PI * 2) / SEGS;
  const segW = R * segAngle * 0.94;
  for (let i = 0; i < SEGS; i++) {
    const a = i * segAngle;
    const s = group(ring, Math.cos(a) * R, 0, Math.sin(a) * R);
    s.rotation.y = -a;
    const tall = i % 4 === 0;
    add(s, box(0.2, tall ? 0.26 : 0.17, segW), k.hull);
    add(s, box(0.215, 0.02, segW * 0.9), k.struct, 0, tall ? 0.14 : 0.095, 0);
    add(s, box(0.215, 0.02, segW * 0.9), k.struct, 0, tall ? -0.14 : -0.095, 0);
    // Lit windows facing out and in.
    windowRow(s, k.window, 4, 0.05, 0.016, 0.101, 0.02, 0, segW / 5, "z");
    windowRow(s, k.window, 3, 0.04, 0.012, -0.101, -0.01, 0, segW / 4, "z");
    if (tall) {
      add(s, box(0.1, 0.06, 0.1), k.plated, 0, 0.16, 0);
      light(s, 0xff2a1a, 0.05, 0, 0.21, 0, [2.4, (i / SEGS) % 1]);
    }
    if (i % 6 === 3) add(s, cyl(0.02, 0.02, 0.26, 10), k.struct, 0, 0.2, 0);
  }
  for (const y of [0.1, -0.1]) add(ring, new THREE.TorusGeometry(R, 0.016, 8, 140).rotateX(Math.PI / 2), k.struct, 0, y, 0);

  // Docking arms off the hub, one with a freighter alongside.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const dir = V(Math.cos(a), 0, Math.sin(a));
    const tip = dir.clone().multiplyScalar(0.95);
    tip.y = i % 2 ? 0.55 : -0.55;
    t.lattice(dir.clone().multiplyScalar(0.3).setY(i % 2 ? 0.2 : -0.2), tip, 0.028, 6, 0.006);
    const head = group(g, tip.x, tip.y, tip.z);
    add(head, box(0.12, 0.09, 0.12), k.dark);
    add(head, box(0.13, 0.02, 0.13), hazardMat(4), 0, 0.055, 0);
    light(head, 0xffaa22, 0.045, 0, -0.06, 0, [1.4, i / 4]);
  }
  // A freighter moored at the upper arm: a plain hull with lit ports.
  const ship = group(g, 1.05, 0.72, 0.42, 0);
  ship.rotation.y = 0.5;
  add(ship, box(0.16, 0.14, 0.62), k.plated);
  add(ship, box(0.12, 0.1, 0.14), k.plated, 0, 0.1, 0.2);
  add(ship, cyl(0.05, 0.05, 0.1, 12).rotateX(Math.PI / 2), k.dark, 0, 0, -0.34);
  windowRow(ship, k.window, 5, 0.03, 0.012, 0.081, 0.03, 0, 0.09, "z");
  light(ship, 0x20ff60, 0.03, 0.09, 0.02, 0.2);
  light(ship, 0xff2020, 0.03, -0.09, 0.02, 0.2);

  // Solar wings on booms along ±Z, and radiators along ±X.
  for (const s of [1, -1]) {
    t.lattice(V(0, 0, s * 0.3), V(0, 0, s * 1.15), 0.022, 6, 0.005);
    for (let i = 0; i < 3; i++) {
      const p = add(g, box(0.5, 0.004, 0.24), k.solar, 0, 0, s * (0.55 + i * 0.28));
      p.rotation.z = 0.12;
    }
    light(g, 0xffffff, 0.05, 0, 0, s * 1.2, [2.2, s > 0 ? 0.25 : 0.75]);
    t.lattice(V(s * 0.3, -0.3, 0), V(s * 0.85, -0.5, 0), 0.018, 5, 0.004);
    for (let i = 0; i < 3; i++) add(g, box(0.26, 0.006, 0.34), k.radiator, s * (0.45 + i * 0.16), -0.36 - i * 0.06, 0);
  }

  // Comm dishes and masts on the hub.
  for (const [x, y, z, r] of [[0.22, 0.5, 0.1, 0.16], [-0.2, 0.46, -0.16, 0.11], [0.05, -0.5, 0.22, 0.13]] as const) {
    const d = group(g, x, y, z);
    d.lookAt(V(x * 4, y * 3, z * 4));
    add(d, new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.4).rotateX(-Math.PI / 2), k.struct);
    rod(d, V(0, 0, 0), V(0, 0, r * 0.8), 0.006, k.dark);
    light(d, 0xff2a1a, 0.02, 0, 0, r * 0.85, [1.8, 0.2]);
  }
  rod(g, V(0, 0.47, 0), V(0, 0.78, 0), 0.006, k.struct);
  light(g, 0xffffff, 0.05, 0, 0.8, 0, [1.6, 0]);
  rod(g, V(0, -0.47, 0), V(0, -0.72, 0), 0.006, k.struct);
  light(g, 0xff2a1a, 0.045, 0, -0.74, 0, [1.8, 0.5]);

  // Merge the static structure and the ring separately, so the ring can spin.
  t.build(g, k.struct);
  addParts(g, bakeParts(g));
  addParts(ring, bakeParts(ring));
  spin.build(ring, k.struct);
  g.add(ring);
  return { root: g, ring };
}

// ---------------------------------------------------------------------------
// Cawley Yards — ore refinery and repair dock.

export function createIndustrialStation(): THREE.Group {
  const k = kit();
  const g = new THREE.Group();
  const t = new Trusses();

  // Keel: a long girder with processing blocks hung along it.
  t.lattice(V(0, 0, -1.7), V(0, 0, 1.7), 0.1, 26, 0.012);
  const blocks: [number, number, number, number][] = [
    [-1.35, 0.34, 0.26, 0.5], [-0.75, 0.46, 0.34, 0.66], [-0.05, 0.4, 0.3, 0.52],
    [0.55, 0.52, 0.38, 0.7], [1.2, 0.3, 0.24, 0.44],
  ];
  blocks.forEach(([z, w, h, d], i) => {
    add(g, box(w, h, d), i % 2 ? k.plated : k.hull, i % 2 ? 0.06 : -0.05, i % 2 ? 0.08 : -0.06, z);
    windowRow(g, k.window, 4, 0.05, 0.014, (i % 2 ? 0.06 : -0.05) + w / 2 + 0.002, i % 2 ? 0.12 : -0.02, z, d / 5, "z");
    add(g, box(w * 0.5, 0.03, d * 0.9), k.struct, i % 2 ? 0.06 : -0.05, (i % 2 ? 0.08 : -0.06) + h / 2, z);
  });

  // Spherical tanks in a rack down the port side.
  for (let i = 0; i < 4; i++) {
    const z = -1.1 + i * 0.62;
    add(g, new THREE.SphereGeometry(0.17, 20, 14), k.tank, -0.42, -0.1, z);
    t.lattice(V(-0.18, -0.08, z), V(-0.42, -0.1, z), 0.02, 3, 0.005);
    add(g, new THREE.TorusGeometry(0.175, 0.008, 6, 24), k.struct, -0.42, -0.1, z);
  }
  // Ore hoppers and a conveyor along the starboard side.
  for (let i = 0; i < 3; i++) {
    const z = -0.9 + i * 0.7;
    add(g, cyl(0.16, 0.06, 0.28, 12), k.plated, 0.44, 0.06, z);
    t.lattice(V(0.2, 0.02, z), V(0.44, 0.04, z), 0.018, 3, 0.005);
    light(g, 0xffaa22, 0.03, 0.44, -0.12, z, [1.2, i / 3]);
  }
  t.lattice(V(0.44, -0.16, -1.0), V(0.44, -0.16, 0.5), 0.03, 10, 0.005);

  // Repair dock: an open gantry cradle amidships with a hull section inside.
  const dock = group(g, 0, 0.62, -0.3);
  for (const s of [1, -1]) {
    t.lattice(V(s * 0.42, -0.5, -0.55), V(s * 0.42, 0.1, -0.55), 0.03, 6, 0.006);
    t.lattice(V(s * 0.42, -0.5, 0.55), V(s * 0.42, 0.1, 0.55), 0.03, 6, 0.006);
    t.lattice(V(s * 0.42, 0.1, -0.55), V(s * 0.42, 0.1, 0.55), 0.03, 10, 0.006);
    for (const z of [-0.35, 0, 0.35]) add(dock, box(0.06, 0.04, 0.05), k.dark, s * 0.42, -0.02, z);
  }
  t.lattice(V(-0.42, 0.1, 0), V(0.42, 0.1, 0), 0.03, 8, 0.006);
  // The hull in the cradle: bare frames at one end, plated at the other.
  add(dock, box(0.3, 0.26, 0.5), k.plated, 0, -0.2, 0.22);
  for (let i = 0; i < 5; i++) add(dock, new THREE.TorusGeometry(0.15, 0.012, 6, 16).rotateY(Math.PI / 2), k.struct, 0, -0.2, -0.05 - i * 0.11);
  add(dock, box(0.02, 0.3, 0.55), k.struct, 0, -0.2, -0.3);
  for (const s of [1, -1]) light(dock, 0xbfe0ff, 0.05, s * 0.3, 0.06, 0, [0.35, s > 0 ? 0 : 0.5]); // welding arcs

  // Flare stack at the stern, radiators, dishes, beacons.
  rod(g, V(-0.1, 0.25, 1.45), V(-0.1, 0.85, 1.55), 0.02, k.struct);
  add(g, cyl(0.05, 0.07, 0.1, 10), k.dark, -0.1, 0.88, 1.56);
  light(g, 0xff7a2a, 0.13, -0.1, 0.96, 1.57);
  add(g, new THREE.ConeGeometry(0.05, 0.16, 10), k.flare, -0.1, 1.02, 1.57);
  for (const s of [1, -1]) for (let i = 0; i < 3; i++) add(g, box(0.34, 0.006, 0.3), k.radiator, s * 0.5, -0.45 - i * 0.08, 0.9 + i * 0.05);
  for (const [x, y, z] of [[0.3, 0.45, -1.5], [-0.32, 0.4, 1.0]] as const) {
    const d = group(g, x, y, z);
    d.lookAt(V(x * 3, y * 4, z * 2));
    add(d, new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.4).rotateX(-Math.PI / 2), k.struct);
    light(d, 0xff2a1a, 0.02, 0, 0, 0.11, [1.8, 0.4]);
  }
  for (const [x, y, z, c] of [[0, 0.3, -1.72, 0xffffff], [0, -0.3, 1.72, 0xff2a1a], [0.6, 0, 0, 0x20ff60], [-0.6, 0, 0, 0xff2020]] as const) {
    light(g, c, 0.05, x, y, z, [2, (x + z) / 4]);
  }
  // Containers stacked on the keel.
  for (let i = 0; i < 10; i++) {
    const z = -1.5 + i * 0.32;
    add(g, box(0.1, 0.07, 0.24), i % 3 ? k.dark : k.struct, (i % 2 ? 0.12 : -0.12), -0.3 - (i % 2) * 0.08, z);
  }

  t.build(g, k.struct);
  addParts(g, bakeParts(g));
  return g;
}
