import * as THREE from "three";
import { backScene, backCamera, camera, scene } from "./renderer";
import { glowTexture } from "./fx/textures";
import { rand } from "./config";
import { panelTextures } from "./models";
import {
  SUN_DIR, PLANET_RADIUS, LINGERING_LOOK, type ThemeLook,
  createSky, createStars, createGasGiant, createSun, createEnvironment,
} from "./backdrop";
import { FRONTIER_LOOK, createFrontier, type Frontier } from "./world-frontier";
import { createIndustrialStation, createRingStation } from "./models-stations";

// The playable space around the combat area: lighting, landmarks, asteroid
// belt and the drifting dust that sells the sense of speed. The far backdrop
// (sky, stars, planet, sun, env map) lives in backdrop.ts. Two themes:
//  - "lingering": the Lingering Systems (Chapter 1) — built at startup.
//  - "frontier":  the Tessick-Varn Frontier (Prologue) — see world-frontier.ts,
//                 built lazily on the first switch.

export { SUN_DIR } from "./backdrop";

export type WorldTheme = "lingering" | "frontier" | "sim";

/**
 * The Academy's Simulation Chamber 3 (GV-K707d): "an open sector of space, no
 * asteroid field this time, no debris to hide behind. Just empty black in every
 * direction, punctuated by the faint glow of a distant nebula on the starboard
 * horizon." Stars cold and distant; no planet, no props, no rocks.
 */
const SIM_LOOK: ThemeLook = {
  sky: {
    base: [0.001, 0.0015, 0.004],
    wisp: [0.16, 0.08, 0.3],
    wispRange: [0.4, 0.85],
    cloud: [0.05, 0.14, 0.26],
    cloudRange: [0.45, 0.9],
    bandDust: [0.05, 0.04, 0.05],
    bandGlow: [0.008, 0.009, 0.014],
    lanes: 0.4,
    sunHalo: [0.25, 0.32, 0.5],
    sunCore: [0.5, 0.56, 0.7],
    focus: [1, 0.04, -0.3, 5],  // starboard of the start heading
  },
  sun: { core: [0xdfe8ff, 1.1], halo: [0x7090ff, 0.08], burst: [0xd0dcff, 0.3] }, // a cold, distant star
  env: { low: [0.01, 0.01, 0.02], high: [0.05, 0.06, 0.1], tint: [0.06, 0.05, 0.12], sun: [0.85, 0.9, 1.0] },
  sunLight: [0xe4ecff, 2.3],
  backSun: [0xe4ecff, 2.2],
  hemi: [0x303a58, 0x06070c, 0.55],
  rockColor: 0x6b7480,
};

export interface Landmark { obj: THREE.Object3D; label: string; color: string; }

// ---------------------------------------------------------------------------
// Landmarks from the original Lingering Systems map.

/** Halvern Ring: the system's port, out past the belt. */
function placeRingStation() {
  const s = createRingStation();
  s.root.position.set(-11, 3, -12);   // ~16 km out: past the fight, inside the belt
  s.root.rotation.set(0.12, 0.5, 0.1);
  s.root.scale.setScalar(1.45);       // ~4.9 km across
  return s;
}

/** Cawley Yards: the refinery and repair dock on the far side. */
function placeYards() {
  const y = createIndustrialStation();
  y.position.set(15, -4, 12);         // ~20 km the other way
  y.rotation.set(0.05, -0.8, -0.08);
  y.scale.setScalar(1.35);            // ~5 km long
  return y;
}



function createDerelict() {
  const g = new THREE.Group();
  const sc = 1.4;
  const tex = panelTextures({ base: "#5d6878", seam: "rgba(10,14,20,0.85)", variance: 0.25, grime: 2, windows: "#ff5a2a", windowDensity: 0.04, repeat: [3, 2] });
  const hullMat = new THREE.MeshStandardMaterial({
    map: tex.map, emissiveMap: tex.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.8,
    roughness: 0.8, metalness: 0.55, flatShading: true,
  });
  const hull = new THREE.Mesh(new THREE.ConeGeometry(sc * 0.8, sc * 2, 3, 4), hullMat);
  hull.rotation.x = Math.PI / 2;
  hull.rotation.z = Math.PI / 2;
  g.add(hull);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(sc * 0.15, sc * 0.3, sc * 0.2), hullMat);
  tower.position.set(-sc * 0.4, sc * 0.15, 0);
  g.add(tower);
  for (let i = 0; i < 10; i++) {
    const debris = new THREE.Mesh(
      new THREE.BoxGeometry(sc * rand(0.05, 0.15), sc * rand(0.02, 0.07), sc * rand(0.05, 0.15)),
      hullMat
    );
    debris.position.set(rand(-0.75, 0.75) * sc, rand(-0.15, 0.15) * sc, rand(-0.4, 0.4) * sc);
    debris.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    g.add(debris);
  }
  for (const [x, y, z, c] of [[-0.3, 0.1, 0.1, 0xff3300], [0.2, 0.05, -0.15, 0xff6600]] as const) {
    const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: new THREE.Color(c).multiplyScalar(2), blending: THREE.AdditiveBlending, depthWrite: false }));
    light.scale.setScalar(sc * 0.15);
    light.position.set(x * sc, y * sc, z * sc);
    g.add(light);
  }
  g.position.set(14, -3, -22);
  g.rotation.set(0.5, 1.2, 0.8);
  return g;
}

function createDebrisField() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x70707e, roughness: 0.85, metalness: 0.5 });
  const wreck = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.2, 12, 24, Math.PI * 1.3), mat);
  wreck.rotation.set(0.5, 1.2, 0.3);
  g.add(wreck);
  for (let i = 0; i < 40; i++) {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(rand(0.02, 0.12), rand(0.01, 0.05), rand(0.02, 0.12)), mat);
    piece.position.set(rand(-2.5, 2.5), rand(-1, 1), rand(-2.5, 2.5));
    piece.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    g.add(piece);
  }
  g.position.set(-16, 4, 14);
  return g;
}

// ---------------------------------------------------------------------------
// Asteroid belt (instanced) — gives parallax and something to weave through.

export interface Rock { pos: THREE.Vector3; radius: number; }

export function rockGeometry(seed: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.sin(v.y * 2.7 + seed * 2) * Math.sin(v.z * 3.3 + seed * 3);
    const bump = 1 + n * 0.28 + Math.sin(v.x * 9 + v.y * 7 + seed) * 0.05;
    v.multiplyScalar(bump);
    p.setXYZ(i, v.x, v.y * 0.8, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function createAsteroids(rocks: Rock[]) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a6e62, roughness: 0.95, metalness: 0.08, flatShading: true });
  const variants = [rockGeometry(1.3), rockGeometry(4.1), rockGeometry(7.7)];
  const perVariant = 70;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const e = new THREE.Euler();
  const color = new THREE.Color();
  const meshes: THREE.InstancedMesh[] = [];
  const spins: { axis: THREE.Vector3; speed: number; pos: THREE.Vector3; scale: number; angle: number }[][] = [];

  variants.forEach((geo) => {
    const mesh = new THREE.InstancedMesh(geo, mat, perVariant);
    const list: typeof spins[number] = [];
    for (let i = 0; i < perVariant; i++) {
      // Belt ring around the combat area, plus a few scattered strays inside.
      const a = Math.random() * Math.PI * 2;
      const stray = Math.random() < 0.15;
      const r = stray ? rand(2, 8) : rand(9, 17);
      const pos = new THREE.Vector3(Math.cos(a) * r, rand(-1.2, 1.2) * (stray ? 2 : 1), Math.sin(a) * r);
      const big = Math.random() < 0.05;
      const scale = big ? rand(0.5, 1.0) : Math.pow(Math.random(), 2.5) * 0.3 + 0.02;
      e.set(rand(0, 6), rand(0, 6), rand(0, 6));
      q.setFromEuler(e);
      s.setScalar(scale);
      m.compose(pos, q, s);
      mesh.setMatrixAt(i, m);
      color.setHSL(0.07 + rand(-0.03, 0.03), rand(0.08, 0.25), rand(0.35, 0.6));
      mesh.setColorAt(i, color);
      rocks.push({ pos, radius: scale * 0.95 });
      list.push({ axis: new THREE.Vector3().randomDirection(), speed: rand(0.05, 0.4) / (1 + scale * 4), pos, scale, angle: rand(0, 6) });
    }
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    meshes.push(mesh);
    spins.push(list);
    group.add(mesh);
  });

  const update = (dt: number) => {
    for (let vi = 0; vi < meshes.length; vi++) {
      const mesh = meshes[vi];
      const list = spins[vi];
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        r.angle += r.speed * dt;
        q.setFromAxisAngle(r.axis, r.angle);
        s.setScalar(r.scale);
        m.compose(r.pos, q, s);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  return { group, update, material: mat };
}

// ---------------------------------------------------------------------------
// Space dust: short streaks that wrap around the camera and stretch with speed.

function createDust() {
  const count = 450;
  const box = 1.4;
  const motes = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) motes[i] = rand(-box / 2, box / 2);
  const positions = new Float32Array(count * 6);
  const colors = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const b = rand(0.25, 0.6);
    colors.set([b * 0.8, b * 0.9, b, 0, 0, 0], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  lines.frustumCulled = false;

  const update = (center: THREE.Vector3, vel: THREE.Vector3) => {
    const streak = 0.06;
    const minLen = 0.0025;
    const speed = vel.length();
    const k = speed > 0.0001 ? Math.max(streak, minLen / speed) : 0;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // Wrap each mote into a box centred on the camera.
      let x = motes[i3] - center.x;
      let y = motes[i3 + 1] - center.y;
      let z = motes[i3 + 2] - center.z;
      x = ((((x + box / 2) % box) + box) % box) - box / 2;
      y = ((((y + box / 2) % box) + box) % box) - box / 2;
      z = ((((z + box / 2) % box) + box) % box) - box / 2;
      motes[i3] = x + center.x;
      motes[i3 + 1] = y + center.y;
      motes[i3 + 2] = z + center.z;
      const o = i * 6;
      positions[o] = motes[i3];
      positions[o + 1] = motes[i3 + 1];
      positions[o + 2] = motes[i3 + 2];
      positions[o + 3] = motes[i3] - vel.x * k;
      positions[o + 4] = motes[i3 + 1] - vel.y * k;
      positions[o + 5] = motes[i3 + 2] - vel.z * k;
    }
    geo.attributes.position.needsUpdate = true;
    (lines.material as THREE.LineBasicMaterial).opacity = Math.min(1, 0.25 + speed * 0.8);
  };
  return { lines, update };
}

// ---------------------------------------------------------------------------

export interface World {
  rocks: Rock[];
  theme: WorldTheme;
  /** Switch the look (cheap if already active; frontier assets build on first use). */
  setTheme(theme: WorldTheme): void;
  /** Radar landmarks for the active theme. */
  landmarks: Landmark[];
  /** Show or hide the asteroid ring around the combat area (the Cruise brings its own belt). */
  setAsteroidsVisible(visible: boolean): void;
  update(dt: number, elapsed: number, playerVel: THREE.Vector3): void;
}

export function createWorld(): World {
  const time = { value: 0 };

  // Backdrop scene
  const sky = createSky(LINGERING_LOOK.sky);
  backScene.add(sky.mesh);
  backScene.add(createStars(time));
  const sun = createSun(LINGERING_LOOK.sun);
  backScene.add(sun.group);
  const gasGiant = createGasGiant();
  backScene.add(gasGiant);
  const backSun = new THREE.DirectionalLight(LINGERING_LOOK.backSun[0], LINGERING_LOOK.backSun[1]);
  backSun.position.copy(SUN_DIR).multiplyScalar(1000);
  backScene.add(backSun, new THREE.AmbientLight(0x221a2a, 0.15));

  // Main scene lighting
  const lingeringEnv = createEnvironment(LINGERING_LOOK.env);
  let frontierEnv: THREE.Texture | null = null;
  scene.environment = lingeringEnv;
  const sunLight = new THREE.DirectionalLight(LINGERING_LOOK.sunLight[0], LINGERING_LOOK.sunLight[1]);
  sunLight.position.copy(SUN_DIR).multiplyScalar(100);
  scene.add(sunLight, sunLight.target);
  const hemi = new THREE.HemisphereLight(LINGERING_LOOK.hemi[0], LINGERING_LOOK.hemi[1], LINGERING_LOOK.hemi[2]);
  scene.add(hemi);

  const halvern = placeRingStation();
  const yards = placeYards();
  const derelict = createDerelict();
  const lingeringProps = new THREE.Group();
  lingeringProps.add(halvern.root, yards, derelict, createDebrisField());
  scene.add(lingeringProps);
  const lingeringLandmarks: Landmark[] = [
    { obj: halvern.root, label: "HLV", color: "#ff8800" },
    { obj: yards, label: "YRD", color: "#ff6600" },
    { obj: derelict, label: "DRL", color: "#888888" },
  ];
  const lingeringOccluder = { center: gasGiant.position, radius: PLANET_RADIUS };

  const rocks: Rock[] = [];
  const asteroids = createAsteroids(rocks);
  scene.add(asteroids.group);

  const dust = createDust();
  scene.add(dust.lines);

  let frontier: Frontier | null = null;
  let simEnv: THREE.Texture | null = null;
  let occluder = lingeringOccluder;

  const applyLook = (look: ThemeLook) => {
    sky.setColors(look.sky);
    sun.setColors(look.sun);
    backSun.color.set(look.backSun[0]);
    backSun.intensity = look.backSun[1];
    sunLight.color.set(look.sunLight[0]);
    sunLight.intensity = look.sunLight[1];
    hemi.color.set(look.hemi[0]);
    hemi.groundColor.set(look.hemi[1]);
    hemi.intensity = look.hemi[2];
    asteroids.material.color.set(look.rockColor);
  };

  const sunNdc = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const oc = new THREE.Vector3();

  const world: World = {
    rocks,
    theme: "lingering",
    landmarks: lingeringLandmarks,
    setTheme(theme) {
      asteroids.group.visible = theme !== "sim"; // (a mission may hide them too: the Cruise brings its own)
      if (theme === world.theme) return;
      world.theme = theme;
      if (theme === "sim") {
        // Nothing out here but the dark: no props, no planet, no landmarks.
        if (frontier) frontier.back.visible = frontier.props.visible = false;
        gasGiant.visible = lingeringProps.visible = false;
        applyLook(SIM_LOOK);
        scene.environment = (simEnv ??= createEnvironment(SIM_LOOK.env));
        world.landmarks = [];
        occluder = { center: gasGiant.position, radius: 0 };
      } else if (theme === "frontier") {
        if (!frontier) {
          frontier = createFrontier();
          backScene.add(frontier.back);
          scene.add(frontier.props);
          frontierEnv = createEnvironment(FRONTIER_LOOK.env);
        }
        frontier.back.visible = frontier.props.visible = true;
        gasGiant.visible = lingeringProps.visible = false;
        applyLook(FRONTIER_LOOK);
        scene.environment = frontierEnv;
        world.landmarks = frontier.landmarks;
        occluder = frontier.planet;
      } else {
        if (frontier) frontier.back.visible = frontier.props.visible = false;
        gasGiant.visible = lingeringProps.visible = true;
        applyLook(LINGERING_LOOK);
        scene.environment = lingeringEnv;
        world.landmarks = lingeringLandmarks;
        occluder = lingeringOccluder;
      }
    },
    setAsteroidsVisible(visible) {
      asteroids.group.visible = visible;
    },
    update(dt, elapsed, playerVel) {
      time.value = elapsed;
      if (world.theme === "lingering") {
        halvern.ring.rotation.y += dt * 0.035;   // the habitat ring spins for gravity
        yards.rotation.y += dt * 0.004;
        derelict.rotation.x += dt * 0.02;
        derelict.rotation.y += dt * 0.03;
      } else if (world.theme === "frontier" && frontier) {
        frontier.update(dt, elapsed);
      }
      asteroids.update(dt);
      dust.update(camera.position, playerVel);

      // Lens flare: ghosts along the line from the sun through screen centre.
      sunNdc.copy(sun.pos).project(backCamera);
      const onScreen = sunNdc.z < 1 && Math.abs(sunNdc.x) < 1.2 && Math.abs(sunNdc.y) < 1.2;
      // Hide the flare if the active planet sits between us and the sun.
      const toSun = tmp.copy(SUN_DIR);
      oc.copy(occluder.center).sub(backCamera.position);
      const proj = oc.dot(toSun);
      const occluded = proj > 0 && oc.lengthSq() - proj * proj < occluder.radius * occluder.radius;
      const edge = Math.max(Math.abs(sunNdc.x), Math.abs(sunNdc.y));
      const strength = onScreen && !occluded ? Math.max(0, 1 - edge) : 0;
      for (const f of sun.flares) {
        f.sprite.visible = strength > 0.01;
        if (!f.sprite.visible) continue;
        tmp.set(sunNdc.x * f.offset, sunNdc.y * f.offset, 0.5).unproject(backCamera);
        const dist = tmp.distanceTo(backCamera.position);
        f.sprite.position.copy(tmp);
        f.sprite.scale.setScalar(dist * f.size);
        f.sprite.material.opacity = strength;
      }
    },
  };
  return world;
}
