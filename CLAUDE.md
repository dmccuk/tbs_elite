# CLAUDE.md — The Black Ship: Lingering Systems

Guidance for Claude (and other contributors) working in this repo.

## What this project is

A narrative, single-scene **browser space-combat game** built with Three.js + TypeScript + Vite. The player is Warrant Officer **Wyatt Staples**, captain of the *Space Refuse Collector MK-IV*, a garbage hauler. After a short practice period, the **Royal Yacht** *Royal Favor* (Cmdr Redford Kalon) jumps into the Lingering Systems pursued by a **Black Ship** corvette flying House Cayston colours. The player shoots down missiles and attack drones to keep the yacht alive, and cripples the corvette by launching their bio-waste cargo container at it and detonating it inside the blast radius (3 hits).

This is **Chapter 1** of a planned serialised story. Lore, names and tone (gritty/blue-collar sci-fi, slightly tongue-in-cheek) should stay consistent across chapters.

## Tech stack and constraints

- **Three.js ^0.160** + **TypeScript 5.3** + **Vite 5**, vanilla — *no* React/Vue/Svelte.
- Three.js is the only runtime dependency (`@types/three` is dev-only). Keep the bundle small; don't add UI frameworks, state stores, or game engines. Three's own `examples/jsm` addons (postprocessing etc.) are fine.
- Targets **modern desktop and mobile browsers** at 60 FPS. WebGL only; no WebGPU yet.
- Deployed via **GitHub Actions → GitHub Pages** (`.github/workflows/deploy.yml`) on every push to `main`. Custom domain via `CNAME` (theblackshipgame.com).
- **No backend.** Only `localStorage` (best score, mute setting).
- **Audio is user-gated**: the shared `AudioContext` is created in `audio.unlock()`, called from the first key/click. Keep that gating intact.
- **No image assets**: every texture and sprite is drawn procedurally on canvases at startup (`src/fx/textures.ts`, `models.ts`, `world.ts`). Audio files are the only binary assets.

## File layout

```
src/main.ts          Bootstrap + main loop (simulate → camera → HUD → render), pause/help/restart
src/game.ts          Shared state object `G`, Phase FSM docs, scheduler, event queue, comms log
src/config.ts        TUNING (all difficulty numbers), SCORE, COLORS, small math helpers
src/mission.ts       Story script: practice/tutorial, ambush, combat events, victory, fail, results
src/player.ts        Flight model, guns + aim assist, dodge roll, shields, collisions, chase camera
src/enemies.ts       Yacht flight path, corvette AI, drones, missiles, damage functions
src/cargo.ts         The cargo-container mine: launch, homing, point-defence, detonation
src/combat.ts        Routes laser-bolt hits to the right damage function
src/weapons.ts       Instanced laser-bolt pool + segment/sphere hit test
src/hud.ts           DOM HUD (cached writes), overlay canvas (brackets, arrows, lead marker), radar
src/input.ts         Keyboard / mouse (pointer lock) / multi-touch → one control state + action queue
src/audio.ts         Single AudioContext: music, radio-filtered voice lines, synthesised SFX, engine hum
src/world.ts         Nebula sky, stars, sun + lens flare, gas giant, lighting, landmarks, asteroids, dust
src/models.ts        Procedural ship/prop models (all face -Z) + canvas hull textures
src/renderer.ts      Renderer, two scenes (backdrop + main), cameras, bloom composer
src/fx/              particles.ts (pooled GPU points), effects.ts (explosions, shockwaves, shake), textures.ts
index.html           HUD/UI markup + all CSS (single file)
public/              tbs_elite.mp3 (music), voice_redford_*.mp3 (radio cues), favicon.svg
```

Keep modules focused. If a module grows past ~600 lines, split it rather than growing it further.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc --noEmit, then vite build → dist/
npm run typecheck
npm run preview
```

## Conventions in this codebase

- **Units**: 1 world unit = **1 km**. Speeds are km/s; the HUD shows m/s (`speed * 1000`). The player's ship is ~70 m long, the corvette ~0.9 km.
- **Forward is -Z** for every model. Orient AI ships with `faceDirection()` in `enemies.ts` (wraps `Matrix4.lookAt`, not `Object3D.lookAt`, which would point +Z at the target).
- **Two scenes**: `backScene` (sky, planet, sun) renders first with a camera that copies only the main camera's rotation; `scene` renders on top after a depth clear. Anything the player can fly near goes in `scene`.
- **Mission state** is `G.phase` (see the transition diagram in `game.ts`). Pausing is `G.paused`, not a phase. Add new phases there and document the legal transitions.
- **Timing**: never use `setTimeout`/`setInterval` for gameplay. Use `schedule(delay, fn)` from `game.ts` — it runs on game time (pauses and slow-motion respected) and is wiped on restart.
- **Events**: combat code calls `emit({ type: ... })`; `mission.ts` reacts in `handleEvents()`. This keeps story/dialogue out of the combat modules and avoids import cycles.
- **Restart** must not reload the page: `restart()` in `mission.ts` clears every entity, effect, scheduled callback and stat. If you add new state, reset it there.
- **Effects** are pooled (particles, flashes, rings, debris, lights). Don't create meshes/materials per shot or per explosion.
- **HUD**: use the cached `setText`/`setHtml`/`setStyle` helpers in `hud.ts` so unchanged values don't touch the DOM.
- **Asset paths**: reference public assets as absolute (`'/tbs_elite.mp3'`). Vite's `base` is `'/'`.

## Controls (keep splash, help menu and `#controls` legend in sync with `input.ts`)

Mouse steer (pointer-locked; arrows / A-D also steer) · Space or left-click fire · W/S throttle · Shift boost · X / C / right-click launch then detonate cargo · Q/E dodge roll · Tab/T cycle target · P/Esc pause · H help · M mute · R restart (when paused or after the mission) · Enter skip practice. Touch: floating stick on the left half, FIRE / CARGO / BOOST / ROLL buttons, auto throttle.

## Game-design constraints

- **Tone**: lived-in sci-fi, "garbage hauler vs warship" underdog energy. Avoid grimdark; keep dry humour (see the comms lines in `mission.ts`).
- **Easy to pick up**: aim assist bends shots toward targets near the crosshair; time slows while the container is in blast range; a floating reticle, off-screen arrows and a lead marker show where to go and shoot.
- **Mission length**: ~3–5 minutes from splash to outcome. The first run has a 30 s practice period with an interactive tutorial and junk drums to shoot (Enter skips it); retries use 5 s.
- **Difficulty knobs** all live in `TUNING` (`config.ts`). Measured baselines: an idle player loses in ~2 minutes; a near-perfect bot wins in ~50 s of combat with the yacht at ~85% (grade A). The main levers are `mine.reloadSeconds`, `corvette.mineHitsToCripple`, missile damage and `mine.pdKillTime` (how long the corvette's point-defence needs to shoot a container down — it forces the player to detonate rather than ram).

## What not to do without asking

- Don't add new top-level `*.md` docs, screenshots, or design treatises unless the user asks. This file is the canonical doc.
- Don't introduce new runtime dependencies without a discussion of bundle-size impact.
- Don't rename the lore (Wyatt Staples, Redford Kalon, House Cayston, *Royal Favor*, Lingering Systems). These will carry into future chapters.
- Don't change `vite.config.ts` base path without verifying the GitHub Pages deploy still resolves `/tbs_elite.mp3` etc.
- Don't push to `main` casually — it deploys straight to the live site.

## Testing

There is no unit-test suite. `npm run build` type-checks. In dev builds the console exposes `window.__game` with `G`, `input`, `audio` and `tick(seconds, beforeStep?)`, which fast-forwards the simulation without rendering — useful for scripted checks (e.g. with Playwright). Adding `?slowgpu` to the dev URL raises the frame-step cap for slow headless renderers.

Manual checklist (`npm run dev`):
1. Splash dismisses on any key/click; the ship doesn't lurch (pointer lock starts centred).
2. Practice tutorial advances as you steer, fire, boost, dodge and launch a container; Enter skips.
3. Ambush: yacht and corvette warp in; missiles, cannons and drone waves start.
4. Container: X launches, ring on the corvette turns green + slow-mo, X detonates; 3 hits → victory → rendezvous beacon → results.
5. Letting the yacht die → failed panel; R restarts without a page reload.
6. P/Esc/window blur pauses; M mutes.
7. Mobile: DevTools device emulation (landscape) — stick + buttons, multi-touch fire while steering.
