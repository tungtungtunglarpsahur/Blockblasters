// Pure game logic – no DOM, no rendering. Everything here is deterministic given the RNG.
import { SHAPES, randomShape } from './shapes.js';

export const SIZE = 8;
export const PIECE_SLOTS = 3;
export const REVIVE_COST = 100;      // coins, after the free revive is used
export const MAX_REVIVES = 5;        // per game

export function levelForScore(score) {
  return Math.floor(Math.sqrt(Math.max(0, score) / 500)) + 1;
}
export function scoreForLevel(level) {
  return (level - 1) * (level - 1) * 500;
}

export class Game {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.board = new Uint8Array(SIZE * SIZE);
    this.pieces = [];
    this.score = 0;
    this.combo = 0;
    this.missStreak = 0;
    this.lines = 0;
    this.maxCombo = 0;
    this.placed = 0;
    this.revivesUsed = 0;
    this.gameOver = false;
    this.seedCounter = 0;
    this.genPieces();
  }

  // ---------- board helpers ----------
  get(c, r) { return this.board[r * SIZE + c]; }
  set(c, r, v) { this.board[r * SIZE + c] = v; }
  isEmptyBoard() { for (let i = 0; i < this.board.length; i++) if (this.board[i]) return false; return true; }
  filledCount() { let n = 0; for (let i = 0; i < this.board.length; i++) if (this.board[i]) n++; return n; }

  canPlace(shape, col, row) {
    if (col < 0 || row < 0 || col + shape.w > SIZE || row + shape.h > SIZE) return false;
    for (const [dc, dr] of shape.cells) {
      if (this.board[(row + dr) * SIZE + (col + dc)]) return false;
    }
    return true;
  }

  // All valid placements for a shape on the current board.
  placements(shape) {
    const out = [];
    for (let r = 0; r <= SIZE - shape.h; r++)
      for (let c = 0; c <= SIZE - shape.w; c++)
        if (this.canPlace(shape, c, r)) out.push([c, r]);
    return out;
  }

  fitsAnywhere(shape) {
    for (let r = 0; r <= SIZE - shape.h; r++)
      for (let c = 0; c <= SIZE - shape.w; c++)
        if (this.canPlace(shape, c, r)) return true;
    return false;
  }

  anyMoveAvailable() {
    return this.pieces.some(p => p && !p.used && this.fitsAnywhere(p.shape));
  }

  // ---------- pieces ----------
  randomColor() { return 1 + Math.floor(this.rng() * 8); }

  genPieces() {
    // Draw three pieces. Be fair: make sure at least one of them can be placed right now
    // (if any shape at all fits). Also avoid three identical shapes.
    let set = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const cand = [];
      for (let i = 0; i < PIECE_SLOTS; i++) {
        let shape = randomShape(this.rng);
        let tries = 0;
        while (tries++ < 6 && cand.some(p => p.shape.id === shape.id)) shape = randomShape(this.rng);
        cand.push({ shape, color: this.randomColor(), used: false });
      }
      if (cand.some(p => this.fitsAnywhere(p.shape))) { set = cand; break; }
      set = cand;
    }
    if (!set.some(p => this.fitsAnywhere(p.shape))) {
      // last resort: swap in any fitting shape, if one exists
      const fitting = SHAPES.filter(s => this.fitsAnywhere(s));
      if (fitting.length) {
        set[Math.floor(this.rng() * PIECE_SLOTS)] = {
          shape: fitting[Math.floor(this.rng() * fitting.length)], color: this.randomColor(), used: false,
        };
      }
    }
    this.pieces = set;
    this.seedCounter++;
  }

  // Which full rows/cols would be cleared if `shape` were placed at col,row (preview).
  previewClears(shape, col, row) {
    const rows = [], cols = [];
    const tmp = this.board.slice();
    for (const [dc, dr] of shape.cells) tmp[(row + dr) * SIZE + (col + dc)] = 1;
    for (let r = 0; r < SIZE; r++) { let full = true; for (let c = 0; c < SIZE; c++) if (!tmp[r * SIZE + c]) { full = false; break; } if (full) rows.push(r); }
    for (let c = 0; c < SIZE; c++) { let full = true; for (let r = 0; r < SIZE; r++) if (!tmp[r * SIZE + c]) { full = false; break; } if (full) cols.push(c); }
    return { rows, cols };
  }

  // ---------- the move ----------
  place(index, col, row) {
    const piece = this.pieces[index];
    if (!piece || piece.used || this.gameOver || !this.canPlace(piece.shape, col, row)) return null;

    const placedCells = [];
    for (const [dc, dr] of piece.shape.cells) {
      const c = col + dc, r = row + dr;
      this.set(c, r, piece.color);
      placedCells.push([c, r]);
    }
    piece.used = true;
    this.placed++;

    // detect full lines
    const rows = [], cols = [];
    for (let r = 0; r < SIZE; r++) { let full = true; for (let c = 0; c < SIZE; c++) if (!this.get(c, r)) { full = false; break; } if (full) rows.push(r); }
    for (let c = 0; c < SIZE; c++) { let full = true; for (let r = 0; r < SIZE; r++) if (!this.get(c, r)) { full = false; break; } if (full) cols.push(c); }
    const linesCleared = rows.length + cols.length;

    // collect cleared cells (with colours, for effects) then clear them
    const cleared = [];
    const seen = new Set();
    const mark = (c, r) => { const k = r * SIZE + c; if (!seen.has(k)) { seen.add(k); cleared.push([c, r, this.board[k]]); } };
    for (const r of rows) for (let c = 0; c < SIZE; c++) mark(c, r);
    for (const c of cols) for (let r = 0; r < SIZE; r++) mark(c, r);
    for (const [c, r] of cleared) this.set(c, r, 0);

    // scoring
    let points = piece.shape.size;
    let comboBefore = this.combo;
    let perfect = false;
    let coins = 0;
    if (linesCleared > 0) {
      this.combo++;
      this.missStreak = 0;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const base = 80 * linesCleared + 40 * linesCleared * (linesCleared - 1);
      points += base * Math.max(1, this.combo);
      this.lines += linesCleared;
      coins += linesCleared + (this.combo >= 2 ? this.combo : 0);
      if (this.isEmptyBoard()) { perfect = true; points += 1000; coins += 25; }
    } else {
      this.missStreak++;
      if (this.missStreak >= 2) { this.combo = 0; this.missStreak = 0; }
    }

    const levelBefore = levelForScore(this.score);
    this.score += points;
    const level = levelForScore(this.score);
    const levelUp = level > levelBefore;
    if (levelUp) coins += 10;

    // refill when all three are used
    let refilled = false;
    if (this.pieces.every(p => p.used)) { this.genPieces(); refilled = true; }

    if (!this.anyMoveAvailable()) this.gameOver = true;

    return {
      placedCells, rows, cols, cleared, linesCleared, points, perfect, coins,
      combo: this.combo, comboBefore, levelUp, level, refilled, gameOver: this.gameOver,
      color: piece.color, score: this.score,
    };
  }

  // ---------- revive ----------
  canRevive() { return this.gameOver && this.revivesUsed < MAX_REVIVES; }
  reviveIsFree() { return this.revivesUsed === 0; }

  // Clears 3 contiguous rows + 3 contiguous columns. Their intersection is a guaranteed
  // 3x3 hole and the rows are completely empty, so every piece in the tray fits again.
  revive() {
    if (!this.canRevive()) return null;
    const r0 = 1 + Math.floor(this.rng() * (SIZE - 4));   // 1..4  -> rows r0..r0+2
    const c0 = 1 + Math.floor(this.rng() * (SIZE - 4));
    const rows = [r0, r0 + 1, r0 + 2];
    const cols = [c0, c0 + 1, c0 + 2];
    const cleared = [];
    const seen = new Set();
    const mark = (c, r) => { const k = r * SIZE + c; if (!seen.has(k) && this.board[k]) { seen.add(k); cleared.push([c, r, this.board[k]]); } };
    for (const r of rows) for (let c = 0; c < SIZE; c++) mark(c, r);
    for (const c of cols) for (let r = 0; r < SIZE; r++) mark(c, r);
    for (const [c, r] of cleared) this.set(c, r, 0);
    this.revivesUsed++;
    this.gameOver = false;
    this.combo = 0; this.missStreak = 0;
    // fresh tray, every piece must be placeable
    this.genPieces();
    if (!this.anyMoveAvailable()) this.gameOver = true; // practically impossible
    return { rows, cols, cleared };
  }

  // ---------- persistence ----------
  serialize() {
    return {
      v: 1,
      board: Array.from(this.board),
      pieces: this.pieces.map(p => ({ s: p.shape.id, c: p.color, u: p.used })),
      score: this.score, combo: this.combo, missStreak: this.missStreak, lines: this.lines,
      maxCombo: this.maxCombo, placed: this.placed, revivesUsed: this.revivesUsed, gameOver: this.gameOver,
    };
  }

  static fromJSON(data, rng = Math.random) {
    const g = new Game(rng);
    if (!data || data.v !== 1 || !Array.isArray(data.board) || data.board.length !== SIZE * SIZE) return g;
    g.board = Uint8Array.from(data.board);
    g.pieces = (data.pieces || []).map(p => ({ shape: SHAPES[p.s] || SHAPES[0], color: p.c || 1, used: !!p.u }));
    while (g.pieces.length < PIECE_SLOTS) g.pieces.push({ shape: randomShape(rng), color: 1, used: true });
    if (g.pieces.every(p => p.used)) g.genPieces();
    g.score = data.score | 0; g.combo = data.combo | 0; g.missStreak = data.missStreak | 0;
    g.lines = data.lines | 0; g.maxCombo = data.maxCombo | 0; g.placed = data.placed | 0;
    g.revivesUsed = data.revivesUsed | 0; g.gameOver = !!data.gameOver || !g.anyMoveAvailable();
    return g;
  }
}
