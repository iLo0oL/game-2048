'use strict';

const SIZE = 4;
const WIN_VALUE = 2048;
const MOVE_MS = 110; // يجب أن تساوي --move في style.css
const SWIPE_MIN = 24;
const STATE_KEY = 'game-2048:state';
const BEST_KEY = 'game-2048:best';

const VECTORS = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

const KEYS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

const els = {
  board: document.getElementById('board'),
  cells: document.getElementById('cells'),
  tiles: document.getElementById('tiles'),
  score: document.getElementById('score'),
  scoreBox: document.getElementById('score-box'),
  best: document.getElementById('best'),
  newGame: document.getElementById('new-game'),
  undo: document.getElementById('undo'),
  overlay: document.getElementById('overlay'),
  overlayTitle: document.getElementById('overlay-title'),
  overlayText: document.getElementById('overlay-text'),
  overlayPrimary: document.getElementById('overlay-primary'),
  overlaySecondary: document.getElementById('overlay-secondary'),
};

const tileEls = new Map();

let grid;
let score = 0;
let best = 0;
let won = false;
let keepPlaying = false;
let over = false;
let history = null;
let nextId = 1;

/* ---------- Storage ---------- */

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // التخزين غير متاح (مثل التصفح الخاص)، فتعمل اللعبة بدون حفظ.
  }
}

/* ---------- Grid ---------- */

function emptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

function createTile(value, r, c) {
  return { id: nextId++, value, r, c };
}

function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function forEachTile(fn) {
  for (const row of grid) {
    for (const tile of row) {
      if (tile) fn(tile);
    }
  }
}

function emptyCells() {
  const cells = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!grid[r][c]) cells.push([r, c]);
    }
  }
  return cells;
}

function addRandomTile() {
  const cells = emptyCells();
  if (!cells.length) return;
  const [r, c] = cells[Math.floor(Math.random() * cells.length)];
  const tile = createTile(Math.random() < 0.9 ? 2 : 4, r, c);
  tile.isNew = true;
  grid[r][c] = tile;
}

function movesAvailable() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const tile = grid[r][c];
      if (!tile) return true;
      if (c + 1 < SIZE && grid[r][c + 1]?.value === tile.value) return true;
      if (r + 1 < SIZE && grid[r + 1][c]?.value === tile.value) return true;
    }
  }
  return false;
}

/* ---------- Snapshots (undo & save) ---------- */

function snapshot() {
  return {
    cells: grid.map((row) => row.map((tile) => (tile ? tile.value : 0))),
    score,
    won,
    keepPlaying,
  };
}

function isValidSnapshot(data) {
  return (
    data &&
    Array.isArray(data.cells) &&
    data.cells.length === SIZE &&
    data.cells.every(
      (row) =>
        Array.isArray(row) &&
        row.length === SIZE &&
        row.every((v) => v === 0 || (Number.isInteger(v) && v >= 2 && (v & (v - 1)) === 0)),
    ) &&
    data.cells.some((row) => row.some((v) => v > 0)) &&
    Number.isInteger(data.score) &&
    data.score >= 0
  );
}

function restore(data) {
  grid = emptyGrid();
  data.cells.forEach((row, r) => {
    row.forEach((value, c) => {
      if (value) grid[r][c] = createTile(value, r, c);
    });
  });
  score = data.score;
  won = Boolean(data.won);
  keepPlaying = Boolean(data.keepPlaying);
  over = !movesAvailable();
}

function save() {
  writeStorage(STATE_KEY, JSON.stringify(snapshot()));
  writeStorage(BEST_KEY, String(best));
}

/* ---------- Game actions ---------- */

function newGame() {
  // يمكن التراجع عن «لعبة جديدة» إذا ضُغطت بالخطأ.
  history = grid && score > 0 ? snapshot() : null;
  grid = emptyGrid();
  score = 0;
  won = false;
  keepPlaying = false;
  over = false;
  addRandomTile();
  addRandomTile();
  save();
  render();
}

function move(direction) {
  if (over || (won && !keepPlaying)) return;

  const [dr, dc] = VECTORS[direction];
  const before = snapshot();
  const rows = [...Array(SIZE).keys()];
  const cols = [...Array(SIZE).keys()];
  if (dr === 1) rows.reverse();
  if (dc === 1) cols.reverse();

  const vanished = [];
  const mergedIds = new Set();
  let moved = false;
  let gained = 0;

  for (const r of rows) {
    for (const c of cols) {
      const tile = grid[r][c];
      if (!tile) continue;

      let nr = r;
      let nc = c;
      while (inBounds(nr + dr, nc + dc) && !grid[nr + dr][nc + dc]) {
        nr += dr;
        nc += dc;
      }

      const next = inBounds(nr + dr, nc + dc) ? grid[nr + dr][nc + dc] : null;
      grid[r][c] = null;

      if (next && next.value === tile.value && !mergedIds.has(next.id)) {
        const merged = createTile(tile.value * 2, next.r, next.c);
        merged.isMerged = true;
        mergedIds.add(merged.id);
        grid[next.r][next.c] = merged;
        tile.r = next.r;
        tile.c = next.c;
        vanished.push(tile, next);
        gained += merged.value;
        if (merged.value === WIN_VALUE && !won) won = true;
        moved = true;
      } else {
        grid[nr][nc] = tile;
        if (nr !== r || nc !== c) {
          tile.r = nr;
          tile.c = nc;
          moved = true;
        }
      }
    }
  }

  if (!moved) return;

  history = before;
  score += gained;
  if (score > best) best = score;
  addRandomTile();
  over = !movesAvailable();
  save();
  render(vanished);
  if (gained) showScoreAdd(gained);
}

function undo() {
  if (!history) return;
  restore(history);
  history = null;
  save();
  render();
}

function continueGame() {
  keepPlaying = true;
  save();
  render();
}

/* ---------- Rendering ---------- */

function placeTile(el, tile) {
  el.style.setProperty('--r', tile.r);
  el.style.setProperty('--c', tile.c);
}

function createTileEl(tile) {
  const el = document.createElement('div');
  el.className = 'tile';
  if (tile.isNew) el.classList.add('tile-new');
  if (tile.isMerged) el.classList.add('tile-merged');
  el.dataset.value = tile.value > WIN_VALUE ? 'super' : String(tile.value);
  el.dataset.digits = String(Math.min(String(tile.value).length, 5));
  placeTile(el, tile);

  const inner = document.createElement('div');
  inner.className = 'tile-inner';
  inner.textContent = tile.value;
  el.append(inner);
  return el;
}

function render(vanished = []) {
  const alive = new Set();

  forEachTile((tile) => {
    alive.add(tile.id);
    let el = tileEls.get(tile.id);
    if (!el) {
      el = createTileEl(tile);
      tileEls.set(tile.id, el);
      els.tiles.append(el);
    } else {
      placeTile(el, tile);
    }
  });

  // المربعات المدموجة تنزلق إلى مكان الدمج ثم تُحذف بعد انتهاء الحركة.
  for (const tile of vanished) {
    const el = tileEls.get(tile.id);
    if (!el) continue;
    tileEls.delete(tile.id);
    placeTile(el, tile);
    setTimeout(() => el.remove(), MOVE_MS);
  }

  for (const [id, el] of tileEls) {
    if (!alive.has(id)) {
      el.remove();
      tileEls.delete(id);
    }
  }

  els.score.textContent = score;
  els.best.textContent = best;
  els.undo.disabled = !history;
  renderOverlay();
}

function renderOverlay() {
  const { overlay, overlayTitle, overlayText, overlayPrimary, overlaySecondary } = els;
  const showWin = won && !keepPlaying;

  if (!showWin && !over) {
    overlay.hidden = true;
    delete overlay.dataset.state;
    return;
  }

  const state = showWin ? 'won' : 'over';
  if (overlay.dataset.state === state && !overlay.hidden) return;
  overlay.dataset.state = state;

  if (showWin) {
    overlayTitle.textContent = 'وصلت إلى 2048! 🎉';
    overlayText.textContent = `نتيجتك ${score}. يمكنك الاستمرار للوصول إلى رقم أعلى.`;
    overlayPrimary.textContent = 'استمر في اللعب';
    overlaySecondary.textContent = 'لعبة جديدة';
    overlaySecondary.hidden = false;
  } else {
    overlayTitle.textContent = 'انتهت اللعبة';
    overlayText.textContent = `نتيجتك ${score}.`;
    overlayPrimary.textContent = 'حاول مرة أخرى';
    overlaySecondary.textContent = 'تراجع';
    overlaySecondary.hidden = !history;
  }

  overlay.hidden = false;
  overlayPrimary.focus({ preventScroll: true });
}

function showScoreAdd(points) {
  const el = document.createElement('span');
  el.className = 'score-add';
  el.textContent = `+${points}`;
  els.scoreBox.append(el);
  setTimeout(() => el.remove(), 650);
}

/* ---------- Input ---------- */

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'KeyZ') {
    event.preventDefault();
    undo();
    return;
  }

  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const direction = KEYS[event.code] || KEYS[event.key];
  if (!direction) return;
  event.preventDefault();
  move(direction);
});

let swipe = null;

els.board.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.target.closest('button')) return;
  swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
  els.board.setPointerCapture(event.pointerId);
});

els.board.addEventListener('pointerup', (event) => {
  if (!swipe || event.pointerId !== swipe.id) return;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  swipe = null;

  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (Math.max(absX, absY) < SWIPE_MIN) return;

  if (absX > absY) move(dx > 0 ? 'right' : 'left');
  else move(dy > 0 ? 'down' : 'up');
});

els.board.addEventListener('pointercancel', () => {
  swipe = null;
});

els.newGame.addEventListener('click', newGame);
els.undo.addEventListener('click', undo);

els.overlayPrimary.addEventListener('click', () => {
  if (els.overlay.dataset.state === 'won') continueGame();
  else newGame();
});

els.overlaySecondary.addEventListener('click', () => {
  if (els.overlay.dataset.state === 'won') newGame();
  else undo();
});

/* ---------- Start ---------- */

function init() {
  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    els.cells.append(cell);
  }

  best = Number.parseInt(readStorage(BEST_KEY), 10) || 0;

  let saved = null;
  try {
    saved = JSON.parse(readStorage(STATE_KEY));
  } catch {
    saved = null;
  }

  if (isValidSnapshot(saved)) {
    restore(saved);
    if (score > best) best = score;
    render();
  } else {
    newGame();
  }
}

init();
