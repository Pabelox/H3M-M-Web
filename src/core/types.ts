import type { FactionId } from './factions';
import type { Axial } from './hex';

export type Team = 'A' | 'B';

/**
 * Cechy specjalne stworzen przeniesione z HoMM3.
 * - `strzelec` - atakuje na odleglosc, dopoki ma amunicje i nie styka sie z wrogiem
 * - `latajacy` - w ruchu ignoruje przeszkody i inne oddzialy
 * - `bez-odwetu` - zaatakowany przez nie oddzial nie oddaje ciosu
 * - `podwojny-odwet` - oddaje cios dwa razy na runde zamiast raz
 */
export type CreatureFlag = 'strzelec' | 'latajacy' | 'bez-odwetu' | 'podwojny-odwet';

/** Niezmienna karta statystyk stworzenia (odpowiednik karty jednostki w pudelku). */
export interface CreatureDef {
  /** Identyfikator, jednoczesnie nazwa pliku sprite'a: `assets/units/<id>.png`. */
  id: string;
  name: string;
  faction: FactionId;
  /** Poziom stworzenia 1-7; wyznacza tez wiersz startowy na planszy. */
  tier: number;
  attack: number;
  defense: number;
  damageMin: number;
  damageMax: number;
  /** Punkty zycia pojedynczego stworzenia w oddziale. */
  hp: number;
  /** Zasieg ruchu w heksach, a zarazem miejsce w kolejce inicjatywy. */
  speed: number;
  /** Zapas amunicji; 0 dla walczacych wrecz. */
  shots: number;
  flags: CreatureFlag[];
}

/** Oddzial na planszy: stos stworzen o wspolnej puli punktow zycia. */
export interface Unit {
  uid: number;
  defId: string;
  team: Team;
  pos: Axial;
  /** Liczebnosc oddzialu - spada, gdy obrazenia zabijaja cale stworzenia. */
  count: number;
  /** Punkty zycia pierwszego stworzenia w stosie (pozostale maja pelne HP). */
  topHp: number;
  ammo: number;
  /** Ile razy oddzial oddal juz odwet w tej rundzie. */
  retaliationsUsed: number;
  /** Czy oddzial sie broni (premia do obrony do poczatku jego nastepnej tury). */
  defending: boolean;
  /** Czy oddzial odlozyl swoja ture w tej rundzie (akcja "czekaj"). */
  hasWaited: boolean;
}

export type Action =
  | { kind: 'move'; to: Axial }
  /** Podejscie na heks `from` i atak wrecz na oddzial `targetUid`. */
  | { kind: 'attack'; targetUid: number; from: Axial }
  | { kind: 'shoot'; targetUid: number }
  | { kind: 'defend' }
  | { kind: 'wait' };

/** Zdarzenie do animacji, dziennika rozgrywki i efektow dzwiekowych. */
export type GameEvent =
  | { type: 'moved'; uid: number; path: Axial[]; flying: boolean }
  | { type: 'diceRoll'; value: number; min: number; max: number }
  | {
      type: 'damage';
      attackerUid: number;
      targetUid: number;
      amount: number;
      killed: number;
      retaliation: boolean;
    }
  | { type: 'unitDied'; uid: number }
  | { type: 'shot'; uid: number; targetUid: number }
  | { type: 'defended'; uid: number }
  | { type: 'waited'; uid: number }
  | { type: 'turnStarted'; uid: number }
  | { type: 'roundStarted'; round: number }
  | { type: 'gameOver'; winner: Team }
  | { type: 'log'; text: string };

export interface GameState {
  units: Unit[];
  /** Miasto wystawione przez kazda ze stron. */
  factions: Record<Team, FactionId>;
  /** Heksy zablokowane przez przeszkody terenowe. */
  obstacles: string[];
  boardCols: number;
  boardRows: number;
  /** Kolejka inicjatywy - identyfikatory oddzialow w kolejnosci dzialania. */
  queue: number[];
  round: number;
  rngState: number;
  winner: Team | null;
}
