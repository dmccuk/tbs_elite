// All game audio runs through ONE shared AudioContext (browsers cap how many
// can exist). It is created on the first user gesture, as browsers require.
// Sound effects are synthesised; the only audio files are the music and the
// recorded voice lines (public/voice/<id>.mp3, see docs/voice-lines.md).

type Ctx = AudioContext;

const MUTE_KEY = "tbs-muted";

// Mix levels. Sound effects (guns, engines, explosions, alarms) all go through
// the sfx bus; music ducks to MUSIC_DUCKED while a voice line plays.
const SFX_VOLUME = 0.88;
const MUSIC_VOLUME = 0.256;
const MUSIC_DUCKED = 0.096;
const VOICE_VOLUME = 1.6;   // voices sit clearly above guns, engines and music
const SFX_DUCKED = 0.55;    // the sfx bus drops to this share while someone talks

/** How a recorded line is processed, by who is speaking and from where. */
export type VoiceFx = "radio" | "radioFar" | "interference" | "pirate" | "computer" | "cockpit" | "pa";

interface FxSpec {
  hp: number;        // band-pass: high-pass Hz…
  lp: number;        // …and low-pass Hz
  drive: number;     // soft-clip distortion (1 = clean)
  static: number;    // hiss bed under the line
  dropouts: number;  // chance per 0.1 s of the signal cutting out
  comb: boolean;     // short metallic comb filter (the ship computers)
  squelch: boolean;  // radio clicks at the start and end
  /** A long echo [delay s, feedback] (the station PA in a big hard room). */
  echo?: [number, number];
}

const VOICE_FX: Record<VoiceFx, FxSpec> = {
  radio:        { hp: 320, lp: 3400, drive: 1.8, static: 0,     dropouts: 0,    comb: false, squelch: true },  // squad radio (Harren)
  radioFar:     { hp: 380, lp: 3000, drive: 2.2, static: 0.035, dropouts: 0.04, comb: false, squelch: true },  // long range (Caldwell via the Kessler, Kalon)
  interference: { hp: 450, lp: 2600, drive: 3.0, static: 0.09,  dropouts: 0.3,  comb: false, squelch: true },  // a relay under attack
  pirate:       { hp: 550, lp: 2300, drive: 4.0, static: 0.05,  dropouts: 0.08, comb: false, squelch: true },  // cheap, dirty pirate kit
  computer:     { hp: 180, lp: 6500, drive: 1.2, static: 0,     dropouts: 0,    comb: true,  squelch: false }, // ship computer
  cockpit:      { hp: 90,  lp: 9000, drive: 1.0, static: 0,     dropouts: 0,    comb: false, squelch: false }, // Staples in his own cockpit
  pa:           { hp: 400, lp: 3800, drive: 1.6, static: 0,     dropouts: 0,    comb: false, squelch: false, echo: [0.16, 0.38] }, // station tannoy
};

interface VoiceLine { el: HTMLAudioElement; mod: GainNode; spec: FxSpec; missing: boolean; }

class AudioSystem {
  private ctx: Ctx | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicGain!: GainNode;
  private voiceBus!: GainNode;
  private noise!: AudioBuffer;
  private music: HTMLAudioElement | null = null;
  private lines = new Map<string, VoiceLine>();
  private voiceQueue: { src: string; fx: VoiceFx; at: number }[] = [];
  private current: VoiceLine | null = null;
  private staticNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private engine: { gain: GainNode; filter: BiquadFilterNode; osc: OscillatorNode; hiss: GainNode; hissFilter: BiquadFilterNode } | null = null;
  private lastLaser = 0;
  private musicCut = false;
  muted = false;

  constructor() {
    try { this.muted = localStorage.getItem(MUTE_KEY) === "1"; } catch { /* storage blocked */ }
  }

  get ready() { return this.ctx !== null; }

  /** Call from a user gesture (keydown/click/touch). Safe to call repeatedly. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      if (this.music?.paused) this.music.play().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = SFX_VOLUME;
    this.sfx.connect(this.master);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = MUSIC_VOLUME;
    this.musicGain.connect(this.master);
    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = VOICE_VOLUME;
    this.voiceBus.connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.music = new Audio("/tbs_elite.mp3");
    this.music.loop = true;
    try {
      ctx.createMediaElementSource(this.music).connect(this.musicGain);
    } catch { /* falls back to element volume */ }
    this.music.play().catch(() => { /* autoplay refused; retried on next gesture */ });

    this.startEngine();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try { localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0"); } catch { /* ignore */ }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  setPaused(paused: boolean) {
    if (!this.ctx) return;
    if (paused) {
      void this.ctx.suspend();
      this.music?.pause();
      this.current?.el.pause();
    } else {
      void this.ctx.resume();
      this.music?.play().catch(() => {});
      this.current?.el.play().catch(() => {});
    }
  }

  // --- Building blocks -----------------------------------------------------

  private env(gain: GainNode, t: number, peak: number, attack: number, decay: number) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this.env(g, t, vol, 0.005, dur);
    osc.connect(g).connect(this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, q = 1, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.004, dur);
    src.connect(filter).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  // --- Game sounds ---------------------------------------------------------

  laser() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastLaser < 0.05) return;
    this.lastLaser = now;
    const f = 1300 + Math.random() * 200;
    this.tone("square", f, 260, 0.08, 0.035);
    this.tone("sine", f * 0.5, 120, 0.06, 0.05);
    this.tone("sawtooth", 240, 70, 0.07, 0.03); // low thump so the guns feel heavier
    this.noiseBurst(0.05, 0.04, "bandpass", 2600, 900, 1.2);
  }

  /** The Seagull's uprated coilgun: a heavy magnetic thunk rather than a zap. */
  coilgun() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastLaser < 0.05) return;
    this.lastLaser = now;
    this.tone("sine", 190 + Math.random() * 20, 45, 0.14, 0.16);
    this.tone("square", 900, 180, 0.05, 0.03);
    this.noiseBurst(0.09, 0.1, "lowpass", 2200, 300, 0.8);
  }

  /** Seeker acquiring: short chirps that rise in pitch as the lock builds (0–1). */
  lockChirp(progress: number) {
    this.tone("square", 900 + progress * 500, 900 + progress * 500, 0.035, 0.035);
  }

  /** Seeker locked: a clean, higher two-note tone. */
  lockTone() {
    this.tone("sine", 1560, 1560, 0.07, 0.06);
    this.tone("sine", 1860, 1860, 0.07, 0.05, 0.08);
  }

  /** Missile drops off the rail: a heavy clunk… */
  missileRelease() {
    this.tone("sawtooth", 150, 55, 0.14, 0.18);
    this.noiseBurst(0.12, 0.12, "lowpass", 900, 200, 1);
  }

  /** …then the motor lights with a rising roar. */
  missileIgnite(vol = 1) {
    this.noiseBurst(0.9, 0.22 * vol, "bandpass", 400, 3200, 1.6);
    this.tone("sawtooth", 90, 260, 0.5, 0.05 * vol);
  }

  enemyShot(vol = 0.5) {
    this.tone("sawtooth", 700, 180, 0.12, 0.03 * vol);
  }

  explosion(size: number, vol = 1) {
    const v = Math.min(1, vol);
    if (v < 0.02) return;
    const dur = 0.4 + Math.min(size, 1.5) * 1.2;
    this.noiseBurst(dur, 0.5 * v, "lowpass", 2400, 90, 0.7);
    this.tone("sine", 110, 32, dur * 0.9, 0.6 * v);
  }

  bigBoom() {
    this.noiseBurst(3.2, 0.8, "lowpass", 3000, 40, 0.5);
    this.tone("sine", 70, 22, 3, 0.9);
    this.tone("triangle", 140, 30, 1.2, 0.3);
    this.noiseBurst(0.35, 0.4, "highpass", 4000, 800, 0.5);
  }

  hullHit() {
    this.noiseBurst(0.25, 0.5, "lowpass", 1400, 120, 1);
    this.tone("sine", 90, 40, 0.25, 0.5);
  }

  shieldHit() {
    this.tone("sine", 950, 520, 0.18, 0.12);
    this.noiseBurst(0.15, 0.12, "bandpass", 3200, 1600, 3);
  }

  missileLaunch(vol = 1) {
    this.noiseBurst(0.7, 0.18 * vol, "bandpass", 500, 2600, 2);
  }

  mineLaunch() {
    this.tone("sawtooth", 180, 60, 0.18, 0.2);      // clamp release clunk
    this.noiseBurst(0.5, 0.25, "bandpass", 300, 1400, 1.5, 0.05);
    this.tone("sine", 200, 800, 0.3, 0.15, 0.05);   // the original whoosh
  }

  detonateClick() {
    this.tone("square", 2000, 1800, 0.05, 0.08);
    this.tone("square", 2600, 2400, 0.05, 0.08, 0.07);
  }

  warp() {
    this.tone("sine", 120, 1800, 0.9, 0.25);
    this.noiseBurst(1.0, 0.3, "bandpass", 400, 5000, 1.2);
    this.tone("sine", 60, 30, 1.2, 0.5, 0.6);
  }

  lock() {
    this.tone("square", 1760, 1760, 0.05, 0.05);
    this.tone("square", 1760, 1760, 0.05, 0.05, 0.08);
  }

  alarm() {
    this.tone("square", 880, 880, 0.12, 0.06);
    this.tone("square", 660, 660, 0.12, 0.06, 0.15);
  }

  /** The station-wide emergency klaxon: one whoop (call it every ~1.1 s). */
  klaxon() {
    this.tone("sawtooth", 440, 780, 0.55, 0.16);
    this.tone("square", 220, 390, 0.55, 0.05);
  }

  /** Every display in the chamber dying at once. */
  powerDown() {
    this.tone("sine", 520, 38, 0.9, 0.35);
    this.tone("triangle", 180, 30, 1.1, 0.25, 0.05);
    this.noiseBurst(0.7, 0.25, "lowpass", 900, 120, 1);
  }

  /** The simulation dissolving into static. */
  simStatic() {
    this.noiseBurst(1.3, 0.3, "bandpass", 3200, 900, 0.6);
  }

  /** Engines cut to nothing (going cold). */
  engineCut() {
    this.tone("sine", 240, 60, 0.35, 0.18);
  }

  /** A boot on deck plating. */
  footstep() {
    this.noiseBurst(0.09, 0.05, "bandpass", 260, 140, 1.2);
    this.tone("sine", 90, 60, 0.07, 0.03);
  }

  /** An empty magazine: the trigger just clicks. */
  dryFire() {
    this.tone("square", 2400, 1800, 0.02, 0.05);
  }

  /** Kill the music outright (the klaxon) or bring it back. */
  cutMusic(cut: boolean) {
    this.musicCut = cut;
    this.duck(this.current !== null);
  }

  beep(high = false) {
    this.tone("sine", high ? 1320 : 990, high ? 1320 : 990, 0.08, 0.08);
  }

  dodge() {
    this.noiseBurst(0.35, 0.2, "bandpass", 800, 2400, 1);
  }

  reload() {
    this.tone("triangle", 400, 600, 0.1, 0.12);
    this.tone("triangle", 600, 900, 0.1, 0.12, 0.1);
  }

  // --- Voice lines ------------------------------------------------------------
  // Lines queue up rather than talking over each other, and ones that waited
  // too long are dropped. A line whose file doesn't exist is skipped silently
  // (the comms text still shows), so recordings can be added a few at a time.

  /** Queue a recorded line: public/voice/<id>.mp3, processed as `fx`. */
  voice(id: string, fx: VoiceFx) {
    this.enqueue(`/voice/${id}.mp3`, fx);
  }

  /** Queue a radio clip by path (Chapter 1's Redford cues). */
  radio(file: string) {
    this.enqueue(file, "radio");
  }

  stopVoice() {
    this.voiceQueue = [];
    if (this.current) {
      this.current.el.pause();
      this.current = null;
    }
    this.stopStatic();
    this.musicCut = false; // a fresh mission gets its music back
    this.duck(false);
  }

  private enqueue(src: string, fx: VoiceFx) {
    const ctx = this.ctx;
    if (!ctx || this.lines.get(src)?.missing) return;
    this.voiceQueue.push({ src, fx, at: ctx.currentTime });
    if (!this.current) this.playNext();
  }

  private playNext() {
    const ctx = this.ctx!;
    // A line that waited more than a few seconds has missed its moment.
    while (this.voiceQueue.length && ctx.currentTime - this.voiceQueue[0].at > 8) this.voiceQueue.shift();
    const next = this.voiceQueue.shift();
    if (!next) { this.duck(false); return; }
    const line = this.lineFor(next.src, next.fx);
    if (line.missing) { this.playNext(); return; }
    this.current = line;
    line.el.currentTime = 0;
    this.duck(true);
    if (line.spec.squelch) this.noiseBurst(0.15, 0.12, "bandpass", 2000, 2600, 2);
    else if (line.spec.comb) this.tone("sine", 1320, 1320, 0.07, 0.05);
    this.startStatic(line.spec);
    this.scheduleDropouts(line);
    line.el.play().catch(() => this.finish(line));
  }

  private finish(line: VoiceLine) {
    if (this.current !== line) return;
    this.current = null;
    this.stopStatic();
    if (line.spec.squelch) this.noiseBurst(0.12, 0.1, "bandpass", 2500, 1800, 2);
    this.playNext();
  }

  /** Build (once per file) the element and its effect chain. */
  private lineFor(src: string, fx: VoiceFx): VoiceLine {
    const known = this.lines.get(src);
    if (known) return known;
    const ctx = this.ctx!;
    const spec = VOICE_FX[fx];
    const el = new Audio(src);
    el.preload = "auto";
    const mod = ctx.createGain(); // dropouts are automated on this
    const line: VoiceLine = { el, mod, spec, missing: false };
    try {
      const source = ctx.createMediaElementSource(el);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = spec.hp;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = spec.lp;
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      const norm = Math.tanh(spec.drive);
      for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 128) - 1) * spec.drive) / norm;
      shaper.curve = curve;
      source.connect(hp).connect(lp).connect(shaper).connect(mod);
      if (spec.comb) {
        const delay = ctx.createDelay(0.05);
        delay.delayTime.value = 0.009;
        const feedback = ctx.createGain();
        feedback.gain.value = 0.45;
        shaper.connect(delay);
        delay.connect(feedback).connect(delay);
        delay.connect(mod);
      }
      if (spec.echo) {
        const delay = ctx.createDelay(1);
        delay.delayTime.value = spec.echo[0];
        const feedback = ctx.createGain();
        feedback.gain.value = spec.echo[1];
        shaper.connect(delay);
        delay.connect(feedback).connect(delay);
        delay.connect(mod);
      }
      mod.connect(this.voiceBus);
    } catch { /* play unprocessed */ }
    el.addEventListener("ended", () => this.finish(line));
    el.addEventListener("error", () => {
      line.missing = true; // not recorded yet: the text alone will do
      this.finish(line);
    });
    this.lines.set(src, line);
    return line;
  }

  /** Music and effects dip while someone is talking. */
  private duck(on: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(this.musicCut ? 0 : on ? MUSIC_DUCKED : MUSIC_VOLUME, t, this.musicCut ? 0.05 : on ? 0.15 : 0.4);
    this.sfx.gain.setTargetAtTime(on ? SFX_VOLUME * SFX_DUCKED : SFX_VOLUME, t, on ? 0.15 : 0.4);
  }

  /** A hiss bed under long-range and pirate transmissions. */
  private startStatic(spec: FxSpec) {
    this.stopStatic();
    if (spec.static <= 0) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1900;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = spec.static;
    src.connect(filter).connect(gain).connect(this.voiceBus);
    src.start(0, Math.random() * 1.5);
    this.staticNode = { src, gain };
  }

  private stopStatic() {
    if (!this.staticNode) return;
    try { this.staticNode.src.stop(); } catch { /* already stopped */ }
    this.staticNode = null;
  }

  /** Random signal dropouts (with a crackle of static) across the line. */
  private scheduleDropouts(line: VoiceLine) {
    const ctx = this.ctx!;
    const g = line.mod.gain;
    const t0 = ctx.currentTime;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(1, t0);
    if (line.spec.dropouts <= 0) return;
    const dur = Number.isFinite(line.el.duration) && line.el.duration > 0 ? line.el.duration : 4;
    for (let t = 0.25; t < dur - 0.1; t += 0.1) {
      if (Math.random() >= line.spec.dropouts) continue;
      const len = 0.04 + Math.random() * 0.1;
      g.setValueAtTime(0.1, t0 + t);
      g.setValueAtTime(1, t0 + t + len);
      const st = this.staticNode?.gain.gain;
      if (st) {
        st.setValueAtTime(line.spec.static * 4, t0 + t);
        st.setValueAtTime(line.spec.static, t0 + t + len);
      }
    }
  }

  private startEngine() {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 48;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 180;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(this.sfx);
    osc.start();

    const hissSrc = ctx.createBufferSource();
    hissSrc.buffer = this.noise;
    hissSrc.loop = true;
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = "bandpass";
    hissFilter.frequency.value = 600;
    hissFilter.Q.value = 0.8;
    const hiss = ctx.createGain();
    hiss.gain.value = 0;
    hissSrc.connect(hissFilter).connect(hiss).connect(this.sfx);
    hissSrc.start();
    this.engine = { gain, filter, osc, hiss, hissFilter };
  }

  /** speed01: 0–1 of max speed; boost: whether the afterburner is lit. */
  setEngine(speed01: number, boost: boolean, active: boolean) {
    const e = this.engine;
    const ctx = this.ctx;
    if (!e || !ctx) return;
    const t = ctx.currentTime;
    const on = active ? 1 : 0;
    e.gain.gain.setTargetAtTime((0.05 + speed01 * 0.05) * on, t, 0.1);
    e.filter.frequency.setTargetAtTime(140 + speed01 * 380 + (boost ? 500 : 0), t, 0.1);
    e.osc.frequency.setTargetAtTime(44 + speed01 * 22 + (boost ? 18 : 0), t, 0.15);
    e.hiss.gain.setTargetAtTime((0.015 + speed01 * 0.02 + (boost ? 0.07 : 0)) * on, t, 0.1);
    e.hissFilter.frequency.setTargetAtTime(500 + speed01 * 700 + (boost ? 1200 : 0), t, 0.1);
  }
}

export const audio = new AudioSystem();
