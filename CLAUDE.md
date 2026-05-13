# CLAUDE.md — The Black Ship: Lingering Systems

Guidance for Claude (and other contributors) working in this repo.

## What this project is

A narrative, single-scene **browser space-combat puzzle** built with Three.js + TypeScript + Vite. The player is Warrant Officer **Wyatt Staples**, captain of the *Space Refuse Collector MK-IV*. After ~30 seconds, a **Royal Yacht** (*Royal Favor*, Cmdr Redford Kalon) jumps into the Lingering Systems pursued by a hostile **Black Ship** corvette flying House Cayston colours. The player must detach their bio-waste cargo container as an improvised mine and detonate it within 10,000 km of the corvette to save the yacht.

This is **Chapter 1** of a planned serialised story. Lore, names and tone (gritty/blue-collar sci-fi, slightly tongue-in-cheek) should stay consistent across chapters.

## Tech stack and constraints

- **Three.js ^0.160** + **TypeScript 5.3** + **Vite 5**, vanilla — *no* React/Vue/Svelte.
- Three.js is the only runtime dependency. Keep the bundle small; don't add UI frameworks, state stores, or game engines.
- Targets **modern desktop and mobile browsers** at 60 FPS. WebGL only; no WebGPU yet.
- Deployed via **GitHub Actions → GitHub Pages** (`.github/workflows/deploy.yml`). The site lives at `https://dmccuk.github.io/tbs_elite/` and is also wired to a custom domain via `CNAME`.
- **No backend.** No persistence beyond `localStorage` if we ever add saves.
- **Audio is user-gated**: browsers require a user gesture before `Audio.play()` / `AudioContext` will start. Keep that gating intact.

## File layout

```
src/main.ts                Everything: scene, physics, AI, mission, HUD updates, audio, input
index.html                 HUD/UI markup + all CSS (single file)
public/                    Static assets served from site root
  tbs_elite.mp3            Background music
  voice_redford_*.mp3      Radio-voice mission cues
  favicon.svg
vite.config.ts             base: '/' — public assets are referenced as '/foo.mp3'
.github/workflows/deploy.yml
```

`main.ts` is intentionally one big file right now (~1700 lines). If a change starts crossing the 100-line mark, prefer extracting a module (e.g. `src/audio.ts`, `src/entities/yacht.ts`) rather than growing the monolith further.

## Running

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # outputs to dist/
npm run preview
```

## Conventions in this codebase

- **Units**: gameplay distances are in **km**, internal Three.js units are scaled via `toRender(km)` / `toKm(units)` helpers (`SCALE.RENDER_SCALE = 0.001`). Always convert at the boundary; never mix raw units and km in the same expression.
- **Speed cap**: `SCALE.MAX_SPEED = 6.5` render units (≈ 3 km/s real-world). HUD shows m/s.
- **Mission state** lives in module-level `let` flags (`missionStarted`, `cargoDetached`, `cargoDetonated`, `blackShipDamaged`, `missionComplete`, `playerIsTarget`). Treat these as a finite state machine — when adding states, document the legal transitions in a comment next to the flag.
- **DOM lookups**: always `getElementById` inside the handler, not cached at module top, because the HUD has elements that may be hidden/replaced.
- **HUD updates**: done imperatively from `animate()` / handlers (no framework). Keep DOM writes minimal per frame.
- **Asset paths**: reference public assets as absolute (`'/tbs_elite.mp3'`), not relative. Vite's `base` is `'/'` — if we move back to a project-page base, update the paths.

## Game-design constraints

- **Tone**: lived-in sci-fi, "garbage hauler vs warship" underdog energy. Avoid grimdark; keep dry humour.
- **Controls are keyboard-first** (WASD throttle, arrows yaw/pitch, QE roll, Space brake, X/C combat). Mobile touch is a fallback, not parity. Don't rebind primary keys without updating the splash, help menu, and `#controls` legend together.
- **Mission length**: target ~3–5 minutes from splash to outcome. The 30-second pre-mission idle exists to let players learn the controls — don't shrink it to zero without adding a tutorial alternative.
- **Difficulty**: a competent first-time player should win on the second or third try. The cargo detonation window (5–20 km optimal, <10,000 km damage radius) is the main difficulty knob.

## Known gotchas (verify before "fixing")

- **Duplicate `<div id="mission-complete">`** in `index.html` (around lines 1140 and 1158). One is dead. Keep this in mind if a "complete" panel doesn't update — you may be editing the wrong copy.
- **`case "KeyR":` falls through to `case "KeyH":`** in the keydown switch (missing `break`). Means pressing R when the mission is complete *both* reloads and toggles the help menu. Probably unintentional — confirm with the user before "fixing", in case the reload is meant to win the race.
- **Multiple `AudioContext` instances**: `playRadioVoice` / `playLaserZapSound` / `playWhooshSound` each `new AudioContext()`. Browsers cap this around 6 — sounds will silently stop working after enough plays. Prefer a single shared context if you touch this code.
- **`setInterval` for transient FX** (explosions, screen shake, trails). They aren't cancelled if mission state changes. Move into the main `animate()` loop if you're touching them.
- **Camera is `ship.add(camera)`** at `(0, 0.3, 0.8)`. Resetting `camera.position` to a hardcoded value after screen shake is fine *only* because of that fixed offset. Don't move the camera off the ship without rewriting the shake code.
- **`speed` HUD math**: `Math.round(speed * 1000)` displays m/s. `velocity` is in render-units/sec, so `* 1000` is the inverse of `RENDER_SCALE`. If you change `RENDER_SCALE`, fix this too.
- **Ship body mesh is `visible = false`** (line ~539). The README mentions a visible ship, but the player flies an invisible cockpit. Intentional or not — confirm with the user before "restoring" it.

## What not to do without asking

- Don't add new top-level `*.md` docs, screenshots, or design treatises unless the user asks. This file is the canonical doc.
- Don't introduce new dependencies (UI framework, physics engine, postprocessing libs) without a discussion of bundle-size impact.
- Don't replace `setInterval` / `setTimeout` everywhere in one pass — they're load-bearing for mission timing. Convert incrementally.
- Don't rename the lore (Wyatt Staples, Redford Kalon, House Cayston, *Royal Favor*, Lingering Systems). These will carry into future chapters.
- Don't change `vite.config.ts` base path without verifying the GitHub Pages deploy still resolves `/tbs_elite.mp3` etc.

## Testing

There is no test suite. Verify changes by running `npm run dev` and:
1. Splash dismisses on any key.
2. After ~30 s mission alert fires and yacht/corvette spawn.
3. `X` detaches cargo, `C` detonates; detonation within ~5–20 km of corvette = win path, far miss = fail path with player-hunt.
4. Radar shows ST1/ST2/DRL/RYL/HST/CRG/RDV markers as appropriate.
5. Mobile: open DevTools device emulation; joystick + buttons respond.

Type-check passes via `npm run build` (Vite runs tsc).
