# Prologue: Tessick-3 — Mission Spec

**Status:** built (Sept 2026), see the notes below for where the build differs from the draft · **Source:** *Academy Days*, Episode 6 "The Warrant Officer", Parts 1–4 (the Tessick-3 raid is in Part 2) · **Target length:** 3–4 minutes

---

## 1. Pitch

About two years before Chapter 1, Wyatt Staples is a **Patrol Pilot in the Ninth Patrol Squadron**, flying a refitted **Seagull** fighter on the Tessick-Varn Frontier. A distress burst comes in from the **Tessick-3 communications relay**: three pirate fighters are escorting a cargo shuttle that is stripping the relay's power cells. Wyatt and his wingman **Harren** are seven minutes out. "Close enough."

The player downs the fighters and then stops the shuttle **without destroying it**, because eleven kidnapped workers are packed into its hold.

**Why this mission:**
- **Contrast.** In the Seagull, Wyatt is a real fighter pilot with a gun that kills things. In Chapter 1 he's stuck in a garbage scow with a pea-shooter. Playing the prologue first makes Chapter 1's underdog set-up land harder.
- **Teaches the controls.** It's a straightforward dogfight, with no cargo-mine mechanic to learn, so new players learn to steer and shoot before Chapter 1.
- **Sets up the story.** The epilogue ends on the posting notice, "Vessel designation: Compost Hauler", which leads straight into Chapter 1.

## 2. Lore to keep (from the source)

| Thing | Detail from the story |
|---|---|
| Player | Patrol Pilot Wyatt Staples, Ninth Patrol Squadron, Flight Group Three, Second Frontier Corps |
| Wingman | Pilot Third Class **Harren**: competent, unenthusiastic, laconic |
| Commander | Lieutenant First Class **Edren Caldwell**, Squadron Commander, speaks in flat facts |
| Carrier | The **Kessler**, a squat patrol corvette. Seagulls can't jump, so the Kessler carries them |
| Ship | **Seagull**: old airframe with heavier shields, extended fuel and an uprated **coilgun**. Rattles on the port side under acceleration, shield indicators flicker amber for no reason, and the coilgun reticle drifts 2° starboard until it warms up |
| Place | Tessick-Varn corridor, Sector Two (Tessick-3 to Tessick-12). Tessick-3 is a comms relay. Home base is Outpost Kaelen |
| The raid | Three pirate fighters escort a cargo shuttle after the relay's power cells and electronics. The fighters are older than the Seagull, badly maintained, and flown by pilots who "point their nose at the nearest target and hold the trigger down" |
| The fight | Wyatt kills the first fighter with a deflection shot. The second breaks left into Harren's firing arc. The third runs, and Wyatt chases it down and puts a burst through its engine housing |
| Aftermath | Eleven workers taken in earlier raids are found in the shuttle's hold. One woman looks at Wyatt and says nothing |

**Tone:** grittier and quieter than Chapter 1, with the humour kept dry. The captives are the emotional beat. Play it straight, but end on hope: they get rescued.

## 3. Mission flow

```
patrol (practice) → distress → dogfight → runner → pursuit → surrender → rendezvous → results (posting notice)
```

*As built:* there is no separate briefing card. Caldwell's line opens the patrol on the comms instead, and the splash card carries the set-up. The epilogue's posting notice is the results panel ("FUTURE POSTING ASSIGNMENT"), with a **NEXT: CHAPTER 1 ▶** button.

| # | Beat | What happens | Player goal | Ends when |
|---|---|---|---|---|
| 1 | **Patrol** (practice) | "Sector Two, hour three." Harren is on your wing. A few nav buoys and debris to shoot. Same interactive tutorial as Chapter 1 (steer, fire, boost, roll, **match speed**). 30 s on the first run, 5 s on retries, Enter skips | Learn the controls | Timer or Enter |
| 2 | **Distress** | A garbled burst from Tessick-3 control. Banner: *DISTRESS — TESSICK-3 RELAY*. A 4 s "burn" plays with forced boost, streaking stars and a *7 MINUTES → 0* counter, then you drop in near the relay | — | Scripted |
| 3 | **Dogfight** | Three pirate fighters break off the relay to intercept. Once the player has damaged fighter #2, it breaks left into Harren's arc and **Harren kills it** (as in the story) | Destroy the fighters | Two fighters down |
| 4 | **Runner** | The last fighter (smoking, below 50% hull) turns and runs for the jump point. "Don't let him warn the others." | Chase it down and kill it | Fighter destroyed, or it escapes (score penalty only, not a fail) |
| 5 | **Pursuit** | The cargo shuttle drops its clamps and burns for the jump point. A jump-spool countdown starts (45 s). New rule: **shoot the ENGINES, not the hull**. There are eleven people in there | Disable the shuttle's engines | Engines at 0 → surrender. Hull at 0 or the jump completes → **fail** |
| 6 | **Surrender** | The shuttle cuts its drive and hails: "We yield! Don't shoot!" A green beacon appears beside it. You fly in to hold position while Harren docks. Comms tell the eleven-people beat in two or three lines | Reach the beacon | Beacon reached |
| 7 | **Epilogue** | Results card (kills, rescued 11/11, relay integrity, time, grade). Then a second card: **FUTURE POSTING ASSIGNMENT … Lingering Systems. Vessel designation: Compost Hauler.** Buttons: **PLAY CHAPTER 1** and **RETRY** | — | Button |

**Fail states:**
- Player destroyed: "Engagement casualty, cause: hostile fire."
- Shuttle hull destroyed: "Eleven names the Principality will never learn." The screen is quiet, with no score screen jokes.
- Shuttle jumps out: "The shuttle vanished. Eleven more entries for the ledger."

Retry skips the briefing and uses the short practice, as in Chapter 1.

> **Change from the source (needs your call):** in the story the shuttle surrenders without a fight. Making it run for the jump point gives the second half a real goal and a new skill (aiming precisely at a moving subsystem). The alternative is to follow the book exactly and make the second half "protect the relay while Harren boards".

## 4. The Seagull and the coilgun

Deliberately stronger than the MK-IV:

| Stat | MK-IV (Ch. 1) | Seagull (Prologue) |
|---|---|---|
| Top speed / boost | 0.9 / 1.8 km/s | 1.1 / 2.1 km/s |
| Turn rate (yaw / pitch) | 1.5 / 1.25 rad/s | 1.9 / 1.6 rad/s |
| Shield / hull | 100 / 100 | 140 / 100 (frontier refit) |
| Gun | Laser, 1 dmg, 0.085 s, 6.5 km/s | **Coilgun**, 2 dmg, 0.13 s, 8 km/s, ~5 km range. Chunky orange-white slugs with a heavy *thunk* |
| Special (X / right-click / CARGO button) | Cargo mine | **MATCH SPEED**: holds your speed at the locked target's speed so chasing is easy. Press again to cancel |

**Seagull quirks** (flavour only, never unfair):
- **Coilgun warming (first 20 s):** the HUD shows *COILGUN WARMING — reticle 2° starboard*, and the crosshair sits visibly offset and slides back to true. Aim assist still works, so it looks like the story but costs the player nothing.
- The camera rattles slightly on the port side while boosting.
- The shield bar sometimes flashes amber for 0.3 s. The computer says "Indicator fault. Probably."

## 5. Enemies and allies

**Pirate fighter** (×3)
- 6 hp, so 3 coilgun hits.
- Reuses the drone AI with sloppier aim (twice the spread) and long bursts: "point at the nearest target and hold the trigger down".
- Targets whichever is nearer, the player or Harren.
- Looks mismatched: patched hull panels in different greys, and one engine trailing smoke.

**Cargo shuttle**
- Boxy freighter, about 60 m.
- Two hit zones:
  - **Engine block** (rear sphere, marked with an orange bracket): 24 hp. Below 50% it slows. At 0 it surrenders.
  - **Hull** (centre sphere): 30 hp. At 0 it breaks up, which is a fail.
- Aim assist locks **only onto the engine block**, so a player who fires near the engines hits them. Sloppy spraying hits the hull.
- A hull-integrity bar flashes red below 50%, and the computer warns: "Hull stress on the shuttle. There are people in there, Staples."
- Flies a spline toward the jump point at 0.6 km/s, slower than the Seagull, with gentle jinking.

**Harren** (wingman)
- Flies loose formation on the player when nothing is happening, then engages the nearest fighter the player isn't targeting.
- His shots do 50% damage so the player gets most of the kills. The scripted fighter-#2 kill is guaranteed.
- **Can't die** (his shields "hold"), so the mission can't soft-lock.
- A blue ally bracket on the HUD, and a green blip on the radar.

**Tessick-3 relay:** a set piece of dish arrays, power-cell racks and scorch marks. Stray pirate fire chips its integrity, which feeds the score but can't cause a fail.

## 6. HUD and guide

Reuse everything from Chapter 1, including the step-by-step guide prompt under the crosshair:

| Beat | Guide text |
|---|---|
| Dogfight | `1` Destroy the pirate fighters — **2 left** (red brackets) |
| Runner | `2` He's running! Chase him — 3.1 km · hold **SHIFT** / press **X** to match speed |
| Pursuit, far away | `3` Catch the shuttle — 4.4 km · jumps in **0:38** |
| Pursuit, in range | `4` Shoot the **ENGINES** (orange bracket) — not the hull! |
| Surrender | Fly to the green beacon |

- The mission-status bar at the top becomes **ENGINES ████ · HULL ████ · JUMP 0:38** during the pursuit.
- The objective line and the always-on controls legend work the same as in Chapter 1.

## 7. Comms script (draft)

| Speaker | Line |
|---|---|
| CALDWELL (briefing) | "Stay on his wing, follow his lead, don't do anything creative, and come back alive." |
| SEAGULL COMPUTER | "Sector Two patrol, hour three. Scanner returns: clean. Coffee: cold." |
| HARREN | "Same route as yesterday. Try to look surprised if anything happens." |
| TESSICK-3 (garbled) | "—raid in progress—three fighters—shuttle at the—cells—please—" |
| HARREN | "Seven minutes out. Close enough. Burn." |
| PIRATE | "Frontier patrol? In *this* century? Light 'em up." |
| STAPLES (first kill) | "One." |
| HARREN (scripted kill) | "He broke into my arc. Rude not to." |
| SEAGULL COMPUTER | "Bandit disengaging toward the jump point." |
| STAPLES | "Not today." |
| CALDWELL (via Kessler) | "Shuttle's running, Staples. Intel says they're carrying people. Engines only." |
| SEAGULL COMPUTER (hull warning) | "Shuttle hull stress rising. There are people in there." |
| SHUTTLE | "We yield! We yield — cutting drive, don't shoot!" |
| HARREN (docked) | "…Staples. You'll want to see this. Eleven of them. In a freight hold." |
| STAPLES | "Get them home." |
| CALDWELL (debrief) | "Filed. Good flying, Staples. Don't let it go to your head. Nothing goes anywhere out here." |

Voice audio is optional. If you record Caldwell and Harren the way you did Redford, they drop in through the existing `audio.radio()` path. Otherwise the game uses text comms with radio beeps.

## 8. Scoring

| Item | Points |
|---|---|
| Pirate fighter | 300 each (the runner: +500 bonus) |
| Engines disabled | 2000 |
| Workers rescued | 11 × 100 |
| Relay integrity | 10 per % |
| Player hull | 10 per % |
| Time bonus | par 150 s, 10 per second under par |

Grades S/A/B/C/D are calibrated against a test bot, as in Chapter 1. The best score is saved per mission (`tbs-best-prologue`).

## 9. Code changes

Chapter 1 must play exactly as it does today.

1. **Mission registry.** `mission.ts` is Chapter-1-specific now. It becomes a thin dispatcher over `src/missions/chapter1.ts` (the current script, moved) and `src/missions/prologue.ts`. Each mission implements `{ id, title, begin(short), update(dt), handleEvents(), controlsActive(), desiredTimeScale(), results() }`.
2. **Phases.** Keep the shared FSM (`splash | briefing | practice | combat | outro | complete | failed`) and add a per-mission `G.step` for the prologue's beats. Document the transitions in `game.ts`.
3. **Ships.** Give each ship its own stat block (`SHIPS.mk4`, `SHIPS.seagull`) instead of the single `TUNING.player`. Build both player models once and toggle which is visible. Only the MK-IV has cargo.
4. **Entities.** Add `G.fighters`, `G.wingman`, `G.shuttle` and `G.relay` to `G`. Fighters reuse the drone steering code, generalised with parameters. `clearEnemies()` and `restart()` reset the new state.
5. **World.** `createWorld()` plus `G.world.setTheme("lingering" | "frontier")` (as built). The Tessick theme gets a cold blue-white sun, a brown-dwarf planet, sparser rock and ice, and distant mining-outpost landmarks. It's built lazily, only when the prologue is picked.
6. **Models.** New procedural models (Seagull, pirate fighter, cargo shuttle, relay, Kessler) go in `src/models-frontier.ts`, because `models.ts` is already at about 570 lines. All face −Z, and all textures are drawn on canvases.
7. **Splash / mission select.** Two cards: **PROLOGUE — TESSICK-3** and **CHAPTER 1 — LINGERING SYSTEMS**. The last one played is remembered. Chapter 1's results screen offers "Play the Prologue"; the Prologue's epilogue offers "Play Chapter 1".
8. **Input.** X / right-click / the CARGO button does the ship's *special*: cargo on the MK-IV, match speed on the Seagull. The touch button's label follows the ship.
9. **Budget.** No new dependencies. Expect about 1,200–1,500 lines of TypeScript and roughly +25 KB gzipped.

## 10. Mobile

Same touch layout. The CARGO button becomes **MATCH** in the prologue. The pursuit is designed around match-speed, so phone players never need fine throttle control. The guide prompt, the always-on legend (desktop only) and the fullscreen/landscape behaviour work as in Chapter 1.

## 11. Build milestones

| # | Milestone | Playable result |
|---|---|---|
| M1 | Mission registry and mission-select splash | Chapter 1 unchanged; the Prologue card starts an empty patrol |
| M2 | Seagull, coilgun, match speed, Tessick world, patrol tutorial | Fly and shoot buoys in the new place |
| M3 | Pirate fighters, Harren, dogfight and runner | Full first half |
| M4 | Shuttle pursuit, engine/hull zones, surrender, beacon | Full mission, placeholder text |
| M5 | Comms script, briefing/epilogue cards, results, guide, mobile pass, bot tuning | Ready to ship |

## 12. Decisions taken (Sept 2026)

- **Mission select:** story order with free choice. The splash shows both missions, with the Prologue marked START HERE until it's completed. Winning the Prologue offers NEXT: CHAPTER 1, and nothing is locked.
- **Shuttle:** it runs for the jump point (recommended option). Engines → surrender, hull → fail, timer → fail.
- **Title/rank:** "Prologue: Tessick-3", Patrol Pilot Staples.
- **Voice:** text comms only for now.
- **The woman in the shuttle bay:** one comms line at the end.
- **Posting notice:** shown on the results panel.
- **Coilgun warm-up quirk:** not built (flavour only; could be added later).

## 13. Original questions

1. **Shuttle:** should it run (recommended) or surrender without a fight as in the book?
2. **Rank and title:** in the story, the Tessick-3 fight happens a few weeks into the posting, when Wyatt is a *Patrol Pilot*. Is "Prologue: Tessick-3" with "Patrol Pilot Staples" right, or do you want an episode-style title such as "Academy Days: The Frontier"?
3. **Which mission shows first** on the splash: the Prologue (story order) or Chapter 1 (the one people already know)?
4. **The woman in the shuttle bay:** include her as the final comms beat (text only), or leave that moment to the books?
5. **Voice lines:** will you record Caldwell and Harren, or is text-only fine?
6. **Epilogue teaser:** show the "Compost Hauler" posting notice (Part 4) before the results, or after them?
