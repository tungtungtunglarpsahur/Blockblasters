// localStorage wrapper – everything is guarded so private mode / blocked storage never crashes the game.
const KEY_PROFILE = 'bb.profile.v1';
const KEY_GAME = 'bb.game.v1';

const DEFAULT_PROFILE = {
  best: 0,
  coins: 0,
  games: 0,
  totalScore: 0,
  totalLines: 0,
  maxCombo: 0,
  revives: 0,
  perfects: 0,
  history: [],           // last 10 scores
  unlockedThemes: [],    // theme ids unlocked by reaching their score
  daily: null,           // { date, best, played } for today's Daily Challenge
  settings: { sound: true, haptics: true, effects: 'high', ghost: true, theme: 'auto' },
};

function read(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }

export const storage = {
  loadProfile() {
    const p = read(KEY_PROFILE) || {};
    return { ...DEFAULT_PROFILE, ...p, settings: { ...DEFAULT_PROFILE.settings, ...(p.settings || {}) } };
  },
  saveProfile(profile) { return write(KEY_PROFILE, profile); },
  loadGame() { return read(KEY_GAME); },
  saveGame(state) { return write(KEY_GAME, state); },
  clearGame() { remove(KEY_GAME); },
  resetAll() { remove(KEY_PROFILE); remove(KEY_GAME); },
};
