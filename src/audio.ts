// All game audio runs through ONE shared AudioContext (browsers cap how many
// can exist). It is created on the first user gesture, as browsers require.
// Sound effects are synthesised, so the only audio files are the music and
// Commander Kalon's radio lines.

type Ctx = AudioContext;

const MUTE_KEY = "tbs-muted";

class AudioSystem {
  private ctx: Ctx | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicGain!: GainNode;
  private noise!: AudioBuffer;
  private music: HTMLAudioElement | null = null;
  private voices = new Map<string, HTMLAudioElement>();
  private currentVoice: HTMLAudioElement | null = null;
  private engine: { gain: GainNode; filter: BiquadFilterNode; osc: OscillatorNode; hiss: GainNode; hissFilter: BiquadFilterNode } | null = null;
  private lastLaser = 0;
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
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.master);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.32;
    this.musicGain.connect(this.master);

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
      this.currentVoice?.pause();
    } else {
      void this.ctx.resume();
      this.music?.play().catch(() => {});
      this.currentVoice?.play().catch(() => {});
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

  /** Plays one of Commander Kalon's lines through a radio filter, ducking the music. */
  radio(file: string) {
    const ctx = this.ctx;
    if (!ctx) return;
    let el = this.voices.get(file);
    if (!el) {
      el = new Audio(file);
      el.volume = 1;
      try {
        const src = ctx.createMediaElementSource(el);
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 320;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 3200;
        const shaper = ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          const x = (i / 128) - 1;
          curve[i] = Math.tanh(x * 1.8);
        }
        shaper.curve = curve;
        const g = ctx.createGain();
        g.gain.value = 1.1;
        src.connect(hp).connect(lp).connect(shaper).connect(g).connect(this.master);
      } catch { /* play unfiltered */ }
      el.addEventListener("ended", () => {
        if (this.currentVoice === el) this.currentVoice = null;
        this.musicGain.gain.setTargetAtTime(0.32, ctx.currentTime, 0.4);
        this.noiseBurst(0.12, 0.1, "bandpass", 2500, 1800, 2);
      });
      this.voices.set(file, el);
    }
    this.currentVoice?.pause();
    this.currentVoice = el;
    el.currentTime = 0;
    this.musicGain.gain.setTargetAtTime(0.12, ctx.currentTime, 0.2);
    this.noiseBurst(0.15, 0.12, "bandpass", 2000, 2600, 2);
    el.play().catch(() => {});
  }

  stopVoice() {
    if (this.currentVoice) {
      this.currentVoice.pause();
      this.currentVoice = null;
      if (this.ctx) this.musicGain.gain.setTargetAtTime(0.32, this.ctx.currentTime, 0.3);
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
