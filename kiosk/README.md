# Tryb kiosk — maszyna wirtualna VirtualBox

Konfiguracja autonomicznej stacji demonstracyjnej: po włączeniu maszyny
użytkownik widzi wyłącznie pełnoekranową grę, bez dostępu do pulpitu,
terminala i skrótów systemowych.

Treść tego katalogu jest podstawą rozdziału „Instrukcja instalacji
i uruchomienia" w dokumentacji PDF.

## Zawartość

| Plik | Rola |
|---|---|
| `install.sh` | Pełna konfiguracja maszyny — uruchamiany raz, na VM, przez `sudo` |
| `deploy.sh` | Wgranie zbudowanej gry z komputera dewelopera na maszynę |
| `files/lightdm.conf` | Automatyczne logowanie konta `kiosk` |
| `files/openbox-rc.xml` | Openbox **bez żadnego skrótu klawiszowego** |
| `files/openbox-menu.xml` | Puste menu — brak pozycji „Terminal" i „Exit" |
| `files/openbox-autostart` | Wyłączenie wygaszacza, kursor, start przeglądarki |
| `files/kiosk-chromium.sh` | Chromium w trybie kiosk + nadzór restartu |
| `files/xorg-kiosk.conf` | Blokada Ctrl+Alt+F1..F12 i Ctrl+Alt+Backspace |
| `files/nginx-kiosk.conf` | Lokalny serwer gry na `http://localhost/` |
| `files/dnsmasq-kiosk.conf` | Filtrowanie DNS białą listą |
| `files/sshd-kiosk.conf` | Zdalny dostęp tylko dla konta `admin` |
| `files/kiosk-resolved.conf` | Zwolnienie portu 53 dla dnsmasq |

---

## 1. Utworzenie maszyny w VirtualBox

| Parametr | Wartość |
|---|---|
| System | Ubuntu 22.04 Server (obraz netinstall, 64-bit) |
| Pamięć | 2048 MB |
| Procesory | 2 |
| Dysk | 20 GB, dynamicznie przydzielany |
| Karta sieciowa | Mostkowana (Bridged Adapter) |
| Karta graficzna | VMSVGA, 128 MB, **włączona akceleracja 3D wyłączona** |

Podczas instalacji Ubuntu:

- wybierz **minimalną** instalację serwera,
- utwórz użytkownika o nazwie **`admin`** (skrypt oczekuje właśnie tej nazwy
  w `AllowUsers`; inna nazwa wymaga poprawienia `files/sshd-kiosk.conf`),
- zaznacz instalację **OpenSSH server**,
- nie instaluj żadnych dodatkowych pakietów snap.

Po instalacji zainstaluj dodatki gościa, żeby rozdzielczość dopasowała się
do okna:

```bash
sudo apt update && sudo apt install -y virtualbox-guest-x11
```

## 2. Konfiguracja kiosku

Skopiuj katalog `kiosk/` na maszynę i uruchom skrypt:

```bash
scp -r kiosk admin@<ip-maszyny>:~/
```

```bash
ssh admin@<ip-maszyny> 'cd ~/kiosk && chmod +x install.sh files/kiosk-chromium.sh && sudo ./install.sh'
```

Skrypt kończy się listą kontrolną — każdy punkt musi być `[ OK ]`.

> **Windows:** jeśli skrypt zgłosi `bad interpreter: ^M`, pliki zostały
> skopiowane z zakończeniami CRLF. Repozytorium ma `.gitattributes`
> wymuszający LF, ale przy kopiowaniu poza gitem napraw to na maszynie:
> `sudo apt install -y dos2unix && dos2unix ~/kiosk/install.sh ~/kiosk/files/*`

## 3. Wgranie gry

Z komputera dewelopera, z katalogu projektu:

```bash
./kiosk/deploy.sh karty <ip-maszyny>
```

Skrypt buduje grę (`npm run build`), kopiuje `dist/` do `/var/www/kiosk/`
i restartuje przeglądarkę. Dla drugiej gry: `./kiosk/deploy.sh glowna <ip>`.

## 4. Uruchomienie

```bash
sudo reboot
```

Po restarcie maszyna wchodzi prosto w grę na pełnym ekranie.

---

## Jak zrealizowano poszczególne wymagania

### Automatyczny start

LightDM loguje konto `kiosk` bez pytania o hasło (`autologin-user-timeout=0`)
i uruchamia sesję Openboksa. Openbox wykonuje `~/.config/openbox/autostart`,
który startuje `kiosk-chromium.sh`. System startuje w `graphical.target`,
bo obraz serwerowy domyślnie wchodzi w tryb tekstowy.

### Pełny ekran bez możliwości wyjścia

Chromium działa z flagą `--kiosk` (brak paska adresu, kart i ramki okna),
a Openbox ma w `rc.xml` regułę `<application class="*">` wymuszającą
`fullscreen` i `decor=no` na każdym oknie.

Skrypt przeglądarki działa w pętli `while true`. Gdyby przeglądarka została
zamknięta lub się wysypała, po sekundzie wraca gra — zamiast gołego pulpitu.
To najważniejszy element zabezpieczenia: bez tej pętli wystarczyłoby jedno
zamknięcie okna, żeby wyjść z kiosku.

### Blokada skrótów klawiszowych

Trzy warstwy, bo żadna nie wystarcza samodzielnie:

| Skrót | Blokada |
|---|---|
| Alt+F4, Alt+Tab, Ctrl+Alt+T, Super | Pusta sekcja `<keyboard>` w `rc.xml` — Openbox nie zna żadnego skrótu |
| Ctrl+Alt+F1..F12 (konsole tekstowe) | `Option "DontVTSwitch" "true"` w konfiguracji Xorg |
| Ctrl+Alt+Backspace (ubicie X) | `Option "DontZap" "true"` |
| Ctrl+Alt+Del (restart) | `systemctl mask ctrl-alt-del.target` |
| Menu pod prawym przyciskiem | Puste `menu.xml` + brak akcji `ShowMenu` w `rc.xml` |

### Filtrowanie DNS

`dnsmasq` rozwiązuje domyślnie **każdą** nazwę na `0.0.0.0` (`address=/#/0.0.0.0`),
a przepuszcza tylko domeny z białej listy. dnsmasq wybiera regułę najbardziej
szczegółową, więc wpisy `server=` mają pierwszeństwo przed regułą ogólną.

Gra działa w całości lokalnie, więc biała lista istnieje wyłącznie po to, żeby
działał klikalny odnośnik do strony uczelni pod logo.

### Praca bez internetu

Zbudowana gra to statyczny HTML, CSS i JavaScript bez żadnej zależności
pobieranej w czasie działania — brak CDN-ów, brak Google Fonts, wszystkie
grafiki i dźwięki leżą lokalnie. Maszyna z odłączoną siecią uruchamia grę
identycznie.

---

## Świadome odstępstwa od wzorcowej konfiguracji

Trzy rzeczy zrobiono inaczej niż w materiale źródłowym zadania, w każdym
przypadku dlatego, że wersja wzorcowa by nie zadziałała:

**1. Powłoka konta `kiosk` to `/bin/bash`, nie `/usr/sbin/nologin`.**
LightDM uruchamia sesję graficzną przez powłokę użytkownika — przy `nologin`
automatyczne logowanie kończy się pustym ekranem. Ten sam efekt (brak dostępu
zdalnego) osiągnięto przez `DenyUsers kiosk` w konfiguracji SSH oraz
zablokowanie hasła (`passwd -l`).

**2. Dołożono `nginx`.**
Zbudowana gra używa modułów ES (`<script type="module">`), które przeglądarka
blokuje przy otwarciu z `file://` przez politykę CORS. Gra musi być serwowana
po HTTP — nginx na localhoscie działa bez internetu i wstaje razem z systemem.

**3. `unclutter` z opóźnieniem 10 sekund zamiast 3.**
W grze klika się heksy i karty, więc kursor jest potrzebny. Chowa się dopiero
po dziesięciu sekundach bezczynności i wraca przy pierwszym ruchu myszy.

Dodatkowo skrypt wyłącza nasłuch `systemd-resolved` na porcie 53 — bez tego
`dnsmasq` nie wystartuje („Address already in use") i całe filtrowanie DNS
po cichu przestaje działać.

---

## Diagnostyka

Maszyna zatrzymuje się na czarnym ekranie:

```bash
systemctl status lightdm
journalctl -u lightdm -b --no-pager | tail -40
```

Widać pulpit zamiast gry — przeglądarka nie wstała:

```bash
sudo -u kiosk DISPLAY=:0 /usr/local/bin/kiosk-chromium.sh
```

Gra się nie ładuje:

```bash
curl -I http://localhost/
sudo nginx -t
ls -la /var/www/kiosk/
```

Filtrowanie DNS nie działa:

```bash
systemctl status dnsmasq
dig +short wsi.edu.pl          # powinno zwrócić prawdziwy adres
dig +short facebook.com       # powinno zwrócić 0.0.0.0
```

Tymczasowe wyjście z kiosku na czas poprawek (przez SSH z konta `admin`):

```bash
sudo systemctl stop lightdm
```
