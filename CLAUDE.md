# CLAUDE.md — The Black Ship

Guidance for Claude (and other contributors) working in this repo.

## What this project is

A narrative **browser space-combat game** from **Vox9 Studios** (the author's audiobook platform and game studio), built with Three.js + TypeScript + Vite, with two story missions and a screensaver ride picked from the title screen (story order, nothing locked):

1. **Prologue.** Before Wyatt piloted the waste hauler, Patrol Pilot **Wyatt Staples** flies a **Seagull** fighter with the Ninth Patrol Squadron on the Tessick-Varn Frontier, with wingman **Harren** and Squadron Commander **Lt Edren Caldwell** on comms. Pirates are stripping the **Tessick-3** relay. The player downs three pirate fighters (Harren takes one; the last one runs), then disables the fleeing cargo shuttle's **engines**, not its hull, because 11 kidnapped workers are aboard. Adapted from *Academy Days* Episode 6; spec in `docs/prologue-tessick3-spec.md`. It ends on the posting notice that sends Wyatt to a compost hauler, which leads into Chapter 1. The Prologue card also offers **free flight** (F on the splash): the patrol never ends, buoys respawn, and Enter starts the real mission. It also offers **landing practice** (L on the splash): fly through three approach rings, cross the Kessler's stern door below 350 m/s (`CAPTURE_MAX` in kessler.ts), and the mag-clamp field brakes you onto the cradle. Come in too fast and you overshoot out of the bow, which fails the drill. You can also land in free flight, and Enter catapults you out through the bow. The Kessler's hull is solid in every frontier mode.
2. **Chapter 1: Lingering Systems.** Warrant Officer Wyatt Staples captains the *Space Refuse Collector MK-IV*, a garbage hauler. After a short practice period, the **Royal Yacht** *Royal Favor* (Cmdr Redford Kalon) jumps in pursued by a **Black Ship** corvette flying House Cayston colours. The player shoots down missiles and drones to keep the yacht alive, and cripples the corvette by launching their bio-waste cargo container at it and detonating it inside the blast radius (2 hits).

3. **Cruise** (C on the splash; not a story mission, not in `MISSION_ORDER`). A screensaver ride: Harren then Wyatt catapult off the Kessler, the autopilot flies a ~6–7 minute loop out through an endless asteroid belt (`belt.ts`) and back into the bay, they rest ~16 s on cradles 1 and 2, and go again, forever. Mid-lap there's a ~45 km **joyride**: Wyatt opens her up (1.5 km/s, two boosts to 2.05), throws an aileron roll and slaloms round "gate" rocks planted on the path, with Harren chasing. Harren (`missions/cruise-harren.ts`) flies kinematically along the same lap: formation off the right wing, behind Wyatt in the slalom, ahead of him to land first. Phase `"cruise"`, no player controls, no score, **no pointer lock and no pause on blur** (so it can run on a second display; the cursor hides when idle). `cinematic.ts` films it with three views: 1 behind (chase), 2 cinematic (cuts between tracking, wide two-ship, orbit, flyby, behind-a-rock, over-Harren's-shoulder in the joyride, and Kessler set-ups: stern approach, hangar, deck, bow launch), 3 cockpit. V cycles; the choice is saved as `tbs-cruise-view`. The HUD is reduced to comms and a title card, with letterbox bars in the cinematic view. Lines: `cruise_*` / `pro_deck_*` in `docs/voice-lines.md`.

**Cockpit view** (V in any mission, `tbs-view` in localStorage; `cockpit.ts`): the camera sits at the pilot's eye and a small cockpit scene (canopy frame, dash, three canvas screens) is drawn over the world after a depth clear. In cockpit view the dash screens replace the HUD's bottom bars and scanner (`body.cockpit`).

This is a planned serialised story. Lore, names and tone (gritty/blue-collar sci-fi, slightly tongue-in-cheek) should stay consistent across missions.

**Title screen** (`#splash-screen` in `index.html`): the Big Shoulders family (Stencil Display for the title, Display/Text for the rest), stencil amber for the title and tags, and HUD green only for things you can press. The support link ("Support Vox9 Studios") lives in the title-screen footer and is driven by `src/tip.ts`, adapted from Vox9's tip-banner snippet. While `TIP_CONFIG.amounts` still holds `REPLACE_ME` placeholders it is a plain Ko-fi link. Once real Stripe Payment Links (each with metadata `type = platform_tip`) are pasted in, it opens a small tip panel with an amount per link.

## Tech stack and constraints

- **Three.js ^0.160** + **TypeScript 5.3** + **Vite 5**, vanilla — *no* React/Vue/Svelte.
- Three.js is the only runtime dependency (`@types/three` is dev-only). Keep the bundle small; don't add UI frameworks, state stores, or game engines. Three's own `examples/jsm` addons (postprocessing etc.) are fine.
- Targets **modern desktop and mobile browsers** at 60 FPS. WebGL only; no WebGPU yet.
- Deployed via **GitHub Actions → GitHub Pages** (`.github/workflows/deploy.yml`) on every push to `main`. Custom domain via `CNAME` (theblackshipgame.com).
- **No backend.** Only `localStorage`: best score per mission (`tbs-best-score` = Chapter 1, `tbs-best-prologue`), completion flags (`tbs-done-<id>`), last mission played, mute setting, mouse steering mode.
- **Audio is user-gated**: the shared `AudioContext` is created in `audio.unlock()`, called from the first key/click. Keep that gating intact.
- **Voice lines**: missions speak through `talk(speaker, text, voiceId)` (`missions/common.ts`). It shows the comms text and queues `public/voice/<voiceId>.mp3` through the speaker's `fx` (`radio`, `radioFar`, `interference`, `pirate`, `computer`, `cockpit`, defined in `VOICE_FX` in `audio.ts`). Lines queue rather than overlap, and ones older than 8 s are dropped. A missing file is skipped silently, so recordings can arrive a few at a time. Voices play above everything else: the music and sfx buses duck while a line plays. The full list of ids and wording is in `docs/voice-lines.md`.
- **No image assets**: every texture and sprite is drawn procedurally on canvases at startup (`src/fx/textures.ts`, `models*.ts`, `backdrop.ts`, `world*.ts`). Audio files are the only binary assets.

## File layout

```
src/main.ts             Bootstrap + main loop (simulate → camera → HUD → render), splash/mission select, pause/help/restart
src/game.ts             Shared state object `G`, MissionId, Phase FSM docs, entity types, scheduler, event queue, comms log
src/config.ts           TUNING (all difficulty numbers incl. TUNING.prologue), SHIPS (per-ship stats), SCORE, COLORS, math helpers
src/mission.ts          Mission dispatcher: start/restart/switch missions, special button, hull alarms, target locking
src/missions/common.ts  Mission interface, practice-tutorial runner, rendezvous beacon, best scores, completion flags
src/missions/chapter1.ts  Chapter 1 script: tutorial, ambush, combat events, cargo guide, victory, fail, results
src/missions/prologue.ts  Prologue script: patrol tutorial, distress + burn, dogfight → runner → pursuit, surrender, results
src/player.ts           Ship switching (MK-IV / Seagull), flight model, guns + aim assist, match speed, dodge, shields, collisions, chase camera
src/missiles.ts         The Seagull's 4 wing missiles: seeker lock (nose-on for 1 s), launch from the wing rails, homing flight, callouts
src/kessler.ts          The Kessler, a small carrier with a through-bay: model, solid hull/bay collisions, approach rings, mag-clamp arrestor, catapult
src/missions/landing.ts Prologue landing practice: start, guide prompt, deck report / scoring (uses kessler.ts)
src/missions/cruise.ts  The Cruise: lap paths (ellipse + climb + weave + joyride slalom, straight ends through the bay), autopilot, launch/land/rest cycle, lines
src/missions/cruise-harren.ts  Harren's Seagull on the Cruise: parked / launching / formation / chase / landing on cradle 1
src/belt.ts             The Cruise's endless asteroid belt: rocks wrap around a box that follows the ship, clear corridor along the path
src/cinematic.ts        The Cruise's camera director (cinematic / cockpit / chase views, shot picking, cuts, letterbox)
src/cockpit.ts          Cockpit view: pilot-eye offsets, cockpit overlay scene + composer passes, live dash screens
src/enemies.ts          Chapter 1 ships: yacht flight path, corvette AI, drones, missiles, damage functions
src/frontier.ts         Prologue ships: Tessick-3 relay, Harren (wingman AI), pirate fighters, cargo shuttle (engine/hull zones), buoys
src/cargo.ts            The cargo-container mine: launch, homing, point-defence, detonation
src/combat.ts           Routes bolt hits (player / enemy / ally) to the right damage function
src/weapons.ts          Instanced bolt pool + segment/sphere hit test
src/hud.ts              DOM HUD (cached writes): bars, mission status, target panel, results, per-mission labels
src/overlay.ts          Overlay canvas: brackets, arrows, crosshair + lead marker, aim circle, blast ring, popups, touch stick
src/radar.ts            The Elite-style scanner canvas
src/input.ts            Keyboard / mouse (pointer lock) / multi-touch → one control state + action queue
src/audio.ts            Single AudioContext: music, radio-filtered voice lines, synthesised SFX (laser, coilgun…), engine hum
src/world.ts            Lighting, landmarks, asteroids, dust, and the theme switch (`G.world.setTheme("lingering" | "frontier")`)
src/backdrop.ts         Sky shader, stars, gas giant, sun + lens flare, environment map (colours come from a theme "look")
src/world-frontier.ts   Tessick-Varn look: brown dwarf, mining outposts T-7/T-9, the carrier Kessler (built lazily)
src/models.ts           Chapter 1 models (MK-IV, yacht, corvette, drone, missile, container, drum, beacon) + canvas hull textures
src/models-frontier.ts  Prologue models (Seagull, pirate fighter, cargo shuttle, Tessick-3 relay, nav buoy)
src/renderer.ts         Renderer, two scenes (backdrop + main), cameras, bloom composer (cockpit.ts inserts its passes after the main scene)
src/fx/                 particles.ts (pooled GPU points), effects.ts (explosions, shockwaves, shake, warp), textures.ts
index.html              HUD/UI markup + all CSS (single file)
docs/                   Author-requested docs: prologue-tessick3-spec.md, voice-lines.md (every comms line + recording file names)
public/                 tbs_elite.mp3 (music), voice/ (recorded comms lines, see docs/voice-lines.md), voice_redford_*.mp3 (Chapter 1 radio cues), favicon.svg
```

Keep modules focused. If a module grows past ~600 lines, split it rather than growing it further.

## Running

```bash
npm install
npm run dev        # http://localhost:5173  (add --host to test on a phone on the same Wi-Fi)
npm run build      # tsc --noEmit, then vite build → dist/
npm run typecheck
npm run preview
```

## Conventions in this codebase

- **Units**: 1 world unit = **1 km**. Speeds are km/s; the HUD shows m/s (`speed * 1000`). The player's ships are ~50–70 m long (the chase camera is tuned for that), the corvette ~0.9 km.
- **Forward is -Z** for every model. Orient AI ships with `faceDirection()` in `enemies.ts` (wraps `Matrix4.lookAt`, not `Object3D.lookAt`, which would point +Z at the target).
- **Two scenes**: `backScene` (sky, planet, sun) renders first with a camera that copies only the main camera's rotation; `scene` renders on top after a depth clear. Anything the player can fly near goes in `scene`.
- **Missions** implement the `Mission` interface in `missions/common.ts` and are registered in `MISSIONS` / `MISSION_ORDER` in `mission.ts`. A mission declares its ship (`SHIPS` id), world theme, start position, HUD text and results text. Mission-specific module state is cleared in its `reset()`.
- **Mission state** is `G.phase`, which all missions share (see the transition diagram in `game.ts`); mission-specific sub-steps go in `G.step`. Pausing is `G.paused`, not a phase.
- **Timing**: never use `setTimeout`/`setInterval` for gameplay. Use `schedule(delay, fn)` from `game.ts`. It runs on game time (so it respects pause and slow motion) and is wiped on restart.
- **Events**: combat code calls `emit({ type: ... })`; the active mission reacts in its `update()`. The dispatcher clears `G.events` every frame. This keeps story/dialogue out of the combat modules and avoids import cycles.
- **Restart / switching** must not reload the page: `startMission()` in `mission.ts` (via `clearAll()`) clears every entity, effect, scheduled callback and stat for both missions. If you add new state, reset it there or in the mission's `reset()`.
- **Effects** are pooled (particles, flashes, rings, debris, lights). Don't create meshes/materials per shot or per explosion. Big models are built once and reused on restart.
- **HUD**: use the cached `setText`/`setHtml`/`setStyle` helpers in `hud.ts` so unchanged values don't touch the DOM. Per-mission bits of `index.html` use `.ch1-only` / `.pro-only` (driven by `body[data-mission]`).
- **Asset paths**: reference public assets as absolute (`'/tbs_elite.mp3'`). Vite's `base` is `'/'`.

## Controls (keep splash, help menu and `#controls` legend in sync with `input.ts`)

- **Steering:** the mouse steers (pointer-locked); arrows / A-D also steer. The mouse has two modes, toggled in the pause menu:
  - **aim** (default): the mouse moves a white aim circle and the ship turns to follow it.
  - **classic** joystick: the cursor's distance from the centre sets the turn rate.
- **Keys:**
  - Space or left-click: fire.
  - W/S: throttle. Shift: boost.
  - X / C / right-click: the ship's **special**. On the MK-IV that's cargo launch, then detonate; on the Seagull it's match speed with the locked target, press again to stop.
  - F / middle-click: fire a missile. Seagull only, with 4 on the wing rails, rearmed when the distress call comes in and reloaded in free flight. Hold the nose on a pirate or buoy for `TUNING.missiles.lockTime` to lock. The seeker never locks the shuttle (people aboard). The MK-IV has no missiles (`SHIPS.mk4.missiles = 0`).
  - Q/E: dodge roll. Tab/T: cycle target.
  - P/Esc: pause. H: help. M: mute (saved as `tbs-muted`). Speaker icons on the title screen and at the end of the HUD's instrument row show the state (red with a line through it when muted) and toggle it on click. M on the title screen mutes rather than starting a mission.
  - R: restart (when paused or after the mission). N: next mission (on the results screen). Enter: skip practice.
  - V: cockpit / chase view (in the Cruise: behind → cinematic → cockpit). 1 / 2 / 3 pick behind / cinematic (Cruise only) / cockpit directly.
  - On the splash, 1/2 pick a mission, F starts Prologue free flight, L landing practice, C the Cruise, and any other key starts the suggested one.
- **Touch:**
  - Floating stick on the left half; FIRE / CARGO-or-MATCH / BOOST / ROLL buttons, plus MSL on the Seagull; VIEW under the pause button.
  - Throttle is automatic (eased off on a Kessler approach) until the player first presses ▲ / ▼; after that it works like W / S (`input.touchThrottle`) and the THROTTLE readout appears.
  - The special button shows its own state: CARGO / reload countdown / BLOW!, or MATCH / MATCH ✓.
  - Tapping start requests fullscreen and a landscape lock where the browser allows it (Android; not iPhone Safari).
- **Legend:** the desktop `#controls` legend stays on screen for the whole mission.

## Game-design constraints

- **Tone**: lived-in sci-fi, "garbage hauler vs warship" underdog energy. Avoid grimdark; keep dry humour (see the comms lines in `missions/*.ts`). The prologue is a little grittier and quieter, and its emotional beat is the captives; play that straight, but end on hope.
- **Easy to pick up**:
  - Aim assist bends shots toward targets near the crosshair. The shuttle's engines use a narrower cone, so aim still matters there.
  - Off-screen arrows and a lead marker show where to go and shoot.
  - During combat a numbered prompt under the crosshair (`updateGuide()` in each mission) always says the next step.
  - Chapter 1 slows time while the container is in blast range.
- **Mission length**: ~3–5 minutes from splash to outcome. The first run of each mission has a 15 s practice period (up to 30 s if the tutorial isn't finished) with an interactive tutorial and practice targets; Enter skips it. Retries use 5 s.
- **Difficulty knobs** all live in `TUNING` / `SHIPS` (`config.ts`).
  - **Chapter 1 baselines are out of date.** They were measured before the Sept 2026 changes: 3 hits to cripple (now 2), drones 3→2 hp, aim assist 7°→10°, gun range +18%, container homing 0.75→1.0 and practice 30→15 s. Re-measure.
  - Those old baselines: an idle player loses in ~2 minutes; a near-perfect bot wins in ~50 s of combat with the yacht at ~85% (grade A).
  - Chapter 1's main levers: `mine.reloadSeconds`, `corvette.mineHitsToCripple`, missile damage and `mine.pdKillTime` (how long the corvette's point-defence needs to shoot a container down, which forces the player to detonate rather than ram).
  - Prologue levers: `TUNING.prologue.fighter.*` (hp, burst size/damage), `shuttle.jumpSeconds`, `shuttle.engineHp` / `hullHp`, `shuttle.engineAssistDeg`, and the Seagull's stats in `SHIPS.seagull`.

## What not to do without asking

- Don't add new top-level `*.md` docs, screenshots, or design treatises unless the user asks. This file is the canonical doc.
- Don't introduce new runtime dependencies without a discussion of bundle-size impact.
- Don't rename the lore (Wyatt Staples, Redford Kalon, House Cayston, *Royal Favor*, Lingering Systems, Harren, Edren Caldwell, the Kessler, Tessick-Varn, Seagull). These will carry into future chapters.
- Don't change `vite.config.ts` base path without verifying the GitHub Pages deploy still resolves `/tbs_elite.mp3` etc.
- Don't push to `main` casually — it deploys straight to the live site.

## Testing

There is no unit-test suite; `npm run build` type-checks.

In dev builds the console exposes `window.__game` with:
- `G`, `input` and `audio`;
- `startMission(id, short)`;
- `tick(seconds, beforeStep?)`, which fast-forwards the simulation without rendering. It's useful for scripted checks, e.g. with Playwright or Puppeteer.

Adding `?slowgpu` to the dev URL raises the frame-step cap for slow headless renderers. `?nobloom` (any build) turns bloom off, which helps when chasing GPU-specific artefacts.

**GPU safety:** a pass in `renderer.ts` replaces NaN/Inf pixels before bloom, because one bad pixel blooms into flashing black blocks on real GPUs (swiftshader in headless tests won't show it). In custom shaders, never `pow()` a value that could dip below zero (clamp it first), and keep `smoothstep` edges in ascending order.

Manual checklist (`npm run dev`):
1. The title screen shows the live scene with the ship framed on the right, the stencil title, and the mission list (Start here / Completed tags, best scores). Hovering a mission previews its ship and star system. Its Play / Free flight buttons, 1/2/F or any other key start a mission. Tab and clicks on empty space don't. The ship doesn't lurch (pointer lock starts centred). The touch buttons stay hidden until a mission starts.
2. Practice tutorial advances as you steer, fire, boost, dodge and use the special (container launch or match speed); Enter skips.
3. Chapter 1:
   - Ambush: yacht and corvette warp in, and missiles, cannons and drone waves start.
   - Container: the guide prompt walks steps 1–4. X launches, the ring on the corvette turns green with slow motion, X detonates. 2 hits → victory → rendezvous beacon → results.
4. Prologue:
   - Distress call → burn to Tessick-3.
   - Dogfight: Harren kills one fighter a few seconds after your first kill, and the last one runs.
   - Pursuit: shooting the engines disables the shuttle and it surrenders → beacon → posting notice → NEXT: CHAPTER 1.
   - Shooting the hull can destroy the shuttle (fail), and letting the timer run out makes it jump (fail).
5. Mouse aim: a flick moves the white circle and the ship turns to it, then stops. Pause → MOUSE: CLASSIC switches to joystick steering, and the choice persists across reloads.
6. R restarts without a page reload. Pause → MISSIONS and results → MISSION SELECT return to the splash.
7. P/Esc/window blur pauses; M mutes.
8. Mobile: DevTools device emulation (landscape) — stick + buttons, multi-touch fire while steering.
