import * as THREE from "three";
import { std } from "../model-kit";
import { solid } from "./walk";
import { emissive, RoomKit, signTex } from "./parts";
import type { Section } from "./types";

// Section 2: the main corridor off the hangar deck, and the ready room.
//
// The deck is enormous on purpose; this is the opposite — 2.6 m wide, 3 m to the
// pipes, so the ship feels like somewhere people actually live. It runs forward
// along the port side from the deck's vestibule, past the ready room, to the
// bridge door at the forward end. METRES, in the deck's coordinates: the bay's
// port wall is x = -85.

/** The doorway cut in the deck's port wall. */
export const DECK_DOOR = { x: -85, z: 140, width: 5, height: 4 };

// The vestibule reaches out to the corridor's outboard wall so the two rooms
// share the z = 133 edge: the corridor's mouth is a gap in the vestibule's
// forward wall, and the corridor itself has no wall there at all.
const VEST = { x0: -100.6, x1: -85, z0: 133, z1: 147, h: 4.2 };  // vestibule behind the deck door
const HALL = { x0: -100.6, x1: -98, z0: 56, z1: 133, h: 3 };     // the corridor proper (2.6 m wide)
const READY = { x0: -112, x1: -100.6, z0: 96, z1: 112, h: 3.2 }; // ready room, outboard

/** Where the corridor meets the bridge: the bridge builds that wall. */
export const BRIDGE_DOOR = { x: (HALL.x0 + HALL.x1) / 2, z: HALL.z0, width: 2.2, height: 2.4 };

export function buildCorridor(): Section {
  const kit = new RoomKit([40, 2], [30, 1]);
  const { add, box } = { add: kit.add.bind(kit), box: kit.box };
  const { panel, trim, pipe, strip, glass } = kit;

  const hallX = (HALL.x0 + HALL.x1) / 2;
  const vestCx = (VEST.x0 + VEST.x1) / 2;

  // --- Vestibule behind the deck's port door ---
  kit.shell(VEST, [
    { side: "x1", at: DECK_DOOR.z - (VEST.z0 + VEST.z1) / 2, width: DECK_DOOR.width },   // back to the hangar
    { side: "z0", at: hallX - vestCx, width: HALL.x1 - HALL.x0 },                        // on into the corridor
  ]);
  add(box(3.4, 0.06, 3.4), std(0xb8901c, 0.7, 0.3), -91, 0.02, 140);    // painted threshold
  kit.hotspot("backToDeck", -86.5, 1.5, 140, 4, "Back onto the hangar deck");
  // A painted line across the vestibule, from the deck door round to the corridor mouth.
  const route = std(0x2f7fb8, 0.7, 0.2);
  for (let x = -87; x > -99; x -= 2.4) add(box(1.2, 0.05, 0.3), route, x, 0.03, 138.6);
  for (let z = 138; z > 134; z -= 1.4) add(box(0.3, 0.05, 0.8), route, -99.3, 0.03, z);
  // A lit sign over the corridor mouth, facing back into the vestibule.
  add(new THREE.PlaneGeometry(2.4, 0.6), emissive(signTex("MAIN CORRIDOR")), hallX, 2.55, VEST.z0 + 0.14);
  // Lockers and a notice board, kept out of the way up the forward end.
  for (let i = 0; i < 4; i++) add(box(0.7, 2, 0.6), panel, -96.2, 1, 141.5 + i * 1.5);
  kit.solids.push(solid(-96.8, 141, -95.6, 146.4, 2));
  add(new THREE.PlaneGeometry(1.6, 1), emissive(signTex("DECK 3 · FLIGHT")), -94.9, 2.2, 144).rotation.y = Math.PI / 2;

  // --- The corridor. No wall at either end: the vestibule and the bridge build those. ---
  kit.shell(HALL, [{ side: "x0", at: 104 - (HALL.z0 + HALL.z1) / 2, width: 1.8 }], ["z0", "z1"]);
  for (let z = HALL.z0 + 4; z < HALL.z1; z += 6) {
    add(box(2.2, 0.08, 0.5), strip, hallX, HALL.h - 0.12, z);                      // ceiling strip
    add(new THREE.CylinderGeometry(0.09, 0.09, 6, 8).rotateX(Math.PI / 2), pipe, HALL.x0 + 0.35, HALL.h - 0.35, z + 3);  // pipe runs
    add(new THREE.CylinderGeometry(0.06, 0.06, 6, 8).rotateX(Math.PI / 2), pipe, HALL.x0 + 0.6, HALL.h - 0.55, z + 3);
    add(box(0.06, 0.5, 6), trim, HALL.x1 - 0.12, 2.3, z + 3);                       // cable tray
    if (z % 18 < 6) add(new THREE.PlaneGeometry(0.5, 0.7), emissive(signTex(`${Math.round(z)}`, "#9ad0ff")), HALL.x1 - 0.12, 1.9, z).rotation.y = -Math.PI / 2;
  }
  // Viewports on the outboard wall: the belt going by.
  for (const z of [124, 88, 70]) {
    add(box(0.16, 0.9, 1.6), trim, HALL.x0 + 0.02, 1.7, z);
    add(new THREE.PlaneGeometry(1.3, 0.62), glass, HALL.x0 + 0.11, 1.7, z).rotation.y = Math.PI / 2;
  }

  // --- Doors, set into the corridor face of each wall so they don't z-fight the panelling ---
  kit.makeDoor("ready", "READY ROOM", HALL.x0 + 0.13, 104, "+x", false, 1.8, 2.3);
  kit.makeDoor("bridge", "BRIDGE", BRIDGE_DOOR.x, BRIDGE_DOOR.z + 0.13, "+z", false, BRIDGE_DOOR.width, BRIDGE_DOOR.height);
  kit.makeDoor("mess", "MESS", HALL.x1 - 0.13, 118, "-x", true);
  kit.makeDoor("quarters", "QUARTERS", HALL.x1 - 0.13, 76, "-x", true);

  // --- Ready room: benches, lockers, a table with a flight plan on it ---
  kit.shell(READY, [{ side: "x1", at: 104 - (READY.z0 + READY.z1) / 2, width: 1.8 }]);
  const rcx = (READY.x0 + READY.x1) / 2, rcz = (READY.z0 + READY.z1) / 2;
  add(box(2.6, 0.12, 1.1), panel, rcx, 0.8, rcz);                       // table top
  for (const [dx, dz] of [[-1.1, -0.4], [1.1, -0.4], [-1.1, 0.4], [1.1, 0.4]] as const) add(box(0.12, 0.8, 0.12), trim, rcx + dx, 0.4, rcz + dz);
  kit.solids.push(solid(rcx - 1.4, rcz - 0.7, rcx + 1.4, rcz + 0.7, 0.9));
  add(new THREE.PlaneGeometry(2, 0.9), emissive(signTex("PATROL PLAN 4471", "#66ffcc")), rcx, 0.87, rcz).rotation.x = -Math.PI / 2;
  for (let i = 0; i < 6; i++) {                                          // lockers
    add(box(0.62, 1.9, 0.55), panel, READY.x0 + 0.4, 0.95, READY.z0 + 1.2 + i * 0.7);
    add(box(0.04, 0.12, 0.04), trim, READY.x0 + 0.72, 1.1, READY.z0 + 1.2 + i * 0.7);
  }
  kit.solids.push(solid(READY.x0, READY.z0 + 0.8, READY.x0 + 0.75, READY.z0 + 5.6, 2));
  for (const dz of [-3, 3]) {                                            // benches
    add(box(2.4, 0.1, 0.45), panel, rcx, 0.45, rcz + dz);
    add(box(2.2, 0.4, 0.08), trim, rcx, 0.22, rcz + dz);
    kit.solids.push(solid(rcx - 1.2, rcz + dz - 0.25, rcx + 1.2, rcz + dz + 0.25, 0.5));
  }
  for (const z of [READY.z0 + 4, READY.z1 - 4]) add(box(2.6, 0.08, 0.5), strip, rcx, READY.h - 0.12, z);
  add(box(0.16, 1, 2.4), trim, READY.x0 + 0.02, 1.7, rcz + 5);
  add(new THREE.PlaneGeometry(2.1, 0.7), glass, READY.x0 + 0.11, 1.7, rcz + 5).rotation.y = Math.PI / 2;
  kit.hotspot("plan", rcx, 1, rcz, 2.6, "Patrol plan");

  // Lighting: a couple of lamps, so the corridor isn't lit by the hangar.
  kit.root.add(new THREE.HemisphereLight(0x8d99ad, 0x23262c, 1.1));
  for (const [x, z] of [[hallX, 120], [hallX, 90], [hallX, 64], [hallX, 136], [-91, 140], [rcx, rcz]] as const) {
    const p = new THREE.PointLight(0xffe6c0, 42, 26, 2);
    p.position.set(x, 2.6, z);
    kit.root.add(p);
  }

  return {
    root: kit.root,
    solids: kit.solids,
    hotspots: kit.hotspots,
    doors: kit.doors,
    update(_t, walker) { kit.updateDoors(walker); },
  };
}
