// Tiny procedural sound engine (WebAudio). No audio files, zero loading time.
class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.unlocked = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(comp).connect(this.ctx.destination);
  }

  unlock() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.unlocked = true;
  }

  get ready() { return this.enabled && this.ctx && this.ctx.state === 'running'; }

  // one voice: oscillator with ADSR-ish envelope, optional pitch slide
  tone({ f = 440, f2 = null, type = 'sine', t = 0, d = 0.15, v = 0.3, a = 0.005, r = null, pan = 0 }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + t;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, now);
    if (f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + d);
    const rel = r ?? d * 0.6;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(v, now + a);
    g.gain.setValueAtTime(v, now + Math.max(a, d - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, now + d);
    let node = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    osc.connect(g); node.connect(this.master);
    osc.start(now); osc.stop(now + d + 0.02);
  }

  noise({ t = 0, d = 0.12, v = 0.2, hp = 800 }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + t;
    const len = Math.floor(ctx.sampleRate * d);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ctx.createGain(); g.gain.setValueAtTime(v, now); g.gain.exponentialRampToValueAtTime(0.0001, now + d);
    src.connect(f).connect(g).connect(this.master);
    src.start(now); src.stop(now + d + 0.02);
  }

  // ---------- game sounds ----------
  click() { this.tone({ f: 620, f2: 480, type: 'triangle', d: 0.07, v: 0.18 }); }
  pick() { this.tone({ f: 520, f2: 700, type: 'sine', d: 0.09, v: 0.16 }); }
  back() { this.tone({ f: 420, f2: 300, type: 'triangle', d: 0.08, v: 0.14 }); }
  drop(size = 3) {
    const f = 240 - size * 8;
    this.tone({ f: f * 1.5, f2: f, type: 'triangle', d: 0.1, v: 0.28 });
    this.noise({ d: 0.05, v: 0.06, hp: 2000 });
  }
  invalid() { this.tone({ f: 180, f2: 140, type: 'square', d: 0.09, v: 0.07 }); }

  clear(lines = 1, combo = 1) {
    const base = 440 * Math.pow(1.06, Math.min(combo, 12) * 2);
    const n = Math.min(lines, 4) + 2;
    for (let i = 0; i < n; i++) {
      const f = base * Math.pow(2, i / 5);
      this.tone({ f, f2: f * 1.01, type: 'sine', t: i * 0.045, d: 0.22, v: 0.22, pan: (i / n) * 0.6 - 0.3 });
      this.tone({ f: f * 2, type: 'triangle', t: i * 0.045, d: 0.12, v: 0.06 });
    }
    this.noise({ d: 0.18, v: 0.12 + lines * 0.03, hp: 1200 });
  }

  combo(count) {
    const notes = [0, 4, 7, 12, 16, 19, 24];
    const root = 523.25 * Math.pow(1.0595, Math.min(count, 10));
    for (let i = 0; i < Math.min(3 + count, 7); i++) {
      const f = root * Math.pow(2, notes[i] / 12);
      this.tone({ f, type: 'square', t: i * 0.05, d: 0.14, v: 0.06 });
      this.tone({ f, type: 'sine', t: i * 0.05, d: 0.25, v: 0.16 });
    }
  }

  perfect() {
    const seq = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093];
    seq.forEach((f, i) => {
      this.tone({ f, type: 'sine', t: i * 0.07, d: 0.5, v: 0.22 });
      this.tone({ f: f / 2, type: 'triangle', t: i * 0.07, d: 0.4, v: 0.1 });
    });
    this.noise({ t: 0.1, d: 0.5, v: 0.15, hp: 600 });
  }

  levelUp() {
    [392, 523.25, 659.25, 783.99].forEach((f, i) => this.tone({ f, type: 'triangle', t: i * 0.08, d: 0.3, v: 0.2 }));
    this.tone({ f: 1567.98, type: 'sine', t: 0.32, d: 0.5, v: 0.14 });
  }

  newBest() {
    [659.25, 783.99, 987.77, 1318.5, 1567.98].forEach((f, i) => {
      this.tone({ f, type: 'sine', t: i * 0.09, d: 0.45, v: 0.22 });
      this.tone({ f: f * 1.5, type: 'triangle', t: i * 0.09 + 0.02, d: 0.3, v: 0.07 });
    });
  }

  gameOver() {
    [440, 369.99, 311.13, 261.63].forEach((f, i) => this.tone({ f, f2: f * 0.97, type: 'triangle', t: i * 0.16, d: 0.3, v: 0.2 }));
    this.tone({ f: 130.81, f2: 65, type: 'sine', t: 0.6, d: 0.8, v: 0.25 });
  }

  revive() {
    this.tone({ f: 220, f2: 880, type: 'sawtooth', d: 0.5, v: 0.1 });
    this.tone({ f: 440, f2: 1760, type: 'sine', d: 0.55, v: 0.2 });
    this.noise({ t: 0.35, d: 0.3, v: 0.18, hp: 900 });
    [880, 1108.73, 1318.5].forEach((f, i) => this.tone({ f, type: 'sine', t: 0.5 + i * 0.08, d: 0.35, v: 0.2 }));
  }

  coin() { this.tone({ f: 1318.5, type: 'square', d: 0.06, v: 0.06 }); this.tone({ f: 1760, type: 'sine', t: 0.05, d: 0.18, v: 0.14 }); }
}

export const audio = new Audio();
