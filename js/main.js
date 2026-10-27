import { Game, REVIVE_COST, MAX_REVIVES, levelForScore, hashSeed, todayKey } from './game.js';
import { Renderer } from './render.js';
import { UI, $, $$, fmt } from './ui.js';
import { audio } from './audio.js';
import { storage } from './storage.js';
import { THEMES, PALETTES, themeById, themeForScore } from './themes.js';

const VERSION = '1.1.1';
const TIPS = [
  'Clear rows and columns at the same time for huge combos.',
  'Keep the centre open — big pieces need room.',
  'Consecutive clears multiply your score. Keep the chain alive!',
  'A combo survives one miss. Two misses in a row break it.',
  'Empty the whole board for an ALL CLEAR — the bonus scales with your combo.',
  'Coins buy extra revives. Combos earn the most coins.',
  'Your first revive each game is free.',
  'Greyed-out pieces don\'t fit anywhere yet — make space first.',
  'Drag a piece over the board to preview the lines it will clear.',
  'New themes unlock as your score climbs: Ocean, Colorful Wood, Lava Ruby, Galaxy.',
  'The score colour shows your combo tier — chase the magenta tier!',
  'Daily Challenge: everyone gets the same first pieces. One board per day.',
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

// Adaptive effect quality: 'auto' measures real frame times and drops to 'low' on phones that
// can't hold ~50 fps, then climbs back when things are smooth again.
const perf = { avg: 16, slowFor: 0, fastFor: 0, level: 'high' };
function effectiveQuality() {
  const pref = profile.settings.effects || 'auto';
  return pref === 'auto' ? perf.level : pref;
}
function samplePerf(dt) {
  if (dt <= 0 || dt >= 0.05) return;             // ignore pauses / tab switches
  perf.avg += (dt - perf.avg) * 0.08;
  if (perf.avg > 0.022) { perf.slowFor += dt; perf.fastFor = 0; } else if (perf.avg < 0.0145) { perf.fastFor += dt; perf.slowFor = 0; } else { perf.slowFor = 0; perf.fastFor = 0; }
  let next = perf.level;
  if (perf.level === 'high' && perf.slowFor > 1.5) next = 'low';
  else if (perf.level === 'low' && perf.fastFor > 6) next = 'high';
  if (next !== perf.level) { perf.level = next; perf.slowFor = perf.fastFor = 0; applyQuality(); }
}
function applyQuality() {
  const q = effectiveQuality();
  if (renderer) renderer.quality = q;
  document.body.classList.toggle('low-fx', q === 'low');
}

function applySettings() {
  audio.enabled = profile.settings.sound;
  if (renderer) renderer.ghostEnabled = profile.settings.ghost;
  applyQuality();
  $$('[data-setting]').forEach(el => {
    const key = el.dataset.setting;
    const val = profile.settings[key];
    if (el.type === 'checkbox') el.checked = !!val;
    else if (el.dataset.value !== undefined) el.classList.toggle('active', el.dataset.value === String(val));
  });
  renderThemePicker();
  applyTheme(pickTheme(game ? game.score : 0));
}

// ---------------------------------------------------------------- themes
let currentTheme = null;
function unlockedThemes() {
  const set = new Set(['neon', ...(profile.unlockedThemes || [])]);
  for (const t of THEMES) if (profile.best >= t.unlock) set.add(t.id);
  return set;
}
// Which theme to show right now: the pinned one, or the best one unlocked by this game's score.
function pickTheme(score) {
  const pin = profile.settings.theme || 'auto';
  if (pin !== 'auto' && unlockedThemes().has(pin)) return themeById(pin);
  return themeForScore(score);
}
function applyTheme(theme, { animate = false } = {}) {
  const changed = !currentTheme || currentTheme.id !== theme.id;
  currentTheme = theme;
  document.body.dataset.theme = theme.id;
  if (renderer) renderer.setTheme(theme, { animate: animate && changed });
  if (changed) renderThemePicker();
}
function renderThemePicker() {
  const list = $('#theme-list');
  if (!list) return;
  const unlocked = unlockedThemes();
  const pin = profile.settings.theme || 'auto';
  const chips = [{ id: 'auto', name: 'Auto', sub: 'by score', palette: 'vivid', unlock: 0 }, ...THEMES];
  list.innerHTML = '';
  for (const t of chips) {
    const isUnlocked = t.id === 'auto' || unlocked.has(t.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-chip' + (pin === t.id ? ' active' : '') + (isUnlocked ? '' : ' locked');
    const pal = PALETTES[t.palette];
    const sw = [1, 3, 5, 7].map(i => `<i style="--c:${pal[i].base}"></i>`).join('');
    btn.innerHTML = `<div class="sw" style="--sw:${t.id === 'auto' ? 'rgba(255,255,255,.1)' : (t.board ? t.board.fill : 'rgba(255,255,255,.1)')}">${sw}</div><span>${t.name}</span><small>${isUnlocked ? (t.sub || (t.unlock ? 'unlocked' : 'default')) : `🔒 ${fmt(t.unlock)} pts`}</small>`;
    btn.addEventListener('click', e => {
      e.preventDefault();
      if (!isUnlocked) { ui.toast(`Reach ${fmt(t.unlock)} points to unlock ${t.name}`); audio.invalid(); return; }
      profile.settings.theme = t.id; saveProfile(); audio.click();
      renderThemePicker();
      applyTheme(pickTheme(game ? game.score : 0), { animate: true });
    });
    list.appendChild(btn);
  }
}
// called after every move: unlock + switch themes as the score climbs
function checkThemeProgress() {
  let unlockedNow = null;
  profile.unlockedThemes = profile.unlockedThemes || [];
  for (const t of THEMES) {
    if (t.unlock > 0 && game.score >= t.unlock && !profile.unlockedThemes.includes(t.id)) { profile.unlockedThemes.push(t.id); unlockedNow = t; }
  }
  const next = pickTheme(game.score);
  if (next.id !== currentTheme.id) {
    applyTheme(next, { animate: true });
    renderer.praise(next.name, { colors: next.banner, lane: 0, size: 1.05, sub: unlockedNow ? 'NEW THEME UNLOCKED!' : 'THEME SWITCH', subColor: '#ffe08a', life: 2.6 });
    setTimeout(() => audio.newBest(), 150);
    haptic([30, 40, 30, 40, 80]);
  }
  if (unlockedNow) saveProfile();
}

// ---------------------------------------------------------------- praise
function praiseFor(res) {
  const L = res.linesCleared;
  if (res.perfect) {
    renderer.praise('ALL CLEAR!', { colors: ['#fff7cc', '#ffb02e'], lane: 0, size: 1.15, sub: `×${Math.max(2, res.combo)} BONUS  +${fmt(res.perfectBonus)}`, subColor: '#ffffff', life: 2.4 });
    return;
  }
  if (L >= 4) renderer.praise('Unbelievable!', { colors: ['#ffffff', '#ff5ce0'], lane: 0, y: 0.55, size: 1.05, life: 1.8 });
  else if (L === 3) renderer.praise('Amazing!', { colors: ['#ffffff', '#a78bfa'], lane: 0, y: 0.55, size: 1, life: 1.6 });
  else if (L === 2) renderer.praise('Great!', { colors: ['#ffffff', '#3ddc84'], lane: 0, y: 0.55, size: 0.95, life: 1.4 });
  else if (L === 1 && res.combo < 2) renderer.praise('Cool!', { colors: ['#ffffff', '#38bdf8'], lane: 0, y: 0.55, size: 0.85, life: 1.1 });
  if (res.combo >= 2) {
    const milestone = res.combo % 5 === 0;
    renderer.praise(`Combo ${res.combo}`, { colors: res.combo >= 10 ? ['#ffffff', '#ff5ce0'] : res.combo >= 5 ? ['#ffffff', '#5ef08a'] : ['#ffffff', '#ffa43a'], lane: 1, y: 0.32, size: milestone ? 1.1 : 0.95, life: 1.4 });
    if (milestone) renderer.praise(res.combo >= 20 ? 'UNSTOPPABLE!' : 'Combo Master!', { colors: ['#fff3b0', '#f6a23a'], lane: 0, y: 0.55, size: 1.05, life: 1.8 });
  }
  if (res.cleared.length >= 8 && res.colorsGone <= 2) {
    renderer.praise(res.colorsGone === 1 ? 'Mono Clear!' : '2 Colors Gone!', { colors: ['#ffffff', res.colorsGone === 1 ? '#22d3ee' : '#f472b6'], lane: 2, y: 0.76, size: 0.8, life: 1.5 });
  }
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
  if (game.mode === 'daily') { const d = dailyInfo(); d.best = Math.max(d.best, game.score); if (!run.dailyCounted) { run.dailyCounted = true; d.played++; } }
  else profile.best = Math.max(profile.best, game.score);
  saveProfile();
}

// ---------------------------------------------------------------- game flow
const rendererCallbacks = {
  onPick: () => { audio.pick(); haptic(8); },
  onInvalid: (fromDrop) => { audio.invalid(); haptic(fromDrop ? [10, 30, 10] : 20); },
  onDrop: (index, col, row) => handleDrop(index, col, row),
};

function dailyInfo() {
  const key = todayKey();
  if (!profile.daily || profile.daily.date !== key) profile.daily = { date: key, best: 0, played: 0 };
  return profile.daily;
}
function bestFor(g) { return g && g.mode === 'daily' ? dailyInfo().best : profile.best; }

function startGame(resume = false, mode = 'classic') {
  const saved = resume ? storage.loadGame() : null;
  if (saved) game = Game.fromJSON(saved);
  else if (mode === 'daily') { const key = todayKey(); game = new Game({ mode: 'daily', daily: key, seed: hashSeed('block-blasters-daily-' + key) }); }
  else game = new Game({ mode: 'classic' });
  newRun();
  if (!renderer) renderer = new Renderer(canvas, game, rendererCallbacks);
  else renderer.setGame(game);
  applySettings();                       // also applies the theme for this score
  ui.setScore(game.score, true);
  ui.setBest(bestFor(game));
  $('#mode-badge').hidden = game.mode !== 'daily';
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
  if (res.levelUp) { setTimeout(() => audio.levelUp(), res.linesCleared ? 350 : 100); renderer.praise(`Level ${res.level}`, { colors: ['#fff3b0', '#ffd166'], lane: 3, y: 0.93, size: 0.72, life: 1.6 }); }
  praiseFor(res);
  let coins = res.coins;
  if (res.linesCleared > 0 && res.cleared.length >= 8 && res.colorsGone <= 2) coins += 3;   // colour bonus
  if (coins > 0) { profile.coins += coins; ui.setCoins(profile.coins); if (coins >= 5) setTimeout(() => audio.coin(), 260); }
  ui.setScore(game.score);
  ui.setLevel(game.score);
  ui.setCombo(game.combo);
  const prevBest = bestFor(game);
  if (game.score > prevBest) {
    const hadBest = prevBest > 0;
    if (game.mode === 'daily') dailyInfo().best = game.score; else profile.best = game.score;
    ui.setBest(game.score);
    if (hadBest && !run.bestCelebrated) {
      run.bestCelebrated = true;
      renderer.celebrateBest();
      renderer.praise('NEW BEST!', { colors: ['#fff3b0', '#ffd166'], lane: 4, y: 0.09, size: 0.85, life: 2.2 });
      setTimeout(() => audio.newBest(), 300);
      haptic([30, 40, 30, 40, 60]);
    }
  }
  checkThemeProgress();
  saveProfile();
  saveGame();
  if (res.gameOver) setTimeout(showGameOver, 650);
  return true;
}

function showGameOver() {
  renderer.interactive = false;
  recordRun();
  const isBest = game.score >= bestFor(game) && game.score > 0;
  if (!overSoundPlayed) { overSoundPlayed = true; if (!isBest) audio.gameOver(); haptic([60, 40, 120]); }
  $('#over-title').textContent = isBest ? (game.mode === 'daily' ? 'DAILY BEST!' : 'NEW HIGHSCORE!') : 'GAME OVER';
  $('#over-title').classList.toggle('gold', isBest);
  $('#over-mode').textContent = game.mode === 'daily' ? `Daily Challenge · ${game.daily}` : 'Classic · Endless';
  $('#over-score').textContent = fmt(game.score);
  $('#over-best').textContent = fmt(bestFor(game));
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
  startGame(false, game ? game.mode : 'classic');
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
  let saved = storage.loadGame();
  if (saved && saved.mode === 'daily' && saved.daily !== todayKey()) { storage.clearGame(); saved = null; }   // yesterday's daily is over
  const cont = $('#btn-continue');
  cont.hidden = !(saved && !saved.gameOver);
  if (saved && !saved.gameOver) {
    $('#continue-label').textContent = saved.mode === 'daily' ? 'Continue Daily' : 'Continue';
    $('#continue-score').textContent = `${fmt(saved.score)} pts`;
  }
  const d = dailyInfo();
  $('#daily-sub').textContent = d.best > 0 ? `Today's best ${fmt(d.best)}` : new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
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
  $('#st-themes').textContent = `${unlockedThemes().size}/${THEMES.length}`;
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
  const raw = (t - lastT) / 1000 || 0;
  const dt = Math.min(0.05, raw);
  lastT = t;
  if (game && !ui.current) samplePerf(raw);     // only measure while actually playing
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
  $('#btn-play').addEventListener('click', click(() => startGame(false, 'classic')));
  $('#btn-daily').addEventListener('click', click(() => startGame(false, 'daily')));
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
    ['Warming up blocks', async () => { renderer = new Renderer(canvas, new Game(), rendererCallbacks); renderer.interactive = false; renderer.setTheme(currentTheme); for (let i = 1; i <= 8; i++) { renderer.sprite(i, renderer.layout.cell); renderer.sprite(i, renderer.layout.slotCell); } }],
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
window.__bb = { get game() { return game; }, get renderer() { return renderer; }, get profile() { return profile; }, showGameOver, applyTheme, themeById, praiseFor };

boot();
