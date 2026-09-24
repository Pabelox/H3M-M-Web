# Wykorzystane materiały i licencje

Lista trafia w całości do dokumentacji PDF (rozdział „Wykorzystane technologie
i materiały"). Każdy plik graficzny lub dźwiękowy dodany do `public/assets/`
musi mieć tutaj wpis.

## Dźwięk

Wszystkie pliki dźwiękowe są **generowane od zera** skryptem
[`tools/generate-audio.mjs`](tools/generate-audio.mjs) — synteza przebiegów
(fale sinusoidalne, szum filtrowany, obwiednie wykładnicze) bez żadnej
biblioteki i bez materiałów z zewnątrz. Autorem dźwięków jest autor projektu,
więc nie ma żadnych zobowiązań licencyjnych.

Ponowne wygenerowanie: `node tools/generate-audio.mjs`

| Plik | Zdarzenie w grze | Długość |
|---|---|---|
| `dice.wav` | rzut kostką obrażeń | 0,75 s |
| `move.wav` | przesunięcie żetonu po planszy | 0,22 s |
| `hit.wav` | trafienie w walce wręcz | 0,40 s |
| `shoot.wav` | strzał na dystans | 0,35 s |
| `death.wav` | rozbicie oddziału | 0,90 s |
| `shield.wav` | przyjęcie postawy obronnej | 0,60 s |
| `victory.wav` | zwycięstwo — fanfara | 1,60 s |
| `click.wav` | kliknięcie przycisku interfejsu | 0,09 s |
| `card.wav` | dobranie i zagranie karty | 0,30 s |
| `music.wav` | **muzyka tła**, zapętlona (Am–F–C–G) | 16,00 s |

Format: WAV, 22050 Hz, mono, 16-bit. Razem 889 KB na grę.

Generator jest deterministyczny (własny generator pseudolosowy ze stałym
ziarnem), więc ponowne uruchomienie daje bajtowo identyczne pliki.

## Grafika

| Materiał | Plik(i) | Autor / źródło | Licencja |
|---|---|---|---|
| Sylwetki oddziałów (pixel art 16×16) | `karty/src/render/pixels.ts` | własne — matryce pikseli w kodzie | projekt |
| Żetony i plansza | rysowane proceduralnie na Canvas 2D | własne | projekt |
| Logo uczelni (zastępcze) | `public/assets/ui/logo-uczelni.svg` | własne | **do podmiany** |

Pixel art jest zapisany jako siatki znaków w kodzie źródłowym, a nie jako
pliki graficzne. Każdy znak wybiera kolor z palety frakcji, więc jedna
sylwetka obsługuje wszystkie strony konfliktu. Zaletą jest brak plików
binarnych w repozytorium i zero kwestii licencyjnych.

## Dane

| Materiał | Zastosowanie | Źródło |
|---|---|---|
| Statystyki stworzeń HoMM3 | `src/core/factions.ts` (gra „Bitwa o Przełęcz") | heroes.thelazy.net — lista stworzeń |

Gra „Karty Bitwy" używa wyłącznie własnych frakcji i nazw, bez odwołań do
materiałów objętych prawami autorskimi.

## Biblioteki

| Biblioteka | Wersja | Licencja | Zastosowanie |
|---|---|---|---|
| Vite | ^6.0.5 | MIT | bundler i serwer deweloperski |
| TypeScript | ^5.7.2 | Apache-2.0 | typowanie, kontrola poprawności |

Gra nie używa żadnej biblioteki w czasie działania — zbudowany `dist/` to czysty
HTML, CSS i JavaScript, bez zależności z CDN. Jest to celowe: maszyna wirtualna
kiosku filtruje DNS białą listą, więc każde odwołanie zewnętrzne by się nie udało.

## Oprogramowanie na maszynie kiosku

| Pakiet | Licencja | Rola |
|---|---|---|
| Ubuntu 22.04 Server | GPL i inne wolne | system gościa |
| Xorg, Openbox | MIT / GPL-2.0 | środowisko graficzne |
| LightDM | GPL-3.0 | automatyczne logowanie |
| Chromium | BSD-3-Clause | przeglądarka w trybie kiosk |
| nginx | BSD-2-Clause | lokalny serwer gry |
| dnsmasq | GPL-2.0 | filtrowanie DNS białą listą |
| unclutter | domena publiczna | ukrywanie kursora przy bezczynności |
