import { Game, REVIVE_COST, MAX_REVIVES, levelForScore } from './game.js';
import { Renderer } from './render.js';
import { UI, $, $$, fmt } from './ui.js';
import { audio } from './audio.js';
import { storage } from './storage.js';

const VERSION = '1.0.0';
const TIPS = [
  'Clear rows and columns at the same time for huge combos.',
  'Keep the centre open — big pieces need room.',
  'Consecutive clears multiply your score. Keep the chain alive!',
  'A combo survives one miss. Two misses in a row break it.',
  'Empty the whole board for a PERFECT bonus of +1000.',
  'Coins buy extra revives. Combos earn the most coins.',
  'Your first revive each game is free.',
  'Greyed-out pieces don\'t fit anywhere yet — make space first.',
  'Drag a piece over the board to preview the lines it will clear.',
];

// ---------------------------------------------------------------- state
const ui = new UI();
let profile = storage.loadProfile();
let game = null;
let renderer = null;
let run = null;            // per-game bookkeeping { recorded:false, histIndex:-1, recordedScore:0, recordedLines:0, bestCelebrated:false }
let paused = false;
let lastT = 0;
let overSoundPlayed = false;

const canvas = $('#game');

// ---------------------------------------------------------------- helpers
function haptic(pattern) {
  if (!profile.settings.haptics) return;
  try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* ignore */ }
}
function saveProfile() { storage.saveProfile(profile); }
function saveGame() { if (game) storage.saveGame(game.serialize()); }

function applySettings() {
  audio.enabled = profile.settings.sound;
  if (renderer) { renderer.quality = profile.settings.effects; renderer.ghostEnabled = profile.settings.ghost; }
  document.body.classList.toggle('low-fx', profile.settings.effects === 'low');
  $$('[data-setting]').forEach(el => {
    const key = el.dataset.setting;
    const val = profile.settings[key];
    if (el.type === 'checkbox') el.checked = !!val;
    else if (el.dataset.value !== undefined) el.classList.toggle('active', el.dataset.value === String(val));
  });
}

function newRun() {
  run = { recorded: false, histIndex: -1, recordedScore: 0, recordedLines: 0, bestCelebrated: false };
  overSoundPlayed = false;
}

// record (or update) this game's result in the profile
function recordRun() {
  const entry = { score: game.score, lines: game.lines, combo: game.maxCombo, date: Date.now() };
  profile.totalScore += game.score - run.recordedScore;
  profile.totalLines += game.lines - run.recordedLines;
  run.recordedScore = game.score; run.recordedLines = game.lines;
  if (!run.recorded) {
    run.recorded = true;
    profile.games++;
    profile.history.unshift(entry);
    profile.history = profile.history.slice(0, 10);
    run.histIndex = 0;
  } else if (run.histIndex >= 0 && profile.history[run.histIndex]) {
    profile.history[run.histIndex] = entry;
  }
  profile.maxCombo = Math.max(profile.maxCombo, game.maxCombo);
  profile.best = Math.max(profile.best, game.score);
  saveProfile();
}

// ---------------------------------------------------------------- game flow
const rendererCallbacks = {
  onPick: () => { audio.pick(); haptic(8); },
  onInvalid: (fromDrop) => { audio.invalid(); haptic(fromDrop ? [10, 30, 10] : 20); },
  onDrop: (index, col, row) => handleDrop(index, col, row),
};

function startGame(resume = false) {
  const saved = resume ? storage.loadGame() : null;
  game = saved ? Game.fromJSON(saved) : new Game();
  newRun();
  if (!renderer) renderer = new Renderer(canvas, game, rendererCallbacks);
  else renderer.setGame(game);
  applySettings();
  ui.setScore(game.score, true);
  ui.setBest(profile.best);
  ui.setCoins(profile.coins, true);
  ui.setLevel(game.score);
  ui.setCombo(game.combo);
  paused = false;
  renderer.interactive = true;
  ui.hideAll();
  if (!saved) storage.clearGame();
  saveGame();
  if (game.gameOver) showGameOver();
}

function handleDrop(index, col, row) {
  const res = game.place(index, col, row);
  if (!res) return false;
  renderer.applyResult(res);
  audio.drop(res.placedCells.length);
  haptic(12);
  if (res.linesCleared > 0) {
    setTimeout(() => audio.clear(res.linesCleared, res.combo), 40);
    haptic(res.linesCleared >= 2 ? [20, 30, 40] : 25);
    if (res.combo >= 2) setTimeout(() => audio.combo(res.combo), 120);
    ui.bumpScore();
  }
  if (res.perfect) setTimeout(() => audio.perfect(), 200);
  if (res.levelUp) setTimeout(() => audio.levelUp(), res.linesCleared ? 350 : 100);
  if (res.coins > 0) { profile.coins += res.coins; ui.setCoins(profile.coins); if (res.coins >= 5) setTimeout(() => audio.coin(), 260); }
  ui.setScore(game.score);
  ui.setLevel(game.score);
  ui.setCombo(game.combo);
  if (game.score > profile.best) {
    const hadBest = profile.best > 0;
    profile.best = game.score;
    ui.setBest(profile.best);
    if (hadBest && !run.bestCelebrated) {
      run.bestCelebrated = true;
      renderer.celebrateBest();
      renderer.fx.text(renderer.w / 2, renderer.layout.by + renderer.layout.board * 0.18, 'NEW BEST!', { color: '#ffd166', size: Math.max(26, renderer.layout.cell * 0.8), life: 2, vy: -20 });
      setTimeout(() => audio.newBest(), 300);
      haptic([30, 40, 30, 40, 60]);
    }
  }
  saveProfile();
  saveGame();
  if (res.gameOver) setTimeout(showGameOver, 650);
  return true;
}

function showGameOver() {
  renderer.interactive = false;
  recordRun();
  const isBest = game.score >= profile.best && game.score > 0;
  if (!overSoundPlayed) { overSoundPlayed = true; if (!isBest) audio.gameOver(); haptic([60, 40, 120]); }
  $('#over-title').textContent = isBest ? 'NEW HIGHSCORE!' : 'GAME OVER';
  $('#over-title').classList.toggle('gold', isBest);
  $('#over-score').textContent = fmt(game.score);
  $('#over-best').textContent = fmt(profile.best);
  $('#over-lines').textContent = fmt(game.lines);
  $('#over-combo').textContent = `×${game.maxCombo}`;
  $('#over-level').textContent = String(levelForScore(game.score));
  const canRevive = game.canRevive();
  const free = game.reviveIsFree();
  const btn = $('#btn-revive');
  const card = $('#revive-card');
  card.hidden = !canRevive;
  if (canRevive) {
    const affordable = free || profile.coins >= REVIVE_COST;
    btn.disabled = !affordable;
    $('#revive-price').innerHTML = free ? 'FREE' : `<span class="coin"></span> ${REVIVE_COST}`;
    $('#revive-left').textContent = `${MAX_REVIVES - game.revivesUsed} left`;
    $('#revive-hint').textContent = affordable
      ? (free ? 'Your first revive is on the house.' : `You have ${fmt(profile.coins)} coins.`)
      : `Not enough coins — you have ${fmt(profile.coins)}. Earn more with combos.`;
  }
  ui.show('over');
}

function doRevive() {
  if (!game.canRevive()) return;
  if (!game.reviveIsFree()) {
    if (profile.coins < REVIVE_COST) { ui.toast('Not enough coins'); audio.invalid(); return; }
    profile.coins -= REVIVE_COST;
    ui.setCoins(profile.coins);
  }
  profile.revives++;
  saveProfile();
  const rev = game.revive();
  if (!rev) return;
  overSoundPlayed = false;
  ui.hideAll();
  audio.revive();
  haptic([20, 30, 20, 30, 80]);
  renderer.applyRevive(rev);
  ui.setCombo(0);
  setTimeout(() => { renderer.interactive = true; }, 450);
  saveGame();
  if (game.gameOver) setTimeout(showGameOver, 900);
}

function restart() {
  storage.clearGame();
  startGame(false);
  audio.click();
}

function goHome() {
  if (game && !game.gameOver) saveGame(); else storage.clearGame();
  if (game && game.gameOver) recordRun();
  renderer.interactive = false;
  paused = true;
  showMenu();
}

function showMenu() {
  const saved = storage.loadGame();
  const cont = $('#btn-continue');
  cont.hidden = !(saved && !saved.gameOver);
  if (saved && !saved.gameOver) $('#continue-score').textContent = `${fmt(saved.score)} pts`;
  $('#menu-best').textContent = fmt(profile.best);
  $('#menu-coins').textContent = fmt(profile.coins);
  ui.show('menu');
}

function showStats() {
  const avg = profile.games ? profile.totalScore / profile.games : 0;
  $('#st-best').textContent = fmt(profile.best);
  $('#st-games').textContent = fmt(profile.games);
  $('#st-avg').textContent = fmt(avg);
  $('#st-lines').textContent = fmt(profile.totalLines);
  $('#st-combo').textContent = `×${profile.maxCombo}`;
  $('#st-revives').textContent = fmt(profile.revives);
  $('#st-coins').textContent = fmt(profile.coins);
  const list = $('#st-history');
  list.innerHTML = '';
  if (!profile.history.length) list.innerHTML = '<li class="muted">No games yet. Go play!</li>';
  for (const h of profile.history) {
    const li = document.createElement('li');
    const d = new Date(h.date);
    li.innerHTML = `<span class="h-score">${fmt(h.score)}</span><span class="h-meta">${h.lines} lines · ×${h.combo}</span><span class="h-date">${d.toLocaleDateString()}</span>`;
    list.appendChild(li);
  }
  ui.show('stats');
}

let settingsFrom = 'menu';
function openSettings(from) { settingsFrom = from; ui.show('settings'); }

function pause() {
  if (!game || game.gameOver || ui.current) return;
  paused = true;
  renderer.interactive = false;
  saveGame();
  ui.show('pause');
  audio.click();
}
function resume() {
  paused = false;
  renderer.interactive = true;
  ui.hideAll();
  lastT = performance.now();
}

// ---------------------------------------------------------------- loop
function frame(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
  lastT = t;
  if (renderer) {
    renderer.update(dt);
    renderer.draw();
  }
  ui.tick(dt);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot
function bindUI() {
  const click = fn => e => { e.preventDefault(); audio.unlock(); audio.click(); fn(e); };
  $('#btn-play').addEventListener('click', click(() => startGame(false)));
  $('#btn-continue').addEventListener('click', click(() => startGame(true)));
  $('#btn-stats').addEventListener('click', click(showStats));
  $('#btn-settings').addEventListener('click', click(() => openSettings('menu')));
  $('#btn-pause-settings').addEventListener('click', click(() => openSettings('pause')));
  $('#btn-pause').addEventListener('click', e => { e.preventDefault(); audio.unlock(); pause(); });
  $('#btn-resume').addEventListener('click', click(resume));
  $('#btn-restart').addEventListener('click', click(restart));
  $('#btn-home').addEventListener('click', click(goHome));
  $('#btn-revive').addEventListener('click', click(doRevive));
  $('#btn-again').addEventListener('click', click(restart));
  $('#btn-over-home').addEventListener('click', click(goHome));
  $$('[data-back]').forEach(b => b.addEventListener('click', click(() => {
    const target = b.dataset.back === 'auto' ? settingsFrom : b.dataset.back;
    if (target === 'pause') ui.show('pause'); else showMenu();
  })));
  $('#btn-reset').addEventListener('click', click(() => {
    if (confirm('Reset highscore, coins and all stats? This cannot be undone.')) {
      storage.resetAll();
      profile = storage.loadProfile();
      applySettings();
      ui.setBest(0); ui.setCoins(0, true);
      ui.toast('All data reset');
      showMenu();
    }
  }));
  $$('[data-setting]').forEach(el => {
    el.addEventListener('change', () => { if (el.type === 'checkbox') { profile.settings[el.dataset.setting] = el.checked; saveProfile(); applySettings(); audio.click(); } });
    el.addEventListener('click', () => { if (el.dataset.value !== undefined) { profile.settings[el.dataset.setting] = el.dataset.value; saveProfile(); applySettings(); audio.click(); } });
  });
  // pause menu quick toggles mirror the settings via the same data-setting attributes (handled above)

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (ui.current === 'pause') resume(); else if (!ui.current) pause(); }
  });
  window.addEventListener('resize', () => renderer && renderer.resize());
  window.visualViewport?.addEventListener('resize', () => renderer && renderer.resize());
  document.addEventListener('visibilitychange', () => { if (document.hidden && game && !game.gameOver && !ui.current) pause(); });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true, capture: true });
  window.addEventListener('pagehide', () => { if (game && !game.gameOver) saveGame(); });
}

async function loading() {
  const bar = $('#load-bar');
  const tip = $('#load-tip');
  tip.textContent = TIPS[(Math.random() * TIPS.length) | 0];
  const steps = [
    ['Loading fonts', async () => { try { await (document.fonts?.ready || Promise.resolve()); } catch { /* ignore */ } }],
    ['Warming up blocks', async () => { renderer = new Renderer(canvas, new Game(), rendererCallbacks); renderer.interactive = false; for (let i = 1; i <= 8; i++) { renderer.sprite(i, renderer.layout.cell); renderer.sprite(i, renderer.layout.slotCell); } }],
    ['Polishing effects', async () => { await new Promise(r => setTimeout(r, 120)); }],
    ['Ready', async () => {}],
  ];
  const start = performance.now();
  for (let i = 0; i < steps.length; i++) {
    $('#load-text').textContent = steps[i][0];
    await steps[i][1]();
    const k = (i + 1) / steps.length;
    bar.style.transform = `scaleX(${k})`;
    await new Promise(r => setTimeout(r, 180));
  }
  const minTime = 1400;
  const left = minTime - (performance.now() - start);
  if (left > 0) await new Promise(r => setTimeout(r, left));
  $('#screen-loading').classList.add('done');
  // renderer was built with a throwaway game; the real one is created on Play.
  renderer.interactive = false;
}

async function boot() {
  $('#version').textContent = `v${VERSION}`;
  bindUI();
  applySettings();
  ui.setBest(profile.best);
  ui.setCoins(profile.coins, true);
  ui.show('loading');
  requestAnimationFrame(frame);
  await loading();
  showMenu();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

// small debug hook (handy in devtools): __bb.game, __bb.renderer
window.__bb = { get game() { return game; }, get renderer() { return renderer; }, get profile() { return profile; }, showGameOver };

boot();
