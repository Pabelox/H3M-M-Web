/**
 * Geometria siatki heksagonalnej.
 *
 * Uklad: heksy "pointy-top" (wierzcholkiem do gory), wiersze przesuwane
 * naprzemiennie (offset "odd-r"). Wewnetrznie operujemy na wspolrzednych
 * osiowych (axial: q, r), bo upraszczaja liczenie odleglosci i sasiadow.
 * Wspolrzedne offsetowe (col, row) sluza tylko do opisu planszy prostokatnej.
 */

export interface Axial {
  q: number;
  r: number;
}

/** Szesciu sasiadow heksa we wspolrzednych osiowych, zgodnie z ruchem zegara. */
export const HEX_DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function offsetToAxial(col: number, row: number): Axial {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

export function axialToOffset(a: Axial): { col: number; row: number } {
  return { col: a.q + (a.r - (a.r & 1)) / 2, row: a.r };
}

/** Klucz tekstowy heksa - uzywany jako identyfikator w mapach i zbiorach. */
export function hexKey(a: Axial): string {
  return `${a.q},${a.r}`;
}

export function hexFromKey(key: string): Axial {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

export function hexEquals(a: Axial, b: Axial): boolean {
  return a.q === b.q && a.r === b.r;
}

/** Odleglosc w heksach (metryka szescienna). */
export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

export function hexNeighbors(a: Axial): Axial[] {
  return HEX_DIRECTIONS.map((d) => ({ q: a.q + d.q, r: a.r + d.r }));
}

/** Srodek heksa w pikselach; `size` to promien opisany na heksie. */
export function hexToPixel(a: Axial, size: number): { x: number; y: number } {
  return {
    x: size * Math.sqrt(3) * (a.q + a.r / 2),
    y: size * 1.5 * a.r,
  };
}

/** Heks pod podanym punktem - odwrotnosc `hexToPixel`. */
export function pixelToHex(x: number, y: number, size: number): Axial {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return roundAxial(q, r);
}

/** Zaokraglenie ulamkowych wspolrzednych osiowych do najblizszego heksa. */
function roundAxial(qf: number, rf: number): Axial {
  const xf = qf;
  const zf = rf;
  const yf = -xf - zf;

  let x = Math.round(xf);
  let y = Math.round(yf);
  let z = Math.round(zf);

  const dx = Math.abs(x - xf);
  const dy = Math.abs(y - yf);
  const dz = Math.abs(z - zf);

  if (dx > dy && dx > dz) x = -y - z;
  else if (dy > dz) y = -x - z;
  else z = -x - y;

  return { q: x, r: z };
}

/** Wierzcholki heksa w pikselach - do rysowania na canvasie. */
export function hexCorners(
  center: { x: number; y: number },
  size: number,
): Array<{ x: number; y: number }> {
  const corners: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({
      x: center.x + size * Math.cos(angle),
      y: center.y + size * Math.sin(angle),
    });
  }
  return corners;
}
