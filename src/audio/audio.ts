/**
 * Warstwa dzwiekowa.
 *
 * Odtwarza pliki z `public/assets/sfx/<nazwa>.wav` - efekty i zapetlona muzyke
 * tla. Pliki powstaja przez syntezę w `tools/generate-audio.mjs`, wiec sa
 * wlasnoscia autora projektu i nie wymagaja zadnej licencji zewnetrznej.
 *
 * Gdyby ktoregos pliku brakowalo, w jego miejsce wchodzi dzwiek generowany
 * na biezaco przez Web Audio API. Dzieki temu brak assetu nigdy nie wywala
 * gry, a najwyzej ja zubaza.
 */

export type SoundName =
  | 'dice'
  | 'move'
  | 'hit'
  | 'shoot'
  | 'death'
  | 'shield'
  | 'victory'
  | 'click'
  | 'card';

/** Parametry zastepczego dzwieku: czestotliwosc [Hz], czas [s], barwa. */
const FALLBACK: Record<SoundName, { freq: number; duration: number; type: OscillatorType }> = {
  dice: { freq: 620, duration: 0.09, type: 'square' },
  move: { freq: 320, duration: 0.08, type: 'triangle' },
  hit: { freq: 150, duration: 0.16, type: 'sawtooth' },
  shoot: { freq: 880, duration: 0.11, type: 'triangle' },
  death: { freq: 90, duration: 0.35, type: 'sawtooth' },
  shield: { freq: 500, duration: 0.14, type: 'sine' },
  victory: { freq: 700, duration: 0.5, type: 'sine' },
  click: { freq: 1100, duration: 0.04, type: 'square' },
  card: { freq: 1400, duration: 0.07, type: 'triangle' },
};

/** Glosnosc kazdego efektu z osobna - inaczej uderzenia zaglaszaja reszte. */
const VOLUME: Record<SoundName, number> = {
  dice: 0.5,
  move: 0.35,
  hit: 0.5,
  shoot: 0.4,
  death: 0.5,
  shield: 0.4,
  victory: 0.6,
  click: 0.25,
  card: 0.35,
};

const MUSIC_VOLUME = 0.18;

const buffers = new Map<SoundName, HTMLAudioElement | null>();
let context: AudioContext | null = null;
let music: HTMLAudioElement | null = null;
let muted = false;

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (!music) return;
  if (muted) {
    music.pause();
  } else {
    void music.play().catch(() => undefined);
  }
}

/**
 * Odblokowuje dzwiek. Przegladarki blokuja autoodtwarzanie do pierwszej
 * interakcji uzytkownika; w kiosku dodatkowo pomaga flaga Chromium
 * `--autoplay-policy=no-user-gesture-required`, ustawiana w konfiguracji VM.
 */
export function unlockAudio(): void {
  if (!context) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) context = new Ctor();
  }
  void context?.resume();
  startMusic();
}

/** Uruchamia zapetlona muzyke tla. Kolejne wywolania nie robia nic. */
export function startMusic(): void {
  if (music || muted) return;

  const track = new Audio('assets/sfx/music.wav');
  track.loop = true;
  track.volume = MUSIC_VOLUME;
  track.addEventListener('error', () => {
    music = null; // brak pliku - gra dziala dalej, tylko bez muzyki
  });

  music = track;
  void track.play().catch(() => {
    // Przegladarka jeszcze nie pozwala grac - sprobujemy po nastepnym klikniecju.
    music = null;
  });
}

export function stopMusic(): void {
  music?.pause();
  music = null;
}

export function playSound(name: SoundName): void {
  if (muted) return;

  const cached = buffers.get(name);

  if (cached === undefined) {
    // Pierwsze uzycie dzwieku: zaczynamy ladowanie i gramy zastepnik,
    // zeby reakcja na akcje gracza byla natychmiastowa.
    const audio = new Audio(`assets/sfx/${name}.wav`);
    audio.preload = 'auto';
    audio.addEventListener('error', () => buffers.set(name, null), { once: true });
    audio.addEventListener('canplaythrough', () => buffers.set(name, audio), { once: true });
    buffers.set(name, null);
    playFallback(name);
    return;
  }

  if (cached) {
    // Klon pozwala nalozyc kilka egzemplarzy tego samego dzwieku na siebie.
    const clone = cached.cloneNode() as HTMLAudioElement;
    clone.volume = VOLUME[name];
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
