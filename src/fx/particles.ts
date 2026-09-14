import * as THREE from "three";

// A fixed-capacity particle system drawn as a single THREE.Points object.
// Particles are recycled in a ring buffer, so emitting never allocates and a
// burst that exceeds capacity simply overwrites the oldest particles.

const tmpColor = new THREE.Color();

export interface ParticleSystemOptions {
  capacity: number;
  texture: THREE.Texture;
  blending: THREE.Blending;
}

export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly cap: number;
  private next = 0;

  // GPU attributes
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;

  // Simulation state
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size0: Float32Array;
  private readonly size1: Float32Array;
  private readonly col0: Float32Array;
  private readonly col1: Float32Array;
  private readonly alpha0: Float32Array;
  private readonly drag: Float32Array;

  constructor(opts: ParticleSystemOptions) {
    const n = (this.cap = opts.capacity);
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.size1 = new Float32Array(n);
    this.col0 = new Float32Array(n * 3);
    this.col1 = new Float32Array(n * 3);
    this.alpha0 = new Float32Array(n);
    this.drag = new Float32Array(n);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: opts.texture },
        uScale: { value: 800 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uScale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aAlpha > 0.0 ? min(aSize * uScale / -mv.z, 512.0) : 0.0;
          vColor = aColor;
          vAlpha = aAlpha;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: opts.blending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  /**
   * Spawn one particle. Colours are hex (sRGB); size is the world-space
   * diameter in km at birth and at death.
   */
  emit(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number,
    sizeStart: number, sizeEnd: number,
    color: number, colorEnd: number = color,
    alpha = 1,
    drag = 0
  ) {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size0[i] = sizeStart;
    this.size1[i] = sizeEnd;
    this.alpha0[i] = alpha;
    this.drag[i] = drag;
    tmpColor.setHex(color);
    this.col0[i3] = tmpColor.r; this.col0[i3 + 1] = tmpColor.g; this.col0[i3 + 2] = tmpColor.b;
    tmpColor.setHex(colorEnd);
    this.col1[i3] = tmpColor.r; this.col1[i3 + 1] = tmpColor.g; this.col1[i3 + 2] = tmpColor.b;
    this.size[i] = sizeStart;
    this.alpha[i] = alpha;
    this.col[i3] = this.col0[i3]; this.col[i3 + 1] = this.col0[i3 + 1]; this.col[i3 + 2] = this.col0[i3 + 2];
  }

  /** Scale colour intensity above 1 so bloom picks particles up. */
  boost = 1;

  update(dt: number, pixelScale: number) {
    this.material.uniforms.uScale.value = pixelScale;
    const b = this.boost;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const i3 = i * 3;
      const t = 1 - Math.max(this.life[i], 0) / this.maxLife[i]; // 0 → 1 over lifetime
      const d = this.drag[i] > 0 ? Math.exp(-this.drag[i] * dt) : 1;
      this.vel[i3] *= d; this.vel[i3 + 1] *= d; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      // Quick fade-in, long fade-out.
      const fade = t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92;
      this.alpha[i] = this.life[i] > 0 ? this.alpha0[i] * fade : 0;
      this.col[i3] = (this.col0[i3] + (this.col1[i3] - this.col0[i3]) * t) * b;
      this.col[i3 + 1] = (this.col0[i3 + 1] + (this.col1[i3 + 1] - this.col0[i3 + 1]) * t) * b;
      this.col[i3 + 2] = (this.col0[i3 + 2] + (this.col1[i3 + 2] - this.col0[i3 + 2]) * t) * b;
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
  }
}
