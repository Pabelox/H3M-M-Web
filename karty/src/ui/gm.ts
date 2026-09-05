import { clearHistory, formatMoment, loadHistory } from '../core/history';
import { DEFAULT_RULES, type RulesConfig } from '../core/types';
import { armyCounts, creatureDef, FACTION_IDS, FACTIONS } from '../core/units';

/** Opis pojedynczego parametru zasad - etykieta, zakres i jednostka. */
interface RuleField {
  key: keyof RulesConfig;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}

const RULE_FIELDS: RuleField[] = [
  {
    key: 'cardEveryTurns',
    label: 'Karta co ile tur',
    hint: 'Po ilu turach własnych oddziałów gracz dobiera kartę.',
    min: 1,
    max: 8,
    step: 1,
  },
  {
    key: 'startingHand',
    label: 'Karty na start',
    hint: 'Ile kart każdy gracz trzyma na ręce na początku partii.',
    min: 0,
    max: 5,
    step: 1,
  },
  {
    key: 'handLimit',
    label: 'Limit ręki',
    hint: 'Powyżej tego limitu gracz nie dobiera nowych kart.',
    min: 1,
    max: 8,
    step: 1,
  },
  {
    key: 'maxUpgradesPerUnit',
    label: 'Limit ulepszeń',
    hint: 'Ile kart-ulepszeń może przyjąć jeden oddział. Niżej = trzeba wybierać faworytów.',
    min: 1,
    max: 12,
    step: 1,
  },
  {
    key: 'maxRespawns',
    label: 'Odrodzenia',
    hint: 'Ile razy rozbity oddział może wrócić na planszę.',
    min: 0,
    max: 5,
    step: 1,
  },
  {
    key: 'respawnPercent',
    label: 'Siła odrodzenia',
    hint: 'Z jaką częścią poprzedniej liczebności oddział wraca do gry.',
    min: 20,
    max: 100,
    step: 5,
    suffix: '%',
  },
  {
    key: 'armyScale',
    label: 'Wielkość armii',
    hint: 'Mnożnik liczebności wszystkich oddziałów. Niżej = krótsza partia.',
    min: 40,
    max: 200,
    step: 10,
    suffix: '%',
  },
];

export interface MatchSetup {
  factionA: string;
  factionB: string;
  rules: RulesConfig;
}

/**
 * Panel mistrza gry: ustawienie zasad przed startem partii oraz historia
 * dotychczasowych rozgrywek. Panel nie ingeruje w trwajaca partie - zasady
 * czyta sie raz, w chwili jej tworzenia.
 */
export class GameMasterPanel {
  private readonly root: HTMLElement;
  private tab: 'zasady' | 'historia' = 'zasady';
  private setup: MatchSetup = {
    factionA: FACTION_IDS[0],
    factionB: FACTION_IDS[1],
    rules: { ...DEFAULT_RULES },
  };

  constructor(private readonly onStart: (setup: MatchSetup) => void) {
    const node = document.getElementById('gm');
    if (!node) throw new Error('Brak elementu #gm w dokumencie.');
    this.root = node;
    this.root.addEventListener('click', (event) => this.handleClick(event));
    this.root.addEventListener('input', (event) => this.handleInput(event));
  }

  show(setup?: MatchSetup): void {
    if (setup) this.setup = { factionA: setup.factionA, factionB: setup.factionB, rules: { ...setup.rules } };
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    this.root.hidden = true;
  }

  private handleInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const key = input.dataset.rule as keyof RulesConfig | undefined;
    if (!key) return;

    if (key === 'obstacles') {
      this.setup.rules.obstacles = input.checked;
    } else {
      (this.setup.rules[key] as number) = Number(input.value);
    }
    this.render();
  }

  private handleClick(event: Event): void {
    const target = event.target as HTMLElement;

    const tabButton = target.closest<HTMLElement>('[data-tab]');
    if (tabButton) {
      this.tab = tabButton.dataset.tab as 'zasady' | 'historia';
      this.render();
      return;
    }

    const factionCard = target.closest<HTMLElement>('[data-faction]');
    if (factionCard) {
      const side = factionCard.dataset.side === 'A' ? 'factionA' : 'factionB';
      this.setup[side] = factionCard.dataset.faction!;
      this.render();
      return;
    }

    if (target.closest('#gm-defaults')) {
      this.setup.rules = { ...DEFAULT_RULES };
      this.render();
      return;
    }

    if (target.closest('#gm-clear-history')) {
      clearHistory();
      this.render();
      return;
    }

    if (target.closest('#gm-start')) {
      this.hide();
      this.onStart({
        factionA: this.setup.factionA,
        factionB: this.setup.factionB,
        rules: { ...this.setup.rules },
      });
    }
  }

  private render(): void {
    this.root.innerHTML = `
      <div class="gm-card">
        <header class="gm-head">
          <h2>Panel mistrza gry</h2>
          <nav class="gm-tabs">
            <button type="button" data-tab="zasady" class="${this.tab === 'zasady' ? 'is-on' : ''}">Zasady partii</button>
            <button type="button" data-tab="historia" class="${this.tab === 'historia' ? 'is-on' : ''}">Historia rozgrywek</button>
          </nav>
        </header>
        ${this.tab === 'zasady' ? this.renderRules() : this.renderHistory()}
      </div>
    `;
  }

  private renderRules(): string {
    return `
      <div class="gm-body">
        <section class="gm-section">
          <h3>Armie</h3>
          <div class="gm-armies">
            ${this.renderFactionPicker('A')}
            ${this.renderFactionPicker('B')}
          </div>
        </section>

        <section class="gm-section">
          <h3>Zasady</h3>
          <div class="gm-rules">
            ${RULE_FIELDS.map((field) => this.renderField(field)).join('')}
          </div>

          <label class="gm-toggle">
            <input type="checkbox" data-rule="obstacles" ${this.setup.rules.obstacles ? 'checked' : ''} />
            <span>Przeszkody terenowe na planszy</span>
          </label>

          <label class="gm-seed">
            <span>Ziarno losowości</span>
            <input type="number" data-rule="seed" min="0" step="1" value="${this.setup.rules.seed}" />
            <em>0 = losowe przy każdej partii. Ta sama wartość odtworzy identyczny przebieg.</em>
          </label>
        </section>

        ${this.renderPreview()}

        <div class="gm-actions">
          <button type="button" id="gm-defaults">Przywróć domyślne</button>
          <button type="button" id="gm-start" class="is-primary">Rozpocznij partię</button>
        </div>
      </div>
    `;
  }

  private renderField(field: RuleField): string {
    const value = this.setup.rules[field.key] as number;
    return `
      <div class="gm-field">
        <div class="gm-field-head">
          <label>${field.label}</label>
          <output>${value}${field.suffix ?? ''}</output>
        </div>
        <input type="range" data-rule="${field.key}"
               min="${field.min}" max="${field.max}" step="${field.step}" value="${value}" />
        <p class="gm-hint">${field.hint}</p>
      </div>
    `;
  }

  private renderFactionPicker(side: 'A' | 'B'): string {
    const selected = side === 'A' ? this.setup.factionA : this.setup.factionB;
    const cards = FACTION_IDS.map((id) => {
      const army = FACTIONS[id];
      return `
        <button type="button" class="gm-faction ${selected === id ? 'is-selected' : ''}"
                data-side="${side}" data-faction="${id}" style="--faction-color:${army.color}">
          <span class="gm-faction-dot"></span>
          <span class="gm-faction-name">${army.name}</span>
          <span class="gm-faction-motto">${army.motto}</span>
        </button>
      `;
    }).join('');

    return `
      <div class="gm-army">
        <h4>${side === 'A' ? 'Gracz 1 — lewa strona' : 'Gracz 2 — prawa strona'}</h4>
        ${cards}
      </div>
    `;
  }

  /** Podglad skladu obu armii po zastosowaniu mnoznika wielkosci. */
  private renderPreview(): string {
    const left = armyCounts(this.setup.factionA, this.setup.rules.armyScale);
    const right = armyCounts(this.setup.factionB, this.setup.rules.armyScale);

    const rows = left
      .map((countLeft, index) => {
        const a = creatureDef(FACTIONS[this.setup.factionA].creatures[index]);
        const b = creatureDef(FACTIONS[this.setup.factionB].creatures[index]);
        return `
          <tr>
            <td class="gm-left">${a.name}</td>
            <td class="gm-stat">${a.attack}/${a.defense} · ${a.damageMin}-${a.damageMax} · ${a.hp} PŻ · ⚡${a.speed}</td>
            <td class="gm-count">×${countLeft}</td>
            <td class="gm-tier">${index + 1}</td>
            <td class="gm-count">×${right[index]}</td>
            <td class="gm-stat">${b.attack}/${b.defense} · ${b.damageMin}-${b.damageMax} · ${b.hp} PŻ · ⚡${b.speed}</td>
            <td class="gm-right">${b.name}</td>
          </tr>
        `;
      })
      .join('');

    return `
      <section class="gm-section">
        <h3>Podgląd sił</h3>
        <div class="gm-table-wrap">
          <table class="gm-preview">
            <thead>
              <tr>
                <th colspan="3" style="color:${FACTIONS[this.setup.factionA].color}">${FACTIONS[this.setup.factionA].name}</th>
                <th>poziom</th>
                <th colspan="3" style="color:${FACTIONS[this.setup.factionB].color}">${FACTIONS[this.setup.factionB].name}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  private renderHistory(): string {
    const history = loadHistory();

    if (history.length === 0) {
      return `
        <div class="gm-body">
          <p class="gm-empty">Brak zapisanych partii. Rozegraj pierwszą, żeby pojawiła się w historii.</p>
        </div>
      `;
    }

    const rows = history
      .map((match) => {
        const result = match.winner
          ? `<span class="gm-winner">${match.winnerName}</span>`
          : '<span class="gm-pending">nierozstrzygnięta</span>';

        return `
          <details class="gm-match">
            <summary>
              <span class="gm-match-when">${formatMoment(match.startedAt)}</span>
              <span class="gm-match-vs">${match.factionNames.A} vs ${match.factionNames.B}</span>
              <span class="gm-match-result">${result}</span>
              <span class="gm-match-rounds">${match.rounds} rund</span>
            </summary>
            <div class="gm-match-body">
              <div class="gm-match-rules">
                Karta co ${match.rules.cardEveryTurns} tur · limit ręki ${match.rules.handLimit} ·
                odrodzenia ${match.rules.maxRespawns} (${match.rules.respawnPercent}%) ·
                armia ${match.rules.armyScale}% · ziarno ${match.seed}
              </div>
              <ol class="gm-match-log">
                ${match.log.map((line) => `<li>${line}</li>`).join('')}
              </ol>
            </div>
          </details>
        `;
      })
      .join('');

    return `
      <div class="gm-body">
        <div class="gm-history">${rows}</div>
        <div class="gm-actions">
          <button type="button" id="gm-clear-history">Wyczyść historię</button>
          <button type="button" data-tab="zasady" class="is-primary">Wróć do zasad</button>
        </div>
      </div>
    `;
  }
}
