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
  practiceSeconds: 30,
  retryPracticeSeconds: 5,

  player: {
    maxSpeed: 0.9,          // km/s at 100% throttle
    boostSpeed: 1.8,        // km/s while boosting
    accel: 1.2,             // km/s² toward target speed
    startThrottle: 0.5,
    throttleRate: 0.6,      // throttle change per second while W/S held
    yawRate: 1.5,           // rad/s at full stick
    pitchRate: 1.25,        // rad/s at full stick
    maxPitch: 1.35,         // rad — stops the player flipping over the pole
    hull: 100,
    shield: 100,
    shieldRegenDelay: 2.5,  // seconds without damage before shields recharge
    shieldRegenRate: 22,    // shield points per second
    boostMax: 100,
    boostDrain: 30,         // per second
    boostRegen: 18,         // per second
    gunCooldown: 0.085,
    bulletSpeed: 6.5,
    bulletLife: 0.55,
    dodgeCooldown: 1.1,
    dodgeDuration: 0.45,
    dodgeStrafe: 1.4,       // km/s sideways burst
    aimAssistDeg: 7,        // bullets bend toward anything this close to the crosshair
    collisionRadius: 0.035,
  },

  yacht: {
    hull: 100,
    speed: 0.42,
    pdChance: 0.3,          // chance the yacht's own point-defence stops a missile
  },

  corvette: {
    mineHitsToCripple: 3,
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
    hp: 3,
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
    turnRate: 0.75,         // gentle homing toward the corvette
    blastRadius: 1.5,       // km — the corvette must be inside this to be hit
    pdRadius: 0.9,          // corvette point-defence engages inside this range…
    pdKillTime: 0.3,        // …and needs this long to destroy the container, so you must detonate first
    life: 20,
    slowMo: 0.35,           // time scale while the container is in blast range
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
