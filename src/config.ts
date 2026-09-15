// Shared constants and gameplay tuning.
//
// UNITS: 1 world unit = 1 km. Speeds are km/s. The HUD shows speed in m/s
// (km/s × 1000) and distances in km (or m when under 1 km).
//
// Every number that changes how hard the game feels lives in TUNING, so
// difficulty can be adjusted here without hunting through the code.

export const TUNING = {
  // Seconds of free flight before the ambush. The first run gives players time
  // to learn the controls on practice targets; retries skip straight to action.
  practiceSeconds: 15,
  practiceMaxSeconds: 30,   // a first-run player still mid-tutorial gets up to this long
  retryPracticeSeconds: 5,

  // Handling shared by every ship; per-ship numbers live in SHIPS below.
  player: {
    startThrottle: 0.5,
    throttleRate: 0.6,      // throttle change per second while W/S held
    maxPitch: 1.35,         // rad — stops the player flipping over the pole
    shieldRegenDelay: 2.5,  // seconds without damage before shields recharge
    shieldRegenRate: 22,    // shield points per second
    boostMax: 100,
    boostDrain: 30,         // per second
    boostRegen: 18,         // per second
    matchGap: 0.45,         // km — match speed settles this far behind the target
    dodgeCooldown: 1.1,
    dodgeDuration: 0.45,
    dodgeStrafe: 1.4,       // km/s sideways burst
    aimAssistDeg: 10,       // bullets bend toward anything this close to the crosshair
    collisionRadius: 0.035,
    // Mouse-aim steering: the mouse moves an aim circle and the ship turns to follow it.
    mouseAimSensitivity: 0.0021, // rad of aim per pixel of mouse movement
    mouseAimLead: 0.5,      // rad — how far the aim circle may run ahead of the nose
    mouseAimGain: 2.6,      // stick deflection per radian between nose and aim circle
  },

  yacht: {
    hull: 100,
    speed: 0.42,
    pdChance: 0.3,          // chance the yacht's own point-defence stops a missile
  },

  corvette: {
    mineHitsToCripple: 2,
    missileInterval: 10,    // seconds between missile volleys at the yacht
    volleyMin: 2,
    volleyMax: 3,           // +1 per container hit — it gets angrier
    cannonInterval: 2.6,
    cannonDamage: 0.25,     // can't be intercepted, so keep it a slow background clock
    droneFirstWave: 12,     // seconds after the ambush
    droneWaveInterval: 24,
    maxDrones: 5,
    trailGap: 2.6,          // km behind the yacht along its flight path
  },

  missile: {
    speed: 0.7,
    turnRate: 1.5,
    life: 15,
    damageYacht: 3,
    damagePlayer: 15,
  },

  drone: {
    hp: 2,
    speed: 0.85,
    turnRate: 2.2,
    fireRange: 1.8,
    fireCooldown: 1.2,
    boltSpeed: 2.6,
    boltDamage: 5,
  },

  mine: {
    rackSize: 1,            // containers held at once
    reloadSeconds: 15,      // compactor time to squeeze out a new one — paces the fight
    launchSpeed: 0.5,       // added to the ship's speed on launch
    maxSpeed: 1.35,
    turnRate: 1.0,          // gentle homing toward the corvette
    launchRange: 4,         // km — the on-screen guide says "launch" inside this range…
    launchConeDeg: 22,      // …with the corvette within this angle of the nose
    blastRadius: 1.5,       // km — the corvette must be inside this to be hit
    pdRadius: 0.9,          // corvette point-defence engages inside this range…
    pdKillTime: 0.3,        // …and needs this long to destroy the container, so you must detonate first
    life: 20,
    slowMo: 0.35,           // time scale while the container is in blast range
  },

  // The Seagull's wing missiles (the MK-IV has none — it's a garbage hauler).
  missiles: {
    lockTime: 1.0,        // seconds of nose-on to lock
    lockConeDeg: 20,      // target must stay within this angle of the nose…
    lockRange: 4,         // …and this close (km)
    dropTime: 0.25,       // falls clear of the wing before the motor lights
    speed: 1.9,           // km/s top speed
    accel: 3,             // km/s²
    turnRate: 3.2,        // rad/s — better than any pirate (2.0)
    life: 7,              // seconds before it self-destructs
    fuse: 0.02,           // km proximity fuse (plus the target's radius)
    damage: 20,           // one missile kills a pirate fighter (10 hp)
    evadeRange: 0.8,      // pirates try a break turn when one gets this close
  },

  // Prologue (see docs/prologue-tessick3-spec.md).
  prologue: {
    fighter: {
      hp: 10,               // 5 coilgun hits
      speed: 0.95,
      turnRate: 2.0,
      engageRange: 3.5,     // km — stop strafing the relay and come for you
      fireRange: 2.6,
      burstShots: 6,        // "point at the nearest target and hold the trigger down"
      burstGap: 0.11,
      burstCooldown: 1.8,
      spread: 0.03,         // sloppy aim
      boltSpeed: 2.8,
      boltDamage: 5,
    },
    runner: {
      speed: 0.85,          // slower than a Seagull at full throttle
      escapeSeconds: 30,
      escapeDistance: 9,    // km
    },
    harrenAssistDelay: 4,   // seconds after your first kill before Harren takes one
    wingmanDamage: 1,       // per bolt — the player gets most of the kills
    shuttle: {
      engineHp: 40,
      hullHp: 30,
      speed: 0.55,
      crippledSpeed: 0.3,   // below half engine health
      jumpSeconds: 45,      // jump-drive spool once it runs
      turretRange: 1.6,
      turretCooldown: 1.1,
      turretDamage: 3,
      engineAssistDeg: 4,   // narrower aim assist on the engines, so aim still matters
    },
    relayDamage: 0.6,       // integrity % per pirate bolt that hits the relay
  },
};

// --- Ships ---------------------------------------------------------------------

export type ShipId = "mk4" | "seagull";

export interface ShipStats {
  label: string;
  maxSpeed: number;         // km/s at 100% throttle
  boostSpeed: number;       // km/s while boosting
  accel: number;            // km/s² toward target speed
  yawRate: number;          // rad/s at full stick
  pitchRate: number;
  hull: number;
  shield: number;
  gunCooldown: number;
  gunDamage: number;
  bulletSpeed: number;
  bulletLife: number;
  boltColor: number;
  boltLength: number;
  boltWidth: number;
  flashColor: number;
  gunSound: "laser" | "coilgun";
  special: "cargo" | "match"; // what X / right-click / the touch button does
  missiles: number;           // wing missiles carried (F / middle-click / MSL)
}

export const SHIPS: Record<ShipId, ShipStats> = {
  // Space Refuse Collector MK-IV (Chapter 1): slow, and a pea-shooter laser.
  mk4: {
    label: "MK-IV", maxSpeed: 0.9, boostSpeed: 1.8, accel: 1.2, yawRate: 1.5, pitchRate: 1.25,
    hull: 100, shield: 100,
    gunCooldown: 0.085, gunDamage: 1, bulletSpeed: 6.5, bulletLife: 0.65,
    boltColor: 0x55ffbb, boltLength: 0.09, boltWidth: 0.0034, flashColor: 0x77ffcc, gunSound: "laser",
    special: "cargo", missiles: 0,
  },
  // Seagull patrol fighter (Prologue): frontier refit — heavier shields, uprated coilgun.
  seagull: {
    label: "SEAGULL", maxSpeed: 1.1, boostSpeed: 2.1, accel: 1.5, yawRate: 1.9, pitchRate: 1.6,
    hull: 100, shield: 140,
    gunCooldown: 0.13, gunDamage: 2, bulletSpeed: 8, bulletLife: 0.62,
    boltColor: 0xffbb66, boltLength: 0.075, boltWidth: 0.005, flashColor: 0xffcc88, gunSound: "coilgun",
    special: "match", missiles: 4,
  },
};

export const SCORE = {
  drum: 25,
  missile: 50,
  drone: 150,
  mineHit: 1000,
  cripple: 2000,
  yachtHullPoint: 20,
  playerHullPoint: 10,
  parTime: 180,           // seconds of combat before the time bonus runs out
  timeBonusPerSecond: 10,
  prologue: {
    buoy: 25,
    fighter: 300,
    runner: 500,          // bonus for catching the one that runs
    engines: 2000,
    rescued: 100,         // per worker
    relayPoint: 10,       // per % relay integrity
    playerHullPoint: 10,
    parTime: 150,
  },
};

export const COLORS = {
  hud: "#00ff88",
  hudDim: "#88ffcc",
  warn: "#ffaa00",
  hostile: "#ff3344",
  ally: "#4aa8ff",
  cargo: "#ffaa00",
  rendezvous: "#00ff88",
  missile: "#ff7a2a",
  neutral: "#8a8f99",
};

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Frame-rate independent smoothing factor for exponential approach. */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
export const rand = (min: number, max: number) => min + Math.random() * (max - min);

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  if (km < 100) return `${km.toFixed(1)}km`;
  return `${Math.round(km).toLocaleString()}km`;
}
