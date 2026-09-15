import * as THREE from "three";
import { bandTexture, type BandPalette, type ThemeLook } from "./backdrop";
import { glowSprite, panelTextures } from "./models";
import type { Landmark } from "./world";
import { createKesslerCarrier } from "./kessler";

// The Tessick-Varn Frontier (the Prologue). Built lazily by world.ts the
// first time the "frontier" theme is selected: a dim brown dwarf in backScene,
// two distant mining outposts, and the carrier Kessler (built in kessler.ts)
// holding station near the patrol start. The Tessick-3 relay itself is a gameplay object (not here).

/** Colder, sparser, lonelier than the Lingering Systems. */
export const FRONTIER_LOOK: ThemeLook = {
  sky: {
    base: [0.002, 0.004, 0.011],
    wisp: [0.05, 0.15, 0.21],
    wispRange: [0.52, 0.95],
    cloud: [0.02, 0.07, 0.12],
    cloudRange: [0.56, 0.98],
    bandDust: [0.26, 0.15, 0.06],
    bandGlow: [0.028, 0.03, 0.045],
    lanes: 0.8,
    sunHalo: [0.62, 0.8, 1.0],
    sunCore: [0.85, 0.92, 1.0],
  },
  sun: { core: [0xe6efff, 6], halo: [0x6f9cff, 0.75], burst: [0xd6e4ff, 2.3] },
  env: { low: [0.012, 0.014, 0.024], high: [0.06, 0.09, 0.15], tint: [0.04, 0.12, 0.15], sun: [0.85, 0.92, 1.0] },
  sunLight: [0xdce8ff, 2.2],
  backSun: [0xdce8ff, 2.7],
  hemi: [0x2c3a58, 0x06080c, 0.5],
  rockColor: 0x6b7480,
};

// Upper-left of the patrol start's view, well clear of the sun and the
// (hidden) gas giant's lower-right spot, further away and smaller on screen.
const DWARF_DIR = new THREE.Vector3(-0.24, 0.41, -0.88).normalize();
const DWARF_DIST = 9000;
const DWARF_RADIUS = 1100;

const DWARF_PALETTE: BandPalette = [
  [92, 40, 26], [120, 58, 36], [70, 28, 20], [132, 70, 44],
  [60, 24, 18], [104, 48, 30], [48, 20, 16], [116, 62, 40],
];

function createBrownDwarf() {
  const group = new THREE.Group();
  const map = bandTexture({
    palette: DWARF_PALETTE, width: 512, height: 256,
    storm: ["rgba(40,12,8,0.85)", "rgba(60,22,14,0.45)", "rgba(60,22,14,0)"],
  });
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(DWARF_RADIUS, 72, 48),
    // Faint self-glow from the bands so the night side still reads as warm.
    new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xff7a50, emissiveIntensity: 0.8, roughness: 1, metalness: 0 })
  );
  body.rotation.z = -0.2;
  group.add(body);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(DWARF_RADIUS * 1.04, 72, 48),
    new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vNormal = normalize(mat3(modelMatrix) * normal);
          vView = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          // clamp: pow() of a tiny negative number is NaN on some GPUs
          float rim = pow(clamp(1.0 - dot(normalize(vNormal), normalize(vView)), 0.0, 1.0), 2.5);
          gl_FragColor = vec4(vec3(1.0, 0.28, 0.1) * rim * 0.9, rim);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  group.add(glow);
  group.position.copy(DWARF_DIR).multiplyScalar(DWARF_DIST);
  return group;
}

// ---------------------------------------------------------------------------
// Shared helpers and materials.

const _zAxis = new THREE.Vector3(0, 0, 1);
const _dir = new THREE.Vector3();

/** A box beam from a to b (thickness t), e.g. conveyors, booms, struts. */
function beam(a: THREE.Vector3, b: THREE.Vector3, t: number, mat: THREE.Material): THREE.Mesh {
  _dir.subVectors(b, a);
  const len = _dir.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(t, t, len), mat);
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_zAxis, _dir.normalize());
  return m;
}

function lumpyRock(seed: number, detail = 1): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 2.7 + seed) * Math.sin(v.y * 3.1 + seed * 1.7) * Math.sin(v.z * 2.3 + seed * 2.9);
    v.multiplyScalar(1 + n * 0.3 + Math.sin(v.x * 7 + v.z * 5 + seed) * 0.06);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  return m;
}

function makeMaterials() {
  const hab = panelTextures({ base: "#4a4f57", seam: "rgba(8,10,12,0.85)", variance: 0.3, grime: 1.5, windows: "#ffcf7a", windowDensity: 0.22, repeat: [2, 1] });
  const hull = panelTextures({ base: "#5c6572", seam: "rgba(10,12,16,0.85)", variance: 0.2, grime: 0.8, windows: "#d8ecff", windowDensity: 0.07, repeat: [2, 1] });
  return {
    hab: new THREE.MeshStandardMaterial({
      map: hab.map, emissiveMap: hab.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.75, metalness: 0.5,
    }),
    frame: new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.6, metalness: 0.7 }),
    tank: new THREE.MeshStandardMaterial({ color: 0x8a5d3a, roughness: 0.7, metalness: 0.45 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x5f646b, roughness: 0.95, metalness: 0.05, flatShading: true }),
    ore: new THREE.MeshStandardMaterial({ color: 0x6e5a48, roughness: 0.9, metalness: 0.2, flatShading: true }),
    hull: new THREE.MeshStandardMaterial({
      map: hull.map, emissiveMap: hull.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.55, metalness: 0.75,
    }),
    plate: new THREE.MeshStandardMaterial({ color: 0x3d434d, roughness: 0.5, metalness: 0.8 }),
    bayGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a0).multiplyScalar(1.8), side: THREE.DoubleSide }),
    bayDark: new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9, metalness: 0.3 }),
    bridge: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbfe0ff).multiplyScalar(1.8) }),
    nozzle: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5aa0ff).multiplyScalar(1.4) }),
  };
}
type Mats = ReturnType<typeof makeMaterials>;

// ---------------------------------------------------------------------------
// Mining outpost: modules bolted onto a host asteroid, an ore conveyor boom to
// a second rock, storage tanks and a lit processing tower. Built at ~3 km so
// it reads from 50+ km away; `seed` reshapes the rocks so T-7 and T-9 differ.

interface Outpost { root: THREE.Group; beacons: THREE.Sprite[]; }

function createOutpost(m: Mats, seed: number): Outpost {
  const g = new THREE.Group();

  const host = new THREE.Mesh(lumpyRock(seed), m.rock);
  host.scale.set(1.45, 0.72, 1.15);
  host.position.set(0, -0.6, 0);
  g.add(host);

  // Squat habitat / processing modules with lit windows.
  g.add(box(1.25, 0.42, 0.62, m.hab, 0, 0.12, 0));
  g.add(box(0.62, 0.34, 0.5, m.hab, -0.78, 0.02, 0.36, 0.3));
  g.add(box(0.5, 0.26, 0.9, m.hab, 0.35, 0.02, 0.62, -0.15));
  g.add(box(0.7, 0.2, 0.4, m.frame, -0.2, 0.42, -0.05));

  // Processing tower with a crane arm and a dish.
  g.add(box(0.28, 1.15, 0.28, m.frame, 0.5, 0.75, -0.12));
  g.add(box(0.44, 0.18, 0.44, m.hab, 0.5, 1.38, -0.12));
  g.add(beam(new THREE.Vector3(0.5, 1.3, -0.12), new THREE.Vector3(-0.6, 1.05, -0.5), 0.06, m.frame));
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), m.plate);
  dish.position.set(0.5, 1.55, -0.12);
  dish.rotation.set(-0.9, 0.4, 0);
  g.add(dish);

  // Storage tanks: a row of spheres and two long horizontal cylinders.
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 12), m.tank);
    t.position.set(-0.55 + i * 0.38, 0.44, 0.2);
    g.add(t);
  }
  for (const z of [-0.3, -0.52]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 16), m.tank);
    c.rotation.z = Math.PI / 2;
    c.position.set(-0.45, 0.36, z);
    g.add(c);
  }

  // Ore conveyor: a long boom out to a smaller rock, with lit carts along it.
  const ore = new THREE.Mesh(lumpyRock(seed + 3.3, 1), m.ore);
  ore.scale.set(0.5, 0.38, 0.45);
  ore.position.set(2.05, -0.55, 1.0);
  g.add(ore);
  const a = new THREE.Vector3(0.5, 0.45, -0.12);
  const b = new THREE.Vector3(1.85, -0.25, 0.85);
  g.add(beam(a, b, 0.07, m.frame));
  g.add(beam(a.clone().setY(0.3), b.clone().setY(-0.4), 0.04, m.frame));
  const p = new THREE.Vector3();
  for (let i = 1; i < 7; i++) {
    p.lerpVectors(a, b, i / 7);
    const cart = box(0.1, 0.07, 0.1, m.ore, p.x, p.y + 0.07, p.z);
    g.add(cart);
    const lamp = glowSprite(0xffaa44, 0.16, 2.2);
    lamp.position.set(p.x, p.y - 0.05, p.z);
    g.add(lamp);
  }
  // Support strut from the boom down to the host rock.
  g.add(beam(new THREE.Vector3(1.2, 0.07, 0.38), new THREE.Vector3(1.0, -0.55, 0.3), 0.05, m.frame));

  // Floodlights and blinking red hazard beacons.
  for (const [x, y, z] of [[-0.6, 0.35, 0.65], [0.7, 0.35, 0.4], [-0.9, 0.3, -0.2]] as const) {
    const flood = glowSprite(0xffc070, 0.3, 1.6);
    flood.position.set(x, y, z);
    g.add(flood);
  }
  const beacons: THREE.Sprite[] = [];
  for (const [x, y, z] of [[0.5, 1.72, -0.12], [-0.6, 1.08, -0.5], [2.05, -0.1, 1.0]] as const) {
    const s = glowSprite(0xff3322, 0.38, 3);
    s.position.set(x, y, z);
    g.add(s);
    beacons.push(s);
  }
  return { root: g, beacons };
}

// ---------------------------------------------------------------------------

export interface Frontier {
  /** Brown dwarf — add to backScene. */
  back: THREE.Group;
  /** Outposts and the Kessler — add to the main scene (group stays at the origin). */
  props: THREE.Group;
  /** Lens-flare occluder (backScene space). */
  planet: { center: THREE.Vector3; radius: number };
  landmarks: Landmark[];
  update(dt: number, elapsed: number): void;
}

export function createFrontier(): Frontier {
  const mats = makeMaterials();
  const back = new THREE.Group();
  const dwarf = createBrownDwarf();
  back.add(dwarf);

  const props = new THREE.Group();
  const t7 = createOutpost(mats, 1.7);
  t7.root.position.set(-45, 6, -30);
  t7.root.rotation.set(0.12, 0.6, -0.08);
  t7.root.scale.setScalar(0.85);
  const t9 = createOutpost(mats, 5.2);
  t9.root.position.set(60, -10, -55);
  t9.root.rotation.set(-0.1, 2.6, 0.1);
  t9.root.scale.setScalar(1.0);
  const kessler = createKesslerCarrier(); // landable: see kessler.ts
  props.add(t7.root, t9.root, kessler.root);

  const beacons = [...t7.beacons, ...t9.beacons];
  return {
    back,
    props,
    planet: { center: dwarf.position, radius: DWARF_RADIUS },
    landmarks: [
      { obj: t7.root, label: "T-7", color: "#ffaa44" },
      { obj: t9.root, label: "T-9", color: "#ffaa44" },
      { obj: kessler.root, label: "KSR", color: "#4aa8ff" },
    ],
    update(dt, elapsed) {
      t7.root.rotateY(dt * 0.012);
      t9.root.rotateY(-dt * 0.009);
      const beaconOn = elapsed % 2.2 < 1.1;
      for (const b of beacons) b.visible = beaconOn;
      const strobeOn = elapsed % 1.6 < 0.1;
      for (const s of kessler.strobes) s.visible = strobeOn;
    },
  };
}
