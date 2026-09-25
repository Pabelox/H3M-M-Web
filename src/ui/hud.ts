import { creatureDef, FACTIONS, hasFlag } from '../core/factions';
import { activeUnit, findUnit, livingUnits, teamColor, teamName, unitHpPool } from '../core/state';
import type { CreatureDef, GameState, Team, Unit } from '../core/types';

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

/** Ikonki cech specjalnych pokazywane przy nazwie stworzenia. */
function flagIcons(def: CreatureDef): string {
  const icons: string[] = [];
  if (hasFlag(def, 'latajacy')) icons.push('<span title="Lata - ignoruje przeszkody">🪽</span>');
  if (hasFlag(def, 'strzelec')) icons.push('<span title="Strzelec">🏹</span>');
  if (hasFlag(def, 'bez-odwetu')) icons.push('<span title="Atak bez odwetu">🚫</span>');
  if (hasFlag(def, 'podwojny-odwet')) icons.push('<span title="Podwójny odwet">↩↩</span>');
  return icons.join('');
}

/**
 * Interfejs poza plansza: paski armii, kolejka inicjatywy, kostka,
 * dziennik bitwy i przyciski akcji.
 */
export class Hud {
  private readonly panels: Record<Team, HTMLElement> = {
    A: el('panel-A'),
    B: el('panel-B'),
  };
  private readonly initiativeBar = el('initiative');
  private readonly roundLabel = el('round-label');
  private readonly turnLabel = el('turn-label');
  private readonly diceBox = el('dice');
  private readonly logBox = el('log');
  private readonly selectedBox = el('selected');
  private readonly overlay = el('overlay');
  private readonly overlayText = el('overlay-text');

  private readonly entries: string[] = [];

  constructor(
    private readonly onNewGame: () => void,
    private readonly onAction: (kind: 'defend' | 'wait') => void,
  ) {
    el('btn-defend').addEventListener('click', () => this.onAction('defend'));
    el('btn-wait').addEventListener('click', () => this.onAction('wait'));
    el('btn-restart').addEventListener('click', () => this.onNewGame());
    el('overlay-restart').addEventListener('click', () => this.onNewGame());
  }

  log(text: string): void {
    this.entries.push(text);
    if (this.entries.length > 40) this.entries.shift();
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

  update(
    state: GameState,
    dice: DiceDisplay | null,
    busy: boolean,
    selectedUid: number | null,
  ): void {
    this.roundLabel.textContent = `Runda ${state.round}`;

    const actor = activeUnit(state);
    if (state.winner) {
      this.turnLabel.textContent = `Zwycięstwo: ${teamName(state, state.winner)}`;
    } else if (actor) {
      this.turnLabel.textContent = `Tura: ${teamName(state, actor.team)} — ${creatureDef(actor.defId).name}`;
    }

    this.renderPanel('A', state);
    this.renderPanel('B', state);
    this.renderInitiative(state);
    this.renderDice(dice);
    this.renderSelected(state, selectedUid);

    const disabled = busy || state.winner !== null;
    (el('btn-defend') as HTMLButtonElement).disabled = disabled;
    (el('btn-wait') as HTMLButtonElement).disabled = disabled || (actor?.hasWaited ?? true);

    this.overlay.hidden = state.winner === null;
    if (state.winner) {
      this.overlayText.textContent = `${teamName(state, state.winner)} zwycięża w rundzie ${state.round}`;
    }
  }

  /**
   * Karta oddzialu wskazanego klikiem. Panele boczne pokazuja cala armie
   * w skrocie, a tutaj sa pelne dane jednego oddzialu.
   */
  private renderSelected(state: GameState, selectedUid: number | null): void {
    const unit = selectedUid === null ? undefined : findUnit(state, selectedUid);
    if (!unit) {
      this.selectedBox.innerHTML =
        '<div class="sel-empty">Kliknij oddzial na planszy, aby zobaczyc jego karte.</div>';
      return;
    }

    const def = creatureDef(unit.defId);
    const army = FACTIONS[state.factions[unit.team]];
    const dead = unit.count <= 0;
    const isActive = state.queue[0] === unit.uid;
    const pool = dead ? 0 : unitHpPool(unit);

    const status = dead
      ? '<span class="sel-dead">rozbity</span>'
      : isActive
        ? '<span class="sel-active">jego tura</span>'
        : '<span class="sel-wait">w kolejce</span>';

    const ammo =
      def.shots > 0
        ? '<div class="sel-stat"><span>Amunicja</span><b>' + unit.ammo + '</b></div>'
        : '';

    const flags =
      def.flags.length > 0
        ? def.flags.map((flag) => '<span>' + flag.replace(/-/g, ' ') + '</span>').join('')
        : '<span class="sel-none">brak cech specjalnych</span>';

    this.selectedBox.innerHTML = [
      '<div class="sel-card ' + (dead ? 'is-dead' : '') + '" style="--army:' + army.color + '">',
      '  <div class="sel-head">',
      '    <div class="sel-title">',
      '      <div class="sel-name"><span class="unit-tier">' + def.tier + '</span>' + def.name + '</div>',
      '      <div class="sel-army">' + army.name + '</div>',
      '      <div class="sel-status">' + status + '</div>',
      '    </div>',
      '    <div class="sel-count"><b>' + (dead ? '&mdash;' : unit.count) + '</b><span>sztuk</span></div>',
      '  </div>',
      '  <div class="sel-stats">',
      '    <div class="sel-stat"><span>Atak</span><b>' + def.attack + '</b></div>',
      '    <div class="sel-stat"><span>Obrona</span><b>' + def.defense + '</b></div>',
      '    <div class="sel-stat"><span>Obrazenia</span><b>' + def.damageMin + '-' + def.damageMax + '</b></div>',
      '    <div class="sel-stat"><span>Szybkosc</span><b>' + def.speed + '</b></div>',
      '    <div class="sel-stat"><span>Zycie / szt.</span><b>' + def.hp + '</b></div>',
      '    <div class="sel-stat"><span>Pula zycia</span><b>' + pool + '</b></div>',
      '    ' + ammo,
      '  </div>',
      '  <div class="sel-flags">' + flags + '</div>',
      '</div>',
    ].join('');
  }

  private renderPanel(team: Team, state: GameState): void {
    const activeUid = state.queue[0];
    const color = teamColor(state, team);
    const rows = state.units
      .filter((u) => u.team === team)
      .map((unit) => this.renderUnitRow(unit, unit.uid === activeUid, color))
      .join('');

    this.panels[team].innerHTML = `
      <div class="panel-title" style="color:${color}">${teamName(state, team)}</div>
      <div class="panel-sub">Oddziały: ${livingUnits(state, team).length} / 7</div>
      ${rows}
    `;
  }

  private renderUnitRow(unit: Unit, isActive: boolean, color: string): string {
    const def = creatureDef(unit.defId);
    const dead = unit.count <= 0;
    const ratio = dead ? 0 : unitHpPool(unit) / (unit.count * def.hp);
    const ammo = def.shots > 0 ? `<span title="Amunicja">🎯 ${unit.ammo}</span>` : '';

    return `
      <div class="unit-row ${dead ? 'is-dead' : ''} ${isActive ? 'is-active' : ''}"
           style="${isActive ? `border-left-color:${color}` : ''}">
        <div class="unit-row-head">
          <span class="unit-name"><span class="unit-tier">${def.tier}</span>${def.name}</span>
          <span class="unit-count">${dead ? '—' : `×${unit.count}`}</span>
        </div>
        <div class="unit-bar"><span style="width:${Math.round(ratio * 100)}%"></span></div>
        <div class="unit-stats">
          <span title="Atak">⚔ ${def.attack}</span>
          <span title="Obrona">🛡 ${def.defense}</span>
          <span title="Obrażenia">${def.damageMin}-${def.damageMax}</span>
          <span title="Punkty życia">❤ ${def.hp}</span>
          <span title="Szybkość">👟 ${def.speed}</span>
          ${ammo}
          ${flagIcons(def)}
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
        const def = creatureDef(unit.defId);
        const color = teamColor(state, unit.team);
        return `<div class="init-chip ${index === 0 ? 'is-now' : ''}" style="border-color:${color}">
            <span class="init-name">${def.name}</span>
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
