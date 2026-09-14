import * as THREE from "three";
import { ParticleSystem } from "./particles";
import { glowTexture, ringTexture, smokeTexture, sparkTexture, starburstTexture } from "./textures";
import { rand } from "../config";
import { isTouch } from "../renderer";

// All transient visual effects live here and are advanced by the main loop.
// Nothing uses setInterval/setTimeout, so resetting the mission can wipe every
// effect instantly with clear().

interface Flash { sprite: THREE.Sprite; life: number; maxLife: number; size0: number; size1: number; }
interface Ring { mesh: THREE.Mesh; life: number; maxLife: number; r0: number; r1: number; billboard: boolean; }
interface Chunk { vel: THREE.Vector3; spin: THREE.Vector3; rot: THREE.Euler; pos: THREE.Vector3; scale: number; life: number; maxLife: number; }
interface FlashLight { light: THREE.PointLight; life: number; maxLife: number; peak: number; }

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const HOT = new THREE.Color(0xffaa44);
const COLD = new THREE.Color(0x1a1a1e);

export type ExplosionStyle = "fire" | "plasma" | "mine";

// Phones get half the particle budget.
const BUDGET = isTouch ? 0.5 : 1;

export class Effects {
  readonly fire = new ParticleSystem({ capacity: 6000 * BUDGET, texture: glowTexture, blending: THREE.AdditiveBlending });
  readonly sparks = new ParticleSystem({ capacity: 2500 * BUDGET, texture: sparkTexture, blending: THREE.AdditiveBlending });
  readonly smoke = new ParticleSystem({ capacity: 2000 * BUDGET, texture: smokeTexture, blending: THREE.NormalBlending });

  private readonly flashes: Flash[] = [];
  private readonly rings: Ring[] = [];
  private readonly chunks: Chunk[] = [];
  private readonly chunkMesh: THREE.InstancedMesh;
  private readonly lights: FlashLight[] = [];

  /** 0–1 camera shake amount; decays over time. */
  trauma = 0;

  constructor(scene: THREE.Scene) {
    this.fire.boost = 2.2;
    this.sparks.boost = 3;
    scene.add(this.smoke.points, this.fire.points, this.sparks.points);

    for (let i = 0; i < 28; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: i % 2 ? glowTexture : starburstTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }));
      sprite.visible = false;
      scene.add(sprite);
      this.flashes.push({ sprite, life: 0, maxLife: 1, size0: 1, size1: 1 });
    }

    const ringGeo = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        map: ringTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide,
      }));
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, life: 0, maxLife: 1, r0: 0, r1: 1, billboard: true });
    }

    this.chunkMesh = new THREE.InstancedMesh(
      new THREE.TetrahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      120
    );
    this.chunkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chunkMesh.setColorAt(0, HOT); // allocate instanceColor before the first compile
    this.chunkMesh.count = 0;
    this.chunkMesh.frustumCulled = false;
    scene.add(this.chunkMesh);

    // A fixed number of lights: changing the light count forces shader recompiles.
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xff8844, 0, 8, 2);
      scene.add(light);
      this.lights.push({ light, life: 0, maxLife: 1, peak: 0 });
    }
  }

  flash(pos: THREE.Vector3, size: number, color: number, life = 0.35, grow = 1.6) {
    const f = this.flashes.find((x) => x.life <= 0) ?? this.flashes[0];
    f.sprite.position.copy(pos);
    (f.sprite.material as THREE.SpriteMaterial).color.setHex(color).multiplyScalar(2.5);
    f.life = f.maxLife = life;
    f.size0 = size;
    f.size1 = size * grow;
    f.sprite.scale.setScalar(size);
    f.sprite.visible = true;
  }

  shockwave(pos: THREE.Vector3, radius: number, color: number, life = 0.8, normal?: THREE.Vector3) {
    const r = this.rings.find((x) => x.life <= 0) ?? this.rings[0];
    r.mesh.position.copy(pos);
    (r.mesh.material as THREE.MeshBasicMaterial).color.setHex(color).multiplyScalar(2);
    r.life = r.maxLife = life;
    r.r0 = radius * 0.08;
    r.r1 = radius;
    r.billboard = !normal;
    if (normal) r.mesh.quaternion.setFromUnitVectors(_v.set(0, 0, 1), normal);
    r.mesh.visible = true;
  }

  light(pos: THREE.Vector3, color: number, peak: number, life = 0.5) {
    const l = this.lights.reduce((a, b) => (a.life < b.life ? a : b));
    l.light.position.copy(pos);
    l.light.color.setHex(color);
    l.life = l.maxLife = life;
    l.peak = peak;
  }

  chunksAt(pos: THREE.Vector3, count: number, speed: number, size: number) {
    for (let i = 0; i < count; i++) {
      if (this.chunks.length >= this.chunkMesh.instanceMatrix.count) this.chunks.shift();
      const vel = new THREE.Vector3().randomDirection().multiplyScalar(speed * rand(0.4, 1));
      this.chunks.push({
        pos: pos.clone(),
        vel,
        spin: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)),
        rot: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)),
        scale: size * rand(0.4, 1),
        life: rand(1.2, 2.4),
        maxLife: 2.4,
      });
    }
  }

  sparksAt(pos: THREE.Vector3, count: number, color: number, speed: number, size = 0.012, life = 0.4, baseVel?: THREE.Vector3) {
    for (let i = 0; i < count; i++) {
      _v.randomDirection().multiplyScalar(speed * rand(0.3, 1));
      if (baseVel) _v.add(baseVel);
      this.sparks.emit(pos.x, pos.y, pos.z, _v.x, _v.y, _v.z, life * rand(0.5, 1), size, size * 0.2, color, 0xff4400, 1, 3);
    }
  }

  /** A full explosion. size is roughly the fireball radius in km. */
  explosion(pos: THREE.Vector3, size: number, style: ExplosionStyle = "fire", baseVel?: THREE.Vector3) {
    const bx = baseVel ? baseVel.x * 0.5 : 0;
    const by = baseVel ? baseVel.y * 0.5 : 0;
    const bz = baseVel ? baseVel.z * 0.5 : 0;
    const core = style === "plasma" ? 0x99ccff : style === "mine" ? 0xd8ff66 : 0xffdd88;
    const mid = style === "plasma" ? 0x3366ff : style === "mine" ? 0xff7a1a : 0xff6a1a;
    const fireCount = Math.round(40 + size * 180);

    for (let i = 0; i < fireCount; i++) {
      _v.randomDirection().multiplyScalar(size * rand(0.4, 2.2));
      this.fire.emit(pos.x, pos.y, pos.z, _v.x + bx, _v.y + by, _v.z + bz,
        rand(0.5, 1.2), size * rand(0.5, 0.9), size * rand(1.2, 2.2), core, mid, 0.9, 2.2);
    }
    for (let i = 0; i < fireCount * 0.6; i++) {
      _v.randomDirection().multiplyScalar(size * rand(0.2, 1.1));
      this.smoke.emit(pos.x, pos.y, pos.z, _v.x + bx, _v.y + by, _v.z + bz,
        rand(1.6, 3.2), size * rand(0.6, 1), size * rand(2.2, 3.4), 0x3a3430, 0x121212, 0.55, 1.2);
    }
    this.sparksAt(pos, Math.round(30 + size * 120), 0xffe6a0, size * 6, Math.max(0.01, size * 0.08), 0.8, baseVel);
    this.flash(pos, size * 7, core, 0.4, 1.4);
    this.flash(pos, size * 3.5, 0xffffff, 0.18, 1.1);
    this.shockwave(pos, size * 5, mid, 0.7);
    if (size > 0.2) this.shockwave(pos, size * 9, core, 1.2, _v.randomDirection().clone());
    this.chunksAt(pos, Math.round(6 + size * 30), size * 3.5, Math.max(0.005, size * 0.06));
    this.light(pos, mid, 4 + size * 40, 0.6);
  }

  /** Blue-white hyperspace flash along a direction of travel. */
  warp(pos: THREE.Vector3, dir: THREE.Vector3, size: number) {
    this.flash(pos, size * 6, 0xaad4ff, 0.6, 2.2);
    this.flash(pos, size * 2.5, 0xffffff, 0.3, 1.5);
    this.shockwave(pos, size * 5, 0x88bbff, 0.9, dir);
    for (let i = 0; i < 160; i++) {
      const t = rand(-6, 1);
      _v.copy(dir).multiplyScalar(size * t);
      this.sparks.emit(pos.x + _v.x, pos.y + _v.y, pos.z + _v.z,
        dir.x * rand(2, 10) * size, dir.y * rand(2, 10) * size, dir.z * rand(2, 10) * size,
        rand(0.2, 0.6), size * 0.12, 0, 0xcfe6ff, 0x3366ff, 1, 2);
    }
    this.light(pos, 0x88bbff, 30, 0.8);
  }

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number, camera: THREE.Camera, pixelScale: number) {
    this.fire.update(dt, pixelScale);
    this.sparks.update(dt, pixelScale);
    this.smoke.update(dt, pixelScale);
    this.trauma = Math.max(0, this.trauma - dt * 1.4);

    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const t = 1 - Math.max(0, f.life) / f.maxLife;
      f.sprite.scale.setScalar(f.size0 + (f.size1 - f.size0) * t);
      f.sprite.material.opacity = (1 - t) * (1 - t);
      if (f.life <= 0) f.sprite.visible = false;
    }

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const t = 1 - Math.max(0, r.life) / r.maxLife;
      const ease = 1 - Math.pow(1 - t, 3);
      r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * ease);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      if (r.billboard) r.mesh.quaternion.copy(camera.quaternion);
      if (r.life <= 0) r.mesh.visible = false;
    }

    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.life -= dt;
      if (c.life <= 0) { this.chunks.splice(i, 1); continue; }
      c.pos.addScaledVector(c.vel, dt);
      c.vel.multiplyScalar(Math.exp(-0.4 * dt));
      c.rot.x += c.spin.x * dt; c.rot.y += c.spin.y * dt; c.rot.z += c.spin.z * dt;
    }
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      _q.setFromEuler(c.rot);
      _s.setScalar(c.scale);
      _m.compose(c.pos, _q, _s);
      this.chunkMesh.setMatrixAt(i, _m);
      const heat = Math.min(1, c.life / c.maxLife * 1.6);
      _c.copy(COLD).lerp(HOT, heat * heat);
      this.chunkMesh.setColorAt(i, _c);
    }
    this.chunkMesh.count = this.chunks.length;
    this.chunkMesh.instanceMatrix.needsUpdate = true;
    if (this.chunkMesh.instanceColor) this.chunkMesh.instanceColor.needsUpdate = true;

    for (const l of this.lights) {
      if (l.life <= 0) { l.light.intensity = 0; continue; }
      l.life -= dt;
      const t = Math.max(0, l.life) / l.maxLife;
      l.light.intensity = l.peak * t * t;
    }
  }

  /** Camera shake offset for this frame (world units). */
  shakeOffset(out: THREE.Vector3): THREE.Vector3 {
    const s = this.trauma * this.trauma * 0.02;
    return out.set(rand(-s, s), rand(-s, s), rand(-s, s) * 0.5);
  }

  clear() {
    this.fire.clear();
    this.sparks.clear();
    this.smoke.clear();
    for (const f of this.flashes) { f.life = 0; f.sprite.visible = false; }
    for (const r of this.rings) { r.life = 0; r.mesh.visible = false; }
    this.chunks.length = 0;
    this.chunkMesh.count = 0;
    for (const l of this.lights) { l.life = 0; l.light.intensity = 0; }
    this.trauma = 0;
  }
}
