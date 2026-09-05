import type { Card } from './types';

/**
 * Talia ulepszen. Szesnascie kart nadaje oddzialom trwale premie, osiem
 * dziala jednorazowo. Rzadkosc (`rarity`) steruje liczba kopii w talii:
 * karta pospolita wystepuje trzy razy, rzadka tylko raz.
 */
export const CARDS: Card[] = [
  // --- Trwale ulepszenia ---
  {
    id: 'ostrze',
    name: 'Naostrzone Ostrza',
    text: '+3 do ataku wybranego oddziału.',
    target: 'wlasny',
    kind: 'ulepszenie',
    rarity: 1,
    mods: { attack: 3 },
  },
  {
    id: 'stal',
    name: 'Hartowana Stal',
    text: '+3 do obrony wybranego oddziału.',
    target: 'wlasny',
    kind: 'ulepszenie',
    rarity: 1,
    mods: { defense: 3 },
  },
  {
    id: 'rynsztunek',
    name: 'Lekki Rynsztunek',
    text: '+2 do szybkości wybranego oddziału.',
    target: 'wlasny',
    kind: 'ulepszenie',
    rarity: 1,
    mods: { speed: 2 },
  },
  {
    id: 'posilki',
    name: 'Zew Posiłków',
    text: 'Liczebność wybranego oddziału rośnie o 25%.',
    target: 'wlasny',
    kind: 'ulepszenie',
    rarity: 1,
    mods: { countPercent: 25 },
  },
  {
    id: 'kly',
    name: 'Wyostrzone Kły',
    text: '+2 do obrażeń minimalnych i maksymalnych.',
    target: 'wlasny',
    kind: 'ulepszenie',
    rarity: 1,
    mods: { damage: 2 },
  },
  {
    id: 'kolczuga',
    name: 'Kolczuga',
    text: '+2 do obrony i 10% liczebności.',
    target: 'wlasny',
    kind: 'ulepszenie',
    rarity: 1,
    mods: { defense: 2, countPercent: 10 },
  },
  {
    id: 'rytual',
    name: 'Krwawy Rytuał',
    text: '+5 do ataku, ale −2 do obrony.',
    target: 'wlasny',
    kind: 'ulepszenie',
    rarity: 2,
    mods: { attack: 5, defense: -2 },
  },
  {
    id: 'skora',
    name: 'Kamienna Skóra',
    text: '+5 do obrony, ale −1 do szybkości.',
    target: 'wlasny',
    kind: 'ulepszenie',
    rarity: 2,
    mods: { defense: 5, speed: -1 },
  },
  {
    id: 'furia',
    name: 'Furia',
    text: '+2 do ataku i +1 do szybkości.',
    target: 'wlasny',
    kind: 'ulepszenie',
    rarity: 2,
    mods: { attack: 2, speed: 1 },
  },
  {
    id: 'groty',
    name: 'Zaklęte Groty',
    text: 'Strzelec: +2 do ataku i +6 amunicji.',
    target: 'wlasny',
    kind: 'ulepszenie',
    rarity: 2,
    requires: 'strzelec',
    mods: { attack: 2, ammo: 6 },
  },
  {
    id: 'skrzydla',
    name: 'Skrzydła Wichru',
    text: 'Oddział zaczyna latać — ignoruje przeszkody.',
    target: 'wlasny',
    kind: 'ulepszenie',
    rarity: 3,
    mods: { grant: ['latajacy'], speed: 1 },
  },
  {
    id: 'luk',
    name: 'Łuk Kompozytowy',
    text: 'Oddział zaczyna strzelać. Otrzymuje 10 amunicji.',
    target: 'wlasny',
    kind: 'ulepszenie',
    rarity: 3,
    mods: { grant: ['strzelec'], ammo: 10 },
  },
  {
    id: 'nietykalnosc',
    name: 'Znak Nietykalności',
    text: 'Ataki tego oddziału nie wywołują odwetu.',
    target: 'wlasny',
    kind: 'ulepszenie',
    rarity: 3,
    mods: { grant: ['bez-odwetu'] },
  },
  {
    id: 'mur',
    name: 'Mur Tarcz',
    text: 'Oddział oddaje odwet dwa razy na rundę.',
    target: 'wlasny',
    kind: 'ulepszenie',
    rarity: 3,
    mods: { grant: ['podwojny-odwet'], defense: 1 },
  },
  {
    id: 'weteran',
    name: 'Weterani',
    text: '+2 do ataku i +2 do obrony.',
    target: 'wlasny',
    kind: 'ulepszenie',
    rarity: 2,
    mods: { attack: 2, defense: 2 },
  },
  {
    id: 'lekkosc',
    name: 'Lekkość Kroku',
    text: '+3 do szybkości, ale −1 do obrony.',
    target: 'wlasny',
    kind: 'ulepszenie',
    rarity: 2,
    mods: { speed: 3, defense: -1 },
  },

  // --- Efekty jednorazowe ---
  {
    id: 'uzdrowienie',
    name: 'Uzdrowienie',
    text: 'Przywraca 40% utraconej liczebności oddziału.',
    target: 'wlasny',
    kind: 'natychmiastowa',
    rarity: 1,
    requires: 'ranny',
    effect: { type: 'leczenie', percent: 40 },
  },
  {
    id: 'druga-tura',
    name: 'Druga Tura',
    text: 'Wybrany oddział działa natychmiast po obecnym.',
    target: 'wlasny',
    kind: 'natychmiastowa',
    rarity: 2,
    effect: { type: 'druga-tura' },
  },
  {
    id: 'wrota',
    name: 'Wrota',
    text: 'Przenosi wybrany oddział na wskazane wolne pole.',
    target: 'wlasny',
    kind: 'natychmiastowa',
    rarity: 2,
    effect: { type: 'teleport' },
  },
  {
    id: 'deszcz-ognia',
    name: 'Deszcz Ognia',
    text: 'Zadaje 60 obrażeń celowi i sąsiadującym z nim wrogom.',
    target: 'wrogi',
    kind: 'natychmiastowa',
    rarity: 3,
    effect: { type: 'ogien', amount: 60 },
  },
  {
    id: 'odrodzenie',
    name: 'Pieczęć Powrotu',
    text: 'Zwraca wybranemu oddziałowi jedno zużyte odrodzenie.',
    target: 'wlasny',
    kind: 'natychmiastowa',
    rarity: 2,
    effect: { type: 'zwrot-odrodzenia' },
  },
  {
    id: 'zatrucie',
    name: 'Zatruta Mgła',
    text: 'Wrogi oddział traci 15% liczebności.',
    target: 'wrogi',
    kind: 'natychmiastowa',
    rarity: 2,
    effect: { type: 'zatrucie', percent: 15 },
  },
  {
    id: 'rozbrojenie',
    name: 'Zasłona Dymna',
    text: 'Wrogi strzelec traci całą amunicję.',
    target: 'wrogi',
    kind: 'natychmiastowa',
    rarity: 2,
    requires: 'strzelec',
    effect: { type: 'rozbrojenie' },
  },
  {
    id: 'sztandar',
    name: 'Sztandar Bojowy',
    text: 'Wszystkie twoje oddziały dostają +1 do ataku i obrony.',
    target: 'brak',
    kind: 'natychmiastowa',
    rarity: 3,
    effect: { type: 'sztandar', mods: { attack: 1, defense: 1 } },
  },
];

export const CARD_BY_ID: Record<string, Card> = Object.fromEntries(
  CARDS.map((card) => [card.id, card]),
);

export function cardById(id: string): Card {
  const card = CARD_BY_ID[id];
  if (!card) throw new Error(`Nieznana karta: ${id}`);
  return card;
}

/** Ile kopii karty trafia do talii - im rzadsza, tym mniej. */
const COPIES_BY_RARITY: Record<1 | 2 | 3, number> = { 1: 3, 2: 2, 3: 1 };

/** Pelna lista identyfikatorow w talii, przed potasowaniem. */
export function buildDeck(): string[] {
  const deck: string[] = [];
  for (const card of CARDS) {
    for (let copy = 0; copy < COPIES_BY_RARITY[card.rarity]; copy++) {
      deck.push(card.id);
    }
  }
  return deck;
}
