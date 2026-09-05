# Grafiki stworzeń

Renderer szuka pliku `<id>.png` dla każdego stworzenia zdefiniowanego
w [`src/core/factions.ts`](../../../src/core/factions.ts). Gdy pliku brakuje,
rysowany jest zastępczy żeton z numerem poziomu — gra działa bez assetów, ale
na zaliczeniu grafiki są wymagane.

## Wymagania techniczne

- kwadratowy kadr, zalecane **256×256 px**, PNG z przezroczystym tłem,
- postać wypełniająca kadr — obrazek jest przycinany do koła podstawki żetonu,
- widok z góry lub portret; unikać cieni sugerujących perspektywę 3D.

## Lista plików (56 sztuk, 8 miast × 7 poziomów)

| # | Zamek | Bastion | Wieża | Inferno |
|---|---|---|---|---|
| 1 | `pikinier` | `centaur` | `gremlin` | `diablik` |
| 2 | `lucznik` | `krasnolud` | `gargulec` | `gog` |
| 3 | `gryf` | `lesny-elf` | `golem` | `ogar` |
| 4 | `miecznik` | `pegaz` | `mag` | `demon` |
| 5 | `mnich` | `drzewiec` | `dzin` | `czart` |
| 6 | `kawalerzysta` | `jednorozec` | `naga` | `ifryt` |
| 7 | `aniol` | `zielony-smok` | `gigant` | `diabel` |

| # | Nekropolis | Loch | Cytadela | Twierdza |
|---|---|---|---|---|
| 1 | `szkielet` | `troglodyta` | `goblin` | `gnoll` |
| 2 | `trup` | `harpia` | `jezdziec-wilk` | `jaszczur` |
| 3 | `zjawa` | `obserwator` | `ork` | `wezowa-mucha` |
| 4 | `wampir` | `meduza` | `ogr` | `bazyliszek` |
| 5 | `licz` | `minotaur` | `roc` | `gorgona` |
| 6 | `czarny-rycerz` | `mantykora` | `cyklop` | `wiwerna` |
| 7 | `kosciany-smok` | `czerwony-smok` | `behemot` | `hydra` |

## Kolejność dodawania

56 grafik to dużo, a gra działa bez nich. Sensowna kolejność:

1. **Dwa miasta, które pokazujesz na obronie** (14 plików) — reszta ma żetony zastępcze.
2. Pozostałe miasta, jeśli zostanie czas.

## Źródła CC0

Grafiki muszą mieć licencję pozwalającą na użycie w projekcie:

- <https://kenney.nl/assets> — spójne stylistycznie paczki CC0, bez atrybucji
- <https://opengameart.org/> — filtr licencji: CC0
- <https://game-icons.net/> — ikony wektorowe, CC BY 3.0 (**wymagana atrybucja**)

**Każdy użyty pakiet wpisz do [`ASSETS.md`](../../../ASSETS.md)** wraz z licencją —
ta lista trafia potem do dokumentacji PDF.

> Uwaga: nazwy stworzeń pochodzą z *Heroes of Might and Magic III*. Do własnej
> gry oddawanej na zaliczenie bezpieczniej jest użyć grafik CC0, a nie
> oryginalnych sprite'ów z gry, które są objęte prawami autorskimi Ubisoftu.
