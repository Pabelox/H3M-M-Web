/**
 * Warstwa dzwiekowa.
 *
 * Docelowo odtwarza pliki z `public/assets/sfx/<nazwa>.mp3`. Dopoki plikow nie
 * ma, generuje zastepczy dzwiek przez Web Audio API - dzieki temu gra jest
 * slyszalna od pierwszej wersji, a dodanie assetow nie wymaga zmian w kodzie.
 */

export type SoundName = 'dice' | 'move' | 'hit' | 'shoot' | 'death' | 'shield' | 'victory';

/** Parametry zastepczego dzwieku: czestotliwosc [Hz], czas [s], barwa. */
const FALLBACK: Record<SoundName, { freq: number; duration: number; type: OscillatorType }> = {
  dice: { freq: 620, duration: 0.09, type: 'square' },
  move: { freq: 320, duration: 0.08, type: 'triangle' },
  hit: { freq: 150, duration: 0.16, type: 'sawtooth' },
  shoot: { freq: 880, duration: 0.11, type: 'triangle' },
  death: { freq: 90, duration: 0.35, type: 'sawtooth' },
  shield: { freq: 500, duration: 0.14, type: 'sine' },
  victory: { freq: 700, duration: 0.5, type: 'sine' },
};

const buffers = new Map<SoundName, HTMLAudioElement | null>();
let context: AudioContext | null = null;
let muted = false;

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

/**
 * Odblokowuje dzwiek po pierwszej interakcji uzytkownika.
 * Przegladarki blokuja autoodtwarzanie do czasu kliknięcia.
 */
export function unlockAudio(): void {
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) context = new Ctor();
  }
  void context?.resume();
}

export function playSound(name: SoundName): void {
  if (muted) return;

  const cached = buffers.get(name);
  if (cached === undefined) {
    const audio = new Audio(`assets/sfx/${name}.mp3`);
    audio.addEventListener('error', () => buffers.set(name, null), { once: true });
    audio.addEventListener('canplaythrough', () => buffers.set(name, audio), { once: true });
    buffers.set(name, null);
    playFallback(name);
    return;
  }

  if (cached) {
    const clone = cached.cloneNode() as HTMLAudioElement;
    clone.volume = 0.5;
    void clone.play().catch(() => playFallback(name));
    return;
  }

  playFallback(name);
}

function playFallback(name: SoundName): void {
  if (!context || context.state !== 'running') return;

  const spec = FALLBACK[name];
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = spec.type;
  oscillator.frequency.setValueAtTime(spec.freq, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(60, spec.freq * 0.6),
    context.currentTime + spec.duration,
  );

  gain.gain.setValueAtTime(0.13, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + spec.duration);

  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + spec.duration);
}
