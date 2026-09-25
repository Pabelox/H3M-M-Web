import { cardById } from '../core/cards';
import { activeUnit, findUnit, teamColor, teamName } from '../core/state';
import { hpPool, maxHpPool, stats } from '../core/stats';
import type { GameState, Team, Unit } from '../core/types';
import { creatureDef, faction } from '../core/units';
import { spriteCanvas, type Palette } from '../render/pixels';

/** Ostatni rzut kostka obrazen - pokazywany w rogu stolu. */
export interface DiceDisplay {
  value: number;
  min: number;
  max: number;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Brak elementu #${id} w dokumencie.`);
  return node as T;
}

const FLAG_ICONS: Record<string, string> = {
  latajacy: '🪽',
  strzelec: '🎯',
  'bez-odwetu': '🚫',
  'podwojny-odwet': '↩',
};

export interface HudCallbacks {
  onNewGame: () => void;
  onAction: (kind: 'defend' | 'wait') => void;
  onSelectCard: (cardId: string | null) => void;
}

/**
 * Interfejs poza plansza: paski armii, kolejka inicjatywy, kostka,
 * dziennik bitwy, przyciski akcji i reka kart aktywnego gracza.
 */
export class Hud {
  private readonly panels: Record<Team, HTMLElement> = { A: el('panel-A'), B: el('panel-B') };
  private readonly initiativeBar = el('initiative');
  private readonly roundLabel = el('round-label');
  private readonly turnLabel = el('turn-label');
  private readonly diceBox = el('dice');
  private readonly logBox = el('log');
  private readonly handBox = el('hand');
  private readonly selectedBox = el('selected');
  private readonly overlay = el('overlay');
  private readonly overlayText = el('overlay-text');

  private readonly entries: string[] = [];
  private selectedCard: string | null = null;

  constructor(private readonly callbacks: HudCallbacks) {
    el('btn-defend').addEventListener('click', () => this.callbacks.onAction('defend'));
    el('btn-wait').addEventListener('click', () => this.callbacks.onAction('wait'));
    el('btn-restart').addEventListener('click', () => this.callbacks.onNewGame());
    el('overlay-restart').addEventListener('click', () => this.callbacks.onNewGame());

    this.handBox.addEventListener('click', (event) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>('[data-card]');
      if (!card || card.classList.contains('is-locked')) return;

      const cardId = card.dataset.card!;
      this.selectedCard = this.selectedCard === cardId ? null : cardId;
      this.callbacks.onSelectCard(this.selectedCard);
    });
  }

  get selected(): string | null {
    return this.selectedCard;
  }

  clearSelection(): void {
    this.selectedCard = null;
  }

  log(text: string): void {
    this.entries.push(text);
    if (this.entries.length > 200) this.entries.shift();
    this.logBox.innerHTML = this.entries
      .slice(-7)
      .map((line) => `<div class="log-line">${line}</div>`)
      .join('');
    this.logBox.scrollTop = this.logBox.scrollHeight;
  }

  clearLog(): void {
    this.entries.length = 0;
    this.logBox.innerHTML = '';
  }

  /** Pelny dziennik partii - trafia do historii w panelu mistrza gry. */
  get fullLog(): string[] {
    return this.entries.slice();
  }

  update(
    state: GameState,
    dice: DiceDisplay | null,
    busy: boolean,
    playableCards: Set<string>,
    selectedUid: number | null,
  ): void {
    this.roundLabel.textContent = `Runda ${state.round}`;

    const actor = activeUnit(state);
    if (state.winner) {
      this.turnLabel.textContent = `Zwycięstwo: ${teamName(state, state.winner)}`;
    } else if (actor) {
      this.turnLabel.textContent = `Tura: ${teamName(state, actor.team)} — ${creatureDef(actor.defId).name}`;
    }

    this.renderPanel('A', state, state.rules.maxUpgradesPerUnit);
    this.renderPanel('B', state, state.rules.maxUpgradesPerUnit);
    this.renderInitiative(state);
    this.renderDice(dice);
    this.renderHand(state, actor, busy, playableCards);
    this.renderSelected(state, selectedUid);

    const disabled = busy || state.winner !== null;
    (el('btn-defend') as HTMLButtonElement).disabled = disabled;
    (el('btn-wait') as HTMLButtonElement).disabled = disabled || (actor?.hasWaited ?? true);

    this.overlay.hidden = state.winner === null;
    if (state.winner) {
      this.overlayText.textContent = `${teamName(state, state.winner)} zwycięża w rundzie ${state.round}`;
    }
  }

  // --- Reka kart ---

  private renderHand(
    state: GameState,
    actor: Unit | undefined,
    busy: boolean,
    playableCards: Set<string>,
  ): void {
    if (!actor || state.winner) {
      this.handBox.innerHTML = '';
      return;
    }

    const hand = state.hands[actor.team];
    const nextCardIn = Math.max(
      0,
      state.rules.cardEveryTurns - state.turnsSinceCard[actor.team],
    );

    if (hand.length === 0) {
      this.handBox.innerHTML = `<div class="hand-empty">Brak kart. Następna za ${nextCardIn} tur.</div>`;
      return;
    }

    const cards = hand
      .map((cardId) => {
        const card = cardById(cardId);
        const locked = busy || state.cardPlayedThisTurn || !playableCards.has(cardId);
        const selected = this.selectedCard === cardId;
        return `
          <button type="button" class="card kind-${card.kind} ${selected ? 'is-selected' : ''} ${locked ? 'is-locked' : ''}"
                  data-card="${cardId}" ${locked ? 'disabled' : ''}>
            <span class="card-name">${card.name}</span>
            <span class="card-text">${card.text}</span>
            <span class="card-tag">${card.kind === 'ulepszenie' ? 'trwałe' : 'jednorazowa'}</span>
          </button>
        `;
      })
      .join('');

    const notice = state.cardPlayedThisTurn
      ? '<div class="hand-note">Karta w tej turze już zagrana.</div>'
      : `<div class="hand-note">Następna karta za ${nextCardIn} tur.</div>`;

    this.handBox.innerHTML = `<div class="hand-cards">${cards}</div>${notice}`;
  }

  // --- Panel wybranego oddzialu ---

  /**
   * Karta oddzialu wskazanego klikiem. Panele boczne pokazuja cala armie
   * w skrocie, a tutaj jest pelen obraz jednego oddzialu: podobizna,
   * statystyki po ulepszeniach, cechy i lista otrzymanych kart.
   */
  private renderSelected(state: GameState, selectedUid: number | null): void {
    const unit = selectedUid === null ? undefined : findUnit(state, selectedUid);
    if (!unit) {
      this.selectedBox.innerHTML =
        '<div class="sel-empty">Kliknij oddział na planszy,<br />aby zobaczyć jego kartę.</div>';
      return;
    }

    const def = creatureDef(unit.defId);
    const army = faction(state.factions[unit.team]);
    const effective = stats(unit);
    const dead = unit.count <= 0;
    const isActive = state.queue[0] === unit.uid;

    // Podobizna to ta sama sylwetka pixel art, ktora stoi na planszy.
    const portrait = spriteCanvas(def.archetype, army.palette as Palette).toDataURL();

    /** Statystyka z zaznaczeniem, o ile podniosly ja ulepszenia. */
    const stat = (label: string, value: number, base: number): string => {
      const delta = value - base;
      const mark =
        delta > 0 ? `<em class="is-boosted">+${delta}</em>`
        : delta < 0 ? `<em class="is-lowered">${delta}</em>`
        : '';
      return `<div class="sel-stat"><span>${label}</span><b>${value}</b>${mark}</div>`;
    };

    const status = dead
      ? `<span class="sel-dead">rozbity — odrodzeń: ${unit.respawnsLeft}</span>`
      : isActive
        ? '<span class="sel-active">jego tura</span>'
        : `<span class="sel-wait">w kolejce</span>`;

    const upgrades =
      unit.upgrades.length > 0
        ? `<ul class="sel-upgrades">${unit.upgrades
            .map((up) => `<li>${up.name}</li>`)
            .join('')}</ul>`
        : '<div class="sel-none">bez ulepszeń</div>';

    const ammo = effective.flags.includes('strzelec')
      ? `<div class="sel-stat"><span>Amunicja</span><b>${unit.ammo}</b></div>`
      : '';

    this.selectedBox.innerHTML = `
      <div class="sel-card ${dead ? 'is-dead' : ''}" style="--army:${army.color}">
        <div class="sel-head">
          <img class="sel-portrait" src="${portrait}" alt="" />
          <div class="sel-title">
            <div class="sel-name"><span class="unit-tier">${def.tier}</span>${def.name}</div>
            <div class="sel-army">${army.name}</div>
            <div class="sel-status">${status}</div>
          </div>
          <div class="sel-count">
            <b>${dead ? '—' : unit.count}</b>
            <span>sztuk</span>
          </div>
        </div>

        <div class="sel-stats">
          ${stat('Atak', effective.attack, def.attack)}
          ${stat('Obrona', effective.defense, def.defense)}
          ${stat('Obrażenia', effective.damageMin, def.damageMin)}
          ${stat('Szybkość', effective.speed, def.speed)}
          <div class="sel-stat"><span>Życie / szt.</span><b>${def.hp}</b></div>
          ${ammo}
        </div>

        <div class="sel-flags">
          ${effective.flags.map((f) => `<span>${FLAG_ICONS[f] ?? ''} ${f.replace(/-/g, ' ')}</span>`).join('') || '<span class="sel-none">brak cech specjalnych</span>'}
        </div>

        <div class="sel-section">
          <div class="sel-label">Ulepszenia ${unit.upgrades.length}/${state.rules.maxUpgradesPerUnit}</div>
          ${upgrades}
        </div>

        <div class="sel-section">
          <div class="sel-label">Odrodzenia</div>
          <div class="sel-respawns">${'●'.repeat(unit.respawnsLeft)}${'○'.repeat(Math.max(0, state.rules.maxRespawns - unit.respawnsLeft))} <em>${unit.respawnsLeft} z ${state.rules.maxRespawns}</em></div>
        </div>
      </div>
    `;
  }

  // --- Panele armii ---

  private renderPanel(team: Team, state: GameState, upgradeCap: number): void {
    const activeUid = state.queue[0];
    const color = teamColor(state, team);
    const units = state.units.filter((unit) => unit.team === team);
    const standing = units.filter((unit) => unit.count > 0).length;

    const rows = units
      .map((unit) => this.renderUnitRow(unit, unit.uid === activeUid, color, upgradeCap))
      .join('');

    this.panels[team].innerHTML = `
      <div class="panel-title" style="color:${color}">${teamName(state, team)}</div>
      <div class="panel-sub">Na planszy: ${standing} / ${units.length} · kart: ${state.hands[team].length}</div>
      ${rows}
    `;
  }

  private renderUnitRow(
    unit: Unit,
    isActive: boolean,
    color: string,
    upgradeCap: number,
  ): string {
    const def = creatureDef(unit.defId);
    const effective = stats(unit);
    const dead = unit.count <= 0;
    const ratio = dead ? 0 : hpPool(unit) / maxHpPool(unit);

    const icons = effective.flags.map((flag) => FLAG_ICONS[flag] ?? '').join('');
    const ammo = effective.flags.includes('strzelec') ? `<span title="Amunicja">🏹${unit.ammo}</span>` : '';
    const full = unit.upgrades.length >= upgradeCap;
    const upgrades =
      unit.upgrades.length > 0
        ? `<span class="up-count ${full ? 'is-full' : ''}" title="Ulepszenia (limit ${upgradeCap})">★${unit.upgrades.length}/${upgradeCap}</span>`
        : '';
    const respawns = `<span class="respawn-count" title="Pozostałe odrodzenia">↻${unit.respawnsLeft}</span>`;

    /** Statystyka podniesiona ulepszeniem dostaje wyroznienie. */
    const stat = (label: string, value: number, base: number, title: string): string =>
      `<span title="${title}" class="${value > base ? 'is-boosted' : value < base ? 'is-lowered' : ''}">${label}${value}</span>`;

    return `
      <div class="unit-row ${dead ? 'is-dead' : ''} ${isActive ? 'is-active' : ''}"
           style="${isActive ? `border-left-color:${color}` : ''}">
        <div class="unit-row-head">
          <span class="unit-name"><span class="unit-tier">${def.tier}</span>${def.name}</span>
          <span class="unit-count">${dead ? '↻ czeka' : `×${unit.count}`}</span>
        </div>
        <div class="unit-bar"><span style="width:${Math.round(ratio * 100)}%"></span></div>
        <div class="unit-stats">
          ${stat('⚔', effective.attack, def.attack, 'Atak')}
          ${stat('🛡', effective.defense, def.defense, 'Obrona')}
          ${stat('', effective.damageMin, def.damageMin, 'Obrażenia')}-${effective.damageMax}
          ${stat('👟', effective.speed, def.speed, 'Szybkość')}
          ${ammo}${upgrades}${respawns}<span class="unit-flags">${icons}</span>
        </div>
      </div>
    `;
  }

  private renderInitiative(state: GameState): void {
    const chips = state.queue
      .slice(0, 12)
      .map((uid, index) => {
        const unit = findUnit(state, uid);
        if (!unit) return '';
        return `<div class="init-chip ${index === 0 ? 'is-now' : ''}" style="border-color:${teamColor(state, unit.team)}">
            <span class="init-name">${creatureDef(unit.defId).name}</span>
            <span class="init-count">${unit.count}</span>
          </div>`;
      })
      .join('');

    this.initiativeBar.innerHTML = `<span class="init-label">Inicjatywa</span>${chips}`;
  }

  private renderDice(dice: DiceDisplay | null): void {
    if (!dice) {
      this.diceBox.innerHTML = '<div class="dice-empty">Kostka obrażeń</div>';
      return;
    }
    this.diceBox.innerHTML = `
      <div class="dice-face">${dice.value}</div>
      <div class="dice-range">zakres ${dice.min}–${dice.max}</div>
    `;
  }
}
