import { creatureDef, hasFlag } from './factions';
import { hexEquals, hexKey, type Axial } from './hex';
import { nextInt } from './rng';
import {
  canShoot,
  damageMultiplier,
  effectiveDefense,
  isAdjacent,
  meleeOptions,
  pathTo,
  reachableHexes,
  retaliationsLeft,
  shootTargets,
} from './rules';
import { activeUnit, buildQueue, findUnit, livingUnits } from './state';
import type { Action, GameEvent, GameState, Team, Unit } from './types';

export interface ActionResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * Jedyny sposob zmiany stanu gry. Funkcja jest czysta: nie modyfikuje
 * przekazanego stanu, tylko zwraca nowy wraz z lista zdarzen do animacji.
 * Dzieki temu AI moze symulowac dowolna liczbe ruchow bez skutkow ubocznych.
 */
export function applyAction(state: GameState, action: Action): ActionResult {
  if (state.winner) return { state, events: [] };

  const next = structuredClone(state);
  const events: GameEvent[] = [];
  const actor = activeUnit(next);
  if (!actor) return { state, events };

  switch (action.kind) {
    case 'move': {
      const reach = reachableHexes(next, actor);
      const entry = reach.get(hexKey(action.to));
      if (!entry || entry.cost === 0) return { state, events: [] };
      moveActor(next, actor, action.to, events);
      break;
    }

    case 'attack': {
      const target = findUnit(next, action.targetUid);
      if (!target || target.count <= 0 || target.team === actor.team) {
        return { state, events: [] };
      }
      if (!isAdjacent(action.from, target.pos)) return { state, events: [] };

      if (!hexEquals(action.from, actor.pos)) {
        const reach = reachableHexes(next, actor);
        if (!reach.has(hexKey(action.from))) return { state, events: [] };
        moveActor(next, actor, action.from, events);
      }

      resolveAttack(next, actor, target, false, events);
      resolveRetaliation(next, actor, target, events);
      break;
    }

    case 'shoot': {
      const target = findUnit(next, action.targetUid);
      if (!target || target.count <= 0 || target.team === actor.team) {
        return { state, events: [] };
      }
      if (!canShoot(next, actor)) return { state, events: [] };

      actor.ammo -= 1;
      events.push({ type: 'shot', uid: actor.uid, targetUid: target.uid });
      resolveAttack(next, actor, target, false, events);
      break;
    }

    case 'defend': {
      actor.defending = true;
      events.push({ type: 'defended', uid: actor.uid });
      break;
    }

    case 'wait': {
      if (actor.hasWaited) return { state, events: [] };
      actor.hasWaited = true;
      next.queue.shift();
      next.queue.push(actor.uid);
      events.push({ type: 'waited', uid: actor.uid });
      announceTurn(next, events);
      return { state: next, events };
    }
  }

  endTurn(next, events);
  return { state: next, events };
}

function moveActor(state: GameState, actor: Unit, to: Axial, events: GameEvent[]): void {
  const reach = reachableHexes(state, actor);
  const path = pathTo(reach, to);
  actor.pos = to;
  events.push({
    type: 'moved',
    uid: actor.uid,
    path,
    flying: hasFlag(creatureDef(actor.defId), 'latajacy'),
  });
}

/**
 * Odwet broniacego sie oddzialu. Nie dochodzi do skutku, gdy atakujacy ma
 * ceche "bez odwetu" albo gdy obronca wyczerpal juz swoje odwety w tej rundzie
 * (Gryf oddaje cios dwa razy, pozostali raz).
 */
function resolveRetaliation(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  events: GameEvent[],
): void {
  if (defender.count <= 0) return;
  if (hasFlag(creatureDef(attacker.defId), 'bez-odwetu')) return;
  if (retaliationsLeft(defender) <= 0) return;

  defender.retaliationsUsed += 1;
  resolveAttack(state, defender, attacker, true, events);
}

/**
 * Rozstrzyga pojedyncze uderzenie: rzut kostka obrazen, mnoznik z roznicy
 * atak/obrona, a nastepnie odjecie punktow zycia od puli calego oddzialu.
 */
function resolveAttack(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  retaliation: boolean,
  events: GameEvent[],
): void {
  const def = creatureDef(attacker.defId);

  const roll = nextInt(state.rngState, def.damageMin, def.damageMax);
  state.rngState = roll.state;
  events.push({
    type: 'diceRoll',
    value: roll.value,
    min: def.damageMin,
    max: def.damageMax,
  });

  const base = attacker.count * roll.value;
  const multiplier = damageMultiplier(def.attack, effectiveDefense(defender));
  const amount = Math.max(1, Math.round(base * multiplier));
  const killed = dealDamage(defender, amount);

  events.push({
    type: 'damage',
    attackerUid: attacker.uid,
    targetUid: defender.uid,
    amount,
    killed,
    retaliation,
  });

  if (defender.count <= 0) {
    events.push({ type: 'unitDied', uid: defender.uid });
  }
}

/** Odejmuje obrazenia od puli zycia oddzialu; zwraca liczbe zabitych stworzen. */
function dealDamage(unit: Unit, amount: number): number {
  const def = creatureDef(unit.defId);
  const pool = unit.topHp + (unit.count - 1) * def.hp;
  const remaining = pool - amount;

  if (remaining <= 0) {
    const killed = unit.count;
    unit.count = 0;
    unit.topHp = 0;
    return killed;
  }

  const newCount = Math.ceil(remaining / def.hp);
  const killed = unit.count - newCount;
  unit.count = newCount;
  unit.topHp = remaining - (newCount - 1) * def.hp;
  return killed;
}

/** Konczy ture aktywnego oddzialu i przekazuje inicjatywe dalej. */
function endTurn(state: GameState, events: GameEvent[]): void {
  state.queue.shift();
  state.queue = state.queue.filter((uid) => (findUnit(state, uid)?.count ?? 0) > 0);

  const winner = checkWinner(state);
  if (winner) {
    state.winner = winner;
    events.push({ type: 'gameOver', winner });
    return;
  }

  if (state.queue.length === 0) startRound(state, events);
  announceTurn(state, events);
}

function startRound(state: GameState, events: GameEvent[]): void {
  state.round += 1;
  for (const unit of state.units) {
    unit.retaliationsUsed = 0;
    unit.hasWaited = false;
  }
  state.queue = buildQueue(state);
  events.push({ type: 'roundStarted', round: state.round });
}

/** Zglasza poczatek tury; postawa obronna wygasa, gdy oddzial znow dziala. */
function announceTurn(state: GameState, events: GameEvent[]): void {
  const unit = activeUnit(state);
  if (!unit) return;
  unit.defending = false;
  events.push({ type: 'turnStarted', uid: unit.uid });
}

function checkWinner(state: GameState): Team | null {
  const aliveA = livingUnits(state, 'A').length;
  const aliveB = livingUnits(state, 'B').length;
  if (aliveA === 0 && aliveB === 0) return null;
  if (aliveA === 0) return 'B';
  if (aliveB === 0) return 'A';
  return null;
}

/**
 * Wszystkie legalne akcje aktywnego oddzialu.
 * Uzywane przez interfejs (podswietlanie) oraz przez AI (ocena ruchow).
 */
export function legalActions(state: GameState): Action[] {
  const actor = activeUnit(state);
  if (!actor || state.winner) return [];

  const actions: Action[] = [];
  const reach = reachableHexes(state, actor);

  for (const entry of reach.values()) {
    if (entry.cost > 0) actions.push({ kind: 'move', to: entry.hex });
  }

  for (const option of meleeOptions(state, actor, reach)) {
    actions.push({ kind: 'attack', targetUid: option.target.uid, from: option.from });
  }

  for (const target of shootTargets(state, actor)) {
    actions.push({ kind: 'shoot', targetUid: target.uid });
  }

  actions.push({ kind: 'defend' });
  if (!actor.hasWaited) actions.push({ kind: 'wait' });

  return actions;
}
