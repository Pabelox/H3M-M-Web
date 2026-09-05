import type { CreatureDef, CreatureFlag } from './types';

/**
 * Statystyki stworzen odwzorowane za Heroes of Might and Magic III
 * (wersje podstawowe, bez ulepszen), tiery 1-7 dla osmiu miast.
 *
 * Zrodlo danych: heroes.thelazy.net (lista stworzen HoMM3).
 * Conflux zostal pominiety - dla tierow 6-7 nie udalo sie potwierdzic wartosci.
 *
 * `speed` pelni podwojna role, tak jak w oryginale: wyznacza zasieg ruchu
 * i miejsce w kolejce inicjatywy.
 */

/** Wiersz tabeli: id, nazwa, atak, obrona, obr. min, obr. maks, PZ, szybkosc, strzaly, cechy. */
type StatRow = [
  string,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  CreatureFlag[],
];

export type FactionId =
  | 'zamek'
  | 'bastion'
  | 'wieza'
  | 'inferno'
  | 'nekropolis'
  | 'loch'
  | 'cytadela'
  | 'twierdza';

export interface Faction {
  id: FactionId;
  name: string;
  /** Kolor przewodni - podstawki zetonow, ramki paneli, akcenty interfejsu. */
  color: string;
  /** Identyfikatory stworzen w kolejnosci tierow 1-7. */
  creatures: string[];
}

const TABLE: Record<FactionId, { name: string; color: string; rows: StatRow[] }> = {
  zamek: {
    name: 'Zamek',
    color: '#d8c48a',
    rows: [
      ['pikinier', 'Pikinier', 4, 5, 1, 3, 10, 4, 0, []],
      ['lucznik', 'Łucznik', 6, 3, 2, 3, 10, 4, 12, ['strzelec']],
      ['gryf', 'Gryf', 8, 8, 3, 6, 25, 6, 0, ['latajacy', 'podwojny-odwet']],
      ['miecznik', 'Miecznik', 10, 12, 6, 9, 35, 5, 0, []],
      ['mnich', 'Mnich', 12, 7, 10, 12, 30, 5, 12, ['strzelec']],
      ['kawalerzysta', 'Kawalerzysta', 15, 15, 15, 25, 100, 7, 0, []],
      ['aniol', 'Anioł', 20, 20, 50, 50, 200, 12, 0, ['latajacy']],
    ],
  },
  bastion: {
    name: 'Bastion',
    color: '#7fc47f',
    rows: [
      ['centaur', 'Centaur', 5, 3, 2, 3, 8, 6, 0, []],
      ['krasnolud', 'Krasnolud', 6, 7, 2, 4, 20, 3, 0, []],
      ['lesny-elf', 'Leśny Elf', 9, 5, 3, 5, 15, 6, 24, ['strzelec']],
      ['pegaz', 'Pegaz', 9, 8, 5, 9, 30, 8, 0, ['latajacy']],
      ['drzewiec', 'Drzewiec', 9, 12, 10, 14, 55, 3, 0, []],
      ['jednorozec', 'Jednorożec', 15, 14, 18, 22, 90, 7, 0, []],
      ['zielony-smok', 'Zielony Smok', 18, 18, 40, 50, 180, 10, 0, ['latajacy']],
    ],
  },
  wieza: {
    name: 'Wieża',
    color: '#8fb8e0',
    rows: [
      ['gremlin', 'Gremlin', 3, 3, 1, 2, 4, 4, 0, []],
      ['gargulec', 'Kamienny Gargulec', 6, 6, 2, 3, 16, 6, 0, ['latajacy']],
      ['golem', 'Kamienny Golem', 7, 10, 4, 5, 30, 3, 0, []],
      ['mag', 'Mag', 11, 8, 7, 9, 25, 5, 24, ['strzelec']],
      ['dzin', 'Dżin', 12, 12, 13, 16, 40, 7, 0, ['latajacy']],
      ['naga', 'Naga', 16, 13, 20, 20, 110, 5, 0, ['bez-odwetu']],
      ['gigant', 'Gigant', 19, 16, 40, 60, 150, 7, 0, []],
    ],
  },
  inferno: {
    name: 'Inferno',
    color: '#d4795a',
    rows: [
      ['diablik', 'Diablik', 2, 3, 1, 2, 4, 5, 0, []],
      ['gog', 'Gog', 6, 4, 2, 4, 13, 4, 12, ['strzelec']],
      ['ogar', 'Ogar Piekielny', 10, 6, 2, 7, 25, 7, 0, []],
      ['demon', 'Demon', 10, 10, 7, 9, 35, 5, 0, []],
      ['czart', 'Czart', 13, 13, 13, 17, 45, 6, 0, []],
      ['ifryt', 'Ifryt', 16, 12, 16, 24, 90, 9, 0, ['latajacy']],
      ['diabel', 'Diabeł', 19, 21, 30, 40, 160, 11, 0, ['latajacy', 'bez-odwetu']],
    ],
  },
  nekropolis: {
    name: 'Nekropolis',
    color: '#9a8fb0',
    rows: [
      ['szkielet', 'Szkielet', 5, 4, 1, 3, 6, 4, 0, []],
      ['trup', 'Chodzący Trup', 5, 5, 2, 3, 15, 3, 0, []],
      ['zjawa', 'Zjawa', 7, 7, 3, 5, 18, 5, 0, ['latajacy']],
      ['wampir', 'Wampir', 10, 9, 5, 8, 30, 6, 0, ['latajacy', 'bez-odwetu']],
      ['licz', 'Licz', 13, 10, 11, 13, 30, 6, 12, ['strzelec']],
      ['czarny-rycerz', 'Czarny Rycerz', 16, 16, 15, 30, 120, 7, 0, []],
      ['kosciany-smok', 'Kościany Smok', 17, 15, 25, 50, 150, 9, 0, ['latajacy']],
    ],
  },
  loch: {
    name: 'Loch',
    color: '#b07fc4',
    rows: [
      ['troglodyta', 'Troglodyta', 4, 3, 1, 3, 5, 4, 0, []],
      ['harpia', 'Harpia', 6, 5, 1, 4, 14, 6, 0, ['latajacy']],
      ['obserwator', 'Obserwator', 9, 7, 3, 5, 22, 5, 12, ['strzelec']],
      ['meduza', 'Meduza', 9, 9, 6, 8, 25, 5, 4, ['strzelec']],
      ['minotaur', 'Minotaur', 14, 12, 12, 20, 50, 6, 0, []],
      ['mantykora', 'Mantykora', 15, 13, 14, 20, 80, 7, 0, ['latajacy']],
      ['czerwony-smok', 'Czerwony Smok', 19, 19, 40, 50, 180, 11, 0, ['latajacy']],
    ],
  },
  cytadela: {
    name: 'Cytadela',
    color: '#c4a05a',
    rows: [
      ['goblin', 'Goblin', 4, 2, 1, 2, 5, 5, 0, []],
      ['jezdziec-wilk', 'Jeździec na Wilku', 7, 5, 2, 4, 10, 6, 0, []],
      ['ork', 'Ork', 8, 4, 2, 5, 15, 4, 12, ['strzelec']],
      ['ogr', 'Ogr', 13, 7, 6, 12, 40, 4, 0, []],
      ['roc', 'Roc', 13, 11, 11, 15, 60, 7, 0, ['latajacy']],
      ['cyklop', 'Cyklop', 15, 12, 16, 20, 70, 6, 16, ['strzelec']],
      ['behemot', 'Behemot', 17, 17, 30, 50, 160, 6, 0, []],
    ],
  },
  twierdza: {
    name: 'Twierdza',
    color: '#8fae7a',
    rows: [
      ['gnoll', 'Gnoll', 3, 5, 2, 3, 6, 4, 0, []],
      ['jaszczur', 'Jaszczuroczłek', 5, 6, 2, 3, 14, 4, 12, ['strzelec']],
      ['wezowa-mucha', 'Wężowa Mucha', 7, 9, 2, 5, 20, 9, 0, ['latajacy']],
      ['bazyliszek', 'Bazyliszek', 11, 11, 6, 10, 35, 5, 0, []],
      ['gorgona', 'Gorgona', 10, 14, 12, 16, 70, 5, 0, []],
      ['wiwerna', 'Wiwerna', 14, 14, 14, 18, 70, 7, 0, ['latajacy']],
      ['hydra', 'Hydra', 16, 18, 25, 45, 175, 5, 0, ['bez-odwetu']],
    ],
  },
};

/**
 * Bazowa liczebnosc oddzialu dla kolejnych tierow 1-7, oparta na tygodniowym
 * przyroscie z HoMM3. Wyznacza proporcje miedzy poziomami wewnatrz armii;
 * roznice miedzy miastami wyrownuje pozniej `ARMY_COUNTS`.
 */
const WEEKLY_GROWTH = [14, 8, 7, 4, 3, 2, 1];
const WEEKS = 3;

export const TIER_COUNTS = WEEKLY_GROWTH.map((growth) => growth * WEEKS);

export const CREATURES: Record<string, CreatureDef> = {};
export const FACTIONS: Record<FactionId, Faction> = {} as Record<FactionId, Faction>;

for (const [factionId, entry] of Object.entries(TABLE) as Array<[FactionId, (typeof TABLE)[FactionId]]>) {
  FACTIONS[factionId] = {
    id: factionId,
    name: entry.name,
    color: entry.color,
    creatures: entry.rows.map((row) => row[0]),
  };

  entry.rows.forEach((row, index) => {
    const [id, name, attack, defense, damageMin, damageMax, hp, speed, shots, flags] = row;
    CREATURES[id] = {
      id,
      name,
      faction: factionId,
      tier: index + 1,
      attack,
      defense,
      damageMin,
      damageMax,
      hp,
      speed,
      shots,
      flags,
    };
  });
}

export const FACTION_IDS = Object.keys(FACTIONS) as FactionId[];

/**
 * Wskaznik sily armii.
 *
 * Sama suma punktow zycia i obrazen nie wystarcza - o wyniku bitwy decyduje tez
 * roznica atak/obrona, bo wchodzi w mnoznik obrazen. Dlatego pule zycia wazymy
 * srednia obrona, a obrazenia srednim atakiem, obiema liczonymi wzgledem
 * wartosci odniesienia 10 i ta sama krzywa +5% na punkt, ktorej uzywa silnik.
 */
function armyPower(creatureIds: string[], counts: number[]): number {
  let hp = 0;
  let dps = 0;
  let weightedAttack = 0;
  let weightedDefense = 0;

  creatureIds.forEach((id, index) => {
    const def = CREATURES[id];
    const count = counts[index];
    const pool = count * def.hp;
    const output = (count * (def.damageMin + def.damageMax)) / 2;

    hp += pool;
    dps += output;
    weightedAttack += output * def.attack;
    weightedDefense += pool * def.defense;
  });

  const effectiveHp = hp * (1 + 0.05 * (weightedDefense / hp - 10));
  const effectiveDps = dps * (1 + 0.05 * (weightedAttack / dps - 10));
  return effectiveHp * effectiveDps;
}

/**
 * Liczebnosci wyrownane miedzy miastami.
 *
 * Statystyki stworzen w HoMM3 nie sa symetryczne - przy jednakowych
 * liczebnosciach Zamek wygrywal z kazdym przeciwnikiem. Skalujemy wiec
 * liczebnosc calej armii tak, by wskaznik sily kazdego miasta trafial w te sama
 * wartosc. Sila rosnie z kwadratem liczebnosci (rosnie i pula zycia, i
 * obrazenia), stad pierwiastek ze stosunku do wartosci docelowej.
 */
export const ARMY_COUNTS: Record<FactionId, number[]> = (() => {
  const basePowers = FACTION_IDS.map((id) => armyPower(FACTIONS[id].creatures, TIER_COUNTS));
  const target = basePowers.reduce((sum, value) => sum + value, 0) / basePowers.length;

  const result = {} as Record<FactionId, number[]>;
  FACTION_IDS.forEach((id, index) => {
    const scale = Math.sqrt(target / basePowers[index]);
    const scaled = TIER_COUNTS.map((count) => Math.max(1, Math.round(count * scale)));
    result[id] = refineCounts(FACTIONS[id].creatures, scaled, target);
  });
  return result;
})();

/**
 * Domyka roznice, ktorej nie da sie wyrazic samym mnoznikiem.
 *
 * Wysokie tiery licza po kilka sztuk, wiec zaokraglenie potrafi zgubic nawet
 * kilkanascie procent sily. Dlatego po przeskalowaniu dobieramy pojedyncze
 * sztuki: w kazdym kroku sprawdzamy, ktora zmiana o +/-1 najbardziej zbliza
 * armie do wartosci docelowej, i zatrzymujemy sie, gdy nic juz nie poprawia.
 */
function refineCounts(creatureIds: string[], counts: number[], target: number): number[] {
  const result = counts.slice();

  for (let iteration = 0; iteration < 40; iteration++) {
    const currentError = Math.abs(armyPower(creatureIds, result) - target) / target;
    if (currentError < 0.005) break;

    let best: { index: number; delta: number; error: number } | null = null;

    for (let index = 0; index < result.length; index++) {
      for (const delta of [-1, 1]) {
        if (result[index] + delta < 1) continue;
        const candidate = result.slice();
        candidate[index] += delta;
        const error = Math.abs(armyPower(creatureIds, candidate) - target) / target;
        if (best === null || error < best.error) best = { index, delta, error };
      }
    }

    if (best === null || best.error >= currentError) break;
    result[best.index] += best.delta;
  }

  return result;
}

/** Liczebnosci oddzialow tierow 1-7 dla wskazanego miasta. */
export function armyCounts(factionId: FactionId): number[] {
  return ARMY_COUNTS[factionId];
}

export function creatureDef(id: string): CreatureDef {
  const def = CREATURES[id];
  if (!def) throw new Error(`Nieznane stworzenie: ${id}`);
  return def;
}

export function hasFlag(def: CreatureDef, flag: CreatureFlag): boolean {
  return def.flags.includes(flag);
}

/** Zasieg strzalu - w praktyce cala plansza, ograniczeniem jest amunicja. */
export const SHOOTING_RANGE = 99;
