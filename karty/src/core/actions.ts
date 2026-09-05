import { CARDS, cardById } from './cards';
import { hexEquals, hexKey, hexNeighbors, type Axial } from './hex';
import { nextInt } from './rng';
import {
  canShoot,
  damageMultiplier,
  effectiveDefense,
  isAdjacent,
  isFreeHex,
  livingUnits,
  meleeOptions,
  nearestFreeHex,
  pathTo,
  reachableHexes,
  retaliationsLeft,
  shootTargets,
} from './rules';
import { activeUnit, buildQueue, drawCard, findUnit, teamAlive } from './state';
import { creatureHp, hpPool, maxHpPool, stats } from './stats';
import type { Action, Card, GameEvent, GameState, Team, Unit, Upgrade } from './types';
import { creatureDef } from './units';

export interface ActionResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * Jedyny sposob zmiany stanu gry. Funkcja jest czysta: nie modyfikuje
 * przekazanego stanu, tylko zwraca nowy wraz z lista zdarzen do animacji.
 */
export function applyAction(state: GameState, action: Action): ActionResult {
  if (state.winner) return { state, events: [] };

  const next = structuredClone(state);
  const events: GameEvent[] = [];
  const actor = activeUnit(next);
  if (!actor) return { state, events };

  switch (action.kind) {
    case 'card': {
      // Zagranie karty nie konczy tury - oddzial moze jeszcze zadzialac.
      if (!playCard(next, actor, action, events)) return { state, events: [] };
      return { state: next, events };
    }

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

// --- Ruch i walka ---

function moveActor(state: GameState, actor: Unit, to: Axial, events: GameEvent[]): void {
  const reach = reachableHexes(state, actor);
  const path = pathTo(reach, to);
  actor.pos = to;
  events.push({
    type: 'moved',
    uid: actor.uid,
    path,
    flying: stats(actor).flags.includes('latajacy'),
  });
}

/** Odwet broniacego sie oddzialu, o ile atakujacy nie ma cechy "bez odwetu". */
function resolveRetaliation(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  events: GameEvent[],
): void {
  if (defender.count <= 0) return;
  if (stats(attacker).flags.includes('bez-odwetu')) return;
  if (retaliationsLeft(defender) <= 0) return;

  defender.retaliationsUsed += 1;
  resolveAttack(state, defender, attacker, true, events);
}

/** Rzut kostka obrazen, mnoznik z roznicy atak/obrona, odjecie od puli zycia. */
function resolveAttack(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  retaliation: boolean,
  events: GameEvent[],
): void {
  const effective = stats(attacker);

  const roll = nextInt(state.rngState, effective.damageMin, effective.damageMax);
  state.rngState = roll.state;
  events.push({
    type: 'diceRoll',
    value: roll.value,
    min: effective.damageMin,
    max: effective.damageMax,
  });

  const base = attacker.count * roll.value;
  const multiplier = damageMultiplier(effective.attack, effectiveDefense(defender));
  const amount = Math.max(1, Math.round(base * multiplier));

  applyDamage(defender, amount, attacker.uid, retaliation, events);
}

/** Odejmuje obrazenia od puli zycia oddzialu i zglasza zdarzenia. */
function applyDamage(
  target: Unit,
  amount: number,
  attackerUid: number | null,
  retaliation: boolean,
  events: GameEvent[],
): void {
  const hp = creatureHp(target);
  const pool = hpPool(target);
  const remaining = pool - amount;

  let killed: number;
  if (remaining <= 0) {
    killed = target.count;
    target.count = 0;
    target.topHp = 0;
  } else {
    const newCount = Math.ceil(remaining / hp);
    killed = target.count - newCount;
    target.count = newCount;
    target.topHp = remaining - (newCount - 1) * hp;
  }

  events.push({
    type: 'damage',
    attackerUid,
    targetUid: target.uid,
    amount,
    killed,
    retaliation,
  });

  if (target.count <= 0) events.push({ type: 'unitDied', uid: target.uid });
}

// --- Karty ---

/** Sprawdza i wykonuje zagranie karty. Zwraca `false`, gdy zagranie nielegalne. */
function playCard(
  state: GameState,
  actor: Unit,
  action: Extract<Action, { kind: 'card' }>,
  events: GameEvent[],
): boolean {
  if (state.cardPlayedThisTurn) return false;

  const hand = state.hands[actor.team];
  const handIndex = hand.indexOf(action.cardId);
  if (handIndex === -1) return false;

  const card = cardById(action.cardId);
  const target =
    action.targetUid === undefined ? undefined : findUnit(state, action.targetUid);

  if (!isLegalTarget(state, card, actor.team, target, action.targetHex)) return false;

  if (card.kind === 'ulepszenie') {
    applyUpgrade(target!, {
      sourceId: card.id,
      name: card.name,
      mods: card.mods ?? {},
    });
  } else if (!applyInstant(state, card, actor.team, target, action.targetHex, events)) {
    return false;
  }

  hand.splice(handIndex, 1);
  state.cardPlayedThisTurn = true;
  events.push({
    type: 'cardPlayed',
    team: actor.team,
    cardId: card.id,
    targetUid: target?.uid,
  });
  return true;
}

function isLegalTarget(
  state: GameState,
  card: Card,
  team: Team,
  target: Unit | undefined,
  targetHex: Axial | undefined,
): boolean {
  if (card.target === 'brak') {
    // Sztandar dziala na cala armie, wiec ma sens tylko wtedy, gdy choc jeden
    // oddzial ma jeszcze miejsce na ulepszenie.
    if (card.effect?.type === 'sztandar') {
      return livingUnits(state, team).some((unit) => hasUpgradeRoom(state, unit));
    }
    return true;
  }
  if (!target) return false;
  if (card.kind === 'ulepszenie' && !hasUpgradeRoom(state, target)) return false;
  if (card.target === 'wlasny' && target.team !== team) return false;
  if (card.target === 'wrogi' && target.team === team) return false;

  const needsLiving = card.requires !== 'martwy';
  if (needsLiving && target.count <= 0) return false;

  switch (card.requires) {
    case 'strzelec':
      if (!stats(target).flags.includes('strzelec')) return false;
      break;
    case 'ranny':
      if (hpPool(target) >= maxHpPool(target) && target.count >= target.lifeStartCount) {
        return false;
      }
      break;
    case 'martwy':
      if (target.count > 0) return false;
      break;
    default:
      break;
  }

  if (card.effect?.type === 'teleport') {
    if (!targetHex || !isFreeHex(state, targetHex, target.uid)) return false;
  }

  return true;
}

/** Czy oddzial miesci jeszcze kolejne ulepszenie z karty. */
export function hasUpgradeRoom(state: GameState, unit: Unit): boolean {
  return unit.upgrades.length < state.rules.maxUpgradesPerUnit;
}

/** Naklada trwale ulepszenie; czesc modyfikatorow dziala od razu. */
function applyUpgrade(unit: Unit, upgrade: Upgrade): void {
  unit.upgrades.push(upgrade);

  // Liczebnosc i amunicja nie sa przeliczane przy kazdym odczycie statystyk,
  // wiec te dwa modyfikatory trzeba zastosowac w chwili nadania ulepszenia.
  const countPercent = upgrade.mods.countPercent ?? 0;
  if (countPercent !== 0) {
    const added = Math.max(1, Math.round((unit.count * countPercent) / 100));
    unit.count = Math.max(1, unit.count + added);
    unit.lifeStartCount = Math.max(unit.lifeStartCount, unit.count);
  }

  const ammo = upgrade.mods.ammo ?? 0;
  if (ammo !== 0) unit.ammo = Math.max(0, unit.ammo + ammo);
}

function applyInstant(
  state: GameState,
  card: Card,
  team: Team,
  target: Unit | undefined,
  targetHex: Axial | undefined,
  events: GameEvent[],
): boolean {
  const effect = card.effect;
  if (!effect) return false;

  switch (effect.type) {
    case 'leczenie': {
      if (!target) return false;
      const lost = Math.max(0, target.lifeStartCount - target.count);
      const restored = Math.max(1, Math.round((lost * effect.percent) / 100));
      target.count = Math.min(target.lifeStartCount, target.count + restored);
      target.topHp = creatureHp(target);
      return true;
    }

    case 'druga-tura': {
      if (!target || target.count <= 0) return false;
      // Oddzial laduje zaraz za obecnie dzialajacym. Usuwamy jego dotychczasowe
      // miejsce w kolejce, zeby nie wystapil dwa razy; jesli celem jest sam
      // dzialajacy oddzial, po prostu dostaje ture jeszcze raz.
      const [current, ...rest] = state.queue;
      state.queue = [current, target.uid, ...rest.filter((uid) => uid !== target.uid)];
      return true;
    }

    case 'teleport': {
      if (!target || !targetHex) return false;
      target.pos = targetHex;
      events.push({ type: 'moved', uid: target.uid, path: [targetHex], flying: true });
      return true;
    }

    case 'ogien': {
      if (!target) return false;
      const splash = livingUnits(state).filter(
        (unit) =>
          unit.team !== team &&
          unit.uid !== target.uid &&
          hexNeighbors(target.pos).some((hex) => hexKey(hex) === hexKey(unit.pos)),
      );
      applyDamage(target, effect.amount, null, false, events);
      for (const unit of splash) applyDamage(unit, effect.amount, null, false, events);
      return true;
    }

    case 'zwrot-odrodzenia': {
      if (!target) return false;
      target.respawnsLeft += 1;
      return true;
    }

    case 'zatrucie': {
      if (!target) return false;
      const loss = Math.max(1, Math.round((target.count * effect.percent) / 100));
      applyDamage(target, loss * creatureHp(target), null, false, events);
      return true;
    }

    case 'rozbrojenie': {
      if (!target) return false;
      target.ammo = 0;
      return true;
    }

    case 'sztandar': {
      for (const unit of livingUnits(state, team)) {
        if (!hasUpgradeRoom(state, unit)) continue;
        applyUpgrade(unit, { sourceId: card.id, name: card.name, mods: effect.mods });
      }
      return true;
    }
  }
}

// --- Kolejka tur, rundy i odrodzenia ---

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

  respawnFallen(state, events);

  state.queue = buildQueue(state);
  events.push({ type: 'roundStarted', round: state.round });
}

/**
 * Rozbite oddzialy wracaja na poczatku rundy na swoje pole startowe.
 * Kazdy powrot jest mniej liczny, ale daje darmowe ulepszenie - armia topnieje
 * ilosciowo, a rosnie jakosciowo, wiec partia sama zmierza do rozstrzygniecia.
 */
function respawnFallen(state: GameState, events: GameEvent[]): void {
  for (const unit of state.units) {
    if (unit.count > 0 || unit.respawnsLeft <= 0) continue;

    const hex = nearestFreeHex(state, unit.home);
    if (!hex) continue; // brak wolnego pola - sprobujemy w nastepnej rundzie

    const revived = Math.max(
      1,
      Math.round((unit.lifeStartCount * state.rules.respawnPercent) / 100),
    );

    unit.respawnsLeft -= 1;
    unit.life += 1;
    unit.count = revived;
    unit.lifeStartCount = revived;
    unit.topHp = creatureHp(unit);
    unit.pos = hex;
    unit.defending = false;
    unit.retaliationsUsed = 0;
    unit.ammo = baseAmmo(unit);

    const upgrade = rollUpgrade(state);
    applyUpgrade(unit, upgrade);
    events.push({ type: 'unitRespawned', uid: unit.uid, upgrade: upgrade.name });
  }
}

/** Amunicja startowa z karty statystyk powiekszona o dotychczasowe ulepszenia. */
function baseAmmo(unit: Unit): number {
  const fromUpgrades = unit.upgrades.reduce((sum, up) => sum + (up.mods.ammo ?? 0), 0);
  return creatureDef(unit.defId).ammo + fromUpgrades;
}

/** Losowe ulepszenie przyznawane przy odrodzeniu. */
function rollUpgrade(state: GameState): Upgrade {
  const pool = CARDS.filter((card) => card.kind === 'ulepszenie' && !card.requires);
  const roll = nextInt(state.rngState, 0, pool.length - 1);
  state.rngState = roll.state;
  const card = pool[roll.value];
  return { sourceId: card.id, name: `Awans: ${card.name}`, mods: card.mods ?? {} };
}

/** Poczatek tury: wygasa obrona, zeruje sie limit kart, moze przyjsc nowa karta. */
function announceTurn(state: GameState, events: GameEvent[]): void {
  const unit = activeUnit(state);
  if (!unit) return;

  unit.defending = false;
  state.cardPlayedThisTurn = false;

  state.turnsSinceCard[unit.team] += 1;
  if (state.turnsSinceCard[unit.team] >= state.rules.cardEveryTurns) {
    state.turnsSinceCard[unit.team] = 0;
    const cardId = drawCard(state, unit.team);
    if (cardId) events.push({ type: 'cardDrawn', team: unit.team, cardId });
  }

  events.push({ type: 'turnStarted', uid: unit.uid });
}

function checkWinner(state: GameState): Team | null {
  const aliveA = teamAlive(state, 'A');
  const aliveB = teamAlive(state, 'B');
  if (!aliveA && !aliveB) return null;
  if (!aliveA) return 'B';
  if (!aliveB) return 'A';
  return null;
}

/** Wszystkie legalne akcje aktywnego oddzialu - dla interfejsu i testow. */
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
  actions.push(...legalCardActions(state, actor));

  return actions;
}

/** Zagrania kart mozliwe dla aktywnego oddzialu wraz z dopuszczalnymi celami. */
export function legalCardActions(state: GameState, actor: Unit): Action[] {
  if (state.cardPlayedThisTurn) return [];

  const actions: Action[] = [];

  for (const cardId of new Set(state.hands[actor.team])) {
    const card = cardById(cardId);

    if (card.target === 'brak') {
      // Karta bez celu tez moze byc niegrywalna - np. sztandar, gdy cala armia
      // wyczerpala limit ulepszen. Bez tego sprawdzenia lista legalnych akcji
      // rozjezdzalaby sie z tym, co faktycznie przyjmuje `applyAction`.
      if (isLegalTarget(state, card, actor.team, undefined, undefined)) {
        actions.push({ kind: 'card', cardId });
      }
      continue;
    }

    const candidates = state.units.filter((unit) =>
      card.target === 'wlasny' ? unit.team === actor.team : unit.team !== actor.team,
    );

    for (const candidate of candidates) {
      if (card.effect?.type === 'teleport') {
        const spot = nearestFreeHex(state, candidate.home);
        if (spot && isLegalTarget(state, card, actor.team, candidate, spot)) {
          actions.push({ kind: 'card', cardId, targetUid: candidate.uid, targetHex: spot });
        }
        continue;
      }
      if (isLegalTarget(state, card, actor.team, candidate, undefined)) {
        actions.push({ kind: 'card', cardId, targetUid: candidate.uid });
      }
    }
  }

  return actions;
}

/** Czy karta moze zostac zagrana w tego konkretnego celu - uzywane przez interfejs. */
export function canTargetWithCard(
  state: GameState,
  cardId: string,
  team: Team,
  target: Unit | undefined,
  targetHex?: Axial,
): boolean {
  if (state.cardPlayedThisTurn) return false;
  if (!state.hands[team].includes(cardId)) return false;
  return isLegalTarget(state, cardById(cardId), team, target, targetHex);
}
