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

// Block colours (index 1..8, 0 = empty) live in themes.js – every theme has its own palette.
export const COLOR_COUNT = 8;
