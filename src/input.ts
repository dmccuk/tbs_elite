import { clamp } from "./config";
import { isTouch } from "./renderer";

// Turns keyboard, mouse and touch into one control state.
//
// Continuous controls (steer, throttle, fire, boost) are read every frame.
// One-shot actions (cargo, dodge, pause…) are queued and taken by the game
// with input.take(), so a quick tap is never missed between frames.
//
// Mouse steering has two modes (toggled from the pause menu, saved in localStorage):
//   "aim"       the mouse moves an aim circle and the ship turns to follow it,
//               so it stops turning as soon as the mouse stops (default).
//   "joystick"  the cursor's distance from screen centre sets the turn rate.
// Mouse aim needs pointer lock; without it the mouse falls back to joystick.
//
// Default bindings — keep index.html (splash, help menu, #controls legend) in sync:
//   Mouse / Arrows / A-D   steer          W / S       throttle
//   Space / Left click     fire           Shift       boost
//   X / C / Right click    the ship's special: cargo launch/detonate (MK-IV), match speed (Seagull)
//   Q / E                  dodge roll     Tab / T     cycle target
//   P / Esc                pause          H           help
//   Enter                  skip practice  R           restart (when paused/over)
//   M                      mute           N           next mission (on the results screen)
//   F / Middle click       fire a missile at a locked target (Seagull only)
//   V                      cockpit / chase view (the Cruise also has a cinematic camera)
//   1 / 2 / 3              pick a view: behind / cinematic (Cruise only) / cockpit
// Touch: floating stick, FIRE / CARGO / MSL / BOOST / ROLL, ▲ ▼ speed, VIEW, pause.
// Touch throttle is automatic until the player first presses ▲ or ▼.

export type Action =
  | "cargo" | "dodgeLeft" | "dodgeRight" | "target" | "pause"
  | "help" | "restart" | "skip" | "mute" | "next" | "missile" | "view" | "view1" | "view2" | "view3";

const KEY_ACTIONS: Record<string, Action> = {
  KeyX: "cargo",
  KeyC: "cargo",
  KeyQ: "dodgeLeft",
  KeyE: "dodgeRight",
  Tab: "target",
  KeyT: "target",
  KeyP: "pause",
  Escape: "pause",
  KeyH: "help",
  KeyR: "restart",
  Enter: "skip",
  KeyM: "mute",
  KeyN: "next",
  KeyF: "missile",
  KeyV: "view",
  Digit1: "view1",
  Numpad1: "view1",
  Digit2: "view2",
  Numpad2: "view2",
  Digit3: "view3",
  Numpad3: "view3",
};

const PREVENT = new Set(["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export type SteeringMode = "aim" | "joystick";
const STEERING_KEY = "tbs-steering";

function loadSteering(): SteeringMode {
  try { return localStorage.getItem(STEERING_KEY) === "joystick" ? "joystick" : "aim"; } catch { return "aim"; }
}

class Input {
  steerX = 0;       // -1 left … +1 right (keys, touch stick, joystick-mode mouse)
  steerY = 0;       // -1 down … +1 up
  /** Arrow / A-D keys are held this frame. */
  keySteering = false;
  steering: SteeringMode = loadSteering();
  throttleUp = false;
  throttleDown = false;
  boost = false;
  fire = false;

  /** Cursor position in CSS pixels, and whether it is currently steering. */
  mouseX = window.innerWidth / 2;
  mouseY = window.innerHeight / 2;
  mouseSteering = false;
  /** Set once the player has used the keyboard to steer (for HUD hints). */
  usedKeyboardSteer = false;
  /** Set when the window loses focus; the game pauses and clears it. */
  lostFocus = false;
  /** True while the mouse is captured with the Pointer Lock API. */
  pointerLocked = false;

  /** Capture the mouse for steering. Must be called from a click/key gesture. */
  lockPointer() {
    if (isTouch || this.pointerLocked) return;
    const canvas = document.getElementById("game-canvas");
    try {
      const result = canvas?.requestPointerLock() as unknown as Promise<void> | undefined;
      result?.catch?.(() => { /* refused: absolute-cursor steering still works */ });
    } catch { /* unsupported */ }
  }

  unlockPointer() {
    if (this.pointerLocked) document.exitPointerLock();
  }

  /** True when the mouse is steering in aim mode right now. */
  get mouseAim(): boolean {
    return this.steering === "aim" && this.pointerLocked;
  }

  /** Mouse movement (px) since the last call, for aim-mode steering. */
  takeAimDelta(out: { x: number; y: number }) {
    out.x = this.aimDX;
    out.y = this.aimDY;
    this.aimDX = this.aimDY = 0;
  }

  toggleSteering(): SteeringMode {
    this.steering = this.steering === "aim" ? "joystick" : "aim";
    try { localStorage.setItem(STEERING_KEY, this.steering); } catch { /* ignore */ }
    this.mouseSteering = false;
    this.mouseX = window.innerWidth / 2;
    this.mouseY = window.innerHeight / 2;
    this.aimDX = this.aimDY = 0;
    return this.steering;
  }

  /** True while the touch joystick is held; the HUD uses it to draw the stick. */
  stick = { active: false, baseX: 0, baseY: 0, x: 0, y: 0 };

  private keys = new Set<string>();
  private queue = new Set<Action>();
  private aimDX = 0;
  private aimDY = 0;
  private mouseFire = false;
  private keyFire = false;
  private touchFire = false;
  private touchBoost = false;
  private touchUp = false;
  private touchDown = false;
  /** A touch player has pressed ▲ / ▼: from then on they set the throttle themselves. */
  touchThrottle = false;
  private stickId: number | null = null;

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      const action = KEY_ACTIONS[e.code];
      if (action) this.queue.add(action);
      if (e.code.startsWith("Arrow") || e.code === "KeyA" || e.code === "KeyD") {
        this.mouseSteering = false;
        this.usedKeyboardSteer = true;
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.mouseFire = false;
      this.mouseSteering = false;
      this.lostFocus = true;
    });

    // Pointer events filtered to real mice, so touchscreen laptops keep mouse
    // steering while taps on phones never steer or fire through here.
    {
      window.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return;
        if (this.pointerLocked) {
          // Some browsers report a huge jump right after locking; ignore spikes.
          this.aimDX += clamp(e.movementX, -150, 150);
          this.aimDY += clamp(e.movementY, -150, 150);
          if (this.steering === "aim") return;
          // Joystick mode: move a virtual cursor, kept inside the steering circle.
          const cx = window.innerWidth / 2;
          const cy = window.innerHeight / 2;
          const range = Math.min(window.innerWidth, window.innerHeight) * 0.38;
          let vx = this.mouseX - cx + e.movementX;
          let vy = this.mouseY - cy + e.movementY;
          const len = Math.hypot(vx, vy);
          if (len > range) { vx *= range / len; vy *= range / len; }
          this.mouseX = cx + vx;
          this.mouseY = cy + vy;
          this.mouseSteering = true;
          return;
        }
        const moved = Math.abs(e.clientX - this.mouseX) + Math.abs(e.clientY - this.mouseY);
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
        if (moved > 2) this.mouseSteering = true;
      });
      document.documentElement.addEventListener("mouseleave", () => { if (!this.pointerLocked) this.mouseSteering = false; });
      document.addEventListener("pointerlockchange", () => {
        this.pointerLocked = document.pointerLockElement !== null;
        if (this.pointerLocked) {
          // Start the virtual cursor dead centre so the ship doesn't lurch.
          this.mouseX = window.innerWidth / 2;
          this.mouseY = window.innerHeight / 2;
          this.aimDX = this.aimDY = 0;
        } else {
          this.mouseSteering = false;
          this.lostFocus = true; // Esc releases the lock — treat it as a pause
        }
      });
      window.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "mouse") return;
        if ((e.target as HTMLElement).closest?.("a, button, .modal, #splash-screen")) return;
        if (e.button === 0) this.mouseFire = true;
        if (e.button === 1) { e.preventDefault(); this.queue.add("missile"); }
        if (e.button === 2) this.queue.add("cargo");
      });
      window.addEventListener("pointerup", (e) => { if (e.pointerType === "mouse" && e.button === 0) this.mouseFire = false; });
      window.addEventListener("contextmenu", (e) => e.preventDefault());
    }
  }

  /** Returns true once per queued press of the action. */
  take(action: Action): boolean {
    if (!this.queue.has(action)) return false;
    this.queue.delete(action);
    return true;
  }

  clearQueue() { this.queue.clear(); }

  /** Queue an action from on-screen buttons. */
  press(action: Action) { this.queue.add(action); }

  update() {
    const k = this.keys;
    this.throttleUp = k.has("KeyW") || this.touchUp;
    this.throttleDown = k.has("KeyS") || this.touchDown;
    this.keyFire = k.has("Space");
    this.boost = k.has("ShiftLeft") || k.has("ShiftRight") || this.touchBoost;
    this.fire = this.keyFire || this.mouseFire || this.touchFire;

    let sx = 0;
    let sy = 0;
    if (k.has("ArrowLeft") || k.has("KeyA")) sx -= 1;
    if (k.has("ArrowRight") || k.has("KeyD")) sx += 1;
    if (k.has("ArrowUp")) sy += 1;
    if (k.has("ArrowDown")) sy -= 1;
    this.keySteering = sx !== 0 || sy !== 0;

    if (this.stick.active) {
      const r = 55;
      sx += clamp((this.stick.x - this.stick.baseX) / r, -1, 1);
      sy += clamp(-(this.stick.y - this.stick.baseY) / r, -1, 1);
    } else if (this.mouseSteering && !this.mouseAim) {
      // Distance of the cursor from screen centre steers the ship.
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const range = Math.min(window.innerWidth, window.innerHeight) * 0.38;
      let mx = (this.mouseX - cx) / range;
      let my = -(this.mouseY - cy) / range;
      const len = Math.hypot(mx, my);
      const dead = 0.07;
      if (len < dead) {
        mx = my = 0;
      } else {
        // Rescale past the dead zone and soften the centre for fine aiming.
        const scaled = Math.min(1, (len - dead) / (1 - dead));
        const curved = Math.pow(scaled, 1.35);
        mx = (mx / len) * curved;
        my = (my / len) * curved;
      }
      sx += mx;
      sy += my;
    }
    this.steerX = clamp(sx, -1, 1);
    this.steerY = clamp(sy, -1, 1);
  }

  /** Wires up the on-screen touch controls (floating stick + buttons). */
  bindTouch() {
    const zone = document.getElementById("touch-stick-zone");
    if (zone) {
      zone.addEventListener("touchstart", (e) => {
        e.preventDefault();
        if (this.stickId !== null) return;
        const t = e.changedTouches[0];
        this.stickId = t.identifier;
        this.stick.active = true;
        this.stick.baseX = this.stick.x = t.clientX;
        this.stick.baseY = this.stick.y = t.clientY;
      }, { passive: false });
      const move = (e: TouchEvent) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier !== this.stickId) continue;
          e.preventDefault();
          // Clamp the knob, dragging the base along if the thumb goes too far.
          const r = 55;
          let dx = t.clientX - this.stick.baseX;
          let dy = t.clientY - this.stick.baseY;
          const d = Math.hypot(dx, dy);
          if (d > r * 1.4) {
            this.stick.baseX += (dx / d) * (d - r * 1.4);
            this.stick.baseY += (dy / d) * (d - r * 1.4);
            dx = t.clientX - this.stick.baseX;
            dy = t.clientY - this.stick.baseY;
          }
          this.stick.x = t.clientX;
          this.stick.y = t.clientY;
        }
      };
      const end = (e: TouchEvent) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === this.stickId) {
            this.stickId = null;
            this.stick.active = false;
          }
        }
      };
      window.addEventListener("touchmove", move, { passive: false });
      window.addEventListener("touchend", end);
      window.addEventListener("touchcancel", end);
    }

    const hold = (id: string, set: (v: boolean) => void) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("touchstart", (e) => { e.preventDefault(); set(true); el.classList.add("held"); }, { passive: false });
      const release = () => { set(false); el.classList.remove("held"); };
      el.addEventListener("touchend", release);
      el.addEventListener("touchcancel", release);
    };
    const tap = (id: string, action: Action | (() => Action)) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("touchstart", (e) => {
        e.preventDefault();
        this.queue.add(typeof action === "function" ? action() : action);
        el.classList.add("held");
      }, { passive: false });
      el.addEventListener("touchend", () => el.classList.remove("held"));
    };
    hold("btn-fire", (v) => (this.touchFire = v));
    hold("btn-boost", (v) => (this.touchBoost = v));
    hold("btn-faster", (v) => { this.touchUp = v; this.touchThrottle = true; });
    hold("btn-slower", (v) => { this.touchDown = v; this.touchThrottle = true; });
    tap("btn-view", "view");
    tap("btn-cargo", "cargo");
    tap("btn-missile", "missile");
    tap("btn-dodge", () => (this.steerX < 0 ? "dodgeLeft" : "dodgeRight"));
    tap("btn-pause", "pause");
  }
}

export const input = new Input();
