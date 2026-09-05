/**
 * Ladowanie grafik oddzialow.
 *
 * Sprite'y sa opcjonalne: dopoki plik `public/assets/units/<id>.png` nie
 * istnieje, renderer rysuje zastepczy zeton proceduralny. Dzieki temu gra jest
 * grywalna przed dodaniem assetow, a podmiana grafiki nie wymaga zmian w kodzie.
 */

const cache = new Map<string, HTMLImageElement | null>();
const pending = new Set<string>();

/** Zwraca zaladowany obrazek albo `null`, gdy sprite'a nie ma. */
export function unitSprite(defId: string): HTMLImageElement | null {
  const cached = cache.get(defId);
  if (cached !== undefined) return cached;

  if (!pending.has(defId)) {
    pending.add(defId);
    const image = new Image();
    image.onload = () => cache.set(defId, image);
    image.onerror = () => cache.set(defId, null);
    image.src = `assets/units/${defId}.png`;
  }

  return null;
}

/** Wymusza wczesniejsze zaladowanie grafik, zeby nie migotaly w pierwszej turze. */
export function preloadUnitSprites(defIds: string[]): void {
  for (const id of defIds) unitSprite(id);
}
