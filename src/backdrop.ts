import * as THREE from "three";
import { renderer } from "./renderer";
import { glowTexture, hexTexture, starburstTexture } from "./fx/textures";
import { rand } from "./config";

// Backdrop pieces that live in `backScene` (and the environment map): nebula
// sky, stars, the Lingering Systems gas giant, the sun + lens flare. Colours
// are parametrised so each world theme (see world.ts) can restyle them; the
// LINGERING_* values are the original Chapter 1 look.

export const SUN_DIR = new THREE.Vector3(-0.55, 0.32, -0.77).normalize();
export const SKY_RADIUS = 30000;
const PLANET_DIR = new THREE.Vector3(0.62, -0.22, -0.75).normalize();
const PLANET_DIST = 7000;
export const PLANET_RADIUS = 1500;

export type RGB = [number, number, number];

/** Sky shader colours (linear RGB). */
export interface SkyColors {
  base: RGB;
  /** Warped nebula wisps (×0.55) and the smoothstep range that reveals them. */
  wisp: RGB;
  wispRange: [number, number];
  /** Second nebula layer (×0.6) and its smoothstep range. */
  cloud: RGB;
  cloudRange: [number, number];
  /** Dusty colour inside the galactic band (×0.35). */
  bandDust: RGB;
  /** Diffuse glow of the galactic band. */
  bandGlow: RGB;
  /** How dark the dust lanes cut through the band (0–1). */
  lanes: number;
  /** Wide and tight glow around the sun direction. */
  sunHalo: RGB;
  sunCore: RGB;
}

/** Sun sprite colours as [hex, intensity multiplier]. */
export interface SunColors {
  core: [number, number];
  halo: [number, number];
  burst: [number, number];
}

/** Environment-map colours (linear RGB). */
export interface EnvColors {
  low: RGB;
  high: RGB;
  tint: RGB;
  sun: RGB;
}

/** Everything a world theme changes about the backdrop and lighting. */
export interface ThemeLook {
  sky: SkyColors;
  sun: SunColors;
  env: EnvColors;
  /** Main-scene DirectionalLight [colour, intensity]. */
  sunLight: [number, number];
  /** backScene DirectionalLight [colour, intensity]. */
  backSun: [number, number];
  /** Main-scene HemisphereLight [sky, ground, intensity]. */
  hemi: [number, number, number];
  /** Shared asteroid material colour (instance colours multiply it). */
  rockColor: number;
}

export const LINGERING_LOOK: ThemeLook = {
  sky: {
    base: [0.004, 0.006, 0.014],
    wisp: [0.30, 0.07, 0.36],
    wispRange: [0.42, 0.85],
    cloud: [0.03, 0.20, 0.28],
    cloudRange: [0.48, 0.92],
    bandDust: [0.42, 0.20, 0.09],
    bandGlow: [0.05, 0.05, 0.075],
    lanes: 0.7,
    sunHalo: [1.0, 0.72, 0.45],
    sunCore: [1.0, 0.85, 0.7],
  },
  sun: { core: [0xfff2d8, 6], halo: [0xffb070, 0.9], burst: [0xffe8c8, 2.5] },
  env: { low: [0.02, 0.018, 0.03], high: [0.10, 0.13, 0.22], tint: [0.20, 0.08, 0.22], sun: [1.0, 0.85, 0.65] },
  sunLight: [0xfff0dd, 2.6],
  backSun: [0xfff0dd, 3.2],
  hemi: [0x3a4a6a, 0x120a08, 0.55],
  rockColor: 0x7a6e62,
};

// ---------------------------------------------------------------------------
// Sky: procedural nebula + galactic band, rendered on the inside of a sphere.

export function createSky(colors: SkyColors) {
  const v3 = () => ({ value: new THREE.Vector3() });
  const uniforms = {
    uSunDir: { value: SUN_DIR },
    uBase: v3(), uWisp: v3(), uCloud: v3(), uBandDust: v3(), uBandGlow: v3(), uSunHalo: v3(), uSunCore: v3(),
    uRanges: { value: new THREE.Vector4() },
    uLanes: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uBase;
      uniform vec3 uWisp;
      uniform vec3 uCloud;
      uniform vec3 uBandDust;
      uniform vec3 uBandGlow;
      uniform vec3 uSunHalo;
      uniform vec3 uSunCore;
      uniform vec4 uRanges; // wisp lo/hi, cloud lo/hi
      uniform float uLanes;
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
        float bd = dot(d, bandNormal) * 3.2;
        float band = exp(-bd * bd); // not pow(): a negative base is undefined on some GPUs

        float n1 = fbm(d * 2.2 + vec3(3.1, 0.0, 1.7));
        float n2 = fbm(d * 4.5 + vec3(11.0, 5.0, 2.0));
        float n3 = fbm(d * 9.0 - vec3(4.0));
        // Warp the nebula for wispy, flowing shapes.
        float warp = fbm(d * 3.0 + n2 * 1.5);

        vec3 col = uBase;
        col += uWisp * smoothstep(uRanges.x, uRanges.y, warp) * 0.55;
        col += uCloud * smoothstep(uRanges.z, uRanges.w, n1) * 0.6;
        col += uBandDust * band * smoothstep(0.35, 0.8, n3) * 0.35;
        col += band * uBandGlow * (0.6 + n2);
        // Dark dust lanes cut through the band.
        col *= 1.0 - band * smoothstep(0.55, 0.75, n2) * uLanes;

        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunHalo * pow(sd, 12.0) * 0.12;
        col += uSunCore * pow(sd, 90.0) * 0.5;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 64, 32), mat);
  mesh.renderOrder = -10;

  const setColors = (c: SkyColors) => {
    uniforms.uBase.value.fromArray(c.base);
    uniforms.uWisp.value.fromArray(c.wisp);
    uniforms.uCloud.value.fromArray(c.cloud);
    uniforms.uBandDust.value.fromArray(c.bandDust);
    uniforms.uBandGlow.value.fromArray(c.bandGlow);
    uniforms.uSunHalo.value.fromArray(c.sunHalo);
    uniforms.uSunCore.value.fromArray(c.sunCore);
    uniforms.uRanges.value.set(c.wispRange[0], c.wispRange[1], c.cloudRange[0], c.cloudRange[1]);
    uniforms.uLanes.value = c.lanes;
  };
  setColors(colors);
  return { mesh, setColors };
}

export function createStars(time: { value: number }) {
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
        float a = 1.0 - smoothstep(0.0, 0.5, length(p)); // edges in ascending order: reversed is undefined in GLSL
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
// Banded planet texture (gas giant, brown dwarf) with an optional storm.

/** Eight sRGB 0–255 colours the bands cycle through. */
export type BandPalette = [RGB, RGB, RGB, RGB, RGB, RGB, RGB, RGB];

export interface BandTextureOptions {
  palette: BandPalette;
  width?: number;
  height?: number;
  /** Storm gradient stops (centre, middle, edge) as CSS colours; omit for none. */
  storm?: [string, string, string];
}

export const GAS_GIANT_PALETTE: BandPalette = [
  [196, 150, 110], [226, 196, 160], [170, 110, 80], [230, 214, 190],
  [150, 96, 70], [205, 170, 130], [120, 80, 64], [214, 186, 150],
];

export function bandTexture(opts: BandTextureOptions): THREE.CanvasTexture {
  const w = opts.width ?? 1024;
  const h = opts.height ?? 512;
  const palette = opts.palette;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
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
  if (opts.storm) {
    // A great storm, because every gas giant needs one.
    const r = 40 * (w / 1024);
    const g = ctx.createRadialGradient(w * 0.3, h * 0.62, 0, w * 0.3, h * 0.62, r);
    g.addColorStop(0, opts.storm[0]);
    g.addColorStop(0.6, opts.storm[1]);
    g.addColorStop(1, opts.storm[2]);
    ctx.fillStyle = g;
    ctx.save();
    ctx.scale(1.8, 1);
    ctx.beginPath();
    ctx.arc((w * 0.3) / 1.8, h * 0.62, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

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

/** The Lingering Systems' ringed gas giant (group positioned in backScene space). */
export function createGasGiant() {
  const group = new THREE.Group();
  const map = bandTexture({
    palette: GAS_GIANT_PALETTE,
    storm: ["rgba(170,70,40,0.9)", "rgba(200,110,70,0.5)", "rgba(200,110,70,0)"],
  });
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS, 96, 64),
    new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 })
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
          float rim = pow(clamp(1.0 - dot(normalize(vNormal), normalize(vView)), 0.0, 1.0), 3.0);
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

export interface Flare { sprite: THREE.Sprite; offset: number; size: number; }

export function createSun(colors: SunColors) {
  const group = new THREE.Group();
  const dist = SKY_RADIUS * 0.8;
  const pos = SUN_DIR.clone().multiplyScalar(dist);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.scale.setScalar(dist * 0.06);
  core.position.copy(pos);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(dist * 0.35);
  halo.position.copy(pos);
  const burst = new THREE.Sprite(new THREE.SpriteMaterial({ map: starburstTexture, blending: THREE.AdditiveBlending, depthWrite: false }));
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

  const setColors = (c: SunColors) => {
    core.material.color.set(c.core[0]).multiplyScalar(c.core[1]);
    halo.material.color.set(c.halo[0]).multiplyScalar(c.halo[1]);
    burst.material.color.set(c.burst[0]).multiplyScalar(c.burst[1]);
  };
  setColors(colors);
  return { group, flares, pos, setColors };
}

// ---------------------------------------------------------------------------
// Environment map: a soft studio-style sky so metal hulls have something to reflect.

export function createEnvironment(colors: EnvColors): THREE.Texture {
  const envScene = new THREE.Scene();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(100, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uSunDir: { value: SUN_DIR },
        uLow: { value: new THREE.Vector3().fromArray(colors.low) },
        uHigh: { value: new THREE.Vector3().fromArray(colors.high) },
        uTint: { value: new THREE.Vector3().fromArray(colors.tint) },
        uSun: { value: new THREE.Vector3().fromArray(colors.sun) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir;
        uniform vec3 uLow;
        uniform vec3 uHigh;
        uniform vec3 uTint;
        uniform vec3 uSun;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 col = mix(uLow, uHigh, smoothstep(-0.6, 0.8, d.y));
          col += uTint * smoothstep(0.3, 1.0, dot(d, normalize(vec3(0.5, -0.1, 0.8))));
          float s = max(dot(d, uSunDir), 0.0);
          col += uSun * (pow(s, 60.0) * 8.0 + pow(s, 6.0) * 0.4);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  envScene.add(sphere);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene, 0.02).texture;
  pmrem.dispose();
  sphere.geometry.dispose();
  (sphere.material as THREE.Material).dispose();
  return env;
}
