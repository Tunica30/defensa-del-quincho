// Sonidos sintetizados con WebAudio: sin archivos externos.
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.volume = 0.8;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp).connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 1.5);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  // Llamar desde un gesto del usuario (click / entrar a XR).
  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _out(pan) {
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(this.master);
      return p;
    }
    return this.master;
  }

  _env(g, now, attack, gain, dur) {
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  }

  _noise({ t = 0, dur = 0.2, type = 'lowpass', f0 = 2000, f1 = null, q = 0.8, gain = 0.5, attack = 0.002, pan = 0 }) {
    const ctx = this.ctx;
    const now = ctx.currentTime + t;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, now);
    if (f1) filt.frequency.exponentialRampToValueAtTime(f1, now + dur);
    const g = ctx.createGain();
    this._env(g, now, attack, gain, dur);
    src.connect(filt).connect(g).connect(this._out(pan));
    src.start(now, Math.random() * 0.5);
    src.stop(now + dur + 0.05);
  }

  _tone({ t = 0, dur = 0.15, type = 'sine', f0 = 440, f1 = null, gain = 0.3, attack = 0.004, pan = 0 }) {
    const ctx = this.ctx;
    const now = ctx.currentTime + t;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    if (f1) osc.frequency.exponentialRampToValueAtTime(f1, now + dur);
    const g = ctx.createGain();
    this._env(g, now, attack, gain, dur);
    osc.connect(g).connect(this._out(pan));
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  _ok() {
    return !!this.ctx;
  }

  shot(type = 'pistol') {
    if (!this._ok()) return;
    if (type === 'shotgun') {
      this._noise({ dur: 0.38, type: 'lowpass', f0: 3500, f1: 250, gain: 0.95 });
      this._tone({ dur: 0.26, f0: 95, f1: 30, gain: 0.95 });
      this._noise({ dur: 0.05, type: 'highpass', f0: 2500, gain: 0.35 });
      // "chk-chk" de la corredera
      this._noise({ t: 0.32, dur: 0.05, type: 'bandpass', f0: 2200, q: 3, gain: 0.3 });
      this._noise({ t: 0.42, dur: 0.05, type: 'bandpass', f0: 1600, q: 3, gain: 0.3 });
    } else if (type === 'rifle') {
      this._noise({ dur: 0.09, type: 'lowpass', f0: 6500, f1: 900, gain: 0.5 });
      this._tone({ dur: 0.07, f0: 210, f1: 60, gain: 0.55 });
      this._noise({ dur: 0.025, type: 'highpass', f0: 5000, gain: 0.2 });
    } else {
      this._noise({ dur: 0.16, type: 'lowpass', f0: 5000, f1: 500, gain: 0.7 });
      this._tone({ dur: 0.12, f0: 150, f1: 40, gain: 0.8 });
      this._noise({ dur: 0.035, type: 'highpass', f0: 4000, gain: 0.25 });
    }
  }

  explosion(radius = 1.5) {
    if (!this._ok()) return;
    const big = Math.min(1, radius / 3.5); // las granadas suenan más grandes que las balas explosivas
    this._noise({ dur: 0.5 + big * 0.6, type: 'lowpass', f0: 1400, f1: 60, gain: 0.7 + big * 0.3 });
    this._tone({ dur: 0.45 + big * 0.5, f0: 75 - big * 20, f1: 22, gain: 0.6 + big * 0.3 });
    if (big > 0.6) this._noise({ t: 0.05, dur: 1.2, type: 'bandpass', f0: 500, f1: 120, q: 0.7, gain: 0.25 }); // retumbo
  }

  // Silbido del meteorito cayendo.
  meteorIncoming() {
    if (!this._ok()) return;
    this._tone({ dur: 2.6, type: 'sine', f0: 1800, f1: 220, gain: 0.18, attack: 0.3 });
    this._noise({ dur: 2.6, type: 'bandpass', f0: 3000, f1: 300, q: 2, gain: 0.25, attack: 0.5 });
  }

  meteorImpact() {
    if (!this._ok()) return;
    this._noise({ dur: 2.2, type: 'lowpass', f0: 1200, f1: 40, gain: 1 });
    this._tone({ dur: 1.6, f0: 60, f1: 20, gain: 1 });
    this._noise({ t: 0.1, dur: 2.5, type: 'bandpass', f0: 300, f1: 60, q: 0.6, gain: 0.5 });
  }

  // Ametralladora: disparo corto y seco.
  turretShot() {
    if (!this._ok()) return;
    this._noise({ dur: 0.07, type: 'lowpass', f0: 5000, f1: 700, gain: 0.4 });
    this._tone({ dur: 0.06, f0: 170, f1: 55, gain: 0.45 });
  }

  // Zumbido del cañón girando (level 0 → 1).
  turretSpin(level, firing) {
    if (!this._ok()) return;
    const ctx = this.ctx;
    if (level <= 0.01) {
      if (this.spinNode) {
        const { g, osc } = this.spinNode;
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
        osc.stop(ctx.currentTime + 0.3);
        this.spinNode = null;
      }
      return;
    }
    if (!this.spinNode) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      osc.connect(filt).connect(g).connect(this.master);
      osc.start();
      this.spinNode = { osc, g };
    }
    const now = ctx.currentTime;
    this.spinNode.osc.frequency.setTargetAtTime(60 + level * 260, now, 0.05);
    this.spinNode.g.gain.setTargetAtTime(0.03 + level * (firing ? 0.07 : 0.05), now, 0.05);
  }

  overheat() {
    if (!this._ok()) return;
    this._noise({ dur: 1.4, type: 'highpass', f0: 2500, f1: 1200, gain: 0.35 });
    this._tone({ dur: 0.3, type: 'square', f0: 300, f1: 120, gain: 0.15 });
  }

  mount() {
    if (!this._ok()) return;
    this._noise({ dur: 0.12, type: 'bandpass', f0: 900, q: 2, gain: 0.4 });
    this._tone({ t: 0.08, dur: 0.15, type: 'triangle', f0: 220, f1: 330, gain: 0.2 });
  }

  pop() {
    if (!this._ok()) return;
    this._noise({ dur: 0.18, type: 'lowpass', f0: 2500, f1: 200, gain: 0.45 });
    this._tone({ dur: 0.12, f0: 140, f1: 50, gain: 0.35 });
  }

  pin() {
    if (!this._ok()) return;
    this._tone({ dur: 0.04, type: 'square', f0: 2600, gain: 0.08 });
    this._noise({ t: 0.03, dur: 0.06, type: 'highpass', f0: 4000, gain: 0.2 });
  }

  throwWhoosh(speed = 10) {
    if (!this._ok()) return;
    const k = Math.min(1, speed / 18);
    this._noise({ dur: 0.25, type: 'bandpass', f0: 600 + 800 * k, f1: 300, q: 1.2, gain: 0.15 + 0.2 * k });
  }

  bounce() {
    if (!this._ok()) return;
    this._tone({ dur: 0.06, type: 'triangle', f0: 900 + Math.random() * 300, f1: 500, gain: 0.12 });
  }

  iceBlast() {
    if (!this._ok()) return;
    this._noise({ dur: 0.5, type: 'highpass', f0: 3000, f1: 1200, gain: 0.5 });
    [2093, 2637, 3136, 2349].forEach((f, i) => this._tone({ t: i * 0.04, dur: 0.5, type: 'sine', f0: f, gain: 0.1 }));
    this._tone({ dur: 0.4, f0: 120, f1: 50, gain: 0.4 });
  }

  // Zumbido continuo del láser.
  laserStart() {
    if (!this._ok() || this.laser) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.18, now + 0.05);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 2400;
    const a = ctx.createOscillator();
    a.type = 'sawtooth';
    a.frequency.value = 180;
    const b = ctx.createOscillator();
    b.type = 'square';
    b.frequency.value = 362;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 24;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 30;
    lfo.connect(lfoGain).connect(a.frequency);
    a.connect(filt);
    b.connect(filt);
    filt.connect(g).connect(this.master);
    a.start(now);
    b.start(now);
    lfo.start(now);
    this.laser = { g, nodes: [a, b, lfo] };
    this._tone({ dur: 0.12, type: 'sine', f0: 1800, f1: 600, gain: 0.15 });
  }

  laserStop() {
    if (!this.laser) return;
    const { g, nodes } = this.laser;
    const now = this.ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    for (const n of nodes) n.stop(now + 0.1);
    this.laser = null;
  }

  hit(head = false) {
    if (!this._ok()) return;
    if (head) {
      // "Ding" metálico bien distinto para el tiro a la cabeza.
      this._tone({ dur: 0.25, type: 'sine', f0: 1760, gain: 0.22, attack: 0.002 });
      this._tone({ dur: 0.18, type: 'triangle', f0: 2637, gain: 0.12, attack: 0.002 });
      this._noise({ dur: 0.05, type: 'highpass', f0: 5000, gain: 0.2 });
    } else {
      this._tone({ dur: 0.05, type: 'square', f0: 900, f1: 600, gain: 0.1 });
    }
  }

  buy() {
    if (!this._ok()) return;
    [1319, 1760].forEach((f, i) => this._tone({ t: i * 0.07, dur: 0.12, type: 'triangle', f0: f, gain: 0.2 }));
  }

  click() {
    if (!this._ok()) return;
    this._tone({ dur: 0.03, type: 'square', f0: 1400, gain: 0.06 });
  }

  boss() {
    if (!this._ok()) return;
    this._tone({ dur: 1.2, type: 'sawtooth', f0: 55, f1: 40, gain: 0.4 });
    this._tone({ t: 0.1, dur: 1.0, type: 'square', f0: 82, f1: 60, gain: 0.15 });
    this._noise({ dur: 0.8, type: 'lowpass', f0: 300, gain: 0.4 });
  }

  kill() {
    if (!this._ok()) return;
    this._noise({ dur: 0.28, type: 'bandpass', f0: 1200, f1: 150, q: 1.5, gain: 0.45 });
    this._tone({ dur: 0.25, type: 'triangle', f0: 300, f1: 60, gain: 0.25 });
  }

  baseHit() {
    if (!this._ok()) return;
    this._tone({ dur: 0.45, type: 'sawtooth', f0: 110, f1: 35, gain: 0.45 });
    this._noise({ dur: 0.35, type: 'lowpass', f0: 400, f1: 100, gain: 0.6 });
  }

  empty() {
    if (!this._ok()) return;
    this._tone({ dur: 0.02, type: 'square', f0: 2200, gain: 0.08 });
  }

  reload() {
    if (!this._ok()) return;
    this._noise({ dur: 0.04, type: 'bandpass', f0: 3000, q: 3, gain: 0.3 });
    this._tone({ t: 0.06, dur: 0.03, type: 'square', f0: 900, gain: 0.06 });
  }

  reloadDone() {
    if (!this._ok()) return;
    this._noise({ dur: 0.05, type: 'bandpass', f0: 2000, q: 3, gain: 0.35 });
    this._tone({ t: 0.05, dur: 0.04, type: 'square', f0: 1200, gain: 0.06 });
  }

  grab() {
    if (!this._ok()) return;
    this._tone({ dur: 0.07, f0: 400, f1: 800, gain: 0.2 });
  }

  release() {
    if (!this._ok()) return;
    this._tone({ dur: 0.07, f0: 800, f1: 400, gain: 0.15 });
  }

  confirm() {
    if (!this._ok()) return;
    this._tone({ dur: 0.07, f0: 660, gain: 0.2 });
    this._tone({ t: 0.07, dur: 0.1, f0: 990, gain: 0.2 });
  }

  undo() {
    if (!this._ok()) return;
    this._tone({ dur: 0.12, f0: 600, f1: 380, gain: 0.18 });
  }

  denied() {
    if (!this._ok()) return;
    this._tone({ dur: 0.1, type: 'square', f0: 180, gain: 0.12 });
    this._tone({ t: 0.13, dur: 0.1, type: 'square', f0: 160, gain: 0.12 });
  }

  warning() {
    if (!this._ok()) return;
    this._tone({ dur: 0.09, type: 'square', f0: 880, gain: 0.1 });
    this._tone({ t: 0.12, dur: 0.09, type: 'square', f0: 880, gain: 0.1 });
  }

  waveStart() {
    if (!this._ok()) return;
    [392, 523, 659].forEach((f, i) => this._tone({ t: i * 0.12, dur: 0.16, type: 'triangle', f0: f, gain: 0.25 }));
    this._tone({ t: 0.36, dur: 0.5, type: 'sawtooth', f0: 98, gain: 0.15 });
  }

  waveClear() {
    if (!this._ok()) return;
    [523, 659, 784, 1047].forEach((f, i) => this._tone({ t: i * 0.1, dur: 0.18, type: 'triangle', f0: f, gain: 0.22 }));
  }

  gameOver() {
    if (!this._ok()) return;
    [392, 330, 262, 196].forEach((f, i) => this._tone({ t: i * 0.22, dur: 0.3, type: 'sawtooth', f0: f, gain: 0.18 }));
  }
}
