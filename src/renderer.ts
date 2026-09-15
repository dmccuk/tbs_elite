import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

// Two scenes are rendered each frame:
//  - backScene: sky, stars, planet, sun. Drawn with its own camera that only
//    copies the main camera's rotation, so it behaves as if infinitely far away.
//  - scene: everything the player can fly near (ships, asteroids, stations).
// Splitting them keeps depth precision good at close range without a huge far plane.

// Phones/tablets only. ("ontouchstart" is also true on touchscreen laptops,
// which should keep mouse + keyboard controls.)
export const isTouch = window.matchMedia("(pointer: coarse)").matches;

export const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.id = "game-canvas";
renderer.domElement.tabIndex = 1;
document.body.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
export const backScene = new THREE.Scene();

export const BASE_FOV = 68;
export const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.004, 600);
export const backCamera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 1, 60000);

// The composer renders into its own targets, so the canvas's `antialias` flag
// does nothing; ask for MSAA on the target instead (desktop only).
const pr = renderer.getPixelRatio();
export const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(
  window.innerWidth * pr, window.innerHeight * pr,
  { type: THREE.HalfFloatType, samples: isTouch ? 0 : 4 }
));
composer.setPixelRatio(pr);
composer.setSize(window.innerWidth, window.innerHeight);

/** Clears depth between the backdrop and the main scene. */
class ClearDepthPass extends Pass {
  constructor() {
    super();
    this.needsSwap = false;
  }
  render(r: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    r.setRenderTarget(read);
    r.clearDepth();
  }
}

composer.addPass(new RenderPass(backScene, backCamera));
composer.addPass(new ClearDepthPass());
const mainPass = new RenderPass(scene, camera);
mainPass.clear = false;
composer.addPass(mainPass);

// Some GPUs occasionally produce a NaN or infinite pixel (pow() of a tiny negative
// number, a half-float overflow…). Bloom's blur smears a single bad pixel into
// flashing black blocks, so scrub the frame before bloom sees it.
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = clamp(c, 0.0, 60000.0);
    }
  `,
}));

// Bloom is soft anyway, so it runs at reduced resolution to save fill rate.
const bloomScale = isTouch ? 0.4 : 0.6;
export const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.95, // strength
  0.55, // radius
  0.78  // threshold — only bright/emissive pixels bloom
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
// Diagnostic: ?nobloom turns the glow off (useful when chasing GPU-specific artefacts).
if (new URLSearchParams(location.search).has("nobloom")) bloomPass.enabled = false;

// addPass()/setSize() size every pass to full resolution; shrink bloom afterwards.
function sizeBloom() {
  bloomPass.setSize(window.innerWidth * pr * bloomScale, window.innerHeight * pr * bloomScale);
}
sizeBloom();

/** Pixels per world unit at distance 1 — used to size point sprites correctly. */
export function projectionScale(): number {
  const h = renderer.domElement.height;
  return h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

export function syncBackCamera() {
  backCamera.quaternion.copy(camera.quaternion);
  // A tiny fraction of real movement gives the planet a hint of parallax.
  backCamera.position.copy(camera.position).multiplyScalar(0.02);
  if (backCamera.fov !== camera.fov) {
    backCamera.fov = camera.fov;
    backCamera.updateProjectionMatrix();
  }
  backCamera.updateMatrixWorld();
}

export function renderFrame() {
  syncBackCamera();
  composer.render();
}

window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  backCamera.aspect = w / h;
  backCamera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  sizeBloom();
});
