import * as THREE from "three";
import { glowSprite, type ShipModel } from "./models";

// The Drazzan fighter, as the Academy's GV-K707d simulation renders it: nothing
// like a human design. A long faceted dart of a hull, forward-swept blade wings
// with crimson edge lights, a tall dorsal crest, twin violet thrusters, and the
// forward sensor array — a red "eye" in the nose — that Wyatt blinds in the
// story. Faces -Z like every model; about 50 m long.

export interface DrazzanModel extends ShipModel {
  /** The forward sensor array's glow (dimmed when it's been shot out). */
  eye: THREE.Sprite;
  /** Everything that shimmers while the fighter materialises. */
  materials: THREE.Material[];
}

let kit: ReturnType<typeof makeKit> | null = null;

function makeKit() {
  const hull = new THREE.MeshStandardMaterial({ color: 0x4a4256, roughness: 0.3, metalness: 0.75, emissive: 0x160a1c });
  const plate = new THREE.MeshStandardMaterial({ color: 0x5c5468, roughness: 0.4, metalness: 0.65, emissive: 0x0c0610 });
  const edge = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2440).multiplyScalar(1.6) });
  const vent = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xa64dff).multiplyScalar(1.5) });

  // Hull: a stretched octahedron, flattened, with a sharper nose than tail.
  const body = new THREE.OctahedronGeometry(1, 0);
  body.scale(0.0085, 0.0048, 0.026);
  const pos = body.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getZ(i) < 0) pos.setZ(i, pos.getZ(i) * 1.2);
  body.computeVertexNormals();

  // Forward-swept blade: root at mid-hull, tip reaching ahead of the nose's shoulder.
  const shape = new THREE.Shape();
  shape.moveTo(0.002, 0.009);
  shape.lineTo(0.004, -0.003);
  shape.lineTo(0.027, -0.019);
  shape.lineTo(0.023, -0.011);
  shape.lineTo(0.012, 0.004);
  shape.closePath();
  const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.0009, bevelEnabled: false });
  blade.rotateX(Math.PI / 2); // shape's y becomes z (fore-aft)
  blade.translate(0, 0.00045, 0);
  const bladeEdge = new THREE.BoxGeometry(0.0007, 0.0007, 0.028);

  // Dorsal crest, drawn as (-z, height) and stood up along the spine.
  const crest = new THREE.Shape();
  crest.moveTo(-0.012, 0);
  crest.lineTo(0.004, 0);
  crest.lineTo(-0.006, 0.009);
  crest.lineTo(-0.013, 0.0085);
  crest.closePath();
  const crestGeo = new THREE.ExtrudeGeometry(crest, { depth: 0.0007, bevelEnabled: false });
  crestGeo.rotateY(Math.PI / 2); // (x, y, z) → (z, y, -x)
  crestGeo.translate(-0.00035, 0, 0);

  const nozzle = new THREE.CylinderGeometry(0.0022, 0.0028, 0.006, 8);
  nozzle.rotateX(Math.PI / 2);
  return { hull, plate, edge, vent, body, blade, bladeEdge, crestGeo, nozzle };
}

export function createDrazzan(): DrazzanModel {
  const k = (kit ??= makeKit());
  const root = new THREE.Group();
  const b = new THREE.Group();
  root.add(b);
  // Own copies of the hull materials, so each fighter can shimmer in on its own.
  const hull = k.hull.clone();
  const plate = k.plate.clone();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    b.add(m);
    return m;
  };
  add(k.body, hull);
  for (const side of [1, -1]) {
    const w = add(k.blade, plate, 0, -0.0008, 0);
    w.scale.x = side;
    w.rotation.z = side * 0.12; // a slight gull
    const e = add(k.bladeEdge, k.edge, side * 0.0155, 0.0002, -0.011);
    e.rotation.y = side * -0.96; // along the blade's leading edge
  }
  add(k.crestGeo, plate, 0, 0.003, 0.004);
  const engines: THREE.Object3D[] = [];
  const glows: THREE.Sprite[] = [];
  for (const side of [1, -1]) {
    add(k.nozzle, plate, side * 0.0045, -0.0006, 0.024);
    const v = add(new THREE.CircleGeometry(0.002, 8), k.vent, side * 0.0045, -0.0006, 0.0272);
    v.rotation.y = 0;
    const g = glowSprite(0xb060ff, 0.016, 2.6);
    g.position.set(side * 0.0045, -0.0006, 0.028);
    b.add(g);
    glows.push(g);
    const m = new THREE.Object3D();
    m.position.set(side * 0.0045, -0.0006, 0.029);
    b.add(m);
    engines.push(m);
  }
  const guns: THREE.Object3D[] = [];
  for (const side of [1, -1]) {
    const m = new THREE.Object3D();
    m.position.set(side * 0.006, -0.0012, -0.02);
    b.add(m);
    guns.push(m);
  }
  const eye = glowSprite(0xff2030, 0.011, 3.2, true);
  eye.position.set(0, 0.0012, -0.029);
  b.add(eye);
  return { root, body: b, engines, guns, pods: [], bay: null, glows, cargo: [], eye, materials: [hull, plate] };
}
