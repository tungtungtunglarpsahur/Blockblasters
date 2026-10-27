// Canvas renderer + pointer input for the board and the piece tray.
import { SIZE, PIECE_SLOTS } from './game.js';
import { COLORS } from './shapes.js';
import { FX, roundRect, easeOut, easeOutBack, easeInOut, clamp, lerp } from './fx.js';

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas, game, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.game = game;
    this.cb = callbacks;             // { onDrop(index,col,row) -> result|null, onPick(), onInvalid(), haptic(kind) }
    this.fx = new FX();
    this.dpr = 1;
    this.w = 0; this.h = 0;
    this.sprites = new Map();
    this.time = 0;
    this.drag = null;                // { index, px, py, anim, type }
    this.returning = null;           // { index, from:{x,y,s}, t }
    this.placedAnim = [];            // { c, r, color, t, delay }
    this.vanish = [];                // { c, r, color, t, delay, spawned }
    this.lineFlash = [];             // { rows, cols, t }
    this.trayAnim = [0, 0, 0];       // pop-in progress per slot
    this.slotBob = [Math.random() * TAU, Math.random() * TAU, Math.random() * TAU];
    this.boardPulse = 0;             // combo glow
    this.pressure = 0;
    this.quality = 'high';
    this.ghostEnabled = true;
    this.interactive = true;
    this.reviveWave = null;          // { rows, cols, t }
    this.intro = 0;                  // board intro animation
    this.layout = null;
    this._bind();
    this.resize();
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
    // board takes what it can, leaving ~32% of height for the tray
    const trayShare = 0.30;
    const maxBoard = Math.min(w - pad * 2, h * (1 - trayShare) - pad * 2, 560);
    const board = Math.max(160, maxBoard);
    const gapRatio = 0.085;
    const cell = board / (SIZE + (SIZE + 1) * gapRatio);
    const gap = cell * gapRatio;
    const bx = (w - board) / 2;
    const freeAbove = h - board - h * trayShare;
    const by = Math.max(pad, freeAbove * 0.5);
    const trayTop = by + board + pad * 0.6;
    const trayH = h - trayTop - pad * 0.5;
    const slotW = board / PIECE_SLOTS;
    // tray pieces: as big as a 3-wide piece allows; wider pieces shrink individually (see slotCellFor)
    const slotCell = Math.min(cell * 0.62, (slotW - 12) / 3.4, (trayH - 10) / 3.6);
    const slots = [];
    for (let i = 0; i < PIECE_SLOTS; i++) {
      slots.push({ x: bx + slotW * i, y: trayTop, w: slotW, h: trayH, cx: bx + slotW * i + slotW / 2, cy: trayTop + trayH / 2 });
    }
    this.layout = { pad, board, cell, gap, bx, by, trayTop, trayH, slots, slotCell, slotW };
  }

  // cell size for a piece sitting in the tray (shrinks 4- and 5-long pieces so they fit the slot)
  slotCellFor(piece) {
    const L = this.layout;
    const n = Math.max(piece.shape.w, piece.shape.h);
    const limit = Math.min((L.slotW - 12) / (n + (n - 1) * 0.12), (L.trayH - 10) / (n + (n - 1) * 0.12));
    return Math.min(L.slotCell, limit);
  }

  cellCenter(c, r) {
    const L = this.layout;
    return { x: L.bx + L.gap + c * (L.cell + L.gap) + L.cell / 2, y: L.by + L.gap + r * (L.cell + L.gap) + L.cell / 2 };
  }
  cellPos(c, r) {
    const L = this.layout;
    return { x: L.bx + L.gap + c * (L.cell + L.gap), y: L.by + L.gap + r * (L.cell + L.gap) };
  }

  // ---------- sprites ----------
  sprite(color, size, variant = 'solid') {
    const key = `${color}|${size | 0}|${variant}`;
    let s = this.sprites.get(key);
    if (s) return s;
    const dp = this.dpr;
    const px = Math.max(2, Math.round(size * dp));
    const pad = variant === 'glow' ? Math.round(px * 0.5) : 0;
    const cv = document.createElement('canvas');
    cv.width = px + pad * 2; cv.height = px + pad * 2;
    const g = cv.getContext('2d');
    g.translate(pad, pad);
    drawBlockRaw(g, 0, 0, px, COLORS[color], variant);
    s = { cv, pad, px };
    this.sprites.set(key, s);
    return s;
  }

  drawBlock(c, r, color, { scale = 1, alpha = 1, variant = 'solid', x, y } = {}) {
    const L = this.layout;
    const p = x !== undefined ? { x, y } : this.cellPos(c, r);
    const s = this.sprite(color, L.cell, variant);
    const ctx = this.ctx;
    const size = L.cell * scale;
    const off = (L.cell - size) / 2;
    ctx.globalAlpha = alpha;
    ctx.drawImage(s.cv, p.x + off - s.pad / this.dpr * scale, p.y + off - s.pad / this.dpr * scale,
      size + 2 * s.pad / this.dpr * scale, size + 2 * s.pad / this.dpr * scale);
    ctx.globalAlpha = 1;
  }

  // ---------- public API: react to game results ----------
  setGame(game) { this.game = game; this.drag = null; this.returning = null; this.placedAnim.length = 0; this.vanish.length = 0; this.lineFlash.length = 0; this.trayAnim = [0, 0, 0]; this.fx.clear(); this.intro = 0; this.reviveWave = null; }

  popTray() { this.trayAnim = [0, 0, 0]; }

  applyResult(res) {
    const L = this.layout;
    const now = this.time;
    // placed cells pop in
    for (const [c, r] of res.placedCells) this.placedAnim.push({ c, r, color: res.color, t: 0, delay: 0 });
    if (res.linesCleared > 0) {
      const center = this.cellCenter(...centroid(res.placedCells));
      for (const [c, r, color] of res.cleared) {
        const p = this.cellCenter(c, r);
        const d = Math.hypot(p.x - center.x, p.y - center.y) / L.cell;
        this.vanish.push({ c, r, color, t: 0, delay: d * 0.035, spawned: false });
      }
      this.lineFlash.push({ rows: res.rows, cols: res.cols, t: 0 });
      const amp = 3 + res.linesCleared * 2.2 + Math.min(res.combo, 8) * 0.6;
      this.fx.shakeScreen(amp, 0.18 + res.linesCleared * 0.05);
      if (res.linesCleared >= 2) this.fx.flashScreen(0.12 + res.linesCleared * 0.05, '#ffffff');
      // floating score
      const col = COLORS[res.color].light;
      this.fx.text(center.x, center.y - L.cell * 0.4, `+${res.points - res.placedCells.length}`, { color: col, size: Math.max(20, L.cell * 0.62), life: 1.15 });
      if (res.combo >= 2) {
        const hue = (res.combo * 47) % 360;
        this.fx.text(center.x, center.y - L.cell * 1.35, `COMBO ×${res.combo}`, { color: `hsl(${hue} 100% 70%)`, size: Math.max(18, L.cell * 0.5), life: 1.3, vy: -55 });
        this.fx.ring(center.x, center.y, `hsl(${hue} 100% 70%)`, { r0: L.cell * 0.5, r1: L.board * (0.4 + Math.min(res.combo, 6) * 0.08), life: 0.55, width: 5 });
        this.boardPulse = 1;
      }
      if (res.perfect) {
        this.fx.text(L.bx + L.board / 2, L.by + L.board * 0.5, 'PERFECT!', { color: '#fff', size: Math.max(28, L.cell * 0.95), life: 1.8, vy: -30 });
        this.fx.confetti(this.w, this.h, 160);
        this.fx.flashScreen(0.45, '#ffffff');
        this.fx.shakeScreen(10, 0.5);
      }
    } else {
      this.fx.text(this.cellCenter(...centroid(res.placedCells)).x, this.cellCenter(...centroid(res.placedCells)).y - L.cell * 0.3, `+${res.points}`, { color: 'rgba(255,255,255,0.85)', size: Math.max(14, L.cell * 0.38), life: 0.8, vy: -45, weight: 800 });
    }
    if (res.levelUp) {
      this.fx.text(L.bx + L.board / 2, L.by + L.board * 0.8, `LEVEL ${res.level}`, { color: '#ffd166', size: Math.max(26, L.cell * 0.8), life: 1.7, vy: -22 });
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
      this.vanish.push({ c, r, color, t: 0, delay: 0.15 + d * 0.05, spawned: false });
    }
    this.fx.ring(cx.x, cx.y, '#ffffff', { r0: 5, r1: L.board, life: 0.9, width: 10 });
    this.fx.flashScreen(0.5, '#a5f3fc');
    this.fx.shakeScreen(9, 0.5);
    this.fx.text(L.bx + L.board / 2, L.by + L.board / 2, 'REVIVED!', { color: '#a5f3fc', size: Math.max(28, L.cell * 0.9), life: 1.8, vy: -30 });
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
    cv.addEventListener('pointercancel', e => this._cancel(e));
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
      // generous hit area: the whole slot
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
    // invalid: fly back
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

  // Where the dragged piece's top-left corner is (board scale), given current pointer.
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
    // animated position: lerp from slot to pointer target during pickup
    const L = this.layout;
    const t = this._dragTarget(d);
    const slot = L.slots[d.index];
    const piece = this.game.pieces[d.index];
    const sc = this.slotCellFor(piece);
    const sw = piece.shape.w * sc + (piece.shape.w - 1) * sc * 0.12;
    const sh = piece.shape.h * sc + (piece.shape.h - 1) * sc * 0.12;
    const sx = slot.cx - sw / 2, sy = slot.cy - sh / 2;
    const e = easeOut(k);
    return { x: lerp(sx, t.x, e), y: lerp(sy, t.y, e), cellSize: lerp(sc, L.cell, e), gap: lerp(sc * 0.12, L.gap, e) };
  }
  // Returns {c,r} for a valid snap, null when over the board but blocked, undefined when off the board.
  _snap(d) {
    const L = this.layout;
    const t = this._dragTarget(d);
    const piece = this.game.pieces[d.index];
    const fc = (t.x - L.bx - L.gap) / (L.cell + L.gap);
    const fr = (t.y - L.by - L.gap) / (L.cell + L.gap);
    const slack = 0.6;                     // how far past the edge we still snap
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
    if (this.drag) this.drag.anim = Math.min(1, this.drag.anim + dt / 0.14);
    if (this.returning) { this.returning.t += dt / 0.22; if (this.returning.t >= 1) this.returning = null; }
    for (let i = this.placedAnim.length - 1; i >= 0; i--) { const a = this.placedAnim[i]; a.t += dt; if (a.t > 0.3) this.placedAnim.splice(i, 1); }
    for (let i = this.vanish.length - 1; i >= 0; i--) {
      const v = this.vanish[i]; v.t += dt;
      if (!v.spawned && v.t >= v.delay) {
        v.spawned = true;
        const p = this.cellCenter(v.c, v.r);
        this.fx.cellPop(p.x, p.y, COLORS[v.color].light, this.layout.cell);
      }
      if (v.t > v.delay + 0.28) this.vanish.splice(i, 1);
    }
    for (let i = this.lineFlash.length - 1; i >= 0; i--) { const f = this.lineFlash[i]; f.t += dt; if (f.t > 0.45) this.lineFlash.splice(i, 1); }
    for (let i = 0; i < PIECE_SLOTS; i++) this.trayAnim[i] = Math.min(1, this.trayAnim[i] + dt / (0.28 + i * 0.07));
    if (this._wiggle) { this._wiggle.t += dt; if (this._wiggle.t > 0.35) this._wiggle = null; }
    this.boardPulse = Math.max(0, this.boardPulse - dt * 1.2);
    if (this.reviveWave) { this.reviveWave.t += dt; if (this.reviveWave.t > 0.9) this.reviveWave = null; }
    const target = this.game.filledCount() / (SIZE * SIZE);
    this.pressure += (target - this.pressure) * Math.min(1, dt * 4);
  }

  draw() {
    const ctx = this.ctx, L = this.layout;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.save();
    ctx.translate(this.fx.shake.x, this.fx.shake.y);

    this._drawBoardPanel();
    this._drawCells();
    this._drawGhost();
    this._drawVanish();
    this._drawLineFlash();
    this._drawTray();
    this.fx.drawRings(ctx);
    this._drawDragged();
    this.fx.drawParticles(ctx);
    this.fx.drawTexts(ctx);
    ctx.restore();
    this.fx.drawFlash(ctx, this.w, this.h);
  }

  _drawBoardPanel() {
    const ctx = this.ctx, L = this.layout;
    const k = easeOutBack(this.intro);
    const combo = this.game.combo;
    const pulse = this.boardPulse;
    const pressure = clamp((this.pressure - 0.6) / 0.35, 0, 1);
    ctx.save();
    ctx.translate(L.bx + L.board / 2, L.by + L.board / 2);
    ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k);
    ctx.translate(-(L.bx + L.board / 2), -(L.by + L.board / 2));
    ctx.globalAlpha = clamp(this.intro * 1.5, 0, 1);

    // outer glow
    if (this.quality !== 'low') {
      const hue = (combo * 47) % 360;
      ctx.shadowColor = combo >= 2 ? `hsla(${hue} 100% 65% / ${0.35 + pulse * 0.5})` : pressure > 0 ? `rgba(255,80,110,${0.25 * pressure * (0.6 + 0.4 * Math.sin(this.time * 5))})` : 'rgba(80,120,255,0.25)';
      ctx.shadowBlur = 28 + pulse * 40;
    }
    ctx.fillStyle = 'rgba(12, 16, 40, 0.72)';
    ctx.beginPath(); roundRect(ctx, L.bx, L.by, L.board, L.board, L.cell * 0.45); ctx.fill();
    ctx.shadowBlur = 0;
    // border
    const grad = ctx.createLinearGradient(L.bx, L.by, L.bx + L.board, L.by + L.board);
    grad.addColorStop(0, 'rgba(255,255,255,0.18)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.06)'); grad.addColorStop(1, 'rgba(255,255,255,0.16)');
    ctx.strokeStyle = grad; ctx.lineWidth = 1.2;
    ctx.beginPath(); roundRect(ctx, L.bx + 0.5, L.by + 0.5, L.board - 1, L.board - 1, L.cell * 0.45); ctx.stroke();
    // empty cells
    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const p = this.cellPos(c, r);
      ctx.beginPath(); roundRect(ctx, p.x, p.y, L.cell, L.cell, L.cell * 0.2); ctx.fill();
    }
    ctx.restore();
  }

  _drawCells() {
    const g = this.game, L = this.layout;
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

  _drawGhost() {
    if (!this.drag || !this.ghostEnabled) return;
    const d = this.drag;
    const snap = this._snap(d);
    if (!snap) return;
    const g = this.game, L = this.layout, ctx = this.ctx;
    const piece = g.pieces[d.index];
    const { rows, cols } = g.previewClears(piece.shape, snap.c, snap.r);
    // highlight lines that would clear
    if (rows.length || cols.length) {
      const glow = 0.55 + 0.25 * Math.sin(this.time * 10);
      ctx.save();
      ctx.globalAlpha = glow;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (const r of rows) { const p = this.cellPos(0, r); ctx.beginPath(); roundRect(ctx, p.x - L.gap * 0.5, p.y - L.gap * 0.5, L.board - L.gap, L.cell + L.gap, L.cell * 0.25); ctx.fill(); }
      for (const c of cols) { const p = this.cellPos(c, 0); ctx.beginPath(); roundRect(ctx, p.x - L.gap * 0.5, p.y - L.gap * 0.5, L.cell + L.gap, L.board - L.gap, L.cell * 0.25); ctx.fill(); }
      ctx.restore();
      // the existing blocks in those lines get a white tint
      for (const r of rows) for (let c = 0; c < SIZE; c++) if (g.board[r * SIZE + c]) this.drawBlock(c, r, g.board[r * SIZE + c], { variant: 'lit' });
      for (const c of cols) for (let r = 0; r < SIZE; r++) if (g.board[r * SIZE + c] && !rows.includes(r)) this.drawBlock(c, r, g.board[r * SIZE + c], { variant: 'lit' });
    }
    for (const [dc, dr] of piece.shape.cells) this.drawBlock(snap.c + dc, snap.r + dr, piece.color, { alpha: 0.42, variant: 'ghost' });
  }

  _drawVanish() {
    for (const v of this.vanish) {
      const k = clamp((v.t - v.delay) / 0.26, 0, 1);
      if (v.t < v.delay) { this.drawBlock(v.c, v.r, v.color, { variant: 'lit' }); continue; }
      const scale = 1 - easeOut(k);
      if (scale > 0.02) this.drawBlock(v.c, v.r, v.color, { scale: scale * 1.15, alpha: 1 - k, variant: 'lit' });
    }
  }

  _drawLineFlash() {
    const ctx = this.ctx, L = this.layout;
    for (const f of this.lineFlash) {
      const k = f.t / 0.45;
      const a = (1 - k) * 0.75;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      if (this.quality !== 'low') { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 25 * (1 - k); }
      const grow = 1 + k * 0.35;
      for (const r of f.rows) { const p = this.cellPos(0, r); const h = (L.cell + L.gap) * grow; ctx.beginPath(); roundRect(ctx, p.x - L.gap * 0.5, p.y + L.cell / 2 - h / 2, L.board - L.gap, h, h * 0.3); ctx.fill(); }
      for (const c of f.cols) { const p = this.cellPos(c, 0); const w = (L.cell + L.gap) * grow; ctx.beginPath(); roundRect(ctx, p.x + L.cell / 2 - w / 2, p.y - L.gap * 0.5, w, L.board - L.gap, w * 0.3); ctx.fill(); }
      ctx.restore();
    }
    if (this.reviveWave) {
      const k = this.reviveWave.t / 0.9;
      ctx.save();
      ctx.globalAlpha = Math.sin(Math.min(1, k) * Math.PI) * 0.6;
      ctx.fillStyle = '#a5f3fc';
      for (const r of this.reviveWave.rows) { const p = this.cellPos(0, r); ctx.beginPath(); roundRect(ctx, p.x, p.y, L.board - 2 * L.gap, L.cell, L.cell * 0.2); ctx.fill(); }
      for (const c of this.reviveWave.cols) { const p = this.cellPos(c, 0); ctx.beginPath(); roundRect(ctx, p.x, p.y, L.cell, L.board - 2 * L.gap, L.cell * 0.2); ctx.fill(); }
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
    const padCss = s.pad / this.dpr;
    for (const [dc, dr] of piece.shape.cells) {
      const px = x + dc * (cellSize + gap), py = y + dr * (cellSize + gap);
      ctx.drawImage(s.cv, px - padCss, py - padCss, cellSize + 2 * padCss, cellSize + 2 * padCss);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  _drawTray() {
    const g = this.game, L = this.layout, ctx = this.ctx;
    for (let i = 0; i < PIECE_SLOTS; i++) {
      const piece = g.pieces[i];
      const slot = L.slots[i];
      if (!piece || piece.used) continue;
      if (this.drag && this.drag.index === i) continue;
      const sc = this.slotCellFor(piece), gap = sc * 0.12;
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
    const d = this.drag, L = this.layout, ctx = this.ctx;
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

// Draws one bevelled block into a context at device-pixel size `s`.
function drawBlockRaw(g, x, y, s, col, variant) {
  const r = s * 0.22;
  if (variant === 'glow') { g.shadowColor = col.glow; g.shadowBlur = s * 0.45; }
  if (variant === 'ghost') {
    g.fillStyle = col.base;
    g.beginPath(); roundRect(g, x, y, s, s, r); g.fill();
    g.strokeStyle = col.light; g.lineWidth = Math.max(1, s * 0.06);
    g.beginPath(); roundRect(g, x + g.lineWidth / 2, y + g.lineWidth / 2, s - g.lineWidth, s - g.lineWidth, r); g.stroke();
    return;
  }
  // base (dark bottom face)
  g.fillStyle = col.dark;
  g.beginPath(); roundRect(g, x, y, s, s, r); g.fill();
  g.shadowBlur = 0;
  // top face
  const inset = s * 0.11;
  const top = g.createLinearGradient(x, y, x, y + s);
  top.addColorStop(0, col.light); top.addColorStop(0.45, col.base); top.addColorStop(1, col.base);
  g.fillStyle = top;
  g.beginPath(); roundRect(g, x, y, s, s - inset, r); g.fill();
  // glossy highlight
  const gl = g.createLinearGradient(x, y, x, y + s * 0.55);
  gl.addColorStop(0, 'rgba(255,255,255,0.55)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl;
  g.beginPath(); roundRect(g, x + s * 0.1, y + s * 0.07, s * 0.8, s * 0.42, r * 0.7); g.fill();
  // inner edge
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = Math.max(1, s * 0.035);
  g.beginPath(); roundRect(g, x + g.lineWidth, y + g.lineWidth, s - 2 * g.lineWidth, s - inset - 2 * g.lineWidth, r * 0.9); g.stroke();
  if (variant === 'lit') {
    g.fillStyle = 'rgba(255,255,255,0.34)';
    g.beginPath(); roundRect(g, x, y, s, s, r); g.fill();
  }
}
