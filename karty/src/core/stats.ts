import { creatureDef } from './units';
import type { Unit, UnitFlag } from './types';

/**
 * Statystyki oddzialu po nalozeniu ulepszen.
 *
 * Punkty zycia pojedynczego stworzenia i liczebnosc celowo nie sa tu liczone:
 * karty zmieniaja je jednorazowo w chwili zagrania, bo pula zycia oddzialu
 * musialaby sie inaczej przeliczac przy kazdym odczycie. Tutaj sa wylacznie
 * wartosci, ktore mozna bezpiecznie wyprowadzic ze stanu w dowolnym momencie.
 */
export interface EffectiveStats {
  attack: number;
  defense: number;
  damageMin: number;
  damageMax: number;
  speed: number;
  flags: UnitFlag[];
}

export function stats(unit: Unit): EffectiveStats {
  const base = creatureDef(unit.defId);

  let attack = base.attack;
  let defense = base.defense;
  let damageMin = base.damageMin;
  let damageMax = base.damageMax;
  let speed = base.speed;
  const flags = new Set<UnitFlag>(base.flags);

  for (const upgrade of unit.upgrades) {
    const mods = upgrade.mods;
    attack += mods.attack ?? 0;
    defense += mods.defense ?? 0;
    speed += mods.speed ?? 0;
    damageMin += mods.damage ?? 0;
    damageMax += mods.damage ?? 0;
    for (const flag of mods.grant ?? []) flags.add(flag);
    for (const flag of mods.revoke ?? []) flags.delete(flag);
  }

  return {
    attack: Math.max(0, attack),
    defense: Math.max(0, defense),
    damageMin: Math.max(1, damageMin),
    damageMax: Math.max(1, Math.max(damageMin, damageMax)),
    speed: Math.max(1, speed),
    flags: [...flags],
  };
}

export function hasFlag(unit: Unit, flag: UnitFlag): boolean {
  return stats(unit).flags.includes(flag);
}

/** Punkty zycia pojedynczego stworzenia - niezmienne przez cala partie. */
export function creatureHp(unit: Unit): number {
  return creatureDef(unit.defId).hp;
}

/** Laczna pula punktow zycia oddzialu. */
export function hpPool(unit: Unit): number {
  return unit.topHp + (unit.count - 1) * creatureHp(unit);
}

/** Maksymalna pula zycia przy obecnej liczebnosci - do paska zdrowia. */
export function maxHpPool(unit: Unit): number {
  return unit.count * creatureHp(unit);
}
