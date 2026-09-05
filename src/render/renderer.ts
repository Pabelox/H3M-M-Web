import {
  hexCorners,
  hexKey,
  hexToPixel,
  pixelToHex,
  type Axial,
} from '../core/hex';
import { creatureDef, hasFlag } from '../core/factions';
import { allHexes, type ReachEntry } from '../core/rules';
import { teamColor, unitHpPool } from '../core/state';
import type { GameState, Unit } from '../core/types';
import { unitSprite } from './sprites';

/** Unoszacy sie napis nad plansza (obrazenia, straty). */
export interface FloatText {
  text: string;
  hex: Axial;
  color: string;
  born: number;
  /** Czas zycia w milisekundach. */
  ttl: number;
}

/** Wszystko, czego renderer potrzebuje, zeby narysowac klatke. */
export interface View {
  state: GameState;
  /** Heksy osiagalne dla aktywnego oddzialu (null, gdy trwa animacja). */
  reach: Map<string, ReachEntry> | null;
  /** Klucz heksa wroga -> heks, z ktorego mozna go zaatakowac wrecz. */
  meleeFrom: Map<string, Axial>;
  /** Identyfikatory oddzialow mozliwych do ostrzelania. */
  shootable: Set<number>;
  hovered: Axial | null;
  /** Oddzial w trakcie animacji ruchu i jego chwilowa pozycja w pikselach. */
  movingUid: number | null;
  movingPixel: { x: number; y: number } | null;
  floats: FloatText[];
}

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

  /** Dopasowuje rozmiar plotna i skale heksow do rozmiaru kontenera. */
  resize(state: GameState): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padding = 28;
    const usableW = rect.width - padding * 2;
    const usableH = rect.height - padding * 2;

    // Szerokosc siatki to sqrt(3)*size*(cols + 0.5), wysokosc 1.5*size*(rows-1) + 2*size.
    const sizeByWidth = usableW / (Math.sqrt(3) * (state.boardCols + 0.5));
    const sizeByHeight = usableH / (1.5 * (state.boardRows - 1) + 2);
    this.hexSize = Math.max(18, Math.min(sizeByWidth, sizeByHeight));

    const bounds = this.gridBounds(state);
    this.originX = (rect.width - (bounds.maxX - bounds.minX)) / 2 - bounds.minX;
    this.originY = (rect.height - (bounds.maxY - bounds.minY)) / 2 - bounds.minY;
  }

  /** Heks pod kursorem albo `null`, gdy kursor jest poza plansza. */
  hexAtPixel(clientX: number, clientY: number): Axial {
    const rect = this.canvas.getBoundingClientRect();
    return pixelToHex(
      clientX - rect.left - this.originX,
      clientY - rect.top - this.originY,
      this.hexSize,
    );
  }

  center(hex: Axial): { x: number; y: number } {
    const p = hexToPixel(hex, this.hexSize);
    return { x: p.x + this.originX, y: p.y + this.originY };
  }

  draw(view: View): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);

    this.drawTiles(view);
    this.drawUnits(view);
    this.drawFloats(view);
  }

  // --- Warstwa planszy ---

  private drawTiles(view: View): void {
    const { state } = view;
    const obstacles = new Set(state.obstacles);
    const hoveredKey = view.hovered ? hexKey(view.hovered) : null;

    for (const hex of allHexes(state)) {
      const key = hexKey(hex);
      const center = this.center(hex);
      const corners = hexCorners(center, this.hexSize - 1.5);

      this.tracePolygon(corners);

      if (obstacles.has(key)) {
        this.ctx.fillStyle = '#4a3f33';
      } else if (view.reach?.get(key) && view.reach.get(key)!.cost > 0) {
        this.ctx.fillStyle = key === hoveredKey ? '#6f9c6a' : '#5c7f58';
      } else {
        this.ctx.fillStyle = ((hex.q + hex.r) & 1) === 0 ? '#8a7a5c' : '#837356';
      }
      this.ctx.fill();

      this.ctx.strokeStyle = 'rgba(28, 22, 16, 0.55)';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();

      if (obstacles.has(key)) this.drawObstacle(center);

      const meleeFrom = view.meleeFrom.get(key);
      if (meleeFrom) {
        this.tracePolygon(hexCorners(center, this.hexSize - 3));
        this.ctx.strokeStyle = '#e8b23a';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
      }
    }
  }

  private drawObstacle(center: { x: number; y: number }): void {
    const r = this.hexSize * 0.5;
    this.ctx.fillStyle = '#6b5c4a';
    this.ctx.beginPath();
    this.ctx.moveTo(center.x - r, center.y + r * 0.6);
    this.ctx.lineTo(center.x - r * 0.35, center.y - r * 0.7);
    this.ctx.lineTo(center.x + r * 0.3, center.y - r * 0.3);
    this.ctx.lineTo(center.x + r, center.y + r * 0.6);
    this.ctx.closePath();
    this.ctx.fill();
  }

  // --- Warstwa oddzialow ---

  private drawUnits(view: View): void {
    const activeUid = view.state.queue[0];

    for (const unit of view.state.units) {
      if (unit.count <= 0) continue;

      const center =
        unit.uid === view.movingUid && view.movingPixel
          ? view.movingPixel
          : this.center(unit.pos);

      this.drawUnitToken(
        unit,
        center,
        teamColor(view.state, unit.team),
        unit.uid === activeUid,
        view.shootable.has(unit.uid),
      );
    }
  }

  private drawUnitToken(
    unit: Unit,
    center: { x: number; y: number },
    color: string,
    isActive: boolean,
    isShootable: boolean,
  ): void {
    const def = creatureDef(unit.defId);
    const radius = this.hexSize * 0.72;
    const ctx = this.ctx;

    // Cien rzucany przez figurke na plansze.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(center.x, center.y + radius * 0.32, radius * 0.92, radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Podstawka figurki w kolorze druzyny.
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#241c14';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.stroke();

    const sprite = unitSprite(def.id);
    if (sprite) {
      const size = radius * 1.5;
      ctx.save();
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius - 3, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(sprite, center.x - size / 2, center.y - size / 2, size, size);
      ctx.restore();
    } else {
      // Zastepczy zeton: krazek w barwie miasta z numerem poziomu stworzenia.
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius - 6, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = '#1d1710';
      ctx.font = `bold ${Math.round(radius * 0.9)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(def.tier), center.x, center.y + 1);
    }

    if (hasFlag(def, 'latajacy')) this.drawWings(center, radius, color);
    if (isActive) this.drawActiveRing(center, radius);
    if (isShootable) this.drawCrosshair(center, radius);
    if (unit.defending) this.drawShield(center, radius);

    this.drawHpBar(unit, center, radius);
    this.drawCountBadge(unit, center, radius, color);
  }

  /** Skrzydelka po bokach podstawki - oznaczenie oddzialu latajacego. */
  private drawWings(center: { x: number; y: number }, radius: number, color: string): void {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(center.x + side * (radius + 1), center.y - radius * 0.15);
      ctx.quadraticCurveTo(
        center.x + side * (radius + radius * 0.5),
        center.y - radius * 0.65,
        center.x + side * (radius + radius * 0.28),
        center.y - radius * 0.05,
      );
      ctx.stroke();
    }
  }

  private drawActiveRing(center: { x: number; y: number }, radius: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
    this.ctx.beginPath();
    this.ctx.arc(center.x, center.y, radius + 4 + pulse * 2.5, 0, Math.PI * 2);
    this.ctx.strokeStyle = `rgba(240, 198, 76, ${0.55 + pulse * 0.45})`;
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
    const s = radius * 0.42;
    const x = center.x - radius * 0.78;
    const y = center.y - radius * 0.78;
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
    const def = creatureDef(unit.defId);
    const maxPool = unit.count * def.hp;
    const ratio = Math.max(0, Math.min(1, unitHpPool(unit) / maxPool));
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
    const y = center.y + radius - h * 0.35;

    ctx.fillStyle = 'rgba(18, 14, 10, 0.92)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#f3e6cf';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, center.x, y + h / 2 + 0.5);
  }

  private drawFloats(view: View): void {
    const now = performance.now();
    for (const float of view.floats) {
      const age = (now - float.born) / float.ttl;
      if (age >= 1) continue;
      const center = this.center(float.hex);
      this.ctx.globalAlpha = 1 - age * age;
      this.ctx.font = `bold ${Math.round(this.hexSize * 0.6)}px "Segoe UI", system-ui, sans-serif`;
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
      const p = hexToPixel(hex, this.hexSize);
      minX = Math.min(minX, p.x - this.hexSize);
      maxX = Math.max(maxX, p.x + this.hexSize);
      minY = Math.min(minY, p.y - this.hexSize);
      maxY = Math.max(maxY, p.y + this.hexSize);
    }

    return { minX, maxX, minY, maxY };
  }
}
