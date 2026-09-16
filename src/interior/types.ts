import * as THREE from "three";
import type { Solid } from "./walk";

// Shared shapes for the walkable sections of the Kessler (deck, corridor, rooms).
// Everything here is in METRES.

/** Something you can look at and press E on. */
export interface Hotspot {
  id: string;
  pos: THREE.Vector3;
  /** How close you have to be (metres). */
  range: number;
  label: string;
}

/** A powered door: slides open when someone comes near, unless it's locked. */
export interface Door {
  id: string;
  /** Centre of the doorway. */
  pos: THREE.Vector3;
  locked: boolean;
  /** 0 shut, 1 open. */
  open: number;
  /** Blocks the way while it's shut. */
  solid: Solid;
  /** Slide the leaves; called with 0-1. */
  set(open: number): void;
  /** Red lamp while locked, green when it's free. */
  lamp?: THREE.MeshBasicMaterial;
}

/** One built part of the ship: geometry, collision, things to use. */
export interface Section {
  root: THREE.Group;
  solids: Solid[];
  hotspots: Hotspot[];
  doors: Door[];
  update?(t: number, walker: THREE.Vector3): void;
}
