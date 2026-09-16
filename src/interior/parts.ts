import * as THREE from "three";
import { canvasTex, lit, std } from "../model-kit";
import { solid, type Solid } from "./walk";
import type { Door, Hotspot } from "./types";

// Shared parts for the walkable sections of the Kessler: the plating and panel
// textures, and a kit that builds a room's shell and its powered doors.
// METRES throughout.

export interface Room { x0: number; x1: number; z0: number; z1: number; h: number }
export type Side = "x0" | "x1" | "z0" | "z1";
export interface Gap { side: Side; at: number; width: number }

export const tiled = (t: THREE.Texture, x: number, y: number) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(x, y);
  return t;
};

export function floorTex() {
  return canvasTex(256, 256, (c) => {
    c.fillStyle = "#3a3f46";
    c.fillRect(0, 0, 256, 256);
    // Diamond-plate grating.
    c.strokeStyle = "rgba(0,0,0,0.5)";
    c.lineWidth = 2;
    c.strokeRect(1, 1, 254, 254);
    c.fillStyle = "rgba(255,255,255,0.07)";
    for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) {
      c.save();
      c.translate(x + 16, y + 16);
      c.rotate((x + y) % 64 ? 0.6 : -0.6);
      c.fillRect(-9, -3, 18, 6);
      c.restore();
    }
    c.fillStyle = "rgba(20,14,8,0.35)";
    for (let i = 0; i < 20; i++) c.fillRect(Math.random() * 256, Math.random() * 256, 12, 5);
  });
}

export function wallTex() {
  return canvasTex(256, 256, (c) => {
    c.fillStyle = "#6a7079";
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = "rgba(0,0,0,0.4)";
    c.lineWidth = 3;
    c.strokeRect(2, 2, 252, 252);
    c.strokeRect(2, 170, 252, 84);      // kick panel
    c.fillStyle = "rgba(255,255,255,0.06)";
    for (let i = 0; i < 60; i++) c.fillRect(Math.random() * 256, Math.random() * 256, 5, 2);
    c.fillStyle = "rgba(90,60,30,0.2)";
    for (let i = 0; i < 8; i++) c.fillRect(Math.random() * 256, 60 + Math.random() * 60, 4, 40);
    // Bolt heads down the seams.
    c.fillStyle = "rgba(30,34,40,0.8)";
    for (let y = 16; y < 256; y += 40) { c.fillRect(8, y, 4, 4); c.fillRect(244, y, 4, 4); }
  });
}

export function signTex(text: string, colour = "#e8b21c") {
  return canvasTex(256, 64, (c) => {
    c.fillStyle = "#10141a";
    c.fillRect(0, 0, 256, 64);
    c.fillStyle = colour;
    c.font = "bold 34px 'Big Shoulders Display', Impact, sans-serif";
    c.textAlign = "center";
    c.fillText(text, 128, 44);
  });
}

/** An unlit plane that always shows its own colours: screens, signs, painted plates. */
export const emissive = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, toneMapped: false });

/**
 * Builds one interior room: shell, collision boxes, hotspots and doors, all in
 * one group. A section can use several of these or share one across its rooms.
 */
export class RoomKit {
  root = new THREE.Group();
  solids: Solid[] = [];
  hotspots: Hotspot[] = [];
  doors: Door[] = [];

  readonly floorMat: THREE.Material;
  readonly wallMat: THREE.Material;
  readonly panel = std(0x555c66, 0.6, 0.6);
  readonly trim = std(0x2a2f36, 0.7, 0.55);
  readonly pipe = std(0x7c828c, 0.45, 0.8);
  readonly strip = lit(0xffeccd, 0.7);
  readonly glass = new THREE.MeshBasicMaterial({ color: 0x0a1018 });

  /** Repeats are in texture tiles across the room's floor and walls. */
  constructor(floorRepeat: [number, number], wallRepeat: [number, number]) {
    this.floorMat = std(0xffffff, 0.8, 0.4, { map: tiled(floorTex(), ...floorRepeat) });
    this.wallMat = std(0xffffff, 0.75, 0.45, { map: tiled(wallTex(), ...wallRepeat) });
  }

  box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.root) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  hotspot(id: string, x: number, y: number, z: number, range: number, label: string) {
    this.hotspots.push({ id, pos: new THREE.Vector3(x, y, z), range, label });
  }

  /**
   * Floor, ceiling and the four walls of a room, leaving gaps where doorways are.
   * `skip` drops a side entirely, for the edge a room shares with the next one
   * (otherwise the two rooms build the same wall twice and it z-fights).
   */
  shell(r: Room, gaps: Gap[] = [], skip: Side[] = []) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    this.add(this.box(w, 0.1, d), this.floorMat, cx, -0.05, cz);
    this.add(this.box(w, 0.1, d), this.trim, cx, r.h, cz);
    for (const side of ["x0", "x1", "z0", "z1"] as const) {
      if (skip.includes(side)) continue;
      const along = side.startsWith("x") ? d : w;
      const gap = gaps.find((g) => g.side === side);
      const spans: [number, number][] = gap
        ? [[-along / 2, gap.at - gap.width / 2], [gap.at + gap.width / 2, along / 2]]
        : [[-along / 2, along / 2]];
      for (const [a, b] of spans) {
        if (b - a < 0.05) continue;
        const len = b - a, mid = (a + b) / 2;
        if (side.startsWith("x")) {
          const x = side === "x0" ? r.x0 : r.x1;
          this.add(this.box(0.2, r.h, len), this.wallMat, x, r.h / 2, cz + mid);
          this.solids.push(solid(x - 0.12, cz + a, x + 0.12, cz + b, r.h));
        } else {
          const z = side === "z0" ? r.z0 : r.z1;
          this.add(this.box(len, r.h, 0.2), this.wallMat, cx + mid, r.h / 2, z);
          this.solids.push(solid(cx + a, z - 0.12, cx + b, z + 0.12, r.h));
        }
      }
      // A header over the gap, so it reads as a doorway rather than a hole.
      if (gap) {
        if (side.startsWith("x")) this.add(this.box(0.2, r.h - 2.2, gap.width), this.wallMat, side === "x0" ? r.x0 : r.x1, r.h - (r.h - 2.2) / 2, cz + gap.at);
        else this.add(this.box(gap.width, r.h - 2.2, 0.2), this.wallMat, cx + gap.at, r.h - (r.h - 2.2) / 2, side === "z0" ? r.z0 : r.z1);
      }
    }
  }

  /**
   * A powered door. `face` is the way its front points, i.e. which side you
   * approach it from — the leaves slide across the doorway at right angles to it.
   */
  makeDoor(id: string, label: string, x: number, z: number, face: "+x" | "-x" | "+z" | "-z", locked: boolean, width = 1.6, height = 2.2) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    // Unrotated, the door faces +z. Turn it to face the room you come from.
    g.rotation.y = face === "+x" ? Math.PI / 2 : face === "-x" ? -Math.PI / 2 : face === "-z" ? Math.PI : 0;
    this.root.add(g);
    // Frame.
    this.add(this.box(width + 0.5, 0.18, 0.34), this.trim, 0, height + 0.09, 0, g);
    for (const s of [-1, 1]) this.add(this.box(0.25, height, 0.34), this.trim, s * (width / 2 + 0.12), height / 2, 0, g);
    const leaves = [-1, 1].map((s) => {
      const leaf = this.add(this.box(width / 2, height, 0.12), this.panel, (s * width) / 4, height / 2, 0, g);
      this.add(this.box(width / 2 - 0.16, 0.06, 0.14), this.trim, (s * width) / 4, height * 0.62, 0.01, g);
      return leaf;
    });
    // Status lamp on the post and the name over the header — a corridor is only
    // 3 m to the pipes, so nothing here can sit higher than about 2.9.
    const lamp = new THREE.MeshBasicMaterial({ color: locked ? 0xff3322 : 0x33ff88 });
    this.add(this.box(0.1, 0.16, 0.05), lamp, -(width / 2 + 0.12), height * 0.8, 0.18, g);
    this.add(new THREE.PlaneGeometry(1.4, 0.32), emissive(signTex(label)), 0, height + 0.3, 0.19, g);
    const acrossZ = face === "+x" || face === "-x";
    const half = acrossZ ? solid(x - 0.2, z - width / 2, x + 0.2, z + width / 2, height) : solid(x - width / 2, z - 0.2, x + width / 2, z + 0.2, height);
    const door: Door = {
      id, locked, open: 0, pos: new THREE.Vector3(x, 1.2, z), solid: half, lamp,
      set(open: number) {
        leaves.forEach((leaf, i) => {
          const s = i === 0 ? -1 : 1;
          leaf.position.x = (s * width) / 4 + s * open * (width / 2);
        });
      },
    };
    this.doors.push(door);
    this.hotspot(`door:${id}`, x, 1.4, z, 3, label);
    return door;
  }

  /** Slide any door the walker is standing near. Call from `Section.update`. */
  updateDoors(walker: THREE.Vector3) {
    for (const d of this.doors) {
      const want = !d.locked && walker.distanceTo(d.pos) < 3.2 ? 1 : 0;
      if (d.open === want) continue;
      d.open = Math.max(0, Math.min(1, d.open + Math.sign(want - d.open) * 0.06));
      d.set(d.open);
    }
  }
}
