// Visual effects: particles, confetti, floating texts, screen shake, flashes.
// Everything lives in CSS-pixel canvas space and is stepped with dt (seconds).

const TAU = Math.PI * 2;

export class FX {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.shake = { t: 0, dur: 0, amp: 0, x: 0, y: 0 };
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.quality = 'high';
    this.time = 0;
  }

  get scale() { return this.quality === 'low' ? 0.35 : 1; }

  burst(x, y, color, { count = 14, speed = 220, size = 5, life = 0.7, gravity = 520, spread = TAU, angle = 0, shape = 'square' } = {}) {
    const n = Math.max(2, Math.round(count * this.scale));
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.9);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.25,
        life, max: life, size: size * (0.5 + Math.random()), color,
        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14, g: gravity, shape,
      });
    }
  }

  // bright white sparks + coloured cubes when a cell is cleared
  cellPop(x, y, color, cell) {
    this.burst(x, y, color, { count: 7, speed: 190, size: cell * 0.22, life: 0.65 });
    this.burst(x, y, '#ffffff', { count: 3, speed: 260, size: cell * 0.08, life: 0.35, gravity: 200, shape: 'spark' });
  }

  confetti(w, h, amount = 120) {
    const colors = ['#ff5c8a', '#ffb02e', '#3ddc84', '#38bdf8', '#a78bfa', '#facc15', '#22d3ee'];
    const n = Math.round(amount * this.scale);
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: Math.random() * w, y: -20 - Math.random() * h * 0.3,
        vx: (Math.random() - 0.5) * 120, vy: 60 + Math.random() * 160,
        life: 2.8 + Math.random() * 1.5, max: 4, size: 5 + Math.random() * 6,
        color: colors[(Math.random() * colors.length) | 0], rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10,
        g: 80, shape: 'confetti', drag: 0.985,
      });
    }
  }

  text(x, y, str, { color = '#fff', size = 22, life = 1.1, vy = -70, weight = 900, stroke = true, scalePop = true } = {}) {
    this.texts.push({ x, y, str, color, size, life, max: life, vy, weight, stroke, scalePop });
  }

  ring(x, y, color, { r0 = 10, r1 = 120, life = 0.5, width = 6 } = {}) {
    this.rings.push({ x, y, color, r0, r1, life, max: life, width });
  }

  shakeScreen(amp = 6, dur = 0.25) {
    if (this.quality === 'low') amp *= 0.5;
    this.shake.amp = Math.max(this.shake.amp, amp);
    this.shake.dur = Math.max(this.shake.dur, dur);
    this.shake.t = Math.max(this.shake.t, dur);
  }

  flashScreen(strength = 0.35, color = '#ffffff') { this.flash = Math.max(this.flash, strength); this.flashColor = color; }

  update(dt) {
    this.time += dt;
    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles[i] = this.particles[this.particles.length - 1]; this.particles.pop(); continue; }
      p.vy += p.g * dt;
      if (p.drag) { p.vx *= p.drag; p.vy *= p.drag; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt; t.y += t.vy * dt; t.vy *= 0.96;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.life -= dt; if (r.life <= 0) this.rings.splice(i, 1);
    }
    // shake
    if (this.shake.t > 0) {
      this.shake.t -= dt;
      const k = Math.max(0, this.shake.t / this.shake.dur);
      const a = this.shake.amp * k * k;
      this.shake.x = (Math.random() - 0.5) * 2 * a;
      this.shake.y = (Math.random() - 0.5) * 2 * a;
      if (this.shake.t <= 0) { this.shake.x = this.shake.y = 0; this.shake.amp = 0; }
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.8);
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const k = Math.max(0, Math.min(1, p.life / p.max));
      ctx.globalAlpha = p.shape === 'confetti' ? Math.min(1, k * 3) : k;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.shape === 'spark') {
        ctx.fillRect(-p.size * 2, -p.size * 0.35, p.size * 4, p.size * 0.7);
      } else if (p.shape === 'confetti') {
        const sy = Math.abs(Math.sin(this.time * 6 + p.rot)) * p.size;
        ctx.fillRect(-p.size / 2, -sy / 2, p.size, Math.max(1.5, sy));
      } else {
        const s = p.size * (0.4 + 0.6 * k);
        ctx.beginPath();
        roundRect(ctx, -s / 2, -s / 2, s, s, s * 0.25);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawRings(ctx) {
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * easeOut(k);
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawTexts(ctx) {
    for (const t of this.texts) {
      const k = t.life / t.max;          // 1 -> 0
      const age = 1 - k;
      const alpha = k < 0.35 ? k / 0.35 : 1;
      const pop = t.scalePop ? (age < 0.18 ? 0.6 + 0.4 * easeOutBack(age / 0.18) : 1) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(t.x, t.y);
      ctx.scale(pop, pop);
      ctx.font = `${t.weight} ${t.size}px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (t.stroke) { ctx.lineWidth = Math.max(2, t.size * 0.18); ctx.strokeStyle = 'rgba(8,10,24,0.85)'; ctx.lineJoin = 'round'; ctx.strokeText(t.str, 0, 0); }
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color; ctx.shadowBlur = t.size * 0.5;
      ctx.fillText(t.str, 0, 0);
      ctx.restore();
    }
  }

  drawFlash(ctx, w, h) {
    if (this.flash <= 0) return;
    ctx.globalAlpha = this.flash;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(-50, -50, w + 100, h + 100);
    ctx.globalAlpha = 1;
  }

  clear() { this.particles.length = 0; this.texts.length = 0; this.rings.length = 0; this.flash = 0; this.shake.t = 0; this.shake.x = this.shake.y = 0; }
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export const easeOut = t => 1 - Math.pow(1 - t, 3);
export const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
