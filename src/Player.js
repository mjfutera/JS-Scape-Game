/**
 * Player.js – Handles player state, WASD + mouse input, collision detection,
 * and proximity-based collectible pickup.
 */
export class Player {
  /**
   * @param {import('./Map.js').GameMap} map
   * @param {object} settings – Mutable settings reference from main.js
   */
  constructor(map, settings) {
    this.map = map;
    this.settings = settings;

    // ── World position (cell coordinates) ──────────────────────────────
    this.x = 1.5; // Start at centre of cell (1, 1)
    this.y = 1.5;

    /** Viewing angle in radians (0 = facing +X axis) */
    this.angle = 0;

    // ── Movement constants ──────────────────────────────────────────────
    /** Movement speed in cells per second */
    this.moveSpeed = 3.5;
    /** Keyboard rotation speed in radians per second */
    this.keyRotSpeed = 2.2;
    /** Radius for wall collision avoidance */
    this.collisionRadius = 0.25;
    /** Radius within which a collectible is picked up */
    this.collectRadius = 0.6;

    // ── Input state ─────────────────────────────────────────────────────
    this._keys = {};
    /** Accumulated mouse delta X since last update */
    this._mouseDeltaX = 0;

    // ── Score ────────────────────────────────────────────────────────────
    this.collected = 0;

    this._bindInput();
  }

  // ── Input Binding ───────────────────────────────────────────────────────

  _bindInput() {
    this._onKeyDown = (e) => { this._keys[e.code] = true; };
    this._onKeyUp = (e) => { this._keys[e.code] = false; };
    this._onMouseMove = (e) => {
      if (document.pointerLockElement) {
        this._mouseDeltaX += e.movementX;
      }
    };

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
  }

  /** Remove event listeners when the player is no longer needed. */
  destroy() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
  }

  // ── Per-frame Update ────────────────────────────────────────────────────

  /**
   * Advance player state by delta-time `dt` (seconds).
   * @param {number} dt
   */
  update(dt) {
    this._handleRotation(dt);
    this._handleMovement(dt);
    this._checkCollectibles();
  }

  // ── Rotation ────────────────────────────────────────────────────────────

  _handleRotation(dt) {
    // Mouse rotation – sensitivity is stored as a 1-10 scale; map to radians/pixel
    const mouseSensitivity = this.settings.sensitivity * 0.001;
    this.angle += this._mouseDeltaX * mouseSensitivity;
    this._mouseDeltaX = 0;

    // Keyboard fallback
    if (this._keys['ArrowLeft']) this.angle -= this.keyRotSpeed * dt;
    if (this._keys['ArrowRight']) this.angle += this.keyRotSpeed * dt;

    // Keep angle in [0, 2π)
    this.angle = ((this.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  }

  // ── Movement ────────────────────────────────────────────────────────────

  _handleMovement(dt) {
    const { angle, moveSpeed: spd, collisionRadius: cr } = this;
    const step = spd * dt;

    // Forward / backward
    const fwdX = Math.cos(angle) * step;
    const fwdY = Math.sin(angle) * step;

    // Strafe (perpendicular to facing direction)
    const strafeX = Math.cos(angle + Math.PI / 2) * step;
    const strafeY = Math.sin(angle + Math.PI / 2) * step;

    let dx = 0;
    let dy = 0;

    if (this._keys['KeyW'] || this._keys['ArrowUp']) { dx += fwdX; dy += fwdY; }
    if (this._keys['KeyS'] || this._keys['ArrowDown']) { dx -= fwdX; dy -= fwdY; }
    if (this._keys['KeyA']) { dx -= strafeX; dy -= strafeY; }
    if (this._keys['KeyD']) { dx += strafeX; dy += strafeY; }

    // Sliding collision – test axes independently
    const nx = this.x + dx;
    const ny = this.y + dy;

    // X axis
    if (
      !this.map.isWall(nx + cr, this.y) &&
      !this.map.isWall(nx - cr, this.y) &&
      !this.map.isWall(nx + cr, this.y + cr) &&
      !this.map.isWall(nx - cr, this.y - cr)
    ) {
      this.x = nx;
    }

    // Y axis
    if (
      !this.map.isWall(this.x, ny + cr) &&
      !this.map.isWall(this.x, ny - cr) &&
      !this.map.isWall(this.x + cr, ny) &&
      !this.map.isWall(this.x - cr, ny)
    ) {
      this.y = ny;
    }
  }

  // ── Collectible Pickup ──────────────────────────────────────────────────

  _checkCollectibles() {
    const { collectibles } = this.map;
    for (let i = collectibles.length - 1; i >= 0; i--) {
      const gem = collectibles[i];
      const dist = Math.hypot(gem.x - this.x, gem.y - this.y);
      if (dist < this.collectRadius) {
        this.map.removeCollectibleAt(gem.x, gem.y);
        this.collected++;
      }
    }
  }
}
