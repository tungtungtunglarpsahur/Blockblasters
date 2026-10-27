// Visual themes. A theme changes the background, the board, the block style and the block palette.
// Themes unlock while you play (by score) – just like the "Colorful Wood" moment in Block Blast –
// and stay unlocked in your profile afterwards.

const P = (base, light, dark) => ({ base, light, dark, glow: base });

export const PALETTES = {
  vivid: [null,
    P('#ff5c8a', '#ff9ab8', '#c2284f'), P('#ffb02e', '#ffd27a', '#c77a00'), P('#3ddc84', '#8cf0b7', '#1a9c57'), P('#38bdf8', '#8ad9ff', '#0f7fb5'),
    P('#a78bfa', '#cdbdff', '#6b46d9'), P('#f97316', '#ffb074', '#b84a08'), P('#22d3ee', '#86ecf7', '#0e8fa3'), P('#facc15', '#fde68a', '#b58f06'),
  ],
  // classic Block-Blast-like: every block is a shade of blue
  ocean: [null,
    P('#2f6ff0', '#78a6ff', '#1b47b0'), P('#1e5ae0', '#6a9cff', '#143f9e'), P('#3d82ff', '#8ab4ff', '#2458c4'), P('#2563eb', '#7aa5ff', '#1a45a8'),
    P('#1d4ed8', '#6d97ff', '#163a9a'), P('#3b7bf5', '#86b0ff', '#2353bd'), P('#2a6cf2', '#7ca8ff', '#1c4bb3'), P('#4b8cff', '#95bcff', '#2b5fcf'),
  ],
  wood: [null,
    P('#e03e3e', '#ff8a8a', '#8f1f1f'), P('#f29a1c', '#ffcf7a', '#9c5c05'), P('#f5cf23', '#fff08a', '#a68705'), P('#36b34a', '#8de59a', '#1c6e2b'),
    P('#2f7ddc', '#86b8ff', '#1a4f93'), P('#8e44d8', '#c79bff', '#5a1f96'), P('#c0772c', '#e8ac6a', '#7a4712'), P('#1fb5b0', '#8ae9e5', '#0e6f6b'),
  ],
  lava: [null,
    P('#e5282d', '#ff7b7f', '#8a1114'), P('#ff8a1f', '#ffc07a', '#a64f05'), P('#ffcf1f', '#ffea8a', '#a68305'), P('#c45a1b', '#ea9b63', '#773208'),
    P('#ff4f6e', '#ff9bb0', '#a3203a'), P('#ffa726', '#ffd085', '#a86306'), P('#d13b1d', '#f28268', '#80200c'), P('#ffe08a', '#fff2c7', '#b59a3a'),
  ],
  galaxy: [null,
    P('#c162ff', '#e0a8ff', '#7a2fb3'), P('#ff5fb5', '#ffa3d7', '#b02a78'), P('#5ea0ff', '#a3c9ff', '#2d5fb5'), P('#35e0d2', '#92f1ea', '#148f85'),
    P('#8b5cf6', '#c2a8ff', '#5a34b3'), P('#ff7bd0', '#ffb8e5', '#b23d8f'), P('#4fd1ff', '#a0e6ff', '#1f87b3'), P('#f0abfc', '#f8d4fe', '#a855f7'),
  ],
};

export const THEMES = [
  {
    id: 'neon', name: 'Neon Night', unlock: 0, palette: 'vivid', style: 'glass',
    board: { fill: 'rgba(12, 16, 40, 0.72)', cell: 'rgba(255,255,255,0.055)', border: 'rgba(255,255,255,0.14)', glow: 'rgba(80,120,255,0.25)' },
    banner: ['#ffffff', '#c7d2fe'],
  },
  {
    id: 'ocean', name: 'Ocean Classic', unlock: 2500, palette: 'ocean', style: 'grid',
    board: { fill: '#dff2ff', cell: '#d2ebff', line: 'rgba(60,110,190,0.28)', border: 'rgba(255,255,255,0.9)', glow: 'rgba(40,110,220,0.35)' },
    banner: ['#ffffff', '#9bd4ff'],
  },
  {
    id: 'wood', name: 'Colorful Wood', unlock: 6000, palette: 'wood', style: 'grid',
    board: { fill: '#5b3a1f', cell: '#4a2d16', line: 'rgba(0,0,0,0.28)', border: 'rgba(255,220,170,0.45)', glow: 'rgba(255,170,90,0.35)' },
    banner: ['#ffe9b0', '#f6a23a'],
  },
  {
    id: 'lava', name: 'Lava Ruby', unlock: 12000, palette: 'lava', style: 'grid',
    board: { fill: '#3a0d0d', cell: '#2b0909', line: 'rgba(255,120,80,0.16)', border: 'rgba(255,120,80,0.45)', glow: 'rgba(255,80,60,0.4)' },
    banner: ['#fff1c7', '#ff7a3d'],
  },
  {
    id: 'galaxy', name: 'Galaxy', unlock: 20000, palette: 'galaxy', style: 'glass',
    board: { fill: 'rgba(28, 10, 56, 0.78)', cell: 'rgba(255,255,255,0.07)', border: 'rgba(255,200,255,0.25)', glow: 'rgba(200,100,255,0.45)' },
    banner: ['#ffffff', '#f0abfc'],
  },
];

export const themeById = id => THEMES.find(t => t.id === id) || THEMES[0];

// The theme a given score plays in when the player hasn't pinned one.
export function themeForScore(score) {
  let t = THEMES[0];
  for (const th of THEMES) if (score >= th.unlock) t = th;
  return t;
}
