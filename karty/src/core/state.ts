import { buildDeck } from './cards';
import { hexKey, offsetToAxial } from './hex';
import { nextInt } from './rng';
import { stats } from './stats';
import type { GameState, RulesConfig, Team, Unit } from './types';
import { armyCounts, creatureDef, faction } from './units';

export const BOARD_COLS = 11;
/** Szesc wierszy - po jednym na kazdy poziom stworzen. */
export const BOARD_ROWS = 6;

/** Przeszkody terenowe (wspolrzedne offsetowe col/row). */
const OBSTACLE_OFFSETS: Array<[number, number]> = [
  [3, 1],
  [4, 4],
  [5, 2],
  [6, 5],
  [7, 3],
];

const START_COLUMN: Record<Team, number> = { A: 0, B: BOARD_COLS - 1 };

export function createInitialState(
  rules: RulesConfig,
  factionA: string,
  factionB: string,
): GameState {
  const factions: Record<Team, string> = { A: factionA, B: factionB };
  const units: Unit[] = [];
  let uid = 1;

  for (const team of ['A', 'B'] as Team[]) {
    const counts = armyCounts(factions[team], rules.armyScale);
    faction(factions[team]).creatures.forEach((creatureId, index) => {
      const def = creatureDef(creatureId);
      const home = offsetToAxial(START_COLUMN[team], index);
      units.push({
        uid: uid++,
        defId: def.id,
        team,
        pos: home,
        home,
        count: counts[index],
        lifeStartCount: counts[index],
        topHp: def.hp,
        ammo: def.ammo,
        upgrades: [],
        respawnsLeft: rules.maxRespawns,
        life: 1,
        retaliationsUsed: 0,
        defending: false,
        hasWaited: false,
      });
    });
  }

  const seed = rules.seed !== 0 ? rules.seed : Date.now() >>> 0;

  const state: GameState = {
    units,
    factions,
    obstacles: rules.obstacles
      ? OBSTACLE_OFFSETS.map(([col, row]) => hexKey(offsetToAxial(col, row)))
      : [],
    boardCols: BOARD_COLS,
    boardRows: BOARD_ROWS,
    queue: [],
    round: 1,
    rngState: seed,
    initialSeed: seed,
    winner: null,
    rules,
    hands: { A: [], B: [] },
    deck: [],
    turnsSinceCard: { A: 0, B: 0 },
    cardPlayedThisTurn: false,
  };

  state.deck = shuffle(state, buildDeck());
  for (const team of ['A', 'B'] as Team[]) {
    for (let i = 0; i < rules.startingHand; i++) drawCard(state, team);
  }

  state.queue = buildQueue(state);
  return state;
}

/**
 * Tasowanie Fishera-Yatesa na generatorze ze stanu gry, zeby cala partia
 * pozostala odtwarzalna z ziarna.
 */
function shuffle(state: GameState, items: string[]): string[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const roll = nextInt(state.rngState, 0, i);
    state.rngState = roll.state;
    [result[i], result[roll.value]] = [result[roll.value], result[i]];
  }
  return result;
}

/**
 * Dobiera karte ze stosu. Gdy stos sie wyczerpie, talia jest budowana
 * i tasowana od nowa - partia nigdy nie zostaje bez kart.
 * Zwraca dobrana karte albo `null`, gdy reka jest pelna.
 */
export function drawCard(state: GameState, team: Team): string | null {
  if (state.hands[team].length >= state.rules.handLimit) return null;

  if (state.deck.length === 0) {
    state.deck = shuffle(state, buildDeck());
  }

  const cardId = state.deck.shift();
  if (!cardId) return null;

  state.hands[team].push(cardId);
  return cardId;
}

/** Kolejnosc dzialania w rundzie: od najszybszego oddzialu. */
export function buildQueue(state: GameState): number[] {
  return state.units
    .filter((unit) => unit.count > 0)
    .slice()
    .sort((a, b) => {
      const diff = stats(b).speed - stats(a).speed;
      return diff !== 0 ? diff : a.uid - b.uid;
    })
    .map((unit) => unit.uid);
}

export function findUnit(state: GameState, uid: number): Unit | undefined {
  return state.units.find((unit) => unit.uid === uid);
}

export function activeUnit(state: GameState): Unit | undefined {
  const uid = state.queue[0];
  return uid === undefined ? undefined : findUnit(state, uid);
}

export function teamColor(state: GameState, team: Team): string {
  return faction(state.factions[team]).color;
}

export function teamName(state: GameState, team: Team): string {
  return faction(state.factions[team]).name;
}

/**
 * Czy strona ma jeszcze czym walczyc - liczy sie zarowno oddzial na planszy,
 * jak i taki, ktory czeka na odrodzenie.
 */
export function teamAlive(state: GameState, team: Team): boolean {
  return state.units.some(
    (unit) => unit.team === team && (unit.count > 0 || unit.respawnsLeft > 0),
  );
}
