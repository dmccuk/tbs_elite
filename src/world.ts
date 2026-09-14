import * as THREE from "three";
import { backScene, backCamera, camera, renderer, scene } from "./renderer";
import { glowTexture, hexTexture, starburstTexture } from "./fx/textures";
import { rand } from "./config";
import { panelTextures } from "./models";

// The Lingering Systems: sky, sun, gas giant, lighting, landmarks, asteroid
// belt and the drifting dust that sells the sense of speed.

export const SUN_DIR = new THREE.Vector3(-0.55, 0.32, -0.77).normalize();
const PLANET_DIR = new THREE.Vector3(0.62, -0.22, -0.75).normalize();
const PLANET_DIST = 7000;
const PLANET_RADIUS = 1500;
const SKY_RADIUS = 30000;

// ---------------------------------------------------------------------------
// Sky: procedural nebula + galactic band, rendered on the inside of a sphere.

function createSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uSunDir: { value: SUN_DIR } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      varying vec3 vDir;
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                       mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                       mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 6; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      void main() {
        vec3 d = normalize(vDir);
        vec3 bandNormal = normalize(vec3(0.25, 1.0, 0.35));
        float band = exp(-pow(dot(d, bandNormal) * 3.2, 2.0));

        float n1 = fbm(d * 2.2 + vec3(3.1, 0.0, 1.7));
        float n2 = fbm(d * 4.5 + vec3(11.0, 5.0, 2.0));
        float n3 = fbm(d * 9.0 - vec3(4.0));
        // Warp the nebula for wispy, flowing shapes.
        float warp = fbm(d * 3.0 + n2 * 1.5);

        vec3 col = vec3(0.004, 0.006, 0.014);
        col += vec3(0.30, 0.07, 0.36) * smoothstep(0.42, 0.85, warp) * 0.55;
        col += vec3(0.03, 0.20, 0.28) * smoothstep(0.48, 0.92, n1) * 0.6;
        col += vec3(0.42, 0.20, 0.09) * band * smoothstep(0.35, 0.8, n3) * 0.35;
        col += band * vec3(0.05, 0.05, 0.075) * (0.6 + n2);
        // Dark dust lanes cut through the band.
        col *= 1.0 - band * smoothstep(0.55, 0.75, n2) * 0.7;

        float sd = max(dot(d, uSunDir), 0.0);
        col += vec3(1.0, 0.72, 0.45) * pow(sd, 12.0) * 0.12;
        col += vec3(1.0, 0.85, 0.7) * pow(sd, 90.0) * 0.5;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 64, 32), mat);
  sky.renderOrder = -10;
  return sky;
}

function createStars(time: { value: number }) {
  const count = 7000;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3().randomDirection();
    // Concentrate a share of stars along the galactic band.
    if (i % 3 === 0) {
      v.y *= 0.18;
      v.normalize();
    }
    v.multiplyScalar(SKY_RADIUS * 0.9);
    pos.set([v.x, v.y, v.z], i * 3);
    const t = Math.random();
    if (t < 0.65) c.setHSL(0.6, 0.3, 0.85);
    else if (t < 0.88) c.setHSL(0.12, 0.6, 0.8);
    else c.setHSL(0.02, 0.8, 0.7);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = Math.random() < 0.97 ? rand(1.0, 2.2) : rand(2.8, 4.5);
    phase[i] = Math.random() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uPixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio;
        vColor = aColor;
        vTwinkle = 0.75 + 0.25 * sin(uTime * (1.5 + fract(aPhase) * 3.0) + aPhase);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(p));
        gl_FragColor = vec4(vColor * vTwinkle * 1.6, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

// ---------------------------------------------------------------------------
// Gas giant with bands, atmosphere glow and rings.

function gasGiantTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const palette = [
    [196, 150, 110], [226, 196, 160], [170, 110, 80], [230, 214, 190],
    [150, 96, 70], [205, 170, 130], [120, 80, 64], [214, 186, 150],
  ];
  // Band colours vary smoothly with latitude; a sine turbulence swirls them.
  const seeds = Array.from({ length: 12 }, () => Math.random() * Math.PI * 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const lat = y / h;
      let turb = 0;
      for (let k = 0; k < 4; k++) {
        turb += Math.sin(u * Math.PI * 2 * (k + 2) + seeds[k] + lat * 20) * 0.012 / (k + 1);
      }
      const bandPos = (lat + turb) * 22 + Math.sin(lat * 40 + seeds[5]) * 0.6;
      const i0 = Math.floor(bandPos) & 7;
      const i1 = (i0 + 1) & 7;
      const f = bandPos - Math.floor(bandPos);
      const t = f * f * (3 - 2 * f);
      const shade = 0.9 + Math.sin(u * 60 + lat * 300 + seeds[8]) * 0.04;
      const o = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        img.data[o + ch] = (palette[i0][ch] * (1 - t) + palette[i1][ch] * t) * shade;
      }
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // A great storm, because every gas giant needs one.
  const g = ctx.createRadialGradient(w * 0.3, h * 0.62, 0, w * 0.3, h * 0.62, 40);
  g.addColorStop(0, "rgba(170,70,40,0.9)");
  g.addColorStop(0.6, "rgba(200,110,70,0.5)");
  g.addColorStop(1, "rgba(200,110,70,0)");
  ctx.fillStyle = g;
  ctx.save();
  ctx.scale(1.8, 1);
  ctx.beginPath();
  ctx.arc((w * 0.3) / 1.8, h * 0.62, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function ringTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 4;
  const ctx = canvas.getContext("2d")!;
  for (let x = 0; x < 512; x++) {
    const t = x / 512;
    let a = 0.15 + 0.5 * Math.pow(Math.sin(t * 40 + Math.sin(t * 9) * 2) * 0.5 + 0.5, 3);
    if (t > 0.55 && t < 0.6) a *= 0.1; // Cassini-style gap
    a *= Math.min(1, t * 8) * Math.min(1, (1 - t) * 6);
    const l = 180 + Math.sin(t * 23) * 30;
    ctx.fillStyle = `rgba(${l},${l * 0.88},${l * 0.72},${a})`;
    ctx.fillRect(x, 0, 1, 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPlanet() {
  const group = new THREE.Group();
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS, 96, 64),
    new THREE.MeshStandardMaterial({ map: gasGiantTexture(), roughness: 1, metalness: 0 })
  );
  planet.rotation.z = 0.35;
  group.add(planet);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS * 1.035, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: { uSunDir: { value: SUN_DIR } },
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
        uniform vec3 uSunDir;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.0);
          float lit = smoothstep(-0.25, 0.6, dot(vNormal, uSunDir));
          gl_FragColor = vec4(vec3(1.0, 0.75, 0.5) * rim * lit * 1.4, rim * lit);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  group.add(atmosphere);

  const ringGeo = new THREE.RingGeometry(PLANET_RADIUS * 1.35, PLANET_RADIUS * 2.3, 160, 1);
  // Remap UVs so the texture runs radially across the ring.
  const p = ringGeo.attributes.position;
  const uv = ringGeo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getY(i));
    uv.setXY(i, (r - PLANET_RADIUS * 1.35) / (PLANET_RADIUS * 0.95), 0.5);
  }
  const rings = new THREE.Mesh(
    ringGeo,
    new THREE.MeshStandardMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, roughness: 1, metalness: 0, depthWrite: false })
  );
  rings.rotation.x = Math.PI / 2 - 0.28;
  rings.rotation.y = 0.2;
  group.add(rings);

  group.position.copy(PLANET_DIR).multiplyScalar(PLANET_DIST);
  return group;
}

// ---------------------------------------------------------------------------
// Sun and a screen-space lens flare.

interface Flare { sprite: THREE.Sprite; offset: number; size: number; }

function createSun() {
  const group = new THREE.Group();
  const dist = SKY_RADIUS * 0.8;
  const pos = SUN_DIR.clone().multiplyScalar(dist);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: new THREE.Color(0xfff2d8).multiplyScalar(6), blending: THREE.AdditiveBlending, depthWrite: false }));
  core.scale.setScalar(dist * 0.06);
  core.position.copy(pos);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: new THREE.Color(0xffb070).multiplyScalar(0.9), blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(dist * 0.35);
  halo.position.copy(pos);
  const burst = new THREE.Sprite(new THREE.SpriteMaterial({ map: starburstTexture, color: new THREE.Color(0xffe8c8).multiplyScalar(2.5), blending: THREE.AdditiveBlending, depthWrite: false }));
  burst.scale.setScalar(dist * 0.25);
  burst.position.copy(pos);
  group.add(halo, core, burst);

  const flares: Flare[] = [];
  const specs: [number, number, number, THREE.Texture][] = [
    [0.45, 0.05, 0xff9955, hexTexture], [0.1, 0.03, 0x88aaff, hexTexture], [-0.3, 0.08, 0xffcc88, glowTexture],
    [-0.6, 0.04, 0x66ffcc, hexTexture], [-1.0, 0.12, 0xaa88ff, glowTexture], [-1.3, 0.06, 0xffaa66, hexTexture],
  ];
  for (const [offset, size, color, map] of specs) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map, color: new THREE.Color(color).multiplyScalar(0.35), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
    }));
    sprite.renderOrder = 10;
    group.add(sprite);
    flares.push({ sprite, offset, size });
  }
  return { group, flares, pos };
}

// ---------------------------------------------------------------------------
// Environment map: a soft studio-style sky so metal hulls have something to reflect.

function createEnvironment(): THREE.Texture {
  const envScene = new THREE.Scene();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(100, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uSunDir: { value: SUN_DIR } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 col = mix(vec3(0.02, 0.018, 0.03), vec3(0.10, 0.13, 0.22), smoothstep(-0.6, 0.8, d.y));
          col += vec3(0.20, 0.08, 0.22) * smoothstep(0.3, 1.0, dot(d, normalize(vec3(0.5, -0.1, 0.8))));
          float s = max(dot(d, uSunDir), 0.0);
          col += vec3(1.0, 0.85, 0.65) * (pow(s, 60.0) * 8.0 + pow(s, 6.0) * 0.4);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  envScene.add(sphere);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene, 0.02).texture;
  pmrem.dispose();
  return env;
}

// ---------------------------------------------------------------------------
// Landmarks from the original Lingering Systems map.

function createStationAlpha() {
  const g = new THREE.Group();
  const sc = 3;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(sc * 0.7, sc * 0.12, 24, 96),
    new THREE.MeshStandardMaterial({ color: 0x9aaad8, roughness: 0.35, metalness: 0.8, emissive: 0x112244, emissiveIntensity: 0.4 })
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(sc * 0.15, sc * 0.15, sc * 0.9, 32),
    new THREE.MeshStandardMaterial({ color: 0x7788aa, roughness: 0.4, metalness: 0.7 })
  );
  g.add(hub);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(
      new THREE.CylinderGeometry(sc * 0.03, sc * 0.03, sc * 1.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x667799, roughness: 0.5, metalness: 0.7 })
    );
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.y = (i / 4) * Math.PI;
    g.add(spoke);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: new THREE.Color(i % 2 ? 0x0088ff : 0x00ff88).multiplyScalar(3), blending: THREE.AdditiveBlending, depthWrite: false }));
    light.scale.setScalar(sc * 0.12);
    light.position.set(Math.cos(a) * sc * 0.7, 0, Math.sin(a) * sc * 0.7);
    g.add(light);
  }
  g.position.set(-38, 7, -58);
  g.rotation.set(0.4, 0, 0.25);
  return g;
}

function createStationBeta() {
  const g = new THREE.Group();
  const sc = 5;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(sc * 1.1, sc * 0.22, 32, 96),
    new THREE.MeshStandardMaterial({ color: 0xaa8866, roughness: 0.35, metalness: 0.85, emissive: 0x443322, emissiveIntensity: 0.4 })
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(sc * 0.3, sc * 0.3, sc * 1.5, 48),
    new THREE.MeshStandardMaterial({ color: 0x998877, roughness: 0.4, metalness: 0.8 })
  );
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  g.position.set(78, -12, 46);
  g.rotation.set(0.2, 0.8, 0);
  return g;
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

function rockGeometry(seed: number): THREE.BufferGeometry {
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
    meshes.forEach((mesh, vi) => {
      spins[vi].forEach((r, i) => {
        r.angle += r.speed * dt;
        q.setFromAxisAngle(r.axis, r.angle);
        s.setScalar(r.scale);
        m.compose(r.pos, q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  };
  return { group, update };
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
  stationAlpha: THREE.Object3D;
  stationBeta: THREE.Object3D;
  derelict: THREE.Object3D;
  update(dt: number, elapsed: number, playerVel: THREE.Vector3): void;
}

export function createWorld(): World {
  const time = { value: 0 };

  // Backdrop scene
  backScene.add(createSky());
  backScene.add(createStars(time));
  const sun = createSun();
  backScene.add(sun.group);
  const planet = createPlanet();
  backScene.add(planet);
  const backSun = new THREE.DirectionalLight(0xfff0dd, 3.2);
  backSun.position.copy(SUN_DIR).multiplyScalar(1000);
  backScene.add(backSun, new THREE.AmbientLight(0x221a2a, 0.15));

  // Main scene lighting
  scene.environment = createEnvironment();
  const sunLight = new THREE.DirectionalLight(0xfff0dd, 2.6);
  sunLight.position.copy(SUN_DIR).multiplyScalar(100);
  scene.add(sunLight, sunLight.target);
  scene.add(new THREE.HemisphereLight(0x3a4a6a, 0x120a08, 0.55));

  const stationAlpha = createStationAlpha();
  const stationBeta = createStationBeta();
  const derelict = createDerelict();
  scene.add(stationAlpha, stationBeta, derelict, createDebrisField());

  const rocks: Rock[] = [];
  const asteroids = createAsteroids(rocks);
  scene.add(asteroids.group);

  const dust = createDust();
  scene.add(dust.lines);

  const sunNdc = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const planetCenter = planet.position;

  return {
    rocks,
    stationAlpha,
    stationBeta,
    derelict,
    update(dt, elapsed, playerVel) {
      time.value = elapsed;
      stationAlpha.rotateY(dt * 0.05);
      stationBeta.rotateX(dt * 0.03);
      derelict.rotation.x += dt * 0.02;
      derelict.rotation.y += dt * 0.03;
      asteroids.update(dt);
      dust.update(camera.position, playerVel);

      // Lens flare: ghosts along the line from the sun through screen centre.
      sunNdc.copy(sun.pos).project(backCamera);
      const onScreen = sunNdc.z < 1 && Math.abs(sunNdc.x) < 1.2 && Math.abs(sunNdc.y) < 1.2;
      // Hide the flare if the planet sits between us and the sun.
      const toSun = tmp.copy(SUN_DIR);
      const oc = planetCenter.clone().sub(backCamera.position);
      const proj = oc.dot(toSun);
      const occluded = proj > 0 && oc.lengthSq() - proj * proj < PLANET_RADIUS * PLANET_RADIUS;
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
}
