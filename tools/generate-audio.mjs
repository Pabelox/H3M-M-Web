/**
 * Generator assetow dzwiekowych.
 *
 * Tworzy pliki WAV z efektami i muzyka tla, syntezujac je od zera - bez
 * zadnej biblioteki i bez materialow z zewnatrz, wiec nie ma kwestii
 * licencyjnych: autorem dzwiekow jest autor projektu.
 *
 * Uruchomienie z katalogu projektu:
 *     node tools/generate-audio.mjs
 *
 * Generator jest deterministyczny (wlasny generator pseudolosowy ze stalym
 * ziarnem), wiec ponowne uruchomienie daje bajtowo identyczne pliki i nie
 * zasmieca historii gita.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = [join(ROOT, 'public', 'assets', 'sfx'), join(ROOT, 'karty', 'public', 'assets', 'sfx')];

const RATE = 22050;

// --- Narzedzia ---------------------------------------------------------

/** Deterministyczny szum - ten sam przy kazdym uruchomieniu (mulberry32). */
function makeNoise(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

const buffer = (seconds) => new Float32Array(Math.round(seconds * RATE));

/** Wykladnicze wygasanie - naturalniejsze niz liniowe. */
const decay = (t, rate) => Math.exp(-t * rate);

/** Krotki narost na poczatku dzwieku, zeby nie bylo slyszalnego trzasku. */
function attack(t, seconds = 0.005) {
  return Math.min(1, t / seconds);
}

function tone(target, { freq, start = 0, duration, gain = 0.3, decayRate = 6, sweep = 1 }) {
  const from = Math.round(start * RATE);
  const count = Math.round(duration * RATE);
  let phase = 0;

  for (let i = 0; i < count; i++) {
    const index = from + i;
    if (index >= target.length) break;
    const t = i / RATE;
    // Plynne przejscie czestotliwosci nadaje dzwiekowi ruch.
    const f = freq * (1 + (sweep - 1) * (t / duration));
    phase += (2 * Math.PI * f) / RATE;
    target[index] += Math.sin(phase) * gain * decay(t, decayRate) * attack(t);
  }
}

function noiseBurst(target, { start = 0, duration, gain = 0.3, decayRate = 20, lowpass = 0.5, seed = 1 }) {
  const from = Math.round(start * RATE);
  const count = Math.round(duration * RATE);
  const random = makeNoise(seed);
  let previous = 0;

  for (let i = 0; i < count; i++) {
    const index = from + i;
    if (index >= target.length) break;
    const t = i / RATE;
    // Prosty filtr dolnoprzepustowy: im nizszy `lowpass`, tym glebszy szum.
    previous = previous + (random() - previous) * lowpass;
    target[index] += previous * gain * decay(t, decayRate) * attack(t, 0.002);
  }
}

/** Miekkie nasycenie - scina szczyty zamiast je obcinac na sztywno. */
function normalize(samples, peak = 0.85) {
  let max = 0;
  for (const value of samples) max = Math.max(max, Math.abs(value));
  if (max === 0) return samples;
  const scale = peak / max;
  for (let i = 0; i < samples.length; i++) samples[i] = Math.tanh(samples[i] * scale);
  return samples;
}

function writeWav(path, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  writeFileSync(path, Buffer.concat([header, data]));
  return 44 + data.length;
}

// --- Efekty dzwiekowe --------------------------------------------------

/** Kostka koziolkujaca po stole - seria drewnianych stuknięc. */
function dice() {
  const out = buffer(0.75);
  const hits = [0, 0.08, 0.15, 0.21, 0.33, 0.42, 0.58];
  hits.forEach((start, index) => {
    const gain = 0.5 * (1 - index / hits.length) + 0.12;
    noiseBurst(out, { start, duration: 0.07, gain, decayRate: 60, lowpass: 0.65, seed: 11 + index });
    tone(out, { freq: 340 - index * 18, start, duration: 0.06, gain: gain * 0.5, decayRate: 55 });
  });
  return normalize(out, 0.8);
}

/** Przesuniecie zetonu po planszy - miekkie tarcie. */
function move() {
  const out = buffer(0.22);
  noiseBurst(out, { duration: 0.2, gain: 0.35, decayRate: 14, lowpass: 0.12, seed: 27 });
  tone(out, { freq: 180, duration: 0.14, gain: 0.18, decayRate: 18, sweep: 0.7 });
  return normalize(out, 0.55);
}

/** Uderzenie wrecz - trzask i niskie dudniecie. */
function hit() {
  const out = buffer(0.4);
  noiseBurst(out, { duration: 0.18, gain: 0.7, decayRate: 32, lowpass: 0.45, seed: 41 });
  tone(out, { freq: 120, duration: 0.3, gain: 0.5, decayRate: 12, sweep: 0.55 });
  tone(out, { freq: 240, duration: 0.12, gain: 0.25, decayRate: 30, sweep: 0.6 });
  return normalize(out, 0.9);
}

/** Strzal - swist pocisku opadajacy w dol. */
function shoot() {
  const out = buffer(0.35);
  noiseBurst(out, { duration: 0.3, gain: 0.45, decayRate: 11, lowpass: 0.85, seed: 63 });
  tone(out, { freq: 1500, duration: 0.28, gain: 0.3, decayRate: 9, sweep: 0.28 });
  return normalize(out, 0.7);
}

/** Rozbicie oddzialu - ciezki, opadajacy dzwiek. */
function death() {
  const out = buffer(0.9);
  tone(out, { freq: 220, duration: 0.85, gain: 0.5, decayRate: 4, sweep: 0.32 });
  tone(out, { freq: 110, duration: 0.85, gain: 0.4, decayRate: 3.5, sweep: 0.4 });
  noiseBurst(out, { duration: 0.5, gain: 0.35, decayRate: 7, lowpass: 0.25, seed: 79 });
  return normalize(out, 0.85);
}

/** Postawa obronna - metaliczny brzek tarczy. */
function shield() {
  const out = buffer(0.6);
  [660, 990, 1320, 1780].forEach((freq, index) => {
    tone(out, { freq, duration: 0.55, gain: 0.3 / (index + 1), decayRate: 7 + index * 2 });
  });
  noiseBurst(out, { duration: 0.06, gain: 0.25, decayRate: 50, lowpass: 0.9, seed: 97 });
  return normalize(out, 0.7);
}

/** Zwyciestwo - krotka fanfara w tonacji durowej. */
function victory() {
  const out = buffer(1.6);
  // C - E - G - C (oktawe wyzej)
  const melody = [
    { freq: 523.25, start: 0.0, duration: 0.22 },
    { freq: 659.25, start: 0.18, duration: 0.22 },
    { freq: 783.99, start: 0.36, duration: 0.26 },
    { freq: 1046.5, start: 0.58, duration: 0.9 },
  ];
  for (const note of melody) {
    tone(out, { ...note, gain: 0.34, decayRate: 3.4 });
    tone(out, { ...note, freq: note.freq * 2, gain: 0.12, decayRate: 4.5 });
    tone(out, { ...note, freq: note.freq * 0.5, gain: 0.16, decayRate: 3 });
  }
  return normalize(out, 0.85);
}

/** Klikniecie w interfejsie - bardzo krotkie. */
function click() {
  const out = buffer(0.09);
  noiseBurst(out, { duration: 0.05, gain: 0.4, decayRate: 90, lowpass: 0.8, seed: 131 });
  tone(out, { freq: 900, duration: 0.05, gain: 0.22, decayRate: 70 });
  return normalize(out, 0.5);
}

/** Dobranie karty - szelest papieru. */
function card() {
  const out = buffer(0.3);
  noiseBurst(out, { duration: 0.26, gain: 0.4, decayRate: 10, lowpass: 0.95, seed: 151 });
  tone(out, { freq: 2200, duration: 0.2, gain: 0.08, decayRate: 14, sweep: 0.5 });
  return normalize(out, 0.55);
}

// --- Muzyka tla --------------------------------------------------------

/**
 * Spokojna petla w tonacji molowej: Am - F - C - G, po cztery sekundy na
 * akord. Poczatek i koniec sa wyciszone tak, zeby zapetlenie bylo niesłyszalne.
 *
 * Muzyka gra na stacji demonstracyjnej godzinami, wiec jest celowo uboga
 * w wydarzenia - ma byc tlem, a nie zwracac na siebie uwage.
 */
function music() {
  const chordSeconds = 4;
  const chords = [
    [220.0, 261.63, 329.63], // Am
    [174.61, 220.0, 261.63], // F
    [261.63, 329.63, 392.0], // C
    [196.0, 246.94, 293.66], // G
  ];

  const total = chordSeconds * chords.length;
  const out = buffer(total);

  chords.forEach((chord, chordIndex) => {
    const start = chordIndex * chordSeconds;

    // Podklad: dlugie, ciche wybrzmienie calego akordu.
    chord.forEach((freq, voice) => {
      tone(out, {
        freq,
        start,
        duration: chordSeconds,
        gain: 0.1 - voice * 0.015,
        decayRate: 0.5,
      });
    });

    // Bas na pierwszej i trzeciej cwiercnucie.
    [0, 2].forEach((beat) => {
      tone(out, {
        freq: chord[0] / 2,
        start: start + beat,
        duration: 1.4,
        gain: 0.16,
        decayRate: 2.2,
      });
    });

    // Arpeggio - po jednej nucie na cwiercnute, lekko szarpane.
    for (let beat = 0; beat < chordSeconds * 2; beat++) {
      const freq = chord[beat % chord.length] * 2;
      tone(out, {
        freq,
        start: start + beat * 0.5,
        duration: 0.45,
        gain: 0.075,
        decayRate: 7,
      });
    }
  });

  // Zlaczenie petli: pierwsze i ostatnie 0,4 s przenikaja sie wzajemnie.
  const fade = Math.round(0.4 * RATE);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[i] *= k;
    out[out.length - 1 - i] *= k;
  }

  return normalize(out, 0.5);
}

// --- Zapis -------------------------------------------------------------

const SOUNDS = {
  dice,
  move,
  hit,
  shoot,
  death,
  shield,
  victory,
  click,
  card,
  music,
};

for (const dir of TARGETS) {
  mkdirSync(dir, { recursive: true });
}

let totalBytes = 0;
console.log('Generowanie assetow dzwiekowych (WAV, 22050 Hz, mono):\n');

for (const [name, make] of Object.entries(SOUNDS)) {
  const samples = make();
  let bytes = 0;
  for (const dir of TARGETS) {
    bytes = writeWav(join(dir, `${name}.wav`), samples);
  }
  totalBytes += bytes * TARGETS.length;
  const seconds = (samples.length / RATE).toFixed(2);
  console.log(`  ${name.padEnd(9)} ${seconds.padStart(5)} s   ${(bytes / 1024).toFixed(0).padStart(5)} KB`);
}

console.log(`\nRazem ${(totalBytes / 1024 / 1024).toFixed(2)} MB w ${TARGETS.length} katalogach:`);
for (const dir of TARGETS) console.log(`  ${dir}`);
