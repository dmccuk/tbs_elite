import * as THREE from "three";

// Procedurally drawn sprite textures. Generated once at startup so the game
// ships no image files and every effect stays crisp at any resolution.

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft round glow — engine glows, particles, flashes, the sun. */
export const glowTexture = canvasTexture(128, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.85)");
  g.addColorStop(0.45, "rgba(255,255,255,0.28)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
});

/** Hard-cored spark: bright centre with a thin falloff. */
export const sparkTexture = canvasTexture(64, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
});

/** Lumpy smoke puff built from overlapping blobs. */
export const smokeTexture = canvasTexture(128, (ctx, s) => {
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * s * 0.22;
    const x = s / 2 + Math.cos(a) * r;
    const y = s / 2 + Math.sin(a) * r;
    const rad = s * (0.12 + Math.random() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, "rgba(255,255,255,0.22)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  // Fade the edges so no square corners show.
  ctx.globalCompositeOperation = "destination-in";
  const mask = ctx.createRadialGradient(s / 2, s / 2, s * 0.2, s / 2, s / 2, s / 2);
  mask.addColorStop(0, "rgba(0,0,0,1)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, s, s);
});

/** Thin bright ring for shockwaves. */
export const ringTexture = canvasTexture(256, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.72, "rgba(255,255,255,0.05)");
  g.addColorStop(0.88, "rgba(255,255,255,0.9)");
  g.addColorStop(0.94, "rgba(255,255,255,0.4)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
});

/** Four-point star glint for the sun and big flashes. */
export const starburstTexture = canvasTexture(256, (ctx, s) => {
  ctx.translate(s / 2, s / 2);
  for (let i = 0; i < 2; i++) {
    if (i === 1) ctx.rotate(Math.PI / 2);
    const g = ctx.createLinearGradient(-s / 2, 0, s / 2, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-s / 2, -1.5, s, 3);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const core = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.25);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, s, s);
});

/** Hexagonal lens-flare ghost. */
export const hexTexture = canvasTexture(128, (ctx, s) => {
  ctx.translate(s / 2, s / 2);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * s * 0.42;
    const y = Math.sin(a) * s * 0.42;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 2;
  ctx.stroke();
});
