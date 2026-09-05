/**
 * Deterministyczny generator liczb pseudolosowych (mulberry32).
 *
 * Stan generatora jest czescia stanu gry, dzieki czemu cala rozgrywka jest
 * odtwarzalna z ziarna (seed). To pozwala AI symulowac ruchy bez efektow
 * ubocznych oraz umozliwia odtworzenie kazdego bledu z logu partii.
 */

/** Zwraca kolejna liczbe z zakresu [0, 1) oraz nowy stan generatora. */
export function nextFloat(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) | 0;
  const s = t;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: s };
}

/** Losuje liczbe calkowita z domknietego zakresu [min, max]. */
export function nextInt(
  state: number,
  min: number,
  max: number,
): { value: number; state: number } {
  const r = nextFloat(state);
  return { value: min + Math.floor(r.value * (max - min + 1)), state: r.state };
}

/** Tworzy ziarno z dowolnego napisu - przydatne do nazwanych partii. */
export function seedFromString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
