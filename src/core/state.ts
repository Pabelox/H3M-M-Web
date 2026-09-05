import { armyCounts, creatureDef, FACTIONS, type FactionId } from './factions';
import { hexKey, offsetToAxial } from './hex';
import type { GameState, Team, Unit } from './types';

/**
 * Szerokosc planszy. Trzynascie kolumn daje szybkim oddzialom latajacym
 * (Aniol ma szybkosc 12) margines, ktorego brakowalo przy jedenastu -
 * bez niego najwyzsze tiery dosiegaly dowolnego pola i pozycja przestawala
 * miec znaczenie.
 */
export const BOARD_COLS = 13;
/** Siedem wierszy - po jednym na kazdy tier stworzen. */
export const BOARD_ROWS = 7;

/** Przeszkody terenowe (wspolrzedne offsetowe col/row) - blokuja ruch i strzaly. */
const OBSTACLE_OFFSETS: Array<[number, number]> = [
  [4, 1],
  [5, 4],
  [6, 2],
  [6, 5],
  [7, 3],
  [8, 0],
];

/** Kolumna startowa dla kazdej ze stron. */
const START_COLUMN: Record<Team, number> = { A: 0, B: BOARD_COLS - 1 };

export function createInitialState(
  seed: number,
  factionA: FactionId,
  factionB: FactionId,
): GameState {
  const factions: Record<Team, FactionId> = { A: factionA, B: factionB };
  const units: Unit[] = [];
  let uid = 1;

  for (const team of ['A', 'B'] as Team[]) {
    const counts = armyCounts(factions[team]);
    FACTIONS[factions[team]].creatures.forEach((creatureId, index) => {
      const def = creatureDef(creatureId);
      units.push({
        uid: uid++,
        defId: def.id,
        team,
        pos: offsetToAxial(START_COLUMN[team], index),
        count: counts[index],
        topHp: def.hp,
        ammo: def.shots,
        retaliationsUsed: 0,
        defending: false,
        hasWaited: false,
      });
    });
  }

  const state: GameState = {
    units,
    factions,
    obstacles: OBSTACLE_OFFSETS.map(([col, row]) => hexKey(offsetToAxial(col, row))),
    boardCols: BOARD_COLS,
    boardRows: BOARD_ROWS,
    queue: [],
    round: 1,
    rngState: seed,
    winner: null,
  };

  state.queue = buildQueue(state);
  return state;
}

/**
 * Buduje kolejke inicjatywy na nowa runde. Tak jak w HoMM3 o kolejnosci
 * decyduje szybkosc stworzenia; przy remisie - kolejnosc wystawienia.
 */
export function buildQueue(state: GameState): number[] {
  return state.units
    .filter((u) => u.count > 0)
    .slice()
    .sort((a, b) => {
      const diff = creatureDef(b.defId).speed - creatureDef(a.defId).speed;
      return diff !== 0 ? diff : a.uid - b.uid;
    })
    .map((u) => u.uid);
}

export function findUnit(state: GameState, uid: number): Unit | undefined {
  return state.units.find((u) => u.uid === uid);
}

/** Oddzial, ktory ma teraz ture, albo `undefined` gdy bitwa jest rozstrzygnieta. */
export function activeUnit(state: GameState): Unit | undefined {
  const uid = state.queue[0];
  return uid === undefined ? undefined : findUnit(state, uid);
}

export function livingUnits(state: GameState, team?: Team): Unit[] {
  return state.units.filter((u) => u.count > 0 && (team === undefined || u.team === team));
}

/** Laczna pula punktow zycia oddzialu (wszystkie stworzenia razem). */
export function unitHpPool(unit: Unit): number {
  return unit.topHp + (unit.count - 1) * creatureDef(unit.defId).hp;
}

/** Kolor przewodni miasta wystawionego przez druzyne. */
export function teamColor(state: GameState, team: Team): string {
  return FACTIONS[state.factions[team]].color;
}

export function teamName(state: GameState, team: Team): string {
  return FACTIONS[state.factions[team]].name;
}
