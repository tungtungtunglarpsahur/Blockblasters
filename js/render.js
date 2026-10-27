// Canvas renderer + pointer input for the board and the piece tray.
import { SIZE, PIECE_SLOTS } from './game.js';
import { PALETTES, THEMES } from './themes.js';
import { FX, roundRect, easeOut, easeOutBack, easeInOut, clamp, lerp } from './fx.js';

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas, game, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.game = game;
    this.cb = callbacks;             // { onDrop(index,col,row) -> bool, onPick(), onInvalid(fromDrop) }
    this.fx = new FX();
    this.dpr = 1;
    this.w = 0; this.h = 0;
    this.sprites = new Map();
    this.time = 0;
    this.drag = null;                // { index, px, py, sx, sy, anim, type, id }
    this.returning = null;           // { index, from:{x,y,s}, t }
    this.placedAnim = [];            // { c, r, color, t }
    this.vanish = [];                // { c, r, color, t, delay, spawned, label }
    this.lineFlash = [];             // { rows, cols, t }
    this.trayAnim = [0, 0, 0];       // pop-in progress per slot
    this.slotBob = [Math.random() * TAU, Math.random() * TAU, Math.random() * TAU];
    this.slotTwinkle = [0, 0, 0];
    this.boardPulse = 0;             // combo glow
    this.pressure = 0;
    this.quality = 'high';
    this.ghostEnabled = true;
    this.interactive = true;
    this.reviveWave = null;          // { rows, cols, t }
    this.intro = 0;                  // board scale-in
    this.ripple = null;              // { t } start-of-game wave
    this.themeFlash = 0;             // flash when a theme switches
    this.layout = null;
    this.theme = THEMES[0];
    this.palette = PALETTES[this.theme.palette];
    this.gapRatio = 0.085;
    this._bind();
    this.resize();
  }

  // ---------- theme ----------
  setTheme(theme, { animate = false } = {}) {
    if (this.theme && this.theme.id === theme.id) return;
    this.theme = theme;
    this.palette = PALETTES[theme.palette] || PALETTES.vivid;
    this.gapRatio = theme.style === 'grid' ? 0 : 0.085;
    this.sprites.clear();
    this._layout();
    if (animate) { this.themeFlash = 1; this.fx.flashScreen(0.5, '#ffffff'); this.fx.confetti(this.w, this.h, 160); this.fx.shakeScreen(7, 0.4); }
  }

  // ---------- layout ----------
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = rect.width; this.h = rect.height;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.sprites.clear();
    this._layout();
  }

  _layout() {
    const w = this.w, h = this.h;
    const pad = Math.max(10, Math.min(18, w * 0.04));
    const trayShare = 0.30;
    const maxBoard = Math.min(w - pad * 2, h * (1 - trayShare) - pad * 2, 560);
    const board = Math.max(160, maxBoard);
    const gapRatio = this.gapRatio;
    const frame = this.theme.style === 'grid' ? board * 0.03 : 0;      // solid frame around a grid board
    const inner = board - 2 * frame;
    const cell = inner / (SIZE + (SIZE + 1) * gapRatio);
    const gap = cell * gapRatio;
    const bx = (w - board) / 2;
    const freeAbove = h - board - h * trayShare;
    const by = Math.max(pad, freeAbove * 0.5);
    const trayTop = by + board + pad * 0.6;
    const trayH = h - trayTop - pad * 0.5;
    const slotW = board / PIECE_SLOTS;
    const slotCell = Math.min(cell * 0.62, (slotW - 12) / 3.4, (trayH - 10) / 3.6);
    const slots = [];
    for (let i = 0; i < PIECE_SLOTS; i++) {
      slots.push({ x: bx + slotW * i, y: trayTop, w: slotW, h: trayH, cx: bx + slotW * i + slotW / 2, cy: trayTop + trayH / 2 });
    }
    this.layout = { pad, board, cell, gap, bx, by, frame, ox: bx + frame, oy: by + frame, trayTop, trayH, slots, slotCell, slotW };
  }

  // cell size for a piece sitting in the tray (shrinks 4- and 5-long pieces so they fit the slot)
  slotCellFor(piece) {
    const L = this.layout;
    const n = Math.max(piece.shape.w, piece.shape.h);
    const limit = Math.min((L.slotW - 12) / (n + (n - 1) * 0.12), (L.trayH - 10) / (n + (n - 1) * 0.12));
    return Math.min(L.slotCell, limit);
  }

  cellPos(c, r) {
    const L = this.layout;
    return { x: L.ox + L.gap + c * (L.cell + L.gap), y: L.oy + L.gap + r * (L.cell + L.gap) };
  }
  cellCenter(c, r) { const p = this.cellPos(c, r); const L = this.layout; return { x: p.x + L.cell / 2, y: p.y + L.cell / 2 }; }
  boardCenter() { const L = this.layout; return { x: L.bx + L.board / 2, y: L.by + L.board / 2 }; }

  // ---------- sprites ----------
  sprite(color, size, variant = 'solid') {
    const key = `${this.theme.id}|${color}|${size | 0}|${variant}`;
    let s = this.sprites.get(key);
    if (s) return s;
    const dp = this.dpr;
    const px = Math.max(2, Math.round(size * dp));
    const pad = 0;
    const cv = document.createElement('canvas');
    cv.width = px + pad * 2; cv.height = px + pad * 2;
    const g = cv.getContext('2d');
    g.translate(pad, pad);
    const col = this.palette[color] || this.palette[1];
    if (this.theme.style === 'grid') drawBevelBlock(g, 0, 0, px, col, variant);
    else drawRoundBlock(g, 0, 0, px, col, variant);
    s = { cv, pad, px };
    this.sprites.set(key, s);
    return s;
  }

  drawBlock(c, r, color, { scale = 1, alpha = 1, variant = 'solid' } = {}) {
    const L = this.layout;
    const p = this.cellPos(c, r);
    const s = this.sprite(color, L.cell, variant);
    const ctx = this.ctx;
    const size = L.cell * scale;
    const off = (L.cell - size) / 2;
    ctx.globalAlpha = alpha;
    ctx.drawImage(s.cv, p.x + off, p.y + off, size, size);
    ctx.globalAlpha = 1;
  }

  // ---------- public API ----------
  setGame(game) {
    this.game = game; this.drag = null; this.returning = null; this.placedAnim.length = 0; this.vanish.length = 0; this.lineFlash.length = 0;
    this.trayAnim = [0, 0, 0]; this.fx.clear(); this.intro = 0; this.reviveWave = null;
    this.ripple = game.filledCount() === 0 ? { t: 0 } : null;
  }

  popTray() { this.trayAnim = [0, 0, 0]; }

  praise(str, { colors, lane = 0, size = 1, sub = null, subColor = '#fff', y = 0.5, life = 1.5 } = {}) {
    const L = this.layout;
    this.fx.banner(L.bx + L.board / 2, L.by + L.board * y, str, {
      colors: colors || this.theme.banner, size: Math.max(26, L.cell * 0.78 * size), lane, sub, subColor, life,
    });
  }

  applyResult(res) {
    const L = this.layout;
    for (const [c, r] of res.placedCells) this.placedAnim.push({ c, r, color: res.color, t: 0 });
    const cen = this.cellCenter(...centroid(res.placedCells));
    cen.x = clamp(cen.x, L.bx + L.cell * 1.6, L.bx + L.board - L.cell * 1.6);   // keep "+points" readable near the edges
    if (res.linesCleared > 0) {
      const label = res.combo >= 2 ? String(res.combo) : null;
      for (const [c, r, color] of res.cleared) {
        const p = this.cellCenter(c, r);
        const d = Math.hypot(p.x - cen.x, p.y - cen.y) / L.cell;
        this.vanish.push({ c, r, color, t: 0, delay: 0.06 + d * 0.035, spawned: false, label });
      }
      this.lineFlash.push({ rows: res.rows, cols: res.cols, t: 0 });
      const amp = 3 + res.linesCleared * 2.2 + Math.min(res.combo, 8) * 0.6;
      this.fx.shakeScreen(amp, 0.18 + res.linesCleared * 0.05);
      if (res.linesCleared >= 2) this.fx.flashScreen(0.1 + res.linesCleared * 0.05, '#ffffff');
      const col = this.palette[res.color].light;
      // "+points" next to the placed piece
      this.fx.text(cen.x, cen.y - L.cell * 0.55, `+${res.points - res.placedCells.length}`, { color: col, size: Math.max(20, L.cell * 0.6), life: 1.2 });
      if (res.combo >= 2) {
        const hue = (res.combo * 47) % 360;
        this.fx.ring(cen.x, cen.y, `hsl(${hue} 100% 70%)`, { r0: L.cell * 0.5, r1: L.board * (0.4 + Math.min(res.combo, 6) * 0.08), life: 0.55, width: 5 });
        this.boardPulse = 1;
      }
      if (res.perfect) {
        this.fx.confetti(this.w, this.h, 180);
        this.fx.flashScreen(0.45, '#ffffff');
        this.fx.shakeScreen(10, 0.5);
      }
    } else {
      this.fx.text(cen.x, cen.y - L.cell * 0.3, `+${res.points}`, { color: 'rgba(255,255,255,0.85)', size: Math.max(14, L.cell * 0.38), life: 0.8, vy: -45, weight: 800 });
    }
    if (res.levelUp) {
      this.fx.ring(L.bx + L.board / 2, L.by + L.board / 2, '#ffd166', { r0: 10, r1: L.board * 0.75, life: 0.7, width: 8 });
    }
    if (res.refilled) this.popTray();
  }

  applyRevive(rev) {
    const L = this.layout;
    this.reviveWave = { rows: rev.rows, cols: rev.cols, t: 0 };
    const cx = this.cellCenter(rev.cols[1], rev.rows[1]);
    for (const [c, r, color] of rev.cleared) {
      const p = this.cellCenter(c, r);
      const d = Math.hypot(p.x - cx.x, p.y - cx.y) / L.cell;
      this.vanish.push({ c, r, color, t: 0, delay: 0.15 + d * 0.05, spawned: false, label: null });
    }
    this.fx.ring(cx.x, cx.y, '#ffffff', { r0: 5, r1: L.board, life: 0.9, width: 10 });
    this.fx.flashScreen(0.5, '#a5f3fc');
    this.fx.shakeScreen(9, 0.5);
    this.praise('REVIVED!', { colors: ['#ffffff', '#67e8f9'], lane: 0, life: 1.8 });
    this.popTray();
  }

  celebrateBest() {
    this.fx.confetti(this.w, this.h, 220);
    this.fx.flashScreen(0.3, '#ffd166');
  }

  // ---------- input ----------
  _bind() {
    const cv = this.canvas;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', e => this._down(e));
    cv.addEventListener('pointermove', e => this._move(e));
    cv.addEventListener('pointerup', e => this._up(e));
    cv.addEventListener('pointercancel', () => this._cancel());
    cv.addEventListener('lostpointercapture', () => { if (this.drag) this._cancel(); });
    cv.addEventListener('contextmenu', e => e.preventDefault());
  }

  _pt(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  _down(e) {
    if (!this.interactive || this.drag || this.game.gameOver) return;
    const p = this._pt(e);
    const L = this.layout;
    for (let i = 0; i < PIECE_SLOTS; i++) {
      const piece = this.game.pieces[i];
      if (!piece || piece.used) continue;
      const s = L.slots[i];
      if (p.x >= s.x && p.x < s.x + s.w && p.y >= s.y - 10 && p.y < s.y + s.h + 10) {
        if (!this.game.fitsAnywhere(piece.shape)) { this.cb.onInvalid?.(); this._wiggle = { i, t: 0 }; return; }
        this.drag = { index: i, px: p.x, py: p.y, sx: p.x, sy: p.y, anim: 0, type: e.pointerType, id: e.pointerId };
        this.returning = null;
        try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        this.cb.onPick?.();
        return;
      }
    }
  }
  _move(e) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const p = this._pt(e);
    this.drag.px = p.x; this.drag.py = p.y;
  }
  _up(e) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const d = this.drag;
    const moved = Math.hypot(d.px - d.sx, d.py - d.sy) > 6;     // a plain tap never places a piece
    const snap = moved ? this._snap(d) : undefined;
    this.drag = null;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (snap && this.cb.onDrop?.(d.index, snap.c, snap.r)) return;
    const L = this.layout;
    const pos = this._dragPos(d, 1);
    this.returning = { index: d.index, from: { x: pos.x, y: pos.y, s: L.cell }, t: 0 };
    if (snap === null && this.cb.onInvalid) this.cb.onInvalid(true);
  }
  _cancel() {
    if (!this.drag) return;
    const d = this.drag; this.drag = null;
    const L = this.layout;
    const pos = this._dragPos(d, 1);
    this.returning = { index: d.index, from: { x: pos.x, y: pos.y, s: L.cell }, t: 0 };
  }

  // Where the dragged piece's top-left corner is (board scale), given the current pointer.
  _dragTarget(d) {
    const L = this.layout;
    const piece = this.game.pieces[d.index];
    const pw = piece.shape.w * L.cell + (piece.shape.w - 1) * L.gap;
    const ph = piece.shape.h * L.cell + (piece.shape.h - 1) * L.gap;
    // touch/pen: the piece floats ~1.15 cells above the finger so it is never hidden by the hand;
    // mouse: the piece is centred on the cursor.
    const touch = d.type === 'touch' || d.type === 'pen';
    const top = touch ? d.py - L.cell * 1.15 - ph : d.py - ph / 2;
    return { x: d.px - pw / 2, y: top, pw, ph };
  }
  _dragPos(d, k) {
    const L = this.layout;
    const t = this._dragTarget(d);
    const slot = L.slots[d.index];
    const piece = this.game.pieces[d.index];
    const sc = this.slotCellFor(piece);
    const sg = sc * 0.12;
    const sw = piece.shape.w * sc + (piece.shape.w - 1) * sg;
    const sh = piece.shape.h * sc + (piece.shape.h - 1) * sg;
    const sx = slot.cx - sw / 2, sy = slot.cy - sh / 2;
    const e = easeOut(k);
    return { x: lerp(sx, t.x, e), y: lerp(sy, t.y, e), cellSize: lerp(sc, L.cell, e), gap: lerp(sg, L.gap, e) };
  }
  // Returns {c,r} for a valid snap, null when over the board but blocked, undefined when off the board.
  _snap(d) {
    const L = this.layout;
    const t = this._dragTarget(d);
    const piece = this.game.pieces[d.index];
    const fc = (t.x - L.ox - L.gap) / (L.cell + L.gap);
    const fr = (t.y - L.oy - L.gap) / (L.cell + L.gap);
    const slack = 0.6;
    if (fc < -slack || fr < -slack || fc > SIZE - piece.shape.w + slack || fr > SIZE - piece.shape.h + slack) return undefined;
    const cc = clamp(Math.round(fc), 0, SIZE - piece.shape.w), rr = clamp(Math.round(fr), 0, SIZE - piece.shape.h);
    return this.game.canPlace(piece.shape, cc, rr) ? { c: cc, r: rr } : null;
  }

  // ---------- frame ----------
  update(dt) {
    this.time += dt;
    this.fx.quality = this.quality;
    this.fx.update(dt);
    this.intro = Math.min(1, this.intro + dt * 1.6);
    if (this.ripple) { this.ripple.t += dt; if (this.ripple.t > 1.4) this.ripple = null; }
    this.themeFlash = Math.max(0, this.themeFlash - dt * 0.8);
    if (this.drag) this.drag.anim = Math.min(1, this.drag.anim + dt / 0.14);
    if (this.returning) { this.returning.t += dt / 0.22; if (this.returning.t >= 1) this.returning = null; }
    for (let i = this.placedAnim.length - 1; i >= 0; i--) { const a = this.placedAnim[i]; a.t += dt; if (a.t > 0.3) this.placedAnim.splice(i, 1); }
    for (let i = this.vanish.length - 1; i >= 0; i--) {
      const v = this.vanish[i]; v.t += dt;
      if (!v.spawned && v.t >= v.delay) {
        v.spawned = true;
        const p = this.cellCenter(v.c, v.r);
        this.fx.cellPop(p.x, p.y, (this.palette[v.color] || this.palette[1]).light, this.layout.cell);
      }
      if (v.t > v.delay + 0.28) this.vanish.splice(i, 1);
    }
    for (let i = this.lineFlash.length - 1; i >= 0; i--) { const f = this.lineFlash[i]; f.t += dt; if (f.t > 0.45) this.lineFlash.splice(i, 1); }
    for (let i = 0; i < PIECE_SLOTS; i++) {
      this.trayAnim[i] = Math.min(1, this.trayAnim[i] + dt / (0.28 + i * 0.07));
      // decorative twinkle in empty slots
      const piece = this.game.pieces[i];
      if (piece && piece.used && this.quality !== 'low') {
        this.slotTwinkle[i] -= dt;
        if (this.slotTwinkle[i] <= 0) {
          this.slotTwinkle[i] = 0.9 + Math.random() * 1.4;
          const s = this.layout.slots[i];
          this.fx.sparkle(s.cx, s.cy, 'rgba(255,255,255,0.8)', { count: 2, size: Math.max(4, this.layout.slotCell * 0.3), life: 1.1, spread: this.layout.slotCell * 1.6 });
        }
      }
    }
    if (this._wiggle) { this._wiggle.t += dt; if (this._wiggle.t > 0.35) this._wiggle = null; }
    this.boardPulse = Math.max(0, this.boardPulse - dt * 1.2);
    if (this.reviveWave) { this.reviveWave.t += dt; if (this.reviveWave.t > 0.9) this.reviveWave = null; }
    const target = this.game.filledCount() / (SIZE * SIZE);
    this.pressure += (target - this.pressure) * Math.min(1, dt * 4);
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.save();
    ctx.translate(this.fx.shake.x, this.fx.shake.y);

    this._drawBoardPanel();
    this._drawCells();
    this._drawRipple();
    this._drawGhost();
    this._drawVanish();
    this._drawLineFlash();
    this._drawComboBorder();
    this._drawTray();
    this.fx.drawRings(ctx);
    this._drawDragged();
    this.fx.drawParticles(ctx);
    this.fx.drawTexts(ctx);
    this.fx.drawBanners(ctx);
    ctx.restore();
    this.fx.drawFlash(ctx, this.w, this.h);
  }

  _drawBoardPanel() {
    const ctx = this.ctx, L = this.layout, T = this.theme;
    const k = easeOutBack(this.intro);
    const combo = this.game.combo;
    const pulse = this.boardPulse;
    const pressure = clamp((this.pressure - 0.6) / 0.35, 0, 1);
    const radius = T.style === 'grid' ? L.cell * 0.18 : L.cell * 0.45;
    ctx.save();
    ctx.translate(L.bx + L.board / 2, L.by + L.board / 2);
    ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k);
    ctx.translate(-(L.bx + L.board / 2), -(L.by + L.board / 2));
    ctx.globalAlpha = clamp(this.intro * 1.5, 0, 1);

    if (this.quality !== 'low') {
      const hue = (combo * 47) % 360;
      ctx.shadowColor = combo >= 2 ? `hsla(${hue} 100% 65% / ${0.35 + pulse * 0.5})`
        : pressure > 0 ? `rgba(255,80,110,${0.25 * pressure * (0.6 + 0.4 * Math.sin(this.time * 5))})` : T.board.glow;
      ctx.shadowBlur = 28 + pulse * 40 + this.themeFlash * 50;
    }
    ctx.fillStyle = T.board.fill;
    ctx.beginPath(); roundRect(ctx, L.bx, L.by, L.board, L.board, radius); ctx.fill();
    ctx.shadowBlur = 0;

    if (T.style === 'grid') {
      // inner cell area + grid lines (Block-Blast-like)
      ctx.fillStyle = T.board.cell;
      ctx.fillRect(L.ox, L.oy, L.cell * SIZE, L.cell * SIZE);
      ctx.strokeStyle = T.board.line; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= SIZE; i++) {
        const x = Math.round(L.ox + i * L.cell) + 0.5, y = Math.round(L.oy + i * L.cell) + 0.5;
        ctx.moveTo(x, L.oy); ctx.lineTo(x, L.oy + L.cell * SIZE);
        ctx.moveTo(L.ox, y); ctx.lineTo(L.ox + L.cell * SIZE, y);
      }
      ctx.stroke();
      // frame highlight
      ctx.strokeStyle = T.board.border; ctx.lineWidth = Math.max(1.5, L.frame * 0.35);
      ctx.beginPath(); roundRect(ctx, L.bx + ctx.lineWidth / 2, L.by + ctx.lineWidth / 2, L.board - ctx.lineWidth, L.board - ctx.lineWidth, radius); ctx.stroke();
    } else {
      const grad = ctx.createLinearGradient(L.bx, L.by, L.bx + L.board, L.by + L.board);
      grad.addColorStop(0, T.board.border); grad.addColorStop(0.5, 'rgba(255,255,255,0.06)'); grad.addColorStop(1, T.board.border);
      ctx.strokeStyle = grad; ctx.lineWidth = 1.2;
      ctx.beginPath(); roundRect(ctx, L.bx + 0.5, L.by + 0.5, L.board - 1, L.board - 1, radius); ctx.stroke();
      ctx.fillStyle = T.board.cell;
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        const p = this.cellPos(c, r);
        ctx.beginPath(); roundRect(ctx, p.x, p.y, L.cell, L.cell, L.cell * 0.2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // animated rainbow frame while a combo streak is running
  _drawComboBorder() {
    const combo = this.game.combo;
    if (combo < 3 || this.quality === 'low') return;
    const ctx = this.ctx, L = this.layout;
    const radius = this.theme.style === 'grid' ? L.cell * 0.18 : L.cell * 0.45;
    const strength = clamp((combo - 2) / 6, 0.35, 1);
    let grad;
    const cx = L.bx + L.board / 2, cy = L.by + L.board / 2;
    if (ctx.createConicGradient) {
      grad = ctx.createConicGradient(this.time * 2.2, cx, cy);
      for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, `hsl(${(i * 60 + this.time * 40) % 360} 100% 65%)`);
    } else {
      grad = ctx.createLinearGradient(L.bx, L.by, L.bx + L.board, L.by + L.board);
      grad.addColorStop(0, `hsl(${(this.time * 80) % 360} 100% 65%)`); grad.addColorStop(1, `hsl(${(this.time * 80 + 180) % 360} 100% 65%)`);
    }
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(this.time * 6) * strength;
    ctx.strokeStyle = grad; ctx.lineWidth = 3 + strength * 3;
    ctx.shadowColor = `hsl(${(this.time * 60) % 360} 100% 65%)`; ctx.shadowBlur = 18 + strength * 16;
    ctx.beginPath(); roundRect(ctx, L.bx - 2, L.by - 2, L.board + 4, L.board + 4, radius + 2); ctx.stroke();
    ctx.restore();
  }

  _drawCells() {
    const g = this.game;
    const popping = new Map(this.placedAnim.map(a => [a.r * SIZE + a.c, a]));
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const color = g.board[r * SIZE + c];
      if (!color) continue;
      const a = popping.get(r * SIZE + c);
      let scale = 1;
      if (a) { const k = clamp(a.t / 0.26, 0, 1); scale = 0.55 + 0.45 * easeOutBack(k); }
      this.drawBlock(c, r, color, { scale });
    }
  }

  // start-of-game wave: ghost blocks sweep from the rim to the centre and dissolve
  _drawRipple() {
    if (!this.ripple) return;
    const t = this.ripple.t;
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const ring = Math.max(Math.abs(c - 3.5), Math.abs(r - 3.5));     // 0.5 .. 3.5
      const k = (t - (3.5 - ring) * 0.16) / 0.42;                       // outer rings first
      if (k < 0 || k > 1) continue;
      const a = Math.sin(k * Math.PI);
      const color = 1 + ((c + r + Math.floor(ring)) % 8);
      this.drawBlock(c, r, color, { alpha: a * 0.9, scale: 0.6 + 0.4 * a });
    }
  }

  _drawGhost() {
    if (!this.drag || !this.ghostEnabled) return;
    const d = this.drag;
    const snap = this._snap(d);
    if (!snap) return;
    const g = this.game, L = this.layout, ctx = this.ctx;
    const piece = g.pieces[d.index];
    const { rows, cols } = g.previewClears(piece.shape, snap.c, snap.r);
    if (rows.length || cols.length) {
      const glow = 0.55 + 0.25 * Math.sin(this.time * 10);
      ctx.save();
      ctx.globalAlpha = glow;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (const r of rows) { const p = this.cellPos(0, r); ctx.beginPath(); roundRect(ctx, p.x - L.gap * 0.5, p.y - L.gap * 0.5, L.cell * SIZE + L.gap * (SIZE - 1), L.cell + L.gap, L.cell * 0.25); ctx.fill(); }
      for (const c of cols) { const p = this.cellPos(c, 0); ctx.beginPath(); roundRect(ctx, p.x - L.gap * 0.5, p.y - L.gap * 0.5, L.cell + L.gap, L.cell * SIZE + L.gap * (SIZE - 1), L.cell * 0.25); ctx.fill(); }
      ctx.restore();
      for (const r of rows) for (let c = 0; c < SIZE; c++) if (g.board[r * SIZE + c]) this.drawBlock(c, r, g.board[r * SIZE + c], { variant: 'lit' });
      for (const c of cols) for (let r = 0; r < SIZE; r++) if (g.board[r * SIZE + c] && !rows.includes(r)) this.drawBlock(c, r, g.board[r * SIZE + c], { variant: 'lit' });
      // combo number preview on the lines about to clear (like Block Blast)
      const next = g.combo + 1;
      if (next >= 2) {
        ctx.save();
        ctx.font = `900 ${Math.max(12, L.cell * 0.5)}px Fredoka, Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(2, L.cell * 0.09); ctx.strokeStyle = 'rgba(10,8,30,0.85)'; ctx.fillStyle = '#fff7b0';
        const seen = new Set();
        const mark = (c, r) => { const k = r * SIZE + c; if (seen.has(k)) return; seen.add(k); const p = this.cellCenter(c, r); ctx.strokeText(String(next), p.x, p.y); ctx.fillText(String(next), p.x, p.y); };
        for (const r of rows) for (let c = 0; c < SIZE; c++) mark(c, r);
        for (const c of cols) for (let r = 0; r < SIZE; r++) mark(c, r);
        ctx.restore();
      }
    }
    for (const [dc, dr] of piece.shape.cells) this.drawBlock(snap.c + dc, snap.r + dr, piece.color, { alpha: 0.42, variant: 'ghost' });
  }

  _drawVanish() {
    const ctx = this.ctx, L = this.layout;
    let labelled = false;
    for (const v of this.vanish) {
      const k = clamp((v.t - v.delay) / 0.26, 0, 1);
      if (v.t < v.delay) { this.drawBlock(v.c, v.r, v.color, { variant: 'lit' }); if (v.label) labelled = true; continue; }
      const scale = 1 - easeOut(k);
      if (scale > 0.02) this.drawBlock(v.c, v.r, v.color, { scale: scale * 1.15, alpha: 1 - k, variant: 'lit' });
    }
    if (!labelled) return;
    // combo number stamped on every block that is about to pop
    ctx.save();
    ctx.font = `900 ${Math.max(12, L.cell * 0.52)}px Fredoka, Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, L.cell * 0.1); ctx.strokeStyle = 'rgba(10,8,30,0.85)'; ctx.fillStyle = '#fff3a0';
    for (const v of this.vanish) {
      if (!v.label || v.t >= v.delay) continue;
      const p = this.cellCenter(v.c, v.r);
      ctx.strokeText(v.label, p.x, p.y); ctx.fillText(v.label, p.x, p.y);
    }
    ctx.restore();
  }

  _drawLineFlash() {
    const ctx = this.ctx, L = this.layout;
    const span = L.cell * SIZE + L.gap * (SIZE - 1);
    for (const f of this.lineFlash) {
      const k = f.t / 0.45;
      const a = (1 - k) * 0.75;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      if (this.quality !== 'low') { ctx.shadowColor = '#ffe9a0'; ctx.shadowBlur = 25 * (1 - k); }
      const grow = 1 + k * 0.35;
      for (const r of f.rows) { const p = this.cellPos(0, r); const h = (L.cell + L.gap) * grow; ctx.beginPath(); roundRect(ctx, p.x - L.gap * 0.5, p.y + L.cell / 2 - h / 2, span, h, h * 0.3); ctx.fill(); }
      for (const c of f.cols) { const p = this.cellPos(c, 0); const w = (L.cell + L.gap) * grow; ctx.beginPath(); roundRect(ctx, p.x + L.cell / 2 - w / 2, p.y - L.gap * 0.5, w, span, w * 0.3); ctx.fill(); }
      ctx.restore();
    }
    if (this.reviveWave) {
      const k = this.reviveWave.t / 0.9;
      ctx.save();
      ctx.globalAlpha = Math.sin(Math.min(1, k) * Math.PI) * 0.6;
      ctx.fillStyle = '#a5f3fc';
      for (const r of this.reviveWave.rows) { const p = this.cellPos(0, r); ctx.beginPath(); roundRect(ctx, p.x, p.y, span, L.cell, L.cell * 0.2); ctx.fill(); }
      for (const c of this.reviveWave.cols) { const p = this.cellPos(c, 0); ctx.beginPath(); roundRect(ctx, p.x, p.y, L.cell, span, L.cell * 0.2); ctx.fill(); }
      ctx.restore();
    }
  }

  _drawPiece(piece, x, y, cellSize, gap, { alpha = 1, variant = 'solid', scale = 1 } = {}) {
    const ctx = this.ctx;
    const s = this.sprite(piece.color, cellSize, variant);
    ctx.globalAlpha = alpha;
    const pw = piece.shape.w * cellSize + (piece.shape.w - 1) * gap;
    const ph = piece.shape.h * cellSize + (piece.shape.h - 1) * gap;
    ctx.save();
    if (scale !== 1) { ctx.translate(x + pw / 2, y + ph / 2); ctx.scale(scale, scale); ctx.translate(-(x + pw / 2), -(y + ph / 2)); }
    for (const [dc, dr] of piece.shape.cells) {
      ctx.drawImage(s.cv, x + dc * (cellSize + gap), y + dr * (cellSize + gap), cellSize, cellSize);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  _drawTray() {
    const g = this.game, L = this.layout, ctx = this.ctx;
    for (let i = 0; i < PIECE_SLOTS; i++) {
      const piece = g.pieces[i];
      const slot = L.slots[i];
      if (!piece) continue;
      if (piece.used) {
        // empty slot: a soft twinkling star
        const tw = 0.5 + 0.5 * Math.sin(this.time * 3 + this.slotBob[i]);
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.3 * tw;
        ctx.fillStyle = '#ffffff';
        ctx.translate(slot.cx, slot.cy);
        ctx.rotate(this.time * 0.6);
        const s = L.slotCell * (0.45 + 0.1 * tw);
        ctx.beginPath();
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; const rr = k % 2 ? s * 0.3 : s; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill();
        ctx.restore();
        continue;
      }
      if (this.drag && this.drag.index === i) continue;
      const sc = this.slotCellFor(piece), gap = sc * 0.12 * (this.theme.style === 'grid' ? 0.35 : 1);
      const pw = piece.shape.w * sc + (piece.shape.w - 1) * gap;
      const ph = piece.shape.h * sc + (piece.shape.h - 1) * gap;
      let x = slot.cx - pw / 2, y = slot.cy - ph / 2;
      const fits = g.fitsAnywhere(piece.shape);
      let alpha = fits ? 1 : 0.28;
      let scale = 1;
      const anim = this.trayAnim[i];
      if (anim < 1) { scale = easeOutBack(anim) * 0.9 + 0.1; alpha *= clamp(anim * 2, 0, 1); }
      if (this.returning && this.returning.index === i) {
        const k = easeInOut(clamp(this.returning.t, 0, 1));
        const f = this.returning.from;
        const cs = lerp(f.s, sc, k), gp = lerp(L.gap, gap, k);
        this._drawPiece(piece, lerp(f.x, x, k), lerp(f.y, y, k), cs, gp, { alpha });
        continue;
      }
      if (this._wiggle && this._wiggle.i === i) x += Math.sin(this._wiggle.t * 60) * 4 * (1 - this._wiggle.t / 0.35);
      const bob = fits && !this.drag ? Math.sin(this.time * 2 + this.slotBob[i]) * 1.5 : 0;
      this._drawPiece(piece, x, y + bob, sc, gap, { alpha, scale });
    }
  }

  _drawDragged() {
    if (!this.drag) return;
    const d = this.drag, ctx = this.ctx;
    const piece = this.game.pieces[d.index];
    const pos = this._dragPos(d, d.anim);
    ctx.save();
    if (this.quality !== 'low') { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 12; }
    this._drawPiece(piece, pos.x, pos.y, pos.cellSize, pos.gap, { alpha: 0.98 });
    ctx.restore();
  }
}

function centroid(cells) {
  let c = 0, r = 0; for (const [x, y] of cells) { c += x; r += y; }
  return [c / cells.length, r / cells.length];
}

// Rounded, glossy block (glass themes). `s` is the device-pixel size.
function drawRoundBlock(g, x, y, s, col, variant) {
  const r = s * 0.22;
  if (variant === 'ghost') {
    g.fillStyle = col.base;
    g.beginPath(); roundRect(g, x, y, s, s, r); g.fill();
    g.strokeStyle = col.light; g.lineWidth = Math.max(1, s * 0.06);
    g.beginPath(); roundRect(g, x + g.lineWidth / 2, y + g.lineWidth / 2, s - g.lineWidth, s - g.lineWidth, r); g.stroke();
    return;
  }
  g.fillStyle = col.dark;
  g.beginPath(); roundRect(g, x, y, s, s, r); g.fill();
  const inset = s * 0.11;
  const top = g.createLinearGradient(x, y, x, y + s);
  top.addColorStop(0, col.light); top.addColorStop(0.45, col.base); top.addColorStop(1, col.base);
  g.fillStyle = top;
  g.beginPath(); roundRect(g, x, y, s, s - inset, r); g.fill();
  const gl = g.createLinearGradient(x, y, x, y + s * 0.55);
  gl.addColorStop(0, 'rgba(255,255,255,0.55)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl;
  g.beginPath(); roundRect(g, x + s * 0.1, y + s * 0.07, s * 0.8, s * 0.42, r * 0.7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = Math.max(1, s * 0.035);
  g.beginPath(); roundRect(g, x + g.lineWidth, y + g.lineWidth, s - 2 * g.lineWidth, s - inset - 2 * g.lineWidth, r * 0.9); g.stroke();
  if (variant === 'lit') { g.fillStyle = 'rgba(255,255,255,0.34)'; g.beginPath(); roundRect(g, x, y, s, s, r); g.fill(); }
}

// Square chamfered block (Block-Blast classic look) for grid themes.
function drawBevelBlock(g, x, y, s, col, variant) {
  const b = Math.max(1.5, s * 0.14);          // bevel width
  const m = Math.max(0.5, s * 0.025);         // tiny seam so adjacent blocks read as separate
  const X = x + m, Y = y + m, S = s - 2 * m;
  if (variant === 'ghost') {
    g.fillStyle = col.base; g.fillRect(X, Y, S, S);
    g.strokeStyle = col.light; g.lineWidth = Math.max(1, s * 0.07);
    g.strokeRect(X + g.lineWidth / 2, Y + g.lineWidth / 2, S - g.lineWidth, S - g.lineWidth);
    return;
  }
  g.fillStyle = col.base; g.fillRect(X, Y, S, S);
  // top + left light faces
  g.fillStyle = col.light;
  g.beginPath(); g.moveTo(X, Y); g.lineTo(X + S, Y); g.lineTo(X + S - b, Y + b); g.lineTo(X + b, Y + b); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(X, Y); g.lineTo(X + b, Y + b); g.lineTo(X + b, Y + S - b); g.lineTo(X, Y + S); g.closePath(); g.fill();
  // bottom + right dark faces
  g.fillStyle = col.dark;
  g.beginPath(); g.moveTo(X + S, Y + S); g.lineTo(X, Y + S); g.lineTo(X + b, Y + S - b); g.lineTo(X + S - b, Y + S - b); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(X + S, Y + S); g.lineTo(X + S - b, Y + S - b); g.lineTo(X + S - b, Y + b); g.lineTo(X + S, Y); g.closePath(); g.fill();
  // soft gloss on the flat face
  const gl = g.createLinearGradient(X, Y + b, X, Y + S - b);
  gl.addColorStop(0, 'rgba(255,255,255,0.22)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = gl; g.fillRect(X + b, Y + b, S - 2 * b, S - 2 * b);
  if (variant === 'lit') { g.fillStyle = 'rgba(255,255,255,0.38)'; g.fillRect(X, Y, S, S); }
}
