import './style.css';

import { isMuted, playSound, setMuted, unlockAudio } from './audio/audio';
import { applyAction, canTargetWithCard, legalCardActions } from './core/actions';
import { cardById } from './core/cards';
import { hexKey, offsetToAxial, type Axial } from './core/hex';
import { newMatchId, saveMatch, type MatchRecord } from './core/history';
import { isFreeHex, meleeOptions, reachableHexes, shootTargets, unitAt } from './core/rules';
import { activeUnit, createInitialState, findUnit, teamName } from './core/state';
import { DEFAULT_RULES, type Action, type GameEvent, type GameState } from './core/types';
import { Renderer, type FloatText, type View } from './render/renderer';
import { creatureDef, faction } from './core/units';
import { GameMasterPanel, type MatchSetup } from './ui/gm';
import { Hud, type DiceDisplay } from './ui/hud';

const canvas = document.getElementById('board') as HTMLCanvasElement;
const renderer = new Renderer(canvas);

let setupUsed: MatchSetup = {
  factionA: 'zakon',
  factionB: 'roj',
  rules: { ...DEFAULT_RULES },
};
let state: GameState = createInitialState(setupUsed.rules, setupUsed.factionA, setupUsed.factionB);
let dice: DiceDisplay | null = null;
let busy = false;
/** Oddzial wskazany karta teleportacji, czekajacy na wybor pola docelowego. */
let pendingTeleportUid: number | null = null;
let matchRecord: MatchRecord | null = null;

const view: View = {
  state,
  reach: null,
  meleeFrom: new Map(),
  shootable: new Set(),
  hovered: null,
  movingUid: null,
  movingPixel: null,
  floats: [],
  cardTargets: new Set(),
  cardHexes: new Set(),
  flashes: new Map(),
};

const gm = new GameMasterPanel(startBattle);
const hud = new Hud({
  onNewGame: () => gm.show(setupUsed),
  onAction: (kind) => {
    void perform({ kind });
  },
  onSelectCard: handleCardSelection,
});

// --- Cykl zycia partii ---

function startBattle(setup: MatchSetup): void {
  setupUsed = setup;
  state = createInitialState(setup.rules, setup.factionA, setup.factionB);
  dice = null;
  busy = false;
  pendingTeleportUid = null;
  view.floats = [];
  hud.clearSelection();

  matchRecord = {
    id: newMatchId(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    factions: { A: setup.factionA, B: setup.factionB },
    factionNames: { A: faction(setup.factionA).name, B: faction(setup.factionB).name },
    rules: { ...setup.rules },
    winner: null,
    winnerName: null,
    rounds: 1,
    seed: state.initialSeed,
    log: [],
  };

  renderer.resize(state);
  hud.clearLog();
  hud.log(`<b>${teamName(state, 'A')}</b> kontra <b>${teamName(state, 'B')}</b>. Partia rozpoczęta.`);
  refresh();
  // Partia trafia do historii od razu, zeby prowadzacy widzial takze te
  // rozgrywki, ktore zostaly przerwane przed rozstrzygnieciem.
  recordMatch();
}

/** Zapisuje aktualny stan partii do historii panelu mistrza gry. */
function recordMatch(): void {
  if (!matchRecord) return;
  matchRecord.rounds = state.round;
  matchRecord.winner = state.winner;
  matchRecord.winnerName = state.winner ? teamName(state, state.winner) : null;
  matchRecord.finishedAt = state.winner ? new Date().toISOString() : null;
  matchRecord.log = hud.fullLog.map((line) => line.replace(/<[^>]+>/g, ''));
  saveMatch(matchRecord);
}

// --- Podpowiedzi dla aktywnego oddzialu ---

function refresh(): void {
  view.state = state;
  view.meleeFrom = new Map();
  view.shootable = new Set();
  view.cardTargets = new Set();
  view.cardHexes = new Set();

  const actor = activeUnit(state);
  const playable = new Set<string>();

  if (actor && !state.winner && !busy) {
    const reach = reachableHexes(state, actor);
    view.reach = reach;
    for (const option of meleeOptions(state, actor, reach)) {
      view.meleeFrom.set(hexKey(option.target.pos), option.from);
    }
    for (const target of shootTargets(state, actor)) view.shootable.add(target.uid);

    for (const action of legalCardActions(state, actor)) {
      if (action.kind === 'card') playable.add(action.cardId);
    }

    applyCardTargeting(actor.team);
  } else {
    view.reach = null;
  }

  hud.update(state, dice, busy, playable);
}

/** Podswietla to, co mozna wskazac aktualnie wybrana karta. */
function applyCardTargeting(team: 'A' | 'B'): void {
  const cardId = hud.selected;
  if (!cardId) return;

  const card = cardById(cardId);

  if (card.effect?.type === 'teleport') {
    if (pendingTeleportUid === null) {
      for (const unit of state.units) {
        if (canTargetWithCard(state, cardId, team, unit, unit.pos)) view.cardTargets.add(unit.uid);
      }
    } else {
      for (const hex of freeHexes()) view.cardHexes.add(hexKey(hex));
    }
    return;
  }

  if (card.target === 'brak') return;

  for (const unit of state.units) {
    if (canTargetWithCard(state, cardId, team, unit)) view.cardTargets.add(unit.uid);
  }
}

function freeHexes(): Axial[] {
  const result: Axial[] = [];
  for (let row = 0; row < state.boardRows; row++) {
    for (let col = 0; col < state.boardCols; col++) {
      const hex = offsetToAxial(col, row);
      if (isFreeHex(state, hex)) result.push(hex);
    }
  }
  return result;
}

/** Karta bez celu dziala od razu; pozostale przechodza w tryb wskazywania. */
function handleCardSelection(cardId: string | null): void {
  pendingTeleportUid = null;

  if (cardId) {
    const card = cardById(cardId);
    if (card.target === 'brak') {
      hud.clearSelection();
      void perform({ kind: 'card', cardId });
      return;
    }
  }

  refresh();
}

// --- Wykonanie akcji wraz z animacja ---

async function perform(action: Action): Promise<void> {
  if (busy || state.winner) return;

  const result = applyAction(state, action);
  if (result.events.length === 0) return; // akcja nielegalna - stan bez zmian

  busy = true;
  view.reach = null;
  view.meleeFrom = new Map();
  view.shootable = new Set();
  view.cardTargets = new Set();
  view.cardHexes = new Set();

  const moveEvent = result.events.find((event) => event.type === 'moved');
  if (moveEvent && moveEvent.type === 'moved' && moveEvent.path.length > 0) {
    playSound('move');
    await animateMove(moveEvent.uid, moveEvent.path);
  }

  state = result.state;
  view.state = state;

  for (const event of result.events) handleEvent(event);

  busy = false;
  hud.clearSelection();
  pendingTeleportUid = null;
  refresh();
  recordMatch();
}

function handleEvent(event: GameEvent): void {
  switch (event.type) {
    case 'diceRoll':
      dice = { value: event.value, min: event.min, max: event.max };
      playSound('dice');
      break;

    case 'shot':
      playSound('shoot');
      break;

    case 'damage': {
      const target = findUnit(state, event.targetUid);
      if (!target) break;
      playSound('hit');
      view.flashes.set(target.uid, performance.now());
      addFloat(
        target.pos,
        event.killed > 0 ? `−${event.amount} (☠${event.killed})` : `−${event.amount}`,
        event.retaliation ? '#f0c64c' : '#ff6b5b',
      );

      const attacker = event.attackerUid === null ? null : findUnit(state, event.attackerUid);
      const who = attacker ? `<b>${creatureDef(attacker.defId).name}</b>` : 'Efekt karty';
      const prefix = event.retaliation ? 'Odwet: ' : '';
      hud.log(
        `${prefix}${who} zadaje ${event.amount} obrażeń oddziałowi ` +
          `<b>${creatureDef(target.defId).name}</b>` +
          `${event.killed > 0 ? ` (straty: ${event.killed})` : ''}.`,
      );
      break;
    }

    case 'unitDied': {
      const unit = findUnit(state, event.uid);
      playSound('death');
      if (unit) {
        const left = unit.respawnsLeft;
        hud.log(
          `Oddział <b>${creatureDef(unit.defId).name}</b> zostaje rozbity` +
            `${left > 0 ? ` — wróci na początku rundy (pozostałe odrodzenia: ${left}).` : ' na dobre.'}`,
        );
      }
      break;
    }

    case 'unitRespawned': {
      const unit = findUnit(state, event.uid);
      if (!unit) break;
      addFloat(unit.pos, `↻ ${unit.count}`, '#9fd6f0');
      hud.log(
        `<b>${creatureDef(unit.defId).name}</b> wraca do walki w sile ${unit.count} ` +
          `i otrzymuje ulepszenie: <b>${event.upgrade}</b>.`,
      );
      break;
    }

    case 'cardDrawn':
      playSound('card');
      hud.log(`${teamName(state, event.team)} dobiera kartę: <b>${cardById(event.cardId).name}</b>.`);
      break;

    case 'cardPlayed': {
      playSound('card');
      const target = event.targetUid === undefined ? null : findUnit(state, event.targetUid);
      const card = cardById(event.cardId);
      if (target) addFloat(target.pos, card.name, '#c9a8f5');
      hud.log(
        `${teamName(state, event.team)} zagrywa <b>${card.name}</b>` +
          `${target ? ` na oddział <b>${creatureDef(target.defId).name}</b>` : ''}.`,
      );
      break;
    }

    case 'defended': {
      const unit = findUnit(state, event.uid);
      playSound('shield');
      if (unit) hud.log(`<b>${creatureDef(unit.defId).name}</b> przyjmuje postawę obronną.`);
      break;
    }

    case 'waited': {
      const unit = findUnit(state, event.uid);
      if (unit) hud.log(`<b>${creatureDef(unit.defId).name}</b> odkłada swoją turę.`);
      break;
    }

    case 'roundStarted':
      hud.log(`— Runda ${event.round} —`);
      break;

    case 'gameOver':
      playSound('victory');
      hud.log(`<b>${teamName(state, event.winner)}</b> wygrywa partię!`);
      break;

    default:
      break;
  }
}

function addFloat(hex: Axial, text: string, color: string): void {
  const float: FloatText = { text, hex, color, born: performance.now(), ttl: 1200 };
  view.floats.push(float);
}

function animateMove(uid: number, path: Axial[]): Promise<void> {
  const unit = findUnit(state, uid);
  if (!unit) return Promise.resolve();

  const points = [unit.pos, ...path].map((hex) => renderer.center(hex));
  const duration = Math.min(650, 120 * (points.length - 1) + 80);
  const start = performance.now();
  view.movingUid = uid;

  return new Promise((resolve) => {
    const step = (): void => {
      const t = Math.min(1, (performance.now() - start) / duration);
      const progress = (points.length - 1) * t;
      const index = Math.min(points.length - 2, Math.floor(progress));
      const frac = progress - index;

      view.movingPixel = {
        x: points[index].x + (points[index + 1].x - points[index].x) * frac,
        y: points[index].y + (points[index + 1].y - points[index].y) * frac,
      };

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        view.movingUid = null;
        view.movingPixel = null;
        resolve();
      }
    };
    step();
  });
}

// --- Obsluga wejscia ---

canvas.addEventListener('mousemove', (event) => {
  view.hovered = renderer.hexAtPixel(event.clientX, event.clientY);
});

canvas.addEventListener('mouseleave', () => {
  view.hovered = null;
});

canvas.addEventListener('click', (event) => {
  unlockAudio();
  if (busy || state.winner) return;

  const actor = activeUnit(state);
  if (!actor) return;

  const hex = renderer.hexAtPixel(event.clientX, event.clientY);
  const key = hexKey(hex);
  const target = unitAt(state, hex);

  // Tryb wskazywania celu karty ma pierwszenstwo przed zwyklymi akcjami.
  const selectedCard = hud.selected;
  if (selectedCard) {
    if (handleCardClick(selectedCard, actor.team, hex, target?.uid)) return;
  }

  if (target && target.team !== actor.team) {
    if (view.shootable.has(target.uid)) {
      void perform({ kind: 'shoot', targetUid: target.uid });
      return;
    }
    const from = view.meleeFrom.get(key);
    if (from) void perform({ kind: 'attack', targetUid: target.uid, from });
    return;
  }

  if (target) return;

  const entry = view.reach?.get(key);
  if (entry && entry.cost > 0) void perform({ kind: 'move', to: hex });
});

/** Obsluguje klikniecie w trybie karty. Zwraca `true`, gdy klikniecie zostalo zuzyte. */
function handleCardClick(
  cardId: string,
  team: 'A' | 'B',
  hex: Axial,
  targetUid: number | undefined,
): boolean {
  const card = cardById(cardId);

  if (card.effect?.type === 'teleport') {
    if (pendingTeleportUid === null) {
      if (targetUid === undefined || !view.cardTargets.has(targetUid)) return false;
      pendingTeleportUid = targetUid;
      refresh();
      return true;
    }
    if (!view.cardHexes.has(hexKey(hex))) return false;
    void perform({ kind: 'card', cardId, targetUid: pendingTeleportUid, targetHex: hex });
    return true;
  }

  if (targetUid === undefined || !view.cardTargets.has(targetUid)) return false;
  if (!canTargetWithCard(state, cardId, team, findUnit(state, targetUid))) return false;

  void perform({ kind: 'card', cardId, targetUid });
  return true;
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();

  if (key === 'escape') {
    hud.clearSelection();
    pendingTeleportUid = null;
    refresh();
    return;
  }

  if (busy || state.winner) return;
  if (key === 'o') void perform({ kind: 'defend' });
  if (key === 'c') void perform({ kind: 'wait' });
});

const muteButton = document.getElementById('btn-mute') as HTMLButtonElement;
muteButton.addEventListener('click', () => {
  unlockAudio();
  setMuted(!isMuted());
  muteButton.textContent = isMuted() ? '🔇 Dźwięk' : '🔊 Dźwięk';
});

window.addEventListener('resize', () => renderer.resize(state));

// Kazdy przycisk interfejsu daje krotkie klikniecie - regulamin wymienia
// efekt klikniecia jako jeden z obowiazkowych dzwiekow.
document.addEventListener('click', (event) => {
  if ((event.target as HTMLElement).closest('button')) playSound('click');
});

// --- Petla renderowania ---

function frame(): void {
  const now = performance.now();
  view.floats = view.floats.filter((float) => now - float.born < float.ttl);
  for (const [uid, born] of view.flashes) {
    if (now - born > 400) view.flashes.delete(uid);
  }
  renderer.draw(view);
  requestAnimationFrame(frame);
}

renderer.resize(state);
refresh();
gm.show(setupUsed);
requestAnimationFrame(frame);
