/**
 * Map.js – Procedural maze generation using Recursive Backtracking.
 *
 * Grid cell values:
 *   0 – open path
 *   1 – wall
 *   2 – collectible (gem)
 */
export class GameMap {
  /**
   * @param {number} width  – Must be odd (e.g. 21, 25). Clamped internally.
   * @param {number} height – Must be odd.
   * @param {number} numCollectibles – How many gems to scatter.
   */
  constructor(width = 21, height = 21, numCollectibles = 15) {
    // Ensure odd dimensions so carving always works properly
    this.width = width % 2 === 0 ? width + 1 : width;
    this.height = height % 2 === 0 ? height + 1 : height;
    this.numCollectibles = numCollectibles;

    /** @type {number[][]} 2-D grid array */
    this.grid = [];

    /**
     * World-space positions (cell centre) of each collectible still on the map.
     * @type {{x: number, y: number}[]}
     */
    this.collectibles = [];

    this.generate();
  }

  // ── Generation ─────────────────────────────────────────────────────────

  generate() {
    // Start with every cell as a wall
    this.grid = Array.from({ length: this.height }, () =>
      new Array(this.width).fill(1)
    );
    this.collectibles = [];

    // Carve the maze starting at (1, 1)
    this._carve(1, 1);

    // Sprinkle collectibles into random open cells
    this._placeCollectibles();
  }

  /**
   * Recursive Backtracking maze carver.
   * Moves in steps of 2 so every carved cell is surrounded by walls.
   */
  _carve(x, y) {
    this.grid[y][x] = 0;

    // Four cardinal directions (step = 2)
    const dirs = [
      [0, -2],
      [2, 0],
      [0, 2],
      [-2, 0],
    ];

    // Fisher-Yates shuffle for randomness
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }

    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;

      if (
        nx > 0 &&
        nx < this.width - 1 &&
        ny > 0 &&
        ny < this.height - 1 &&
        this.grid[ny][nx] === 1
      ) {
        // Knock down the wall between current cell and neighbour
        this.grid[y + dy / 2][x + dx / 2] = 0;
        this._carve(nx, ny);
      }
    }
  }

  /** Randomly place collectibles in open cells (excluding the spawn cell). */
  _placeCollectibles() {
    const empty = [];
    for (let row = 1; row < this.height - 1; row++) {
      for (let col = 1; col < this.width - 1; col++) {
        if (this.grid[row][col] === 0 && !(col === 1 && row === 1)) {
          empty.push({ col, row });
        }
      }
    }

    // Shuffle the pool
    for (let i = empty.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [empty[i], empty[j]] = [empty[j], empty[i]];
    }

    const count = Math.min(this.numCollectibles, empty.length);
    for (let i = 0; i < count; i++) {
      const { col, row } = empty[i];
      this.grid[row][col] = 2;
      // Store world-space centre of the cell
      this.collectibles.push({ x: col + 0.5, y: row + 0.5 });
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────

  /**
   * Returns true if the world-space point (x, y) is inside a wall.
   * Out-of-bounds positions are treated as walls.
   */
  isWall(x, y) {
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (col < 0 || col >= this.width || row < 0 || row >= this.height) {
      return true;
    }
    return this.grid[row][col] === 1;
  }

  /**
   * Returns the grid value at world-space position (x, y), or -1 if OOB.
   */
  cellAt(x, y) {
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (col < 0 || col >= this.width || row < 0 || row >= this.height) {
      return -1;
    }
    return this.grid[row][col];
  }

  /**
   * Remove a collectible at the given world-space position.
   * Returns true if a collectible was actually removed.
   */
  removeCollectibleAt(worldX, worldY) {
    const col = Math.floor(worldX);
    const row = Math.floor(worldY);
    if (this.grid[row] && this.grid[row][col] === 2) {
      this.grid[row][col] = 0;
      const idx = this.collectibles.findIndex(
        (c) => Math.floor(c.x) === col && Math.floor(c.y) === row
      );
      if (idx !== -1) {
        this.collectibles.splice(idx, 1);
        return true;
      }
    }
    return false;
  }
}
