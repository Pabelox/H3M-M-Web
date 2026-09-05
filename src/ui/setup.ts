import { armyCounts, creatureDef, FACTION_IDS, FACTIONS, type FactionId } from '../core/factions';

/**
 * Ekran wyboru miast przed bitwa. Gracz wybiera armie dla obu stron,
 * a przy kazdym miescie widzi pelny sklad (tiery 1-7) i liczebnosc oddzialow.
 */
export class SetupScreen {
  private readonly root: HTMLElement;
  private picked: Record<'A' | 'B', FactionId> = { A: 'zamek', B: 'inferno' };

  constructor(private readonly onStart: (a: FactionId, b: FactionId) => void) {
    const node = document.getElementById('setup');
    if (!node) throw new Error('Brak elementu #setup w dokumencie.');
    this.root = node;
    this.root.addEventListener('click', (event) => this.handleClick(event));
  }

  show(current?: Record<'A' | 'B', FactionId>): void {
    if (current) this.picked = { ...current };
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    this.root.hidden = true;
  }

  private handleClick(event: Event): void {
    const target = event.target as HTMLElement;

    const card = target.closest<HTMLElement>('[data-faction]');
    if (card) {
      const side = card.dataset.side as 'A' | 'B';
      this.picked[side] = card.dataset.faction as FactionId;
      this.render();
      return;
    }

    if (target.closest('#setup-start')) {
      this.hide();
      this.onStart(this.picked.A, this.picked.B);
    }

    if (target.closest('#setup-random')) {
      this.picked.A = FACTION_IDS[Math.floor(Math.random() * FACTION_IDS.length)];
      this.picked.B = FACTION_IDS[Math.floor(Math.random() * FACTION_IDS.length)];
      this.render();
    }
  }

  private render(): void {
    this.root.innerHTML = `
      <div class="setup-card">
        <h2>Wybierz armie</h2>
        <p class="setup-lead">
          Osiem miast, po siedem poziomów stworzeń. Statystyki odwzorowane
          za <em>Heroes of Might and Magic III</em>.
        </p>

        <div class="setup-columns">
          ${this.renderColumn('A')}
          ${this.renderColumn('B')}
        </div>

        ${this.renderRoster()}

        <div class="setup-actions">
          <button id="setup-random" type="button">🎲 Losowo</button>
          <button id="setup-start" type="button" class="is-primary">Rozpocznij bitwę</button>
        </div>
      </div>
    `;
  }

  private renderColumn(side: 'A' | 'B'): string {
    const cards = FACTION_IDS.map((id) => {
      const faction = FACTIONS[id];
      const selected = this.picked[side] === id;
      return `
        <button type="button" class="faction-card ${selected ? 'is-selected' : ''}"
                data-side="${side}" data-faction="${id}"
                style="--faction-color:${faction.color}">
          <span class="faction-dot"></span>
          <span class="faction-name">${faction.name}</span>
        </button>
      `;
    }).join('');

    return `
      <div class="setup-column">
        <h3>${side === 'A' ? 'Gracz 1 (lewa strona)' : 'Gracz 2 (prawa strona)'}</h3>
        <div class="faction-grid">${cards}</div>
      </div>
    `;
  }

  /** Podglad skladu obu wybranych armii, tier po tierze. */
  private renderRoster(): string {
    const countsLeft = armyCounts(this.picked.A);
    const countsRight = armyCounts(this.picked.B);

    const rows = countsLeft
      .map((countLeft, index) => {
        const left = creatureDef(FACTIONS[this.picked.A].creatures[index]);
        const right = creatureDef(FACTIONS[this.picked.B].creatures[index]);
        return `
        <tr>
          <td class="roster-left">${left.name}</td>
          <td class="roster-stat">${left.attack}/${left.defense} · ${left.damageMin}-${left.damageMax} · ${left.hp} PŻ · ⚡${left.speed}</td>
          <td class="roster-count">×${countLeft}</td>
          <td class="roster-tier">${index + 1}</td>
          <td class="roster-count">×${countsRight[index]}</td>
          <td class="roster-stat">${right.attack}/${right.defense} · ${right.damageMin}-${right.damageMax} · ${right.hp} PŻ · ⚡${right.speed}</td>
          <td class="roster-right">${right.name}</td>
        </tr>
      `;
      })
      .join('');

    return `
      <div class="setup-roster-wrap">
      <table class="setup-roster">
        <thead>
          <tr>
            <th colspan="3" style="color:${FACTIONS[this.picked.A].color}">${FACTIONS[this.picked.A].name}</th>
            <th>poziom</th>
            <th colspan="3" style="color:${FACTIONS[this.picked.B].color}">${FACTIONS[this.picked.B].name}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      </div>
    `;
  }
}
