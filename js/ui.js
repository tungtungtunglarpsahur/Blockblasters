// DOM glue: screens, HUD, toasts, number tweens. No game rules live here.
import { levelForScore, scoreForLevel } from './game.js';

export const $ = sel => document.querySelector(sel);
export const $$ = sel => Array.from(document.querySelectorAll(sel));

export const fmt = n => Math.round(n).toLocaleString('en-US');

export class UI {
  constructor() {
    this.screens = $$('.overlay');
    this.current = null;
    this.scoreShown = 0;
    this.scoreTarget = 0;
    this.bestShown = 0;
    this.coinsShown = 0;
    this.coinsTarget = 0;
    this.comboTimer = 0;
    this.toastTimer = null;
    this.el = {
      score: $('#score'), best: $('#best'), coins: $('#coins'), level: $('#level'), levelBar: $('#level-bar'),
      combo: $('#combo'), hud: $('#hud'), toast: $('#toast'),
    };
  }

  show(name) {
    for (const s of this.screens) {
      const on = s.id === `screen-${name}`;
      if (on) { s.hidden = false; requestAnimationFrame(() => s.classList.add('active')); }
      else if (s.classList.contains('active')) { s.classList.remove('active'); setTimeout(() => { if (!s.classList.contains('active')) s.hidden = true; }, 320); }
      else s.hidden = true;
    }
    this.current = name;
    document.body.dataset.screen = name || 'game';
  }
  hideAll() { this.show(null); }

  toast(msg, ms = 1800) {
    const t = this.el.toast;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  setScore(v, instant = false) { this.scoreTarget = v; if (instant) { this.scoreShown = v; this.el.score.textContent = fmt(v); } }
  setBest(v) { if (v !== this.bestShown) { this.bestShown = v; this.el.best.textContent = fmt(v); this.el.best.parentElement.classList.remove('bump'); void this.el.best.offsetWidth; this.el.best.parentElement.classList.add('bump'); } }
  setCoins(v, instant = false) { this.coinsTarget = v; if (instant) { this.coinsShown = v; this.el.coins.textContent = fmt(v); } }

  setLevel(score) {
    const lv = levelForScore(score);
    const lo = scoreForLevel(lv), hi = scoreForLevel(lv + 1);
    const k = Math.max(0, Math.min(1, (score - lo) / (hi - lo)));
    this.el.level.textContent = `LVL ${lv}`;
    this.el.levelBar.style.transform = `scaleX(${k.toFixed(3)})`;
  }

  // Score colour follows the combo tier (white → orange → green → cyan → magenta), gem pulses with it.
  setScoreTier(combo) {
    const tier = combo >= 10 ? 4 : combo >= 7 ? 3 : combo >= 4 ? 2 : combo >= 2 ? 1 : 0;
    const colors = ['#ffffff', '#ffa43a', '#5ef08a', '#4fd6ff', '#ff5ce0'];
    const hud = this.el.hud;
    hud.style.setProperty('--score-color', colors[tier]);
    hud.dataset.tier = String(tier);
  }

  setCombo(n) {
    const c = this.el.combo;
    this.setScoreTier(n);
    if (n >= 2) {
      c.textContent = `COMBO ×${n}`;
      c.style.setProperty('--hue', String((n * 47) % 360));
      c.classList.add('show');
      c.classList.remove('pulse'); void c.offsetWidth; c.classList.add('pulse');
      this.comboTimer = 2.6;
    } else {
      c.classList.remove('show');
    }
  }

  tick(dt) {
    // tween numbers
    if (this.scoreShown !== this.scoreTarget) {
      const diff = this.scoreTarget - this.scoreShown;
      const step = Math.abs(diff) < 2 ? diff : diff * Math.min(1, dt * 9);
      this.scoreShown += step;
      if (Math.abs(this.scoreTarget - this.scoreShown) < 0.6) this.scoreShown = this.scoreTarget;
      this.el.score.textContent = fmt(this.scoreShown);
    }
    if (this.coinsShown !== this.coinsTarget) {
      const diff = this.coinsTarget - this.coinsShown;
      const step = Math.abs(diff) < 2 ? diff : diff * Math.min(1, dt * 7);
      this.coinsShown += step;
      if (Math.abs(this.coinsTarget - this.coinsShown) < 0.6) this.coinsShown = this.coinsTarget;
      this.el.coins.textContent = fmt(this.coinsShown);
    }
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.el.combo.classList.remove('show'); }
  }

  bumpScore() { const s = this.el.score; s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); }
}
