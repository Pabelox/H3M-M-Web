import type { RulesConfig, Team } from './types';

/**
 * Historia rozegranych partii dla panelu mistrza gry.
 *
 * Zapis idzie do `localStorage`, wiec przetrwa przeladowanie strony i restart
 * kiosku. Dostep do magazynu jest owiniety w `try`, bo w trybie prywatnym albo
 * przy zablokowanych danych witryny sam odczyt potrafi rzucic wyjatkiem -
 * w takim wypadku panel po prostu pokazuje pusta historie.
 */

const STORAGE_KEY = 'karty-bitwy:historia';
const MAX_ENTRIES = 20;

export interface MatchRecord {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  factions: Record<Team, string>;
  factionNames: Record<Team, string>;
  rules: RulesConfig;
  winner: Team | null;
  winnerName: string | null;
  rounds: number;
  seed: number;
  /** Skrocony dziennik przebiegu partii. */
  log: string[];
}

export function loadHistory(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MatchRecord[]) : [];
  } catch {
    return [];
  }
}

/** Dopisuje lub aktualizuje wpis o partii (rozpoznawany po `id`). */
export function saveMatch(record: MatchRecord): void {
  try {
    const history = loadHistory().filter((entry) => entry.id !== record.id);
    history.unshift(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_ENTRIES)));
  } catch {
    // Brak dostepu do magazynu - historia dziala tylko w pamieci biezacej sesji.
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // jak wyzej
  }
}

export function newMatchId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Data i godzina w formacie czytelnym dla prowadzacego pokaz. */
export function formatMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
