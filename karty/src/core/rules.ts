import {
  axialToOffset,
  hexDistance,
  hexKey,
  hexNeighbors,
  offsetToAxial,
  type Axial,
} from './hex';
import { stats } from './stats';
import type { GameState, Unit } from './types';

/** Wynik przeszukiwania planszy: heks, koszt dojscia i heks poprzedni. */
export interface ReachEntry {
  hex: Axial;
  cost: number;
  from: string | null;
}

export function isOnBoard(state: GameState, hex: Axial): boolean {
  const { col, row } = axialToOffset(hex);
  return col >= 0 && col < state.boardCols && row >= 0 && row < state.boardRows;
}

export function occupiedHexes(state: GameState, ignoreUid?: number): Set<string> {
  const set = new Set<string>();
  for (const unit of state.units) {
    if (unit.count > 0 && unit.uid !== ignoreUid) set.add(hexKey(unit.pos));
  }
  return set;
}

export function unitAt(state: GameState, hex: Axial): Unit | undefined {
  const key = hexKey(hex);
  return state.units.find((unit) => unit.count > 0 && hexKey(unit.pos) === key);
}

/** Wszystkie heksy planszy w kolejnosci wierszami - do rysowania. */
export function allHexes(state: GameState): Axial[] {
  const hexes: Axial[] = [];
  for (let row = 0; row < state.boardRows; row++) {
    for (let col = 0; col < state.boardCols; col++) {
      hexes.push(offsetToAxial(col, row));
    }
  }
  return hexes;
}

export function livingUnits(state: GameState, team?: Unit['team']): Unit[] {
  return state.units.filter(
    (unit) => unit.count > 0 && (team === undefined || unit.team === team),
  );
}

/** Czy pole jest wolne - w granicach planszy, bez przeszkody i bez oddzialu. */
export function isFreeHex(state: GameState, hex: Axial, ignoreUid?: number): boolean {
  if (!isOnBoard(state, hex)) return false;
  if (state.obstacles.includes(hexKey(hex))) return false;
  return !occupiedHexes(state, ignoreUid).has(hexKey(hex));
}

/**
 * Heksy osiagalne dla oddzialu w tej turze. Oddzialy naziemne ida krok po
 * kroku, omijajac przeszkody; latajace przenosza sie w linii prostej na
 * dowolne wolne pole w zasiegu szybkosci.
 */
export function reachableHexes(state: GameState, unit: Unit): Map<string, ReachEntry> {
  const effective = stats(unit);
  const blocked = occupiedHexes(state, unit.uid);
  const obstacles = new Set(state.obstacles);

  const result = new Map<string, ReachEntry>();
  const startKey = hexKey(unit.pos);
  result.set(startKey, { hex: unit.pos, cost: 0, from: null });

  if (effective.flags.includes('latajacy')) {
    for (const hex of allHexes(state)) {
      const key = hexKey(hex);
      if (key === startKey || obstacles.has(key) || blocked.has(key)) continue;
      const distance = hexDistance(unit.pos, hex);
      if (distance > effective.speed) continue;
      result.set(key, { hex, cost: distance, from: startKey });
    }
    return result;
  }

  let frontier: Array<{ hex: Axial; cost: number }> = [{ hex: unit.pos, cost: 0 }];

  while (frontier.length > 0) {
    const next: Array<{ hex: Axial; cost: number }> = [];
    for (const current of frontier) {
      if (current.cost >= effective.speed) continue;
      for (const neighbor of hexNeighbors(current.hex)) {
        const key = hexKey(neighbor);
        if (result.has(key)) continue;
        if (!isOnBoard(state, neighbor)) continue;
        if (obstacles.has(key) || blocked.has(key)) continue;
        result.set(key, { hex: neighbor, cost: current.cost + 1, from: hexKey(current.hex) });
        next.push({ hex: neighbor, cost: current.cost + 1 });
      }
    }
    frontier = next;
  }

  return result;
}

/** Odtwarza sciezke ruchu od pozycji startowej do celu (bez heksa startowego). */
export function pathTo(reach: Map<string, ReachEntry>, target: Axial): Axial[] {
  const path: Axial[] = [];
  let key: string | null = hexKey(target);

  while (key) {
    const entry: ReachEntry | undefined = reach.get(key);
    if (!entry) return [];
    if (entry.from === null) break;
    path.push(entry.hex);
    key = entry.from;
  }

  return path.reverse();
}

export function isAdjacent(a: Axial, b: Axial): boolean {
  return hexDistance(a, b) === 1;
}

export function hasAdjacentEnemy(state: GameState, unit: Unit): boolean {
  return livingUnits(state)
    .filter((other) => other.team !== unit.team)
    .some((enemy) => isAdjacent(unit.pos, enemy.pos));
}

export function canShoot(state: GameState, unit: Unit): boolean {
  return stats(unit).flags.includes('strzelec') && unit.ammo > 0 && !hasAdjacentEnemy(state, unit);
}

export function shootTargets(state: GameState, unit: Unit): Unit[] {
  if (!canShoot(state, unit)) return [];
  return livingUnits(state).filter((other) => other.team !== unit.team);
}

export interface MeleeOption {
  target: Unit;
  from: Axial;
  cost: number;
}

/** Wrogowie do zaatakowania wrecz wraz z najtanszym polem ataku. */
export function meleeOptions(
  state: GameState,
  unit: Unit,
  reach: Map<string, ReachEntry>,
): MeleeOption[] {
  const options: MeleeOption[] = [];

  for (const enemy of livingUnits(state).filter((other) => other.team !== unit.team)) {
    let best: MeleeOption | null = null;
    for (const spot of hexNeighbors(enemy.pos)) {
      const entry = reach.get(hexKey(spot));
      if (!entry) continue;
      if (best === null || entry.cost < best.cost) {
        best = { target: enemy, from: entry.hex, cost: entry.cost };
      }
    }
    if (best) options.push(best);
  }

  return options;
}

/** Efektywna obrona z uwzglednieniem postawy obronnej (+30%, minimum +1). */
export function effectiveDefense(unit: Unit): number {
  const base = stats(unit).defense;
  return unit.defending ? base + Math.max(1, Math.round(base * 0.3)) : base;
}

/** Mnoznik obrazen z roznicy atak/obrona: +5% za punkt przewagi. */
export function damageMultiplier(attack: number, defense: number): number {
  const raw =
    attack >= defense ? 1 + 0.05 * (attack - defense) : 1 / (1 + 0.05 * (defense - attack));
  return Math.min(4, Math.max(0.3, raw));
}

/** Ile razy oddzial moze jeszcze oddac odwet w tej rundzie. */
export function retaliationsLeft(unit: Unit): number {
  const max = stats(unit).flags.includes('podwojny-odwet') ? 2 : 1;
  return Math.max(0, max - unit.retaliationsUsed);
}

/** Najblizsze wolne pole wzgledem podanego - uzywane przy odrodzeniu. */
export function nearestFreeHex(state: GameState, origin: Axial): Axial | null {
  if (isFreeHex(state, origin)) return origin;

  const seen = new Set<string>([hexKey(origin)]);
  let frontier = [origin];

  for (let ring = 0; ring < 6; ring++) {
    const next: Axial[] = [];
    for (const hex of frontier) {
      for (const neighbor of hexNeighbors(hex)) {
        const key = hexKey(neighbor);
        if (seen.has(key)) continue;
        seen.add(key);
        if (isFreeHex(state, neighbor)) return neighbor;
        if (isOnBoard(state, neighbor)) next.push(neighbor);
      }
    }
    frontier = next;
  }

  return null;
}
