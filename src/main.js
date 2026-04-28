/**
 * main.js – Entry point for Cast & Collect.
 *
 * Responsibilities:
 *   - Manage game states: MENU → PLAYING → PAUSED → WIN
 *   - Wire up the Main Menu, Settings, Pause, and Win overlays
 *   - Drive the requestAnimationFrame game loop
 *   - Apply Fullscreen API and Pointer Lock API on game start
 */

import { GameMap } from './Map.js';
import { Player } from './Player.js';
import { Renderer } from './Renderer.js';

// ── DOM References ────────────────────────────────────────────────────────

const canvas = /** @type {HTMLCanvasElement} */ (
  document.getElementById('gameCanvas')
);
const ctx = canvas.getContext('2d');

// Overlays
const menuEl = document.getElementById('menu');
const mainMenuEl = document.getElementById('mainMenu');
const settingsPanelEl = document.getElementById('settingsPanel');
const aboutPanelEl = document.getElementById('aboutPanel');
const pauseOverlayEl = document.getElementById('pauseOverlay');
const winOverlayEl = document.getElementById('winOverlay');
const hudEl = document.getElementById('hud');

// HUD elements
const hudCollectedEl = document.getElementById('hudCollected');
const hudTotalEl = document.getElementById('hudTotal');
const winMessageEl = document.getElementById('winMessage');

// Settings inputs
const fovRangeEl = /** @type {HTMLInputElement} */ (
  document.getElementById('fovRange')
);
const sensRangeEl = /** @type {HTMLInputElement} */ (
  document.getElementById('sensRange')
);
const sizeRangeEl = /** @type {HTMLInputElement} */ (
  document.getElementById('sizeRange')
);

// ── Mutable Settings Object ───────────────────────────────────────────────

/**
 * Passed by reference into Player and Renderer so live changes take effect
 * immediately without requiring re-instantiation.
 */
const settings = {
  fov: 66,         // degrees
  sensitivity: 2,  // 1–10 scale
  mazeSize: 21,    // must be odd; clamped in GameMap
};

// ── Game State ────────────────────────────────────────────────────────────

/** @type {'MENU' | 'PLAYING' | 'PAUSED' | 'WIN'} */
let state = 'MENU';

/** @type {GameMap | null} */
let map = null;
/** @type {Player | null} */
let player = null;
/** @type {Renderer | null} */
let renderer = null;

let lastTimestamp = 0;
let totalGems = 0;

// ── Game Lifecycle ────────────────────────────────────────────────────────

function startGame() {
  // Tear down previous session if any
  if (player) player.destroy();
  if (renderer) renderer.destroy();

  map = new GameMap(settings.mazeSize, settings.mazeSize, Math.round(settings.mazeSize * 0.8));
  player = new Player(map, settings);
  renderer = new Renderer(canvas, ctx, settings);

  totalGems = map.collectibles.length;
  hudTotalEl.textContent = String(totalGems);
  hudCollectedEl.textContent = '0';

  // Show / hide overlays
  menuEl.classList.add('hidden');
  pauseOverlayEl.classList.add('hidden');
  winOverlayEl.classList.add('hidden');
  hudEl.classList.remove('hidden');

  // Request Fullscreen then Pointer Lock
  const fsTarget = document.documentElement;
  const enterFs = fsTarget.requestFullscreen
    ? fsTarget.requestFullscreen()
    : Promise.resolve();

  enterFs
    .catch(() => {}) // Fullscreen may be blocked – that's fine
    .finally(() => {
      canvas.requestPointerLock();
    });

  state = 'PLAYING';
  lastTimestamp = performance.now();
  requestAnimationFrame(gameLoop);
}

function pauseGame() {
  if (state !== 'PLAYING') return;
  state = 'PAUSED';
  pauseOverlayEl.classList.remove('hidden');
  document.exitPointerLock();
}

function resumeGame() {
  if (state !== 'PAUSED') return;
  pauseOverlayEl.classList.add('hidden');
  canvas.requestPointerLock();
  state = 'PLAYING';
  lastTimestamp = performance.now();
  requestAnimationFrame(gameLoop);
}

function showMainMenu() {
  state = 'MENU';

  if (player) { player.destroy(); player = null; }
  if (renderer) { renderer.destroy(); renderer = null; }
  map = null;

  menuEl.classList.remove('hidden');
  showPanel(mainMenuEl);
  pauseOverlayEl.classList.add('hidden');
  winOverlayEl.classList.add('hidden');
  hudEl.classList.add('hidden');

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  document.exitPointerLock();
}

function showWin() {
  state = 'WIN';
  winOverlayEl.classList.remove('hidden');
  winMessageEl.textContent = `You collected all ${totalGems} gems!`;
  document.exitPointerLock();
}

// ── Game Loop ─────────────────────────────────────────────────────────────

function gameLoop(timestamp) {
  if (state !== 'PLAYING') return;

  // Delta-time in seconds; capped at 100 ms to avoid spiral-of-death on tab switch
  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
  lastTimestamp = timestamp;

  player.update(dt);

  // Update HUD
  hudCollectedEl.textContent = String(player.collected);

  // Check win condition
  if (map.collectibles.length === 0) {
    renderer.render(map, player); // render final frame
    showWin();
    return;
  }

  renderer.render(map, player);

  requestAnimationFrame(gameLoop);
}

// ── Helper: Panel Navigation ──────────────────────────────────────────────

/** Hide all child panels inside #menu and show the requested one. */
function showPanel(panelEl) {
  [mainMenuEl, settingsPanelEl, aboutPanelEl].forEach((p) =>
    p.classList.add('hidden')
  );
  panelEl.classList.remove('hidden');
}

// ── Menu Button Wiring ────────────────────────────────────────────────────

document.getElementById('startBtn').addEventListener('click', startGame);

document.getElementById('settingsBtn').addEventListener('click', () => {
  showPanel(settingsPanelEl);
});

document.getElementById('backFromSettings').addEventListener('click', () => {
  showPanel(mainMenuEl);
});

document.getElementById('aboutBtn').addEventListener('click', () => {
  showPanel(aboutPanelEl);
});

document.getElementById('backFromAbout').addEventListener('click', () => {
  showPanel(mainMenuEl);
});

// Pause overlay
document.getElementById('resumeBtn').addEventListener('click', resumeGame);
document.getElementById('quitBtn').addEventListener('click', showMainMenu);

// Win overlay
document.getElementById('playAgainBtn').addEventListener('click', startGame);
document.getElementById('winMenuBtn').addEventListener('click', showMainMenu);

// Click on canvas while paused → resume
canvas.addEventListener('click', () => {
  if (state === 'PAUSED') resumeGame();
});

// ── Pointer Lock ──────────────────────────────────────────────────────────

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && state === 'PLAYING') {
    pauseGame();
  }
});

// ── Settings Sliders ──────────────────────────────────────────────────────

fovRangeEl.addEventListener('input', () => {
  settings.fov = Number(fovRangeEl.value);
  document.getElementById('fovValue').textContent = fovRangeEl.value;
});

sensRangeEl.addEventListener('input', () => {
  settings.sensitivity = Number(sensRangeEl.value);
  document.getElementById('sensValue').textContent = sensRangeEl.value;
});

sizeRangeEl.addEventListener('input', () => {
  let val = Number(sizeRangeEl.value);
  if (val % 2 === 0) val++; // enforce odd
  settings.mazeSize = val;
  document.getElementById('sizeValue').textContent = String(val);
});
