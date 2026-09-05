import { creatureDef, hasFlag, SHOOTING_RANGE } from './factions';
import {
  axialToOffset,
  hexDistance,
  hexKey,
  hexNeighbors,
  offsetToAxial,
  type Axial,
} from './hex';
import { livingUnits } from './state';
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

/** Zbior heksow zajetych przez zyjace oddzialy. */
export function occupiedHexes(state: GameState, ignoreUid?: number): Set<string> {
  const set = new Set<string>();
  for (const u of state.units) {
    if (u.count > 0 && u.uid !== ignoreUid) set.add(hexKey(u.pos));
  }
  return set;
}

export function unitAt(state: GameState, hex: Axial): Unit | undefined {
  const key = hexKey(hex);
  return state.units.find((u) => u.count > 0 && hexKey(u.pos) === key);
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

/**
 * Heksy osiagalne dla oddzialu w tej turze.
 *
 * Oddzialy naziemne ida krok po kroku (przeszukiwanie wszerz), omijajac
 * przeszkody i innych. Oddzialy latajace przenosza sie w linii prostej na
 * dowolne wolne pole w zasiegu szybkosci - przeszkody im nie przeszkadzaja.
 */
export function reachableHexes(state: GameState, unit: Unit): Map<string, ReachEntry> {
  const def = creatureDef(unit.defId);
  const blocked = occupiedHexes(state, unit.uid);
  const obstacles = new Set(state.obstacles);

  const result = new Map<string, ReachEntry>();
  const startKey = hexKey(unit.pos);
  result.set(startKey, { hex: unit.pos, cost: 0, from: null });

  if (hasFlag(def, 'latajacy')) {
    for (const hex of allHexes(state)) {
      const key = hexKey(hex);
      if (key === startKey || obstacles.has(key) || blocked.has(key)) continue;
      const distance = hexDistance(unit.pos, hex);
      if (distance > def.speed) continue;
      result.set(key, { hex, cost: distance, from: startKey });
    }
    return result;
  }

  let frontier: Array<{ hex: Axial; cost: number }> = [{ hex: unit.pos, cost: 0 }];

  while (frontier.length > 0) {
    const next: Array<{ hex: Axial; cost: number }> = [];
    for (const current of frontier) {
      if (current.cost >= def.speed) continue;
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

/** Czy oddzial styka sie z jakimkolwiek wrogiem (blokuje strzelanie). */
export function hasAdjacentEnemy(state: GameState, unit: Unit): boolean {
  return livingUnits(state)
    .filter((u) => u.team !== unit.team)
    .some((enemy) => isAdjacent(unit.pos, enemy.pos));
}

export function canShoot(state: GameState, unit: Unit): boolean {
  const def = creatureDef(unit.defId);
  return hasFlag(def, 'strzelec') && unit.ammo > 0 && !hasAdjacentEnemy(state, unit);
}

/** Wrogowie w zasiegu strzalu. */
export function shootTargets(state: GameState, unit: Unit): Unit[] {
  if (!canShoot(state, unit)) return [];
  return livingUnits(state)
    .filter((u) => u.team !== unit.team)
    .filter((enemy) => hexDistance(unit.pos, enemy.pos) <= SHOOTING_RANGE);
}

export interface MeleeOption {
  target: Unit;
  /** Heks, z ktorego nastapi atak (moze byc rowny obecnej pozycji). */
  from: Axial;
  /** Koszt dojscia do heksa ataku. */
  cost: number;
}

/**
 * Wrogowie mozliwi do zaatakowania wrecz w tej turze, wraz z najtanszym
 * heksem, z ktorego mozna wyprowadzic atak.
 */
export function meleeOptions(
  state: GameState,
  unit: Unit,
  reach: Map<string, ReachEntry>,
): MeleeOption[] {
  const options: MeleeOption[] = [];

  for (const enemy of livingUnits(state).filter((u) => u.team !== unit.team)) {
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
  const base = creatureDef(unit.defId).defense;
  return unit.defending ? base + Math.max(1, Math.round(base * 0.3)) : base;
}

/**
 * Mnoznik obrazen wynikajacy z roznicy atak/obrona.
 * Przewaga ataku daje +5% za punkt, przewaga obrony redukuje obrazenia.
 */
export function damageMultiplier(attack: number, defense: number): number {
  const raw =
    attack >= defense ? 1 + 0.05 * (attack - defense) : 1 / (1 + 0.05 * (defense - attack));
  return Math.min(4, Math.max(0.3, raw));
}

/** Ile razy oddzial moze jeszcze oddac odwet w tej rundzie. */
export function retaliationsLeft(unit: Unit): number {
  const max = hasFlag(creatureDef(unit.defId), 'podwojny-odwet') ? 2 : 1;
  return Math.max(0, max - unit.retaliationsUsed);
}
