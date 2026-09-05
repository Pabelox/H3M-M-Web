import type { Axial } from './hex';

export type Team = 'A' | 'B';

/**
 * Cechy specjalne oddzialu. Karty moga je nadawac w trakcie partii,
 * dlatego nie sa czescia niezmiennej karty statystyk, tylko stanu jednostki.
 */
export type UnitFlag = 'strzelec' | 'latajacy' | 'bez-odwetu' | 'podwojny-odwet';

/** Modyfikatory statystyk - wspolny jezyk kart i awansow z odrodzenia. */
export interface StatMods {
  attack?: number;
  defense?: number;
  speed?: number;
  /** Dodawane do obrazen minimalnych i maksymalnych. */
  damage?: number;
  /** Zmiana liczebnosci w procentach, np. 25 to +25%. */
  countPercent?: number;
  ammo?: number;
  grant?: UnitFlag[];
  revoke?: UnitFlag[];
}

/** Ulepszenie przypiete do konkretnego oddzialu na stale. */
export interface Upgrade {
  /** Identyfikator karty albo awansu, ktory je nadal. */
  sourceId: string;
  name: string;
  mods: StatMods;
}

/** Niezmienna karta statystyk oddzialu. */
export interface CreatureDef {
  id: string;
  name: string;
  factionId: string;
  /** Poziom 1-6; wyznacza wiersz startowy i sile bazowa. */
  tier: number;
  /** Sylwetka pixel art uzywana do narysowania zetonu. */
  archetype: Archetype;
  hp: number;
  attack: number;
  defense: number;
  damageMin: number;
  damageMax: number;
  speed: number;
  ammo: number;
  flags: UnitFlag[];
}

export type Archetype = 'piechur' | 'strzelec' | 'skrzydlaty' | 'ciezki' | 'bestia' | 'kolos';

/** Oddzial na planszy: stos stworzen o wspolnej puli punktow zycia. */
export interface Unit {
  uid: number;
  defId: string;
  team: Team;
  pos: Axial;
  /** Pole startowe - tutaj oddzial wraca po odrodzeniu. */
  home: Axial;
  count: number;
  /** Liczebnosc, z ktora oddzial rozpoczal obecne zycie. */
  lifeStartCount: number;
  topHp: number;
  ammo: number;
  /** Ulepszenia z kart i awansow, nakladane na statystyki bazowe. */
  upgrades: Upgrade[];
  /** Ile razy oddzial moze jeszcze wrocic na plansze. */
  respawnsLeft: number;
  /** Ktore to zycie oddzialu - 1 przy rozstawieniu poczatkowym. */
  life: number;
  retaliationsUsed: number;
  defending: boolean;
  hasWaited: boolean;
}

// --- Karty ---

export type CardTarget = 'wlasny' | 'wrogi' | 'brak';

export type InstantEffect =
  /** Przywraca procent utraconej liczebnosci. */
  | { type: 'leczenie'; percent: number }
  /** Wskazany oddzial dziala natychmiast po obecnym. */
  | { type: 'druga-tura' }
  /** Przenosi oddzial na dowolne wolne pole (wybierane po zagraniu). */
  | { type: 'teleport' }
  /** Obrazenia w cel i wszystkich sasiadow. */
  | { type: 'ogien'; amount: number }
  /** Zwraca jedno zuzyte odrodzenie. */
  | { type: 'zwrot-odrodzenia' }
  /** Wrogi oddzial traci procent liczebnosci. */
  | { type: 'zatrucie'; percent: number }
  /** Wrogi strzelec traci cala amunicje. */
  | { type: 'rozbrojenie' }
  /** Ulepszenie nakladane na wszystkie wlasne oddzialy naraz. */
  | { type: 'sztandar'; mods: StatMods };

export interface Card {
  id: string;
  name: string;
  /** Opis widoczny na karcie - jedno zdanie. */
  text: string;
  target: CardTarget;
  kind: 'ulepszenie' | 'natychmiastowa';
  /** Im wyzsza, tym rzadsza w talii (1 - pospolita, 3 - rzadka). */
  rarity: 1 | 2 | 3;
  mods?: StatMods;
  effect?: InstantEffect;
  /** Karta dziala tylko na oddzial spelniajacy warunek. */
  requires?: 'strzelec' | 'ranny' | 'martwy';
}

// --- Zasady ustawiane w panelu mistrza gry ---

export interface RulesConfig {
  /** Co ile wlasnych tur gracz dobiera karte. */
  cardEveryTurns: number;
  /** Maksymalna liczba kart na rece. */
  handLimit: number;
  /** Karty rozdane na starcie. */
  startingHand: number;
  /**
   * Maksymalna liczba ulepszen na jednym oddziale. Bez tego limitu oplaca sie
   * zrzucac wszystkie karty na jeden oddzial - limit wymusza wybor, w kogo
   * inwestowac, i utrzymuje statystyki w rozsadnych granicach.
   */
  maxUpgradesPerUnit: number;
  /** Ile razy oddzial moze wrocic na plansze po smierci. */
  maxRespawns: number;
  /** Procent liczebnosci, z ktorym oddzial wraca po odrodzeniu. */
  respawnPercent: number;
  /** Mnoznik wielkosci armii w procentach (100 to wartosc bazowa). */
  armyScale: number;
  /** Czy na planszy pojawiaja sie przeszkody terenowe. */
  obstacles: boolean;
  /** Ziarno losowosci; 0 oznacza losowe przy starcie partii. */
  seed: number;
}

export const DEFAULT_RULES: RulesConfig = {
  cardEveryTurns: 3,
  handLimit: 5,
  startingHand: 2,
  maxUpgradesPerUnit: 6,
  maxRespawns: 3,
  respawnPercent: 60,
  armyScale: 80,
  obstacles: true,
  seed: 0,
};

// --- Akcje i zdarzenia ---

export type Action =
  | { kind: 'move'; to: Axial }
  | { kind: 'attack'; targetUid: number; from: Axial }
  | { kind: 'shoot'; targetUid: number }
  | { kind: 'defend' }
  | { kind: 'wait' }
  /** Zagranie karty z reki; `targetUid` i `targetHex` zaleza od rodzaju karty. */
  | { kind: 'card'; cardId: string; targetUid?: number; targetHex?: Axial };

export type GameEvent =
  | { type: 'moved'; uid: number; path: Axial[]; flying: boolean }
  | { type: 'diceRoll'; value: number; min: number; max: number }
  | {
      type: 'damage';
      attackerUid: number | null;
      targetUid: number;
      amount: number;
      killed: number;
      retaliation: boolean;
    }
  | { type: 'unitDied'; uid: number }
  | { type: 'unitRespawned'; uid: number; upgrade: string }
  | { type: 'shot'; uid: number; targetUid: number }
  | { type: 'defended'; uid: number }
  | { type: 'waited'; uid: number }
  | { type: 'cardDrawn'; team: Team; cardId: string }
  | { type: 'cardPlayed'; team: Team; cardId: string; targetUid?: number }
  | { type: 'turnStarted'; uid: number }
  | { type: 'roundStarted'; round: number }
  | { type: 'gameOver'; winner: Team }
  | { type: 'log'; text: string };

export interface GameState {
  units: Unit[];
  factions: Record<Team, string>;
  obstacles: string[];
  boardCols: number;
  boardRows: number;
  queue: number[];
  round: number;
  /** Biezacy stan generatora - zmienia sie po kazdym losowaniu. */
  rngState: number;
  /**
   * Ziarno, od ktorego zaczela sie partia. Trzymane osobno od `rngState`,
   * bo tylko ono pozwala odtworzyc rozgrywke od poczatku - i to je zapisujemy
   * w historii panelu mistrza gry.
   */
  initialSeed: number;
  winner: Team | null;
  rules: RulesConfig;
  /** Karty na rece kazdego gracza. */
  hands: Record<Team, string[]>;
  /** Stos dobierania - identyfikatory kart w kolejnosci losowania. */
  deck: string[];
  /** Licznik tur od ostatniej dobranej karty, osobno dla kazdej strony. */
  turnsSinceCard: Record<Team, number>;
  /** Czy aktywny oddzial zagral juz karte w tej turze. */
  cardPlayedThisTurn: boolean;
}
