import type { Archetype, CreatureDef, UnitFlag } from './types';

/**
 * Sklad armii budujemy z jednej krzywej poziomow i stylu frakcji.
 *
 * Kazda frakcja ma te sama strukture rol - dwoch strzelcow (poziom 2 i 5),
 * jednego latajacego (poziom 4) i jednego kolosa (poziom 6). W poprzedniej
 * wersji gry to wlasnie liczba strzelcow decydowala o wyniku bitwy bardziej
 * niz statystyki, wiec tutaj jest wyrownana z definicji, a roznice miedzy
 * frakcjami ida w wartosci liczbowe i cechy specjalne.
 */

interface TierRow {
  archetype: Archetype;
  hp: number;
  attack: number;
  defense: number;
  damageMin: number;
  damageMax: number;
  speed: number;
  ammo: number;
  count: number;
  flags: UnitFlag[];
}

const TIERS: TierRow[] = [
  {
    archetype: 'piechur',
    hp: 8,
    attack: 4,
    defense: 4,
    damageMin: 1,
    damageMax: 3,
    speed: 5,
    ammo: 0,
    count: 24,
    flags: [],
  },
  {
    archetype: 'strzelec',
    hp: 14,
    attack: 6,
    defense: 4,
    damageMin: 2,
    damageMax: 4,
    speed: 4,
    ammo: 12,
    count: 16,
    flags: ['strzelec'],
  },
  {
    archetype: 'bestia',
    hp: 24,
    attack: 9,
    defense: 7,
    damageMin: 3,
    damageMax: 6,
    speed: 7,
    ammo: 0,
    count: 12,
    flags: [],
  },
  {
    archetype: 'skrzydlaty',
    hp: 34,
    attack: 11,
    defense: 10,
    damageMin: 6,
    damageMax: 9,
    speed: 8,
    ammo: 0,
    count: 8,
    flags: ['latajacy'],
  },
  {
    archetype: 'ciezki',
    hp: 55,
    attack: 13,
    defense: 11,
    damageMin: 10,
    damageMax: 14,
    speed: 5,
    ammo: 8,
    count: 5,
    flags: ['strzelec'],
  },
  {
    archetype: 'kolos',
    hp: 95,
    attack: 16,
    defense: 16,
    damageMin: 18,
    damageMax: 26,
    speed: 6,
    ammo: 0,
    count: 3,
    flags: [],
  },
];

/** Odchylenie frakcji od krzywej bazowej - stad bierze sie jej charakter. */
interface FactionStyle {
  id: string;
  name: string;
  /** Krotki opis pokazywany przy wyborze armii. */
  motto: string;
  color: string;
  /** Paleta pixel art: kontur, cien, kolor glowny, swiatlo, akcent. */
  palette: [string, string, string, string, string];
  names: string[];
  attack: number;
  defense: number;
  speed: number;
  /** Zmiana punktow zycia w procentach. */
  hpPercent: number;
  /** Zmiana liczebnosci w procentach. */
  countPercent: number;
  /** Poziom, ktory dostaje dodatkowa ceche, i sama cecha. */
  signature: { tier: number; flag: UnitFlag };
}

const STYLES: FactionStyle[] = [
  {
    id: 'zakon',
    name: 'Zakon Świtu',
    motto: 'Karność i mur tarcz. Wolniejsi, ale trudni do rozbicia.',
    color: '#e0c877',
    palette: ['#2a2118', '#8a6f3c', '#d8bd72', '#f5e6ad', '#7fb6e8'],
    names: ['Rekrut', 'Kusznik', 'Rumak Bojowy', 'Sokół Zakonu', 'Trebusz', 'Paladyn'],
    attack: 0,
    defense: 2,
    speed: -1,
    hpPercent: 0,
    countPercent: 0,
    signature: { tier: 6, flag: 'podwojny-odwet' },
  },
  {
    id: 'roj',
    name: 'Rój Głębin',
    motto: 'Liczebność i tempo. Uderza pierwszy, ginie łatwo.',
    color: '#7fd4b0',
    palette: ['#12241e', '#2e6b52', '#5fb98c', '#a8e8c8', '#e87fa8'],
    names: ['Larwa', 'Plujka', 'Skoczek', 'Skrzydlica', 'Miotacz Kwasu', 'Matka Roju'],
    attack: 0,
    defense: -2,
    speed: 1,
    hpPercent: -10,
    countPercent: 25,
    signature: { tier: 3, flag: 'bez-odwetu' },
  },
  {
    id: 'popiol',
    name: 'Popiołowi',
    motto: 'Ogień i pęd. Zadaje najwięcej, ale sam jest kruchy.',
    color: '#e08a5a',
    palette: ['#2a1512', '#7a3320', '#c85f38', '#f0a878', '#f5d76a'],
    names: [
      'Zgorzelec',
      'Prochownik',
      'Ogar Żaru',
      'Żarptak',
      'Katapulta Żaru',
      'Kolos Popiołu',
    ],
    attack: 2,
    defense: 0,
    speed: 0,
    hpPercent: -12,
    countPercent: 0,
    signature: { tier: 5, flag: 'bez-odwetu' },
  },
];

export interface Faction {
  id: string;
  name: string;
  motto: string;
  color: string;
  palette: [string, string, string, string, string];
  /** Identyfikatory stworzen w kolejnosci poziomow 1-6. */
  creatures: string[];
}

export const CREATURES: Record<string, CreatureDef> = {};
export const FACTIONS: Record<string, Faction> = {};
/** Bazowa liczebnosc kazdego oddzialu, zanim zadziala mnoznik z zasad. */
export const BASE_COUNTS: Record<string, number[]> = {};

for (const style of STYLES) {
  const creatureIds: string[] = [];
  const counts: number[] = [];

  TIERS.forEach((tier, index) => {
    const id = `${style.id}-${index + 1}`;
    const flags: UnitFlag[] = [...tier.flags];
    if (style.signature.tier === index + 1 && !flags.includes(style.signature.flag)) {
      flags.push(style.signature.flag);
    }

    CREATURES[id] = {
      id,
      name: style.names[index],
      factionId: style.id,
      tier: index + 1,
      archetype: tier.archetype,
      hp: Math.max(1, Math.round(tier.hp * (1 + style.hpPercent / 100))),
      attack: tier.attack + style.attack,
      defense: Math.max(1, tier.defense + style.defense),
      damageMin: tier.damageMin,
      damageMax: tier.damageMax,
      speed: Math.max(1, tier.speed + style.speed),
      ammo: tier.ammo,
      flags,
    };

    creatureIds.push(id);
    counts.push(Math.max(1, Math.round(tier.count * (1 + style.countPercent / 100))));
  });

  FACTIONS[style.id] = {
    id: style.id,
    name: style.name,
    motto: style.motto,
    color: style.color,
    palette: style.palette,
    creatures: creatureIds,
  };
  BASE_COUNTS[style.id] = counts;
}

export const FACTION_IDS = Object.keys(FACTIONS);

export function creatureDef(id: string): CreatureDef {
  const def = CREATURES[id];
  if (!def) throw new Error(`Nieznane stworzenie: ${id}`);
  return def;
}

export function faction(id: string): Faction {
  const found = FACTIONS[id];
  if (!found) throw new Error(`Nieznana frakcja: ${id}`);
  return found;
}

/**
 * Wskaznik sily armii - pula zycia wazona obrona, razy obrazenia wazone
 * atakiem. Sluzy do wyrownania frakcji miedzy soba.
 */
function armyPower(creatureIds: string[], counts: number[]): number {
  let hp = 0;
  let dps = 0;
  let weightedAttack = 0;
  let weightedDefense = 0;

  creatureIds.forEach((id, index) => {
    const def = CREATURES[id];
    const pool = counts[index] * def.hp;
    const output = (counts[index] * (def.damageMin + def.damageMax)) / 2;
    hp += pool;
    dps += output;
    weightedAttack += output * def.attack;
    weightedDefense += pool * def.defense;
  });

  return (
    hp *
    (1 + 0.05 * (weightedDefense / hp - 10)) *
    dps *
    (1 + 0.05 * (weightedAttack / dps - 10))
  );
}

/**
 * Liczebnosci wyrownane miedzy frakcjami i przeskalowane mnoznikiem z zasad.
 * Sila armii rosnie z kwadratem liczebnosci, stad pierwiastek przy skalowaniu.
 */
export function armyCounts(factionId: string, armyScale: number): number[] {
  const ids = FACTIONS[factionId].creatures;
  const powers = FACTION_IDS.map((id) => armyPower(FACTIONS[id].creatures, BASE_COUNTS[id]));
  const target = powers.reduce((sum, value) => sum + value, 0) / powers.length;

  const balance = Math.sqrt(target / armyPower(ids, BASE_COUNTS[factionId]));
  const scale = balance * (armyScale / 100);
  return BASE_COUNTS[factionId].map((count) => Math.max(1, Math.round(count * scale)));
}
