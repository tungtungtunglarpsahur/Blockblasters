// Piece shape definitions. Each shape is a list of [col,row] cells relative to its origin.
// `w` controls how often a shape is drawn (weight). Bigger / awkward shapes are rarer.

const S = (cells, w = 1) => ({ cells, w });

const RAW = [
  // singles & lines
  S([[0,0]], 1.2),
  S([[0,0],[1,0]], 1.4), S([[0,0],[0,1]], 1.4),
  S([[0,0],[1,0],[2,0]], 1.6), S([[0,0],[0,1],[0,2]], 1.6),
  S([[0,0],[1,0],[2,0],[3,0]], 1.2), S([[0,0],[0,1],[0,2],[0,3]], 1.2),
  S([[0,0],[1,0],[2,0],[3,0],[4,0]], 0.6), S([[0,0],[0,1],[0,2],[0,3],[0,4]], 0.6),
  // squares & rects
  S([[0,0],[1,0],[0,1],[1,1]], 1.6),
  S([[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]], 0.7), S([[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]], 0.7),
  S([[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]], 0.45),
  // small L (3 cells, all 4 rotations)
  S([[0,0],[0,1],[1,1]], 1.2), S([[0,0],[1,0],[0,1]], 1.2),
  S([[0,0],[1,0],[1,1]], 1.2), S([[1,0],[0,1],[1,1]], 1.2),
  // big L (5 cells, 3x3 corner, all 4 rotations)
  S([[0,0],[0,1],[0,2],[1,2],[2,2]], 0.8), S([[0,0],[1,0],[2,0],[0,1],[0,2]], 0.8),
  S([[0,0],[1,0],[2,0],[2,1],[2,2]], 0.8), S([[2,0],[2,1],[0,2],[1,2],[2,2]], 0.8),
  // 2x3 L (4 cells, 8 orientations)
  S([[0,0],[0,1],[0,2],[1,2]], 0.9), S([[1,0],[1,1],[1,2],[0,2]], 0.9),
  S([[0,0],[1,0],[0,1],[0,2]], 0.9), S([[0,0],[1,0],[1,1],[1,2]], 0.9),
  S([[0,0],[1,0],[2,0],[0,1]], 0.9), S([[0,0],[1,0],[2,0],[2,1]], 0.9),
  S([[0,0],[0,1],[1,1],[2,1]], 0.9), S([[2,0],[0,1],[1,1],[2,1]], 0.9),
  // T (4 cells, 4 rotations)
  S([[0,0],[1,0],[2,0],[1,1]], 0.9), S([[1,0],[0,1],[1,1],[2,1]], 0.9),
  S([[0,0],[0,1],[1,1],[0,2]], 0.9), S([[1,0],[0,1],[1,1],[1,2]], 0.9),
  // S / Z (4 cells)
  S([[1,0],[2,0],[0,1],[1,1]], 0.8), S([[0,0],[1,0],[1,1],[2,1]], 0.8),
  S([[0,0],[0,1],[1,1],[1,2]], 0.8), S([[1,0],[0,1],[1,1],[0,2]], 0.8),
  // plus
  S([[1,0],[0,1],[1,1],[2,1],[1,2]], 0.5),
  // diagonals (2 & 3) – fun, rare
  S([[0,0],[1,1]], 0.35), S([[1,0],[0,1]], 0.35),
  S([[0,0],[1,1],[2,2]], 0.25), S([[2,0],[1,1],[0,2]], 0.25),
];

export const SHAPES = RAW.map((s, id) => {
  const w = Math.max(...s.cells.map(c => c[0])) + 1;
  const h = Math.max(...s.cells.map(c => c[1])) + 1;
  return { id, cells: s.cells, w, h, weight: s.w, size: s.cells.length };
});

export const TOTAL_WEIGHT = SHAPES.reduce((a, s) => a + s.weight, 0);

export function randomShape(rng = Math.random) {
  let r = rng() * TOTAL_WEIGHT;
  for (const s of SHAPES) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return SHAPES[SHAPES.length - 1];
}

// 8 vivid block colours (index 1..8). 0 = empty.
export const COLORS = [
  null,
  { base: '#ff5c8a', light: '#ff9ab8', dark: '#c2284f', glow: '#ff5c8a' }, // pink
  { base: '#ffb02e', light: '#ffd27a', dark: '#c77a00', glow: '#ffb02e' }, // amber
  { base: '#3ddc84', light: '#8cf0b7', dark: '#1a9c57', glow: '#3ddc84' }, // green
  { base: '#38bdf8', light: '#8ad9ff', dark: '#0f7fb5', glow: '#38bdf8' }, // sky
  { base: '#a78bfa', light: '#cdbdff', dark: '#6b46d9', glow: '#a78bfa' }, // violet
  { base: '#f97316', light: '#ffb074', dark: '#b84a08', glow: '#f97316' }, // orange
  { base: '#22d3ee', light: '#86ecf7', dark: '#0e8fa3', glow: '#22d3ee' }, // cyan
  { base: '#facc15', light: '#fde68a', dark: '#b58f06', glow: '#facc15' }, // yellow
];
