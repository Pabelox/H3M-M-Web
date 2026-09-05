import './style.css';

import { isMuted, playSound, setMuted, unlockAudio } from './audio/audio';
import { applyAction } from './core/actions';
import { CREATURES, creatureDef, type FactionId } from './core/factions';
import { hexKey, type Axial } from './core/hex';
import { meleeOptions, reachableHexes, shootTargets, unitAt } from './core/rules';
import { activeUnit, createInitialState, findUnit, teamName } from './core/state';
import type { Action, GameEvent, GameState } from './core/types';
import { Renderer, type FloatText, type View } from './render/renderer';
import { preloadUnitSprites } from './render/sprites';
import { Hud, type DiceDisplay } from './ui/hud';
import { SetupScreen } from './ui/setup';

const canvas = document.getElementById('board') as HTMLCanvasElement;
const renderer = new Renderer(canvas);

let state: GameState = createInitialState(Date.now() >>> 0, 'zamek', 'inferno');
let dice: DiceDisplay | null = null;
/** Blokuje wejscie gracza w trakcie animacji, zeby nie zakolejkowac dwoch akcji. */
let busy = false;

const view: View = {
  state,
  reach: null,
  meleeFrom: new Map(),
  shootable: new Set(),
  hovered: null,
  movingUid: null,
  movingPixel: null,
  floats: [],
};

const setup = new SetupScreen(startBattle);
const hud = new Hud(
  () => setup.show(state.factions),
  (kind) => {
    void perform({ kind });
  },
);

// --- Cykl zycia partii ---

function startBattle(factionA: FactionId, factionB: FactionId): void {
  state = createInitialState(Date.now() >>> 0, factionA, factionB);
  dice = null;
  busy = false;
  view.floats = [];

  renderer.resize(state);
  hud.clearLog();
  hud.log(`<b>${teamName(state, 'A')}</b> kontra <b>${teamName(state, 'B')}</b>. Bitwa rozpoczęta.`);
  hud.log('Kliknij podświetlony heks, aby się poruszyć, lub wrogi oddział, aby zaatakować.');
  refresh();
}

/** Przelicza podpowiedzi dla aktywnego oddzialu i odswieza interfejs. */
function refresh(): void {
  view.state = state;
  view.meleeFrom = new Map();
  view.shootable = new Set();

  const actor = activeUnit(state);
  if (actor && !state.winner && !busy) {
    const reach = reachableHexes(state, actor);
    view.reach = reach;
    for (const option of meleeOptions(state, actor, reach)) {
      view.meleeFrom.set(hexKey(option.target.pos), option.from);
    }
    for (const target of shootTargets(state, actor)) {
      view.shootable.add(target.uid);
    }
  } else {
    view.reach = null;
  }

  hud.update(state, dice, busy);
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
  hud.update(state, dice, busy);

  const moveEvent = result.events.find((e) => e.type === 'moved');
  if (moveEvent && moveEvent.type === 'moved' && moveEvent.path.length > 0) {
    playSound('move');
    await animateMove(moveEvent.uid, moveEvent.path);
  }

  state = result.state;
  view.state = state;

  for (const event of result.events) {
    handleEvent(event);
  }

  busy = false;
  refresh();
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
      const attacker = findUnit(state, event.attackerUid);
      const target = findUnit(state, event.targetUid);
      if (!attacker || !target) break;

      playSound('hit');
      addFloat(
        target.pos,
        event.killed > 0 ? `−${event.amount} (☠${event.killed})` : `−${event.amount}`,
        event.retaliation ? '#f0c64c' : '#ff6b5b',
      );

      const prefix = event.retaliation ? 'Odwet: ' : '';
      hud.log(
        `${prefix}<b>${creatureDef(attacker.defId).name}</b> zadaje ${event.amount} obrażeń ` +
          `oddziałowi <b>${creatureDef(target.defId).name}</b>` +
          `${event.killed > 0 ? ` (straty: ${event.killed})` : ''}.`,
      );
      break;
    }

    case 'unitDied': {
      const unit = findUnit(state, event.uid);
      playSound('death');
      if (unit) hud.log(`Oddział <b>${creatureDef(unit.defId).name}</b> zostaje rozbity.`);
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
      hud.log(`<b>${teamName(state, event.winner)}</b> wygrywa bitwę!`);
      break;

    default:
      break;
  }
}

function addFloat(hex: Axial, text: string, color: string): void {
  const float: FloatText = { text, hex, color, born: performance.now(), ttl: 1100 };
  view.floats.push(float);
}

/**
 * Przesuwa zeton oddzialu wzdluz wyznaczonej sciezki. Oddzialy latajace maja
 * sciezke jednoodcinkowa, wiec przelatuja nad plansza w linii prostej.
 */
function animateMove(uid: number, path: Axial[]): Promise<void> {
  const unit = findUnit(state, uid);
  if (!unit) return Promise.resolve();

  const points = [unit.pos, ...path].map((hex) => renderer.center(hex));
  const duration = Math.min(700, 120 * (points.length - 1) + 80);
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

  if (target && target.team !== actor.team) {
    if (view.shootable.has(target.uid)) {
      void perform({ kind: 'shoot', targetUid: target.uid });
      return;
    }
    const from = view.meleeFrom.get(key);
    if (from) void perform({ kind: 'attack', targetUid: target.uid, from });
    return;
  }

  if (target) return; // wlasny oddzial - brak akcji

  const entry = view.reach?.get(key);
  if (entry && entry.cost > 0) void perform({ kind: 'move', to: hex });
});

window.addEventListener('keydown', (event) => {
  if (busy || state.winner) return;
  const key = event.key.toLowerCase();
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

// --- Petla renderowania ---

function frame(): void {
  const now = performance.now();
  view.floats = view.floats.filter((f) => now - f.born < f.ttl);
  renderer.draw(view);
  requestAnimationFrame(frame);
}

preloadUnitSprites(Object.keys(CREATURES));
renderer.resize(state);
refresh();
setup.show(state.factions);
requestAnimationFrame(frame);
