/**
 * Renderer.js – 3D raycasting engine.
 *
 * Algorithm overview:
 *   1. For each screen column cast a ray using the DDA (Digital Differential
 *      Analyser) algorithm to find the nearest wall intersection.
 *   2. Compute the perpendicular wall distance to avoid the fisheye effect.
 *   3. Draw a vertical wall strip scaled inversely to that distance.
 *   4. Store the distance in a Z-buffer (one entry per column).
 *   5. Sort collectible sprites by distance (farthest first) and render each
 *      one column by column, skipping pixels occluded by walls using the
 *      Z-buffer.
 */
export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} settings – Mutable settings reference
   */
  constructor(canvas, ctx, settings) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.settings = settings;

    /** Z-buffer: perpendicular wall distance for each screen column */
    this.zBuffer = new Float64Array(1);

    this._resize();
    this._resizeHandler = () => this._resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  destroy() {
    window.removeEventListener('resize', this._resizeHandler);
  }

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.zBuffer = new Float64Array(this.w);
  }

  // ── Public Render Entry ─────────────────────────────────────────────────

  /**
   * Full-frame render: ceiling, floor, walls, sprites.
   * @param {import('./Map.js').GameMap} map
   * @param {import('./Player.js').Player} player
   */
  render(map, player) {
    const { ctx, w, h } = this;
    ctx.imageSmoothingEnabled = false;

    const { x: px, y: py, angle } = player;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    // Camera-plane length determines FOV:  FOV = 2·atan(planeLen)
    const fovRad = (this.settings.fov * Math.PI) / 180;
    const planeLen = Math.tan(fovRad / 2);
    // Camera plane is perpendicular to the direction vector
    const planeX = -dirY * planeLen;
    const planeY = dirX * planeLen;

    // ── Ceiling ───────────────────────────────────────────────────────────
    ctx.fillStyle = '#0d0d1f';
    ctx.fillRect(0, 0, w, h / 2);

    // ── Floor ─────────────────────────────────────────────────────────────
    ctx.fillStyle = '#1c1c1c';
    ctx.fillRect(0, h / 2, w, h / 2);

    // ── Walls (DDA) ───────────────────────────────────────────────────────
    this._renderWalls(map, px, py, dirX, dirY, planeX, planeY);

    // ── Sprites (collectibles) ────────────────────────────────────────────
    this._renderSprites(map, px, py, dirX, dirY, planeX, planeY);
  }

  // ── Wall Rendering ──────────────────────────────────────────────────────

  _renderWalls(map, px, py, dirX, dirY, planeX, planeY) {
    const { ctx, w, h, zBuffer } = this;

    for (let screenX = 0; screenX < w; screenX++) {
      // Map screen column to camera-plane coordinate [-1, +1]
      const cameraX = (2 * screenX) / w - 1;

      const rayDirX = dirX + planeX * cameraX;
      const rayDirY = dirY + planeY * cameraX;

      // Current map cell
      let mapCol = Math.floor(px);
      let mapRow = Math.floor(py);

      // Distance ray travels between consecutive cell boundaries (x or y)
      // Guard against division by zero with Infinity (ray parallel to axis)
      const deltaDistX = rayDirX === 0 ? Infinity : Math.abs(1 / rayDirX);
      const deltaDistY = rayDirY === 0 ? Infinity : Math.abs(1 / rayDirY);

      // Step direction and initial side distances
      let stepCol, stepRow, sideDistX, sideDistY;

      if (rayDirX < 0) {
        stepCol = -1;
        sideDistX = (px - mapCol) * deltaDistX;
      } else {
        stepCol = 1;
        sideDistX = (mapCol + 1 - px) * deltaDistX;
      }

      if (rayDirY < 0) {
        stepRow = -1;
        sideDistY = (py - mapRow) * deltaDistY;
      } else {
        stepRow = 1;
        sideDistY = (mapRow + 1 - py) * deltaDistY;
      }

      // DDA loop – advance until we hit a wall (or leave the map)
      let side = 0; // 0 = x-boundary hit, 1 = y-boundary hit
      let hit = false;
      let safetyCounter = 0;
      while (!hit && safetyCounter < map.width + map.height) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapCol += stepCol;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapRow += stepRow;
          side = 1;
        }

        if (
          mapCol < 0 || mapCol >= map.width ||
          mapRow < 0 || mapRow >= map.height
        ) {
          hit = true; // left the map bounds
        } else if (map.grid[mapRow][mapCol] === 1) {
          hit = true;
        }
        safetyCounter++;
      }

      /**
       * Perpendicular wall distance (avoids the fisheye effect).
       * We subtract deltaDistX (or Y) once because sideDistX/Y has
       * already been incremented past the hit boundary.
       */
      let perpDist = side === 0
        ? sideDistX - deltaDistX
        : sideDistY - deltaDistY;

      if (perpDist < 0.01) perpDist = 0.01; // clamp to avoid /0

      zBuffer[screenX] = perpDist;

      // Wall strip height on screen
      const lineH = Math.floor(h / perpDist);
      const drawTop = Math.max(0, Math.floor((h - lineH) / 2));
      const drawBot = Math.min(h - 1, Math.floor((h + lineH) / 2));

      // Shade y-sides darker to give a subtle ambient-occlusion feel
      const shade = side === 0 ? 1.0 : 0.65;

      // Vary wall colour slightly based on column (texture-like striping)
      // For x-side hits use the y-position on the wall, for y-side the x-position
      let wallX;
      if (side === 0) {
        wallX = py + perpDist * dirY;
      } else {
        wallX = px + perpDist * dirX;
      }
      wallX -= Math.floor(wallX); // fractional part 0-1

      // Base brown palette
      const baseR = Math.floor((120 + wallX * 40) * shade);
      const baseG = Math.floor((70 + wallX * 20) * shade);
      const baseB = Math.floor((30 + wallX * 10) * shade);

      ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
      ctx.fillRect(screenX, drawTop, 1, drawBot - drawTop + 1);
    }
  }

  // ── Sprite (Collectible) Rendering ──────────────────────────────────────

  _renderSprites(map, px, py, dirX, dirY, planeX, planeY) {
    const { ctx, w, h, zBuffer } = this;

    if (map.collectibles.length === 0) return;

    // Copy + sort by distance (farthest first → painter's order)
    const sprites = map.collectibles.map((c) => ({
      ...c,
      dist2: (c.x - px) ** 2 + (c.y - py) ** 2,
    }));
    sprites.sort((a, b) => b.dist2 - a.dist2);

    for (const sprite of sprites) {
      // Translate sprite position relative to the camera origin
      const spriteRelX = sprite.x - px;
      const spriteRelY = sprite.y - py;

      /**
       * Transform to camera space using the inverse of the camera matrix:
       *
       *   | planeX  dirX | ^-1  =   1/det * |  dirY  -dirX |
       *   | planeY  dirY |              |-planeY  planeX|
       *
       * where det = planeX*dirY - dirX*planeY
       */
      const invDet = 1 / (planeX * dirY - dirX * planeY);
      const transformX = invDet * (dirY * spriteRelX - dirX * spriteRelY);
      const transformY = invDet * (-planeY * spriteRelX + planeX * spriteRelY);

      // Sprite is behind the camera
      if (transformY <= 0.1) continue;

      // Screen X coordinate of sprite centre
      const spriteScreenX = Math.floor((w / 2) * (1 + transformX / transformY));

      // Sprite height (and width) on screen – same as wall at that distance
      const spriteH = Math.max(1, Math.abs(Math.floor(h / transformY)));
      const spriteW = spriteH;

      const drawTop = Math.max(0, Math.floor((h - spriteH) / 2));
      const drawBot = Math.min(h - 1, Math.floor((h + spriteH) / 2));

      const stripeLeft = Math.floor(spriteScreenX - spriteW / 2);
      const stripeRight = Math.floor(spriteScreenX + spriteW / 2);

      // Render column by column
      for (
        let stripe = Math.max(0, stripeLeft);
        stripe <= Math.min(w - 1, stripeRight);
        stripe++
      ) {
        // Z-buffer test: skip if this column is behind a wall
        if (transformY >= zBuffer[stripe]) continue;

        // Normalised horizontal position within the sprite [-1, +1]
        const tx = ((stripe - stripeLeft) / spriteW) * 2 - 1; // -1 .. +1

        /**
         * Gem diamond shape:  |tx| + |ty| < threshold
         * We compute the y-range for which |ty| < threshold - |tx|.
         */
        const halfWidthAtX = 0.78 - Math.abs(tx);
        if (halfWidthAtX <= 0) continue; // outside diamond outline

        const spriteMidY = (drawTop + drawBot) / 2;
        const halfExtent = halfWidthAtX * spriteH * 0.5;

        const colTop = Math.max(drawTop, Math.floor(spriteMidY - halfExtent));
        const colBot = Math.min(drawBot, Math.floor(spriteMidY + halfExtent));
        if (colBot <= colTop) continue;

        /**
         * Colour gradient – bright gold in the centre, amber at edges.
         * Brightness derived from distance to diamond centre.
         */
        const brightness = halfWidthAtX / 0.78; // 0 (edge) → 1 (centre)
        const r = 255;
        const g = Math.floor(140 + 110 * brightness); // 140 → 250
        const b = Math.floor(10 * brightness);

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(stripe, colTop, 1, colBot - colTop);
      }
    }
  }
}
