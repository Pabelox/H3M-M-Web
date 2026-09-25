import { hexCorners, hexKey, hexToPixel, pixelToHex, type Axial } from '../core/hex';
import { allHexes, type ReachEntry } from '../core/rules';
import { hpPool, maxHpPool } from '../core/stats';
import type { GameState, Unit } from '../core/types';
import { creatureDef, faction } from '../core/units';
import { drawSprite, type Palette } from './pixels';

/** Unoszacy sie napis nad plansza (obrazenia, straty, ulepszenia). */
export interface FloatText {
  text: string;
  hex: Axial;
  color: string;
  born: number;
  ttl: number;
}

/** Wszystko, czego renderer potrzebuje, zeby narysowac klatke. */
export interface View {
  state: GameState;
  reach: Map<string, ReachEntry> | null;
  /** Klucz heksa wroga -> pole, z ktorego mozna go zaatakowac wrecz. */
  meleeFrom: Map<string, Axial>;
  shootable: Set<number>;
  hovered: Axial | null;
  movingUid: number | null;
  movingPixel: { x: number; y: number } | null;
  floats: FloatText[];
  /** Oddzialy, ktore mozna wskazac zagrywana wlasnie karta. */
  cardTargets: Set<number>;
  /** Pola, na ktore mozna wskazac kartę teleportacji. */
  cardHexes: Set<string>;
  /** Oddzialy trafione przed chwila: identyfikator -> czas trafienia. */
  flashes: Map<number, number>;
  /** Oddzial pokazywany w panelu szczegolow. */
  selectedUid: number | null;
}

const TILE_LIGHT = '#5d6b4a';
const TILE_DARK = '#556344';
const TILE_REACH = '#6f8a55';
const TILE_REACH_HOVER = '#87a468';
const TILE_OBSTACLE = '#3a3128';

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private hexSize = 40;
  private originX = 0;
  private originY = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Brak kontekstu 2D - przegladarka nie wspiera canvas.');
    this.ctx = ctx;
  }

  resize(state: GameState): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padding = 24;
    const usableW = rect.width - padding * 2;
    const usableH = rect.height - padding * 2;

    const sizeByWidth = usableW / (Math.sqrt(3) * (state.boardCols + 0.5));
    const sizeByHeight = usableH / (1.5 * (state.boardRows - 1) + 2);
    this.hexSize = Math.max(18, Math.min(sizeByWidth, sizeByHeight));

    const bounds = this.gridBounds(state);
    this.originX = (rect.width - (bounds.maxX - bounds.minX)) / 2 - bounds.minX;
    this.originY = (rect.height - (bounds.maxY - bounds.minY)) / 2 - bounds.minY;
  }

  hexAtPixel(clientX: number, clientY: number): Axial {
    const rect = this.canvas.getBoundingClientRect();
    return pixelToHex(
      clientX - rect.left - this.originX,
      clientY - rect.top - this.originY,
      this.hexSize,
    );
  }

  center(hex: Axial): { x: number; y: number } {
    const point = hexToPixel(hex, this.hexSize);
    return { x: point.x + this.originX, y: point.y + this.originY };
  }

  draw(view: View): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    this.drawTiles(view);
    this.drawUnits(view);
    this.drawFloats(view);
  }

  // --- Plansza ---

  private drawTiles(view: View): void {
    const obstacles = new Set(view.state.obstacles);
    const hoveredKey = view.hovered ? hexKey(view.hovered) : null;

    for (const hex of allHexes(view.state)) {
      const key = hexKey(hex);
      const center = this.center(hex);
      const corners = hexCorners(center, this.hexSize - 1.5);
      const reachEntry = view.reach?.get(key);

      this.tracePolygon(corners);

      if (obstacles.has(key)) {
        this.ctx.fillStyle = TILE_OBSTACLE;
      } else if (view.cardHexes.has(key)) {
        this.ctx.fillStyle = key === hoveredKey ? '#7a6aa8' : '#635391';
      } else if (reachEntry && reachEntry.cost > 0) {
        this.ctx.fillStyle = key === hoveredKey ? TILE_REACH_HOVER : TILE_REACH;
      } else {
        this.ctx.fillStyle = ((hex.q + hex.r) & 1) === 0 ? TILE_LIGHT : TILE_DARK;
      }
      this.ctx.fill();

      this.ctx.strokeStyle = 'rgba(18, 16, 12, 0.6)';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();

      if (obstacles.has(key)) this.drawObstacle(center);

      if (view.meleeFrom.has(key)) {
        this.tracePolygon(hexCorners(center, this.hexSize - 3));
        this.ctx.strokeStyle = '#e8b23a';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
      }
    }
  }

  /** Przeszkoda rysowana pikselowo, w tej samej stylistyce co oddzialy. */
  private drawObstacle(center: { x: number; y: number }): void {
    const step = Math.max(2, Math.round(this.hexSize / 7));
    const blocks: Array<[number, number, string]> = [
      [-1, 0, '#6b5c4a'],
      [0, -1, '#7d6d59'],
      [1, 0, '#6b5c4a'],
      [0, 0, '#8a7963'],
      [0, 1, '#5a4d3e'],
      [-1, 1, '#5a4d3e'],
      [1, 1, '#5a4d3e'],
    ];
    for (const [dx, dy, color] of blocks) {
      this.ctx.fillStyle = color;
      this.ctx.fillRect(
        Math.round(center.x + dx * step - step / 2),
        Math.round(center.y + dy * step - step / 2),
        step,
        step,
      );
    }
  }

  // --- Oddzialy ---

  private drawUnits(view: View): void {
    const activeUid = view.state.queue[0];
    const now = performance.now();

    for (const unit of view.state.units) {
      if (unit.count <= 0) continue;

      const moving = unit.uid === view.movingUid && view.movingPixel;
      const center = moving ? view.movingPixel! : this.center(unit.pos);

      if (!moving) {
        // Lekkie unoszenie sie zetonow ozywia plansze. Faza zalezy od
        // identyfikatora, zeby oddzialy nie oddychaly zgodnie jak jeden organizm.
        const active = unit.uid === activeUid;
        const speed = active ? 220 : 620;
        const amplitude = active ? 2.4 : 1.1;
        center.y += Math.sin(now / speed + unit.uid * 1.7) * amplitude;
      }

      this.drawUnitToken(view, unit, center, unit.uid === activeUid);
    }
  }

  private drawUnitToken(
    view: View,
    unit: Unit,
    center: { x: number; y: number },
    isActive: boolean,
  ): void {
    const ctx = this.ctx;
    const def = creatureDef(unit.defId);
    const army = faction(view.state.factions[unit.team]);
    const radius = this.hexSize * 0.74;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.beginPath();
    ctx.ellipse(center.x, center.y + radius * 0.34, radius * 0.9, radius * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = unit.team === 'A' ? '#1d1a14' : '#241419';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = army.color;
    ctx.stroke();

    drawSprite(ctx, def.archetype, army.palette as Palette, center.x, center.y, radius * 1.7);
    this.drawHitFlash(view, unit, center, radius);

    if (unit.uid === view.selectedUid && !isActive) this.drawSelectionRing(center, radius);
    if (isActive) this.drawActiveRing(center, radius);
    if (view.cardTargets.has(unit.uid)) this.drawCardTargetRing(center, radius);
    if (view.shootable.has(unit.uid)) this.drawCrosshair(center, radius);
    if (unit.defending) this.drawShield(center, radius);

    this.drawHpBar(unit, center, radius);
    this.drawCountBadge(unit, center, radius, army.color);
    this.drawUpgradePips(unit, center, radius);
    this.drawRespawnPips(unit, center, radius);
  }

  /**
   * Bialy rozblysk na zetonie tuz po otrzymaniu obrazen. Wygasa w 260 ms,
   * wiec od razu widac, ktory oddzial zostal trafiony - przy kilku ciosach
   * w jednej turze sam ubytek liczebnosci bywa nieczytelny.
   */
  private drawHitFlash(
    view: View,
    unit: Unit,
    center: { x: number; y: number },
    radius: number,
  ): void {
    const born = view.flashes.get(unit.uid);
    if (born === undefined) return;

    const age = (performance.now() - born) / 260;
    if (age >= 1) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - age) * 0.75;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius - 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd9d0';
    ctx.fill();
    ctx.restore();
  }

  /**
   * Przerywana obwodka oddzialu ogladanego w panelu szczegolow.
   * Celowo inna niz zlota obwodka oddzialu, ktory ma ture - to dwie rozne
   * informacje i nie moga wygladac tak samo.
   */
  private drawSelectionRing(center: { x: number; y: number }, radius: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -performance.now() / 55;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius + 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(236, 240, 248, 0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  private drawActiveRing(center: { x: number; y: number }, radius: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
    this.ctx.beginPath();
    this.ctx.arc(center.x, center.y, radius + 4 + pulse * 2.5, 0, Math.PI * 2);
    this.ctx.strokeStyle = `rgba(240, 198, 76, ${0.55 + pulse * 0.45})`;
    this.ctx.lineWidth = 3;
    this.ctx.stroke();
  }

  /** Fioletowa obwodka - oddzial mozna wskazac zagrywana karta. */
  private drawCardTargetRing(center: { x: number; y: number }, radius: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    this.ctx.beginPath();
    this.ctx.arc(center.x, center.y, radius + 6, 0, Math.PI * 2);
    this.ctx.strokeStyle = `rgba(176, 140, 240, ${0.5 + pulse * 0.5})`;
    this.ctx.lineWidth = 3;
    this.ctx.stroke();
  }

  private drawCrosshair(center: { x: number; y: number }, radius: number): void {
    const r = radius + 9;
    this.ctx.strokeStyle = '#f1592a';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI / 2) * i + Math.PI / 4;
      const x = center.x + Math.cos(angle) * r;
      const y = center.y + Math.sin(angle) * r;
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x + Math.cos(angle) * 6, y + Math.sin(angle) * 6);
    }
    this.ctx.stroke();
  }

  private drawShield(center: { x: number; y: number }, radius: number): void {
    const ctx = this.ctx;
    const s = radius * 0.4;
    const x = center.x - radius * 0.8;
    const y = center.y - radius * 0.8;
    ctx.fillStyle = 'rgba(210, 226, 245, 0.92)';
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.8, y - s * 0.5);
    ctx.lineTo(x + s * 0.8, y + s * 0.3);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s * 0.8, y + s * 0.3);
    ctx.lineTo(x - s * 0.8, y - s * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  private drawHpBar(unit: Unit, center: { x: number; y: number }, radius: number): void {
    const ratio = Math.max(0, Math.min(1, hpPool(unit) / maxHpPool(unit)));
    if (ratio >= 1) return;

    const w = radius * 1.6;
    const h = 4;
    const x = center.x - w / 2;
    const y = center.y - radius - 9;

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    this.ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    this.ctx.fillStyle = ratio > 0.5 ? '#5ac16a' : ratio > 0.25 ? '#e0b040' : '#d24d3e';
    this.ctx.fillRect(x, y, w * ratio, h);
  }

  private drawCountBadge(
    unit: Unit,
    center: { x: number; y: number },
    radius: number,
    color: string,
  ): void {
    const label = String(unit.count);
    const ctx = this.ctx;
    ctx.font = `bold ${Math.round(radius * 0.5)}px "Segoe UI", system-ui, sans-serif`;
    const w = Math.max(ctx.measureText(label).width + 10, 20);
    const h = radius * 0.58;
    const x = center.x - w / 2;
    const y = center.y + radius - h * 0.3;

    ctx.fillStyle = 'rgba(14, 12, 8, 0.94)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#f3e6cf';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, center.x, y + h / 2 + 0.5);
  }

  /** Zlote kropki po prawej - liczba ulepszen nalozonych na oddzial. */
  private drawUpgradePips(unit: Unit, center: { x: number; y: number }, radius: number): void {
    const count = Math.min(unit.upgrades.length, 6);
    if (count === 0) return;

    const size = Math.max(2, Math.round(radius * 0.16));
    for (let i = 0; i < count; i++) {
      this.ctx.fillStyle = '#f0c64c';
      this.ctx.fillRect(
        Math.round(center.x + radius * 0.72),
        Math.round(center.y - radius * 0.6 + i * (size + 2)),
        size,
        size,
      );
    }
  }

  /** Szare kropki po lewej - ile razy oddzial moze jeszcze wrocic na plansze. */
  private drawRespawnPips(unit: Unit, center: { x: number; y: number }, radius: number): void {
    if (unit.respawnsLeft <= 0) return;

    const size = Math.max(2, Math.round(radius * 0.16));
    for (let i = 0; i < unit.respawnsLeft; i++) {
      this.ctx.fillStyle = '#9fd6f0';
      this.ctx.fillRect(
        Math.round(center.x - radius * 0.72 - size),
        Math.round(center.y - radius * 0.6 + i * (size + 2)),
        size,
        size,
      );
    }
  }

  private drawFloats(view: View): void {
    const now = performance.now();
    for (const float of view.floats) {
      const age = (now - float.born) / float.ttl;
      if (age >= 1) continue;
      const center = this.center(float.hex);
      this.ctx.globalAlpha = 1 - age * age;
      this.ctx.font = `bold ${Math.round(this.hexSize * 0.55)}px "Segoe UI", system-ui, sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.lineWidth = 4;
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      const y = center.y - this.hexSize * (0.9 + age * 1.1);
      this.ctx.strokeText(float.text, center.x, y);
      this.ctx.fillStyle = float.color;
      this.ctx.fillText(float.text, center.x, y);
      this.ctx.globalAlpha = 1;
    }
  }

  private tracePolygon(points: Array<{ x: number; y: number }>): void {
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) this.ctx.lineTo(points[i].x, points[i].y);
    this.ctx.closePath();
  }

  private gridBounds(state: GameState): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const hex of allHexes(state)) {
      const point = hexToPixel(hex, this.hexSize);
      minX = Math.min(minX, point.x - this.hexSize);
      maxX = Math.max(maxX, point.x + this.hexSize);
      minY = Math.min(minY, point.y - this.hexSize);
      maxY = Math.max(maxY, point.y + this.hexSize);
    }

    return { minX, maxX, minY, maxY };
  }
}
