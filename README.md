# Webowe gry planszowe — projekt zaliczeniowy

Repozytorium zawiera **dwie samodzielne gry** dzielące ten sam silnik heksów
i model rozgrywki turowej. Każda ma własny `package.json` i buduje się osobno.

| Katalog | Gra | Port dev | Charakterystyka |
|---|---|---|---|
| `/` (korzeń) | **Bitwa o Przełęcz** | 5173 | 8 miast, statystyki odwzorowane za HoMM3 |
| `/karty` | **Karty Bitwy** | 5175 | 3 własne frakcje, oddziały ulepszane kartami, odrodzenia, panel MG |

## Uruchomienie

Każdą grę uruchamia się niezależnie, z jej katalogu:

```bash
npm install && npm run dev
```

```bash
cd karty && npm install && npm run dev
```

Budowanie wersji produkcyjnej (`npm run build`) najpierw sprawdza typy
(`tsc --noEmit`), a potem tworzy statyczny katalog `dist/` — czysty HTML, CSS
i JavaScript, bez żadnej zależności pobieranej w czasie działania.

## Wspólne założenia techniczne

- **Zero bibliotek w czasie działania.** Maszyna wirtualna kiosku filtruje DNS
  białą listą, więc każde odwołanie do CDN by się nie udało. Vite i TypeScript
  są wyłącznie narzędziami budowania.
- **Perspektywa płaska (top-down).** Plansza leży na stole i jest oglądana
  prosto z góry — bez izometrii i bez silników 3D, zgodnie z regulaminem.
- **Rdzeń oddzielony od widoku.** Katalog `src/core/` nie dotyka DOM-u, a cała
  zmiana stanu przechodzi przez czystą funkcję `applyAction(state, action)`.
  Dzięki temu rozgrywkę da się symulować bez interfejsu — tak zweryfikowano
  stabilność mechaniki i wyrównano balans frakcji.
- **Determinizm.** Stan generatora losowego jest częścią stanu gry, więc partia
  z tym samym ziarnem przebiega identycznie. W „Kartach Bitwy" ziarno jest
  zapisywane w historii, żeby dało się odtworzyć konkretną rozgrywkę.

## Identyfikacja wizualna

Obie gry mają stały podpis autora w prawym dolnym rogu (**Paweł Kłosek,
nr albumu 4148**) oraz logo uczelni w lewym górnym rogu, będące klikalnym
odnośnikiem do [wsi.edu.pl](https://wsi.edu.pl). Logo leży na jasnej płytce,
bo kolorowy znak WSIZ jest nieczytelny na ciemnym interfejsie.

Domena uczelni jest wpisana na białą listę DNS kiosku
(`kiosk/files/dnsmasq-kiosk.conf`), żeby odnośnik działał także na maszynie
z filtrowanym ruchem.

Wykorzystane materiały i licencje: [`ASSETS.md`](ASSETS.md).
Konfiguracja stacji demonstracyjnej: [`kiosk/README.md`](kiosk/README.md).
