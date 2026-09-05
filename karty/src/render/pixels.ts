import type { Archetype } from '../core/types';

/**
 * Pixel art rysowany w kodzie.
 *
 * Kazda sylwetka to siatka 16x16 znakow, gdzie znak wybiera kolor z palety
 * frakcji: '1' kontur, '2' cien, '3' kolor glowny, '4' swiatlo, '5' akcent,
 * '.' przezroczystosc. Dzieki temu ten sam ksztalt obsluguje wszystkie
 * frakcje - rozni je wylacznie paleta - i nie ma zadnych plikow graficznych
 * ani kwestii licencyjnych.
 *
 * Sylwetka odpowiada roli oddzialu, wiec po samym ksztalcie widac, czy zeton
 * jest strzelcem, lataczem czy kolosem.
 */

export const SPRITE_SIZE = 16;

const RAW_SPRITES: Record<Archetype, string[]> = {
  piechur: [
    '................',
    '.....111........',
    '....13331.......',
    '....14341.......',
    '....13331....5..',
    '.....111.....5..',
    '...11121111..5..',
    '..11333333311...',
    '..13333333331...',
    '..12222222221...',
    '...111333111....',
    '.....13331......',
    '.....13.31......',
    '....113.311.....',
    '....111.111.....',
    '................',
  ],
  strzelec: [
    '................',
    '.....111........',
    '....13331...5...',
    '....14341..5.5..',
    '....13331.5...5.',
    '.....111..5...5.',
    '...1112111.5..5.',
    '..113333311.5.5.',
    '..1333333311.55.',
    '..1222222211.5..',
    '...11133311.....',
    '.....13331......',
    '.....13.31......',
    '....113.311.....',
    '....111.111.....',
    '................',
  ],
  skrzydlaty: [
    '................',
    '.......11.......',
    '......1331......',
    '......1431......',
    '...5..1331..5...',
    '..555.1331.555..',
    '.5555.1221.5555.',
    '.5555.1331.5555.',
    '..555.1331.555..',
    '...5..1221..5...',
    '......1331......',
    '......13.1......',
    '.....11..11.....',
    '.....11..11.....',
    '................',
    '................',
  ],
  ciezki: [
    '................',
    '................',
    '....11111111....',
    '...1333333331...',
    '...1344444331...',
    '...1334444331...',
    '..113333333311..',
    '..133333333331..',
    '..133322233331..',
    '..122333332221..',
    '...1333333331...',
    '...1122222211...',
    '....11.....11...',
    '....11.....11...',
    '................',
    '................',
  ],
  bestia: [
    '................',
    '................',
    '............111.',
    '...........13331',
    '...........14351',
    '..1111111111331.',
    '.133333333333331',
    '.133333333333331',
    '.122222222222221',
    '..1331....1331..',
    '..1331....1331..',
    '..111......111..',
    '................',
    '................',
    '................',
    '................',
  ],
  kolos: [
    '................',
    '.....111111.....',
    '....13333331....',
    '....14355341....',
    '....13333331....',
    '.....111111.....',
    '...111222111....',
    '..11333333311...',
    '.1133333333311..',
    '.1333333333331..',
    '.1333333333331..',
    '.1222222222221..',
    '..11333333311...',
    '...1331..1331...',
    '...111....111...',
    '................',
  ],
};

/**
 * Sprawdza, czy kazda sylwetka ma dokladnie 16 wierszy po 16 znakow.
 * Blad w matrycy przesunalby wszystkie kolejne piksele, a na obrazku bylby
 * trudny do zauwazenia - lepiej, zeby wysypal sie od razu przy starcie.
 */
function validate(): void {
  for (const [name, rows] of Object.entries(RAW_SPRITES)) {
    if (rows.length !== SPRITE_SIZE) {
      throw new Error(`Sylwetka "${name}" ma ${rows.length} wierszy zamiast ${SPRITE_SIZE}.`);
    }
    rows.forEach((row, index) => {
      if (row.length !== SPRITE_SIZE) {
        throw new Error(
          `Sylwetka "${name}", wiersz ${index}: ${row.length} znakow zamiast ${SPRITE_SIZE}.`,
        );
      }
    });
  }
}

validate();

export type Palette = readonly [string, string, string, string, string];

const cache = new Map<string, HTMLCanvasElement>();

/**
 * Zwraca gotowy obrazek sylwetki w podanej palecie.
 * Wynik jest zapamietywany, wiec kazda kombinacja rysowana jest raz.
 */
export function spriteCanvas(archetype: Archetype, palette: Palette): HTMLCanvasElement {
  const key = `${archetype}|${palette.join(',')}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Brak kontekstu 2D przy rysowaniu sylwetki.');

  RAW_SPRITES[archetype].forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const char = row[x];
      if (char === '.') continue;
      const colorIndex = Number(char) - 1;
      const color = palette[colorIndex];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  });

  cache.set(key, canvas);
  return canvas;
}

/**
 * Rysuje sylwetke na planszy bez wygladzania, zeby piksele zostaly ostre.
 * Rozmiar docelowy zaokraglamy do wielokrotnosci 16 - inaczej piksele
 * mialyby nierowna szerokosc i obrazek wygladalby na rozmyty.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  archetype: Archetype,
  palette: Palette,
  centerX: number,
  centerY: number,
  targetSize: number,
): void {
  const scale = Math.max(1, Math.round(targetSize / SPRITE_SIZE));
  const size = scale * SPRITE_SIZE;
  const sprite = spriteCanvas(archetype, palette);

  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, Math.round(centerX - size / 2), Math.round(centerY - size / 2), size, size);
  ctx.imageSmoothingEnabled = smoothing;
}
