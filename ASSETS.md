# Wykorzystane materiały i licencje

Lista trafia w całości do dokumentacji PDF (rozdział „Wykorzystane technologie
i materiały"). Każdy plik graficzny lub dźwiękowy dodany do `public/assets/`
musi mieć tutaj wpis.

## Grafika

| Materiał | Plik(i) | Autor / źródło | Licencja |
|---|---|---|---|
| Logo uczelni (zastępcze) | `public/assets/ui/logo-uczelni.svg` | własne | — do podmiany |
| _(tu wpisz kolejne paczki)_ | | | |

## Dźwięk

Silnik szuka plików `public/assets/sfx/<nazwa>.mp3` dla zdarzeń:
`dice`, `move`, `hit`, `shoot`, `death`, `shield`, `victory`.
Gdy pliku brak, odtwarzany jest zastępczy dźwięk generowany przez Web Audio API.

| Materiał | Plik(i) | Autor / źródło | Licencja |
|---|---|---|---|
| _(tu wpisz efekty dźwiękowe)_ | | | |

## Dane

| Materiał | Zastosowanie | Źródło |
|---|---|---|
| Statystyki stworzeń HoMM3 | `src/core/factions.ts` | heroes.thelazy.net — lista stworzeń |

## Biblioteki

| Biblioteka | Wersja | Licencja | Zastosowanie |
|---|---|---|---|
| Vite | ^6.0.5 | MIT | bundler i serwer deweloperski |
| TypeScript | ^5.7.2 | Apache-2.0 | typowanie, kontrola poprawności |

Gra nie używa żadnej biblioteki w czasie działania — zbudowany `dist/` to czysty
HTML, CSS i JavaScript, bez zależności z CDN. Jest to celowe: maszyna wirtualna
kiosku filtruje DNS białą listą, więc każde odwołanie zewnętrzne by się nie udało.
