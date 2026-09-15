# Voice lines: recording list

Every line of radio chatter in the game, grouped by mission and in the order you'll usually hear it. Record the ones you want. Any line without a recording stays text-only, so partial sets are fine.

## How to record

- **Format:** MP3, mono, 44.1 kHz. Aim for about −3 dB peaks.
- **Clean and dry:** no music, no reverb, no radio effect. The game adds the radio crackle, band-pass and distortion itself, and can use a different treatment per speaker (see *Treatment* below).
- **Silence:** leave about 0.2 s of silence at the start and end.
- **File names:** name each file exactly as in the **File** column and put it in `public/voice/`.
- **Timing:** most lines have to fit in about 2–4 seconds before the next line arrives. Punchy beats long.
- **Wording:** changes are fine. Tell me and I'll update the on-screen text to match.

**Treatment** (applied in-game):
- **radio**: band-pass plus crackle, like Redford's existing lines.
- **cockpit**: Staples in his own cockpit, dry with a light room tone.
- **computer**: a flat synthetic filter.
- **pirate**: a heavier, dirtier radio.

## Prologue: Tessick-3

| # | File | Speaker | Line | When | Treatment |
|---|---|---|---|---|---|
| 1 | `pro_caldwell_wing.mp3` | Lt Caldwell | Stay on his wing, follow his lead, don't do anything creative, and come back alive. | Patrol starts | radio |
| 2 | `pro_computer_patrol.mp3` | Seagull computer | Sector Two patrol, hour three. Scanner returns: clean. Coffee: cold. | Patrol, 3 s | computer |
| 3 | `pro_harren_same_route.mp3` | Harren | Same route as yesterday. Try to look surprised if anything happens. | Patrol, 7 s | radio |
| 4 | `pro_harren_again.mp3` | Harren | Again? Fine. Stay on my wing. | Patrol, on a retry | radio |
| 5 | `pro_staples_quirks.mp3` | Staples | Quirks logged. She rattles on the port side. Good to know. | Tutorial finished | cockpit |
| 6 | `pro_relay_distress.mp3` | Tessick-3 control | —raid in progress—three fighters—a shuttle at the dock—they're taking the cells—please— | Distress call | radio (broken up: record it choppy, I'll add dropouts) |
| 7 | `pro_harren_burn.mp3` | Harren | Seven minutes out. Close enough. Burn. | Distress call | radio |
| 8 | `pro_computer_on_station.mp3` | Seagull computer | On station. Three bandits on the relay. One cargo shuttle docked. | Arrive at the relay | computer |
| 9 | `pro_pirate_light_em_up.mp3` | Pirate | Frontier patrol? Out here? Light 'em up. | Dogfight starts | pirate |
| 10 | `pro_staples_one.mp3` | Staples | One. | Your first kill | cockpit |
| 11 | `pro_harren_arc.mp3` | Harren | He broke into my arc. Rude not to. | Harren's kill | radio |
| 12 | `pro_computer_disengaging.mp3` | Seagull computer | Last bandit disengaging toward the jump point. | The last pirate runs | computer |
| 13 | `pro_staples_not_today.mp3` | Staples | Not today. | Right after 12 | cockpit |
| 14 | `pro_harren_nice_shooting.mp3` | Harren | Nice shooting. Now the shuttle — it's moving! | You catch the runner | radio |
| 15 | `pro_harren_hes_gone.mp3` | Harren | He's gone. Forget him — the shuttle's moving! | The runner escapes | radio |
| 16 | `pro_caldwell_engines_only.mp3` | Lt Caldwell | Shuttle's running, Staples. Intel says they're carrying people. Engines only. | Pursuit starts | radio |
| 17 | `pro_computer_engine_hits.mp3` | Seagull computer | Engine hits confirmed. Keep it on the block. | First engine hit | computer |
| 18 | `pro_harren_slowing.mp3` | Harren | She's slowing. Keep at it. | Engines below half | radio |
| 19 | `pro_computer_hull_stress.mp3` | Seagull computer | Shuttle hull stress rising. There are people in there. | Shuttle hull hit | computer |
| 20 | `pro_harren_hull_failing.mp3` | Harren | Hull's failing! Engines, Staples — ENGINES! | Shuttle hull low | radio |
| 21 | `pro_shuttle_we_yield.mp3` | Shuttle pilot | We yield! We yield — drive's dead, don't shoot! | Engines disabled | pirate |
| 22 | `pro_harren_hold_position.mp3` | Harren | Hold position on her, Staples. I'll dock and take a look. | After the surrender | radio |
| 23 | `pro_harren_eleven.mp3` | Harren | …Staples. You'll want to see this. Eleven of them. In a freight hold. | Mission complete | radio |
| 24 | `pro_staples_get_them_home.mp3` | Staples | Get them home. | Right after 23 | cockpit |
| 25 | `pro_harren_people.mp3` | Harren | …Staples. There were people in there. | Fail: shuttle destroyed | radio |
| 26 | `pro_harren_ledger.mp3` | Harren | They're gone. Eleven more names for the ledger. | Fail: shuttle escaped | radio |
| 27 | `pro_computer_hull_critical.mp3` | Seagull computer | Hull integrity critical. Recommend not dying. | Your hull below 30% | computer |

The final beat ("A woman about your mother's age looks up at you. She says nothing. She doesn't need to.") is narration, so it stays text-only unless you want a narrator voice.

### Seagull computer: missile callouts (Prologue)

These are voice-only callouts, with no comms text; the HUD shows the lock. Keep them short and clipped, like a targeting computer. Each one is rate-limited, so they won't spam.

| # | File | Line | When |
|---|---|---|---|
| 28 | `pro_computer_missile_lock.mp3` | Missile lock. | The seeker locks a target |
| 29 | `pro_computer_missile_away.mp3` | Missile away. | You fire (missiles 1 and 2) |
| 30 | `pro_computer_last_missile.mp3` | Last missile. | You fire the third, one left |
| 31 | `pro_computer_missiles_depleted.mp3` | Missiles depleted. Coilgun only. | You fire the last one |
| 32 | `pro_computer_target_destroyed.mp3` | Target destroyed. | A missile kills a pirate |
| 33 | `pro_computer_lock_broken.mp3` | Lock broken. | The target slips out of the seeker |
| 34 | `pro_computer_no_lock.mp3` | No lock. | You fire before the lock completes |
| 35 | `pro_computer_no_lock_hostages.mp3` | Negative. A missile would breach that hull. There are people aboard. | You try to lock the shuttle |
| 36 | `pro_computer_missiles_reloaded.mp3` | Rails reloaded. Four missiles. | Free flight reloads your missiles |

### Kessler flight deck (Prologue landing practice and free-flight landings)

The Kessler's deck officer: a dry, unimpressed voice. Treatment: radio.

| # | File | Line | When |
|---|---|---|---|
| 37 | `pro_deck_cleared.mp3` | Seagull, Kessler deck. You're cleared to land. Bay's hot, mind the paint. | Landing practice starts |
| 38 | `pro_deck_too_fast.mp3` | Too fast, Seagull! Bleed it off or wave off! | Closing on the stern door above 350 m/s |
| 39 | `pro_deck_captured.mp3` | Mag-clamp field has you. Hands off the stick. | The arrestor field catches you |
| 40 | `pro_deck_landed.mp3` | Clamps engaged. Welcome home, Staples. | You land on the cradle |
| 41 | `pro_deck_overshoot.mp3` | …and straight out the front door. Somebody fetch a mop. | Too fast: you fly out of the bow |
| 42 | `pro_deck_scrape.mp3` | That's coming out of your pay. | You scrape the bay walls |
| 43 | `pro_deck_launch.mp3` | Catapult's charged. Go. | Launching after a free-flight landing |

## Cruise (the screensaver ride)

Wyatt and Harren fly a loop out of the Kessler and back, with a joyride in the middle (boost, a roll, a slalom round the rocks). The deck lines above play here too (cleared, captured, landed, launch). Lines are spaced out, several only play some laps, and the four musings rotate so they don't repeat back to back.

| # | File | Speaker | Line | When | Treatment |
|---|---|---|---|---|---|
| 1 | `cruise_staples_launch.mp3` | Staples | No pirates, no paperwork. Just me and the rocks. | Off the catapult (first ride, then now and then) | cockpit |
| 2 | `cruise_harren_launch.mp3` | Harren | Harren, on your wing. Try not to fall asleep, Staples. | Follows 1 | radio |
| 3 | `cruise_staples_view.mp3` | Staples | Say what you like about the Tessick-Varn. The view's free. | Out in the belt (musing) | cockpit |
| 4 | `cruise_staples_quiet.mp3` | Staples | Quiet out here. I could get used to quiet. | Out in the belt (musing) | cockpit |
| 5 | `cruise_staples_harren.mp3` | Staples | Harren's gone quiet. That's either peace or a prank. | Out in the belt (musing) | cockpit |
| 6 | `cruise_staples_flask.mp3` | Staples | Should have brought a flask. Rookie mistake. | Out in the belt (musing) | cockpit |
| 7 | `cruise_staples_lairy.mp3` | Staples | Nobody's watching. Let's see what she's got. | The joyride starts | cockpit |
| 8 | `cruise_harren_race.mp3` | Harren | Oh, it's like that, is it? Race you! | Follows 7 | radio |
| 9 | `cruise_staples_whoop.mp3` | Staples | Ha! Threaded it! | Through the first rocks, on the boost | cockpit |
| 10 | `cruise_computer_proximity.mp3` | Seagull computer | Proximity alert. Proximity alert. Rock. | Late in the slalom | computer |
| 11 | `cruise_staples_sensible.mp3` | Staples | Right. Sensible flying from here on. Nobody saw that. | The joyride ends | cockpit |
| 12 | `cruise_harren_show_off.mp3` | Harren | Show-off. I'm telling Caldwell. | Follows 11 | radio |
| 13 | `cruise_harren_home.mp3` | Harren | I'll go first. Last one down buys the coffee. | 9 km out, as he pulls ahead to land first | radio |
| 14 | `cruise_staples_home.mp3` | Staples | Kessler, Seagull. Coming home. | 7 km out (the deck answers with `pro_deck_cleared`) | cockpit |

## Chapter 1: Lingering Systems

**Already recorded (Redford, in `public/`):** `voice_redford_alert.mp3` (the ambush), `voice_redford_failed.mp3` (first missed container), `voice_redford_damaged.mp3` (corvette crippled), `voice_redford_complete.mp3` (victory).
- These play *alongside* the text lines, so the text and audio may say different things.
- If you re-record Kalon's lines below, I'll swap those four for the matching lines.

| # | File | Speaker | Line | When | Treatment |
|---|---|---|---|---|---|
| 1 | `c1_computer_waste_run.mp3` | MK-IV computer | Waste run 4471. Container secured. Nothing ever happens out here. | Practice starts | computer |
| 2 | `c1_computer_rewind.mp3` | MK-IV computer | Rewinding the tape. Same corvette, same bad day. Get ready. | Practice, on a retry | computer |
| 3 | `c1_staples_void.mp3` | Staples | Right. Now back to staring at the void for another eleven hours. | Tutorial finished | cockpit |
| 4 | `c1_computer_warp_signatures.mp3` | MK-IV computer | Warp signatures detected in the Lingering Systems! | Ambush | computer |
| 5 | `c1_kalon_mayday.mp3` | Cmdr Kalon | Mayday, mayday! This is the Royal Favor — a House Cayston corvette is on our tail! Anyone out there? | Ambush | radio |
| 6 | `c1_staples_bio_waste.mp3` | Staples | My guns won't scratch that thing… but a tonne of compacted bio-waste might. | Combat starts | cockpit |
| 7 | `c1_kalon_incoming_missiles.mp3` | Cmdr Kalon | Incoming missiles! Shoot them down before they reach us! | First missile volley | radio |
| 8 | `c1_computer_missile_lock.mp3` | MK-IV computer | Missile lock on US. Shoot it down or dodge-roll at the last second. | First missile at you | computer |
| 9 | `c1_computer_drones.mp3` | MK-IV computer | Corvette launching attack drones. They seem to want you specifically. | First drone wave | computer |
| 10 | `c1_staples_scratch_one.mp3` | Staples | Scratch one drone. | First drone kill | cockpit |
| 11 | `c1_computer_armour.mp3` | MK-IV computer | Corvette armour rating: excessive. Guns ineffective. Suggest the cargo. | You shoot the corvette | computer |
| 12 | `c1_computer_missed.mp3` | MK-IV computer | Detonation outside blast radius — missed. | Container blown too far away (the text also shows the distance) | computer |
| 13 | `c1_computer_shot_down.mp3` | MK-IV computer | Container shot down by point-defence. Detonate sooner! | Container shot down | computer |
| 14 | `c1_computer_lost.mp3` | MK-IV computer | Container lost. Launch it closer to the corvette. | Container lost | computer |
| 15 | `c1_computer_compacting.mp3` | MK-IV computer | Compactor squeezing out another. | Follows 12–14 while reloading | computer |
| 16 | `c1_computer_fresh_container.mp3` | MK-IV computer | Compactor has produced a fresh container. Lovely. | Container ready | computer |
| 17 | `c1_kalon_direct_hit.mp3` | Cmdr Kalon | Direct hit! Their shields are buckling — one more should do it! | First container hit | radio |
| 18 | `c1_hostile_garbage.mp3` | Hostile (corvette) | Is that… garbage? You'll pay for that, hauler. | After 17 | pirate |
| 19 | `c1_kalon_fifty_percent.mp3` | Cmdr Kalon | Hull at fifty percent! We can't take much more of this! | Yacht at 50% | radio |
| 20 | `c1_kalon_hull_critical.mp3` | Cmdr Kalon | Hull critical! Staples, whatever you're planning — do it NOW! | Yacht at 25% | radio |
| 21 | `c1_computer_link_lost.mp3` | MK-IV computer | Drone control link lost. Oh, look at them go. | Corvette crippled | computer |
| 22 | `c1_hostile_never_forgets.mp3` | Hostile (corvette) | This isn't over, Staples. House Cayston never forgets a face. Or a smell. | Corvette jumps away | pirate |
| 23 | `c1_kalon_resourceful.mp3` | Cmdr Kalon | Resourceful work, Warrant Officer Staples. You've saved our VIP with those… creative tactics of yours. | Victory | radio |
| 24 | `c1_kalon_join_us.mp3` | Cmdr Kalon | House Cayston has turned traitor. Join us, Staples — His Majesty will want to meet the pilot who throws garbage at warships. | Rendezvous | radio |
| 25 | `c1_hostile_big_mistake.mp3` | Hostile (corvette) | You just made a BIG mistake, garbage hauler. You're a traitor to House Cayston. | Fail: yacht destroyed | pirate |
| 26 | `c1_computer_hull_critical.mp3` | MK-IV computer | Hull integrity critical. Recommend not dying. | Your hull below 30% | computer |

**Unused with the current 2-hit setting** (only needed if the corvette goes back to 3 hits):
- `c1_kalon_breached.mp3` (Kalon): "Their hull's breached — they're venting plasma! One more should do it!"
- `c1_hostile_all_batteries.mp3` (Hostile): "All batteries! Kill that garbage scow NOW!"

## Totals

- **Prologue:** 27 lines. Harren 12, Seagull computer 6, Staples 4, Caldwell 2, Tessick-3 control 1, pirate 1, shuttle pilot 1.
- **Chapter 1:** 26 lines, plus 2 optional. MK-IV computer 13, Kalon 7, Staples 3, Hostile 3.
- **Cruise:** 14 new lines. Staples 9, Harren 4, Seagull computer 1 (plus the Kessler deck lines).
- **Voices needed:** Staples, Harren, Caldwell, Kalon, two ship computers (one voice with different filters works), a pirate or hostile voice (can double as the shuttle pilot), and Tessick-3 control.
