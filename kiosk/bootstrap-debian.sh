#!/bin/bash
#
# ============================================================================
#  Stacja demonstracyjna (tryb kiosk) - instalacja od zera na Debianie
# ============================================================================
#
#  Skrypt prowadzi minimalna, terminalowa instalacje Debiana do stanu, w ktorym
#  po wlaczeniu maszyny od razu widac pelnoekranowa gre i nie da sie z niej
#  wyjsc. Pobiera kod z repozytorium, buduje go na miejscu i konfiguruje caly
#  system.
#
#  UZYCIE (na maszynie wirtualnej, jako root):
#
#      su -
#      apt-get update && apt-get install -y curl
#      curl -fsSL <adres-skryptu> -o bootstrap-debian.sh
#      bash bootstrap-debian.sh
#
#  albo, gdy skrypt jest juz skopiowany na maszyne:
#
#      bash bootstrap-debian.sh
#
#  PARAMETRY (zmienne srodowiskowe, wszystkie opcjonalne):
#
#      GAME=karty|glowna     ktora gre wystawic          (domyslnie: karty)
#      REPO_URL=...          adres repozytorium          (domyslnie: HTTPS)
#      REPO_BRANCH=main      galaz do pobrania
#      ADMIN_USER=admin      konto z dostepem po SSH
#      UCZELNIA=wsi.edu.pl   domena przepuszczana przez filtr DNS
#      REBOOT=1              zrestartuj maszyne na koncu
#
#  Przyklad:
#      GAME=glowna REBOOT=1 bash bootstrap-debian.sh
#
# ============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
#  Konfiguracja
# ---------------------------------------------------------------------------

# Domyslnie HTTPS, a nie SSH. Swiezo zainstalowana maszyna nie ma klucza
# zarejestrowanego na GitHubie, wiec "git@github.com:..." zakonczylby sie
# bledem "Permission denied (publickey)". Adres SSH ma sens dopiero wtedy,
# gdy wczesniej wgrasz na maszyne klucz wdrozeniowy (deploy key).
REPO_URL="${REPO_URL:-https://github.com/Pabelox/H3M-M-Web.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"

GAME="${GAME:-karty}"
KIOSK_USER="kiosk"
ADMIN_USER="${ADMIN_USER:-${SUDO_USER:-admin}}"
UCZELNIA="${UCZELNIA:-wsi.edu.pl}"

SRC_DIR="/opt/kiosk-src"
WEB_ROOT="/var/www/kiosk"
OB_DIR="/home/$KIOSK_USER/.config/openbox"

STEP=0
TOTAL=12

log()  { STEP=$((STEP + 1)); printf '\n\033[1;33m[%d/%d] %s\033[0m\n' "$STEP" "$TOTAL" "$*"; }
info() { printf '       %s\n' "$*"; }
warn() { printf '\033[1;31m  [!]  %s\033[0m\n' "$*"; }
die()  { warn "$*"; exit 1; }

# ---------------------------------------------------------------------------
#  Kontrola wstepna
# ---------------------------------------------------------------------------

[ "$(id -u)" -eq 0 ] || die "Uruchom jako root:  su -  albo  sudo bash $0"

if [ -r /etc/os-release ]; then
    . /etc/os-release
    case "${ID:-}${ID_LIKE:-}" in
        *debian*) : ;;
        *) warn "System to '${PRETTY_NAME:-nieznany}', a skrypt pisany pod Debiana." ;;
    esac
    info "System: ${PRETTY_NAME:-nieznany}"
fi

case "$GAME" in
    karty)  BUILD_SUBDIR="karty"; GAME_NAME="Karty Bitwy" ;;
    glowna) BUILD_SUBDIR=".";     GAME_NAME="Bitwa o Przełęcz" ;;
    *) die "Nieznana gra: '$GAME' (dozwolone: karty, glowna)" ;;
esac

if [ "$ADMIN_USER" = "root" ]; then
    warn "ADMIN_USER=root - dostep po SSH nie zostanie ograniczony."
fi

info "Gra:            $GAME_NAME ($GAME)"
info "Repozytorium:   $REPO_URL (galaz $REPO_BRANCH)"
info "Konto admina:   $ADMIN_USER"
info "Domena uczelni: $UCZELNIA"

case "$REPO_URL" in
    git@*|ssh://*)
        warn "Adres SSH - upewnij sie, ze maszyna ma klucz przyjety przez GitHuba,"
        warn "inaczej klonowanie zakonczy sie bledem 'Permission denied (publickey)'."
        ;;
esac

# ---------------------------------------------------------------------------
log "Instalacja pakietow"
# ---------------------------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

# Uwaga na --no-install-recommends przy Xorg: bez jawnego podania sterownikow
# wejscia maszyna wstaje z obrazem, ale bez reakcji na mysz i klawiature,
# czyli w gre nie da sie zagrac.
apt-get install -y --no-install-recommends \
    xorg xserver-xorg-input-all xserver-xorg-video-all \
    openbox lightdm lightdm-gtk-greeter \
    chromium \
    unclutter x11-xserver-utils \
    nginx dnsmasq \
    git curl ca-certificates rsync openssh-server \
    procps psmisc

# Dodatki gosca VirtualBoksa dopasowuja rozdzielczosc do okna. Pakiet lezy
# w sekcji contrib, ktorej minimalna instalacja Debiana czesto nie ma
# wlaczonej - dlatego proba jest nieblokujaca.
if apt-get install -y --no-install-recommends virtualbox-guest-x11 2>/dev/null; then
    info "Zainstalowano dodatki gosca VirtualBoksa."
else
    info "Pominieto dodatki gosca (brak sekcji contrib) - rozdzielczosc bedzie stala."
fi

# ---------------------------------------------------------------------------
log "Node.js do zbudowania gry"
# ---------------------------------------------------------------------------
node_major() { node -pe 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

apt-get install -y --no-install-recommends nodejs npm 2>/dev/null || true

if [ "$(node_major)" -lt 18 ]; then
    info "Node z repozytorium Debiana jest za stary - instaluje Node 20 z NodeSource."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

command -v node >/dev/null || die "Nie udalo sie zainstalowac Node.js."
info "Node $(node -v), npm $(npm -v)"

# ---------------------------------------------------------------------------
log "Pobranie kodu gry"
# ---------------------------------------------------------------------------
if [ -d "$SRC_DIR/.git" ]; then
    info "Repozytorium juz jest - pobieram najnowsza wersje."
    git -C "$SRC_DIR" remote set-url origin "$REPO_URL"
    git -C "$SRC_DIR" fetch --depth 1 origin "$REPO_BRANCH"
    git -C "$SRC_DIR" reset --hard "origin/$REPO_BRANCH"
else
    rm -rf "$SRC_DIR"
    git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$SRC_DIR"
fi

[ -f "$SRC_DIR/$BUILD_SUBDIR/package.json" ] \
    || die "W repozytorium nie ma $BUILD_SUBDIR/package.json - sprawdz parametr GAME."

# ---------------------------------------------------------------------------
log "Budowanie gry"
# ---------------------------------------------------------------------------
(
    cd "$SRC_DIR/$BUILD_SUBDIR"
    # npm ci jest szybsze i wierne package-lock.json, ale wymaga jego obecnosci
    # i zgodnosci z package.json - stad zapasowe npm install.
    if [ -f package-lock.json ]; then
        npm ci --no-audit --no-fund || npm install --no-audit --no-fund
    else
        npm install --no-audit --no-fund
    fi
    npm run build
)

BUILD_DIR="$SRC_DIR/$BUILD_SUBDIR/dist"
[ -f "$BUILD_DIR/index.html" ] || die "Budowanie nie wyprodukowalo $BUILD_DIR/index.html"
info "Zbudowano: $(du -sh "$BUILD_DIR" | cut -f1)"

# ---------------------------------------------------------------------------
log "Publikacja gry"
# ---------------------------------------------------------------------------
install -d -m 0755 "$WEB_ROOT"
rsync -a --delete "$BUILD_DIR/" "$WEB_ROOT/"
chown -R www-data:www-data "$WEB_ROOT"

cat > /etc/nginx/sites-available/kiosk <<'NGINX'
# Lokalny serwer gry. Zbudowana gra to moduly ES (<script type="module">),
# ktore przegladarka blokuje przy otwarciu z file:// przez polityke CORS -
# dlatego pliki musza isc po HTTP. nginx dziala bez internetu i wstaje
# automatycznie razem z systemem.
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /var/www/kiosk;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 30d;
        access_log off;
    }

    # W kiosku nikt nie zobaczy strony bledu - lepiej wrocic do gry.
    error_page 404 =200 /index.html;
    server_tokens off;
}
NGINX

ln -sf /etc/nginx/sites-available/kiosk /etc/nginx/sites-enabled/kiosk
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx >/dev/null
systemctl restart nginx

# ---------------------------------------------------------------------------
log "Konto uzytkownika kiosku"
# ---------------------------------------------------------------------------
if ! id "$KIOSK_USER" >/dev/null 2>&1; then
    # Celowo /bin/bash, a nie /usr/sbin/nologin: LightDM uruchamia sesje
    # graficzna przez powloke uzytkownika, wiec przy nologin automatyczne
    # logowanie konczy sie pustym ekranem. Dostep zdalny odcinamy zamiast
    # tego w konfiguracji SSH - efekt jest ten sam, a sesja dziala.
    adduser --disabled-password --gecos "Stacja demonstracyjna" \
            --shell /bin/bash "$KIOSK_USER"
fi
passwd -l "$KIOSK_USER" >/dev/null   # logowanie wylacznie automatyczne
info "Konto $KIOSK_USER gotowe."

# ---------------------------------------------------------------------------
log "Automatyczne logowanie (LightDM)"
# ---------------------------------------------------------------------------
cat > /etc/lightdm/lightdm.conf <<LIGHTDM
[Seat:*]
autologin-user=$KIOSK_USER
autologin-user-timeout=0
user-session=openbox
greeter-session=lightdm-gtk-greeter
allow-guest=false
greeter-hide-users=true
greeter-show-manual-login=false
LIGHTDM

# Na Debianie autologowanie wymaga przynaleznosci do grupy autologin.
getent group autologin >/dev/null || groupadd autologin
usermod -aG autologin "$KIOSK_USER"

systemctl enable lightdm >/dev/null
# Obraz terminalowy startuje w trybie tekstowym - przestawiamy na graficzny.
systemctl set-default graphical.target >/dev/null

# ---------------------------------------------------------------------------
log "Sesja Openboksa i blokada skrotow"
# ---------------------------------------------------------------------------
install -d -o "$KIOSK_USER" -g "$KIOSK_USER" -m 0755 "$OB_DIR"

# Pusta sekcja <keyboard> oznacza, ze Openbox nie zna ZADNEGO skrotu -
# Alt+F4, Alt+Tab, Ctrl+Alt+T i klawisz Super przestaja cokolwiek robic.
cat > "$OB_DIR/rc.xml" <<'RCXML'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <focus>
    <focusNew>yes</focusNew>
    <followMouse>no</followMouse>
  </focus>
  <theme>
    <name>Clearlooks</name>
    <keepBorder>no</keepBorder>
    <titleLayout></titleLayout>
  </theme>
  <desktops>
    <number>1</number>
    <firstdesk>1</firstdesk>
    <names><name>Kiosk</name></names>
    <popupTime>0</popupTime>
  </desktops>
  <margins><top>0</top><bottom>0</bottom><left>0</left><right>0</right></margins>
  <applications>
    <application class="*">
      <decor>no</decor>
      <maximized>yes</maximized>
      <fullscreen>yes</fullscreen>
      <skip_taskbar>yes</skip_taskbar>
    </application>
  </applications>
  <!-- PUSTA sekcja: zaden skrot klawiszowy nie jest obslugiwany. -->
  <keyboard>
  </keyboard>
  <!-- Brak kontekstu "Desktop" z akcja ShowMenu: klikniecie na pulpicie
       nie otwiera menu systemowego. -->
  <mouse>
    <dragThreshold>8</dragThreshold>
    <doubleClickTime>200</doubleClickTime>
  </mouse>
  <menu>
    <file>menu.xml</file>
    <showIcons>no</showIcons>
  </menu>
</openbox_config>
RCXML

# Domyslne menu Openboksa ma pozycje "Terminal emulator" i "Exit" - czyli
# gotowa ucieczke z kiosku. Zastepujemy je menu bez zadnej pozycji.
cat > "$OB_DIR/menu.xml" <<'MENUXML'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_menu xmlns="http://openbox.org/3.4/menu">
  <menu id="root-menu" label="Kiosk"></menu>
</openbox_menu>
MENUXML

cat > "$OB_DIR/autostart" <<'AUTOSTART'
# Bez wygaszacza i bez usypiania ekranu - stacja ma swiecic caly czas.
xset s off &
xset s noblank &
xset -dpms &

# Kursor jest potrzebny do gry (klika sie heksy), wiec chowa sie dopiero
# po 10 sekundach bezczynnosci i wraca przy pierwszym ruchu myszy.
unclutter -idle 10 -root &

/usr/local/bin/kiosk-chromium.sh &
AUTOSTART

chown -R "$KIOSK_USER:$KIOSK_USER" "/home/$KIOSK_USER/.config"

cat > /usr/local/bin/kiosk-chromium.sh <<'CHROMIUM'
#!/bin/bash
# Przegladarka w trybie kiosk wraz z nadzorem restartu.
set -u

URL="${KIOSK_URL:-http://localhost/}"
PROFILE="/home/kiosk/.config/chromium-kiosk"

# Na Debianie binarka nazywa sie "chromium"; pozostale nazwy sa na wypadek
# uruchomienia tego samego skryptu na innej dystrybucji.
find_browser() {
    for candidate in chromium chromium-browser /usr/bin/chromium \
                     /usr/bin/chromium-browser /snap/bin/chromium; do
        command -v "$candidate" >/dev/null 2>&1 && { command -v "$candidate"; return 0; }
    done
    return 1
}

BROWSER="$(find_browser)" || { echo "kiosk: brak przegladarki Chromium" >&2; exit 1; }

# Po twardym wylaczeniu maszyny Chromium pokazuje pasek "Przywroc strony",
# ktorego w kiosku nie da sie zamknac - kasujemy znacznik awaryjnego konca.
if [ -f "$PROFILE/Default/Preferences" ]; then
    sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/g' \
        "$PROFILE/Default/Preferences" 2>/dev/null || true
fi

while true; do
    "$BROWSER" \
        --kiosk \
        --user-data-dir="$PROFILE" \
        --start-fullscreen \
        --noerrdialogs \
        --disable-infobars \
        --disable-session-crashed-bubble \
        --disable-features=TranslateUI,Translate \
        --no-first-run \
        --disable-pinch \
        --overscroll-history-navigation=0 \
        --check-for-update-interval=31536000 \
        --password-store=basic \
        `# gra ma muzyke tla - bez tej flagi przegladarka zablokowalaby` \
        `# dzwiek do pierwszego klikniecia uzytkownika` \
        --autoplay-policy=no-user-gesture-required \
        ${KIOSK_EXTRA_FLAGS:-} \
        "$URL"

    # Gdyby przegladarka zostala zamknieta albo sie wysypala, uzytkownik
    # zobaczylby goly pulpit. Zamiast tego po sekundzie wraca gra.
    sleep 1
done
CHROMIUM
chmod 0755 /usr/local/bin/kiosk-chromium.sh

# W VirtualBoksie bez akceleracji proces GPU Chromium potrafi sie sypac.
# Flaga jest wstrzykiwana przez srodowisko sesji, wiec latwo ja zdjac.
install -d -m 0755 /etc/X11/Xsession.d
cat > /etc/X11/Xsession.d/95kiosk-flags <<'XFLAGS'
# Dodatkowe flagi przegladarki kiosku. Przy problemach z obrazem w maszynie
# wirtualnej odkomentuj ponizsza linie i zrestartuj maszyne.
# export KIOSK_EXTRA_FLAGS="--disable-gpu --disable-software-rasterizer"
XFLAGS

# ---------------------------------------------------------------------------
log "Blokady systemowe"
# ---------------------------------------------------------------------------
install -d -m 0755 /etc/X11/xorg.conf.d
cat > /etc/X11/xorg.conf.d/99-kiosk.conf <<'XORG'
# DontVTSwitch blokuje Ctrl+Alt+F1..F12 (ucieczke do konsoli tekstowej).
# DontZap blokuje Ctrl+Alt+Backspace (ubicie serwera X).
# Bez tych dwoch opcji tryb kiosk da sie obejsc dwoma skrotami.
Section "ServerFlags"
    Option "DontVTSwitch" "true"
    Option "DontZap"      "true"
    Option "BlankTime"    "0"
    Option "StandbyTime"  "0"
    Option "SuspendTime"  "0"
    Option "OffTime"      "0"
EndSection
XORG

# Ctrl+Alt+Del nie restartuje maszyny.
systemctl mask ctrl-alt-del.target >/dev/null 2>&1 || true

# Aktualizacje w tle nie moga przerwac pokazu.
systemctl disable --now unattended-upgrades >/dev/null 2>&1 || true
systemctl disable --now apt-daily.timer apt-daily-upgrade.timer >/dev/null 2>&1 || true

# Dostep zdalny tylko dla konta administracyjnego.
if id "$ADMIN_USER" >/dev/null 2>&1 && [ "$ADMIN_USER" != "root" ]; then
    install -d -m 0755 /etc/ssh/sshd_config.d
    cat > /etc/ssh/sshd_config.d/10-kiosk.conf <<SSHD
PermitRootLogin no
AllowUsers $ADMIN_USER
DenyUsers $KIOSK_USER
SSHD
    if sshd -t 2>/dev/null; then
        systemctl restart ssh
        info "SSH ograniczony do konta $ADMIN_USER."
    else
        rm -f /etc/ssh/sshd_config.d/10-kiosk.conf
        warn "Konfiguracja SSH nie przeszla testu - zostawiam ustawienia domyslne."
    fi
else
    warn "Brak konta '$ADMIN_USER' - pomijam ograniczenie SSH, zeby nie odciac dostepu."
fi

# ---------------------------------------------------------------------------
log "Narzedzia obslugi kiosku"
# ---------------------------------------------------------------------------

# Przelacznik filtrowania DNS. Filtr blokuje wszystko poza biala lista, wiec
# przy aktualizacji gry (github, rejestr npm) trzeba go na chwile zdjac.
cat > /usr/local/bin/kiosk-dns <<'DNSTOOL'
#!/bin/bash
# Wlacza albo wylacza filtrowanie DNS kiosku.
#   kiosk-dns off   - przepuszcza caly ruch (na czas aktualizacji)
#   kiosk-dns on    - przywraca biala liste
#   kiosk-dns stan  - pokazuje biezacy stan
#
# UWAGA: schowek jest POZA /etc/dnsmasq.d. Debian ma
# "conf-dir=/etc/dnsmasq.d/,.bak", czyli wczytuje z tego katalogu KAZDY plik
# poza koncowka .bak - samo dopisanie ".disabled" niczego by nie wylaczylo.
set -euo pipefail

FILTR=/etc/dnsmasq.d/20-kiosk-filter.conf
OTWARTY=/etc/dnsmasq.d/20-kiosk-open.conf
SCHOWEK=/etc/kiosk/20-kiosk-filter.conf

install -d -m 0755 /etc/kiosk

zastosuj() {
    dnsmasq --test >/dev/null 2>&1 || { echo "Bledna konfiguracja dnsmasq" >&2; exit 1; }
    systemctl restart dnsmasq
}

case "${1:-stan}" in
    off)
        [ -f "$FILTR" ] && mv "$FILTR" "$SCHOWEK"
        # Bez filtru potrzebny jest serwer nadrzedny, inaczej nic sie nie rozwiaze.
        printf 'server=1.1.1.1\nserver=8.8.8.8\n' > "$OTWARTY"
        zastosuj
        echo "Filtr DNS: WYLACZONY (caly ruch przepuszczany)"
        ;;
    on)
        rm -f "$OTWARTY"
        [ -f "$SCHOWEK" ] && mv "$SCHOWEK" "$FILTR"
        [ -f "$FILTR" ] || { echo "Brak pliku z filtrem: $FILTR" >&2; exit 1; }
        zastosuj
        echo "Filtr DNS: WLACZONY (biala lista)"
        ;;
    stan)
        if [ -f "$FILTR" ]; then echo "Filtr DNS: WLACZONY"; else echo "Filtr DNS: WYLACZONY"; fi
        ;;
    *) echo "Uzycie: kiosk-dns {on|off|stan}" >&2; exit 1 ;;
esac
DNSTOOL
chmod 0755 /usr/local/bin/kiosk-dns

# Aktualizacja gry z repozytorium - sama zdejmuje i przywraca filtr DNS.
cat > /usr/local/bin/kiosk-update <<UPDATE
#!/bin/bash
# Pobiera najnowsza wersje gry, buduje ja i podmienia na kiosku.
set -euo pipefail
[ "\$(id -u)" -eq 0 ] || { echo "Uruchom przez sudo." >&2; exit 1; }

echo "==> Zdejmuje filtr DNS na czas pobierania"
kiosk-dns off

trap 'echo "==> Przywracam filtr DNS"; kiosk-dns on' EXIT

cd "$SRC_DIR"
git fetch --depth 1 origin "$REPO_BRANCH"
git reset --hard "origin/$REPO_BRANCH"

cd "$SRC_DIR/$BUILD_SUBDIR"
if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund || npm install --no-audit --no-fund
else
    npm install --no-audit --no-fund
fi
npm run build

rsync -a --delete "$SRC_DIR/$BUILD_SUBDIR/dist/" "$WEB_ROOT/"
chown -R www-data:www-data "$WEB_ROOT"

echo "==> Restartuje przegladarke"
pkill -u $KIOSK_USER -f chromium || true
echo "==> Gotowe"
UPDATE
chmod 0755 /usr/local/bin/kiosk-update

# ---------------------------------------------------------------------------
log "Filtrowanie DNS (na koncu, po wszystkich pobraniach)"
# ---------------------------------------------------------------------------

# Debian zwykle nie ma systemd-resolved, ale gdy jest - trzyma port 53
# i dnsmasq nie wstanie ("Address already in use").
if systemctl list-unit-files 2>/dev/null | grep -q '^systemd-resolved\.service'; then
    install -d -m 0755 /etc/systemd/resolved.conf.d
    printf '[Resolve]\nDNSStubListener=no\n' > /etc/systemd/resolved.conf.d/kiosk.conf
    systemctl restart systemd-resolved 2>/dev/null || true
    info "Wylaczono nasluch systemd-resolved na porcie 53."
fi

# Debian wczytuje /etc/dnsmasq.d tylko wtedy, gdy w /etc/dnsmasq.conf jest
# aktywny wpis conf-dir. Gdyby go brakowalo, cala konfiguracja ponizej
# zostalaby zignorowana, a dnsmasq forwardowalby do /etc/resolv.conf,
# czyli sam do siebie.
if ! grep -qE '^[[:space:]]*conf-dir=/etc/dnsmasq\.d' /etc/dnsmasq.conf 2>/dev/null; then
    printf '\n# Kiosk: wczytaj konfiguracje z katalogu.\nconf-dir=/etc/dnsmasq.d/,.bak\n' \
        >> /etc/dnsmasq.conf
    info "Wlaczono conf-dir=/etc/dnsmasq.d w /etc/dnsmasq.conf."
fi

# Stary uklad zostawial plik z filtrem w katalogu pod nazwa .conf.disabled,
# ktory dnsmasq i tak wczytywal. Sprzatamy po nim.
rm -f /etc/dnsmasq.d/20-kiosk-filter.conf.disabled

cat > /etc/dnsmasq.d/10-kiosk-base.conf <<'DNSBASE'
# Podstawa: dnsmasq nasluchuje tylko lokalnie i nie czyta /etc/resolv.conf
# (inaczej zrobilaby sie petla, bo resolv.conf wskazuje na dnsmasq).
listen-address=127.0.0.1
bind-interfaces
no-resolv
domain-needed
bogus-priv
cache-size=1000

# Localhost musi sie rozwiazywac zawsze - to na nim stoi nginx z gra.
address=/localhost/127.0.0.1
DNSBASE

# W pliku bazowym CELOWO nie ma wpisu "server=" bez domeny. Domyslny serwer
# nadrzedny istnieje wylacznie wtedy, gdy filtr jest zdjety (plik
# 20-kiosk-open.conf tworzony przez "kiosk-dns off"). Dzieki temu przy
# wlaczonym filtrze nie ma czym rozwiazac nazwy spoza bialej listy - a gdyby
# plik z filtrem nie wszedl, awaria jest glosna zamiast cichej.
cat > /etc/dnsmasq.d/20-kiosk-filter.conf <<DNSFILTER
# --- CZARNA LISTA (domyslna) ---
# Kazda nazwa nieobjeta biala lista rozwiazuje sie na 0.0.0.0.
address=/#/0.0.0.0

# --- BIALA LISTA ---
# dnsmasq wybiera regule najbardziej szczegolowa, wiec wpisy server=
# maja pierwszenstwo przed ogolnym address=/#/.
server=/$UCZELNIA/1.1.1.1
server=/www.$UCZELNIA/1.1.1.1
DNSFILTER

rm -f /etc/dnsmasq.d/20-kiosk-open.conf
dnsmasq --test || die "Konfiguracja dnsmasq jest bledna."

# Na Debianie /etc/resolv.conf nadpisuje dhclient przy kazdym odnowieniu
# dzierzawy DHCP. "supersede" sprawia, ze sam wpisuje tam nasz resolwer.
if [ -f /etc/dhcp/dhclient.conf ] \
   && ! grep -q 'supersede domain-name-servers 127.0.0.1' /etc/dhcp/dhclient.conf; then
    printf '\n# Kiosk: caly ruch DNS przez lokalny dnsmasq.\nsupersede domain-name-servers 127.0.0.1;\n' \
        >> /etc/dhcp/dhclient.conf
    info "dhclient bedzie wpisywal 127.0.0.1 do /etc/resolv.conf."
fi

printf 'nameserver 127.0.0.1\noptions edns0 trust-ad\n' > /etc/resolv.conf

systemctl enable dnsmasq >/dev/null
systemctl restart dnsmasq

# ---------------------------------------------------------------------------
log "Weryfikacja"
# ---------------------------------------------------------------------------
fail=0
check() {
    if eval "$2" >/dev/null 2>&1; then
        printf '       [ OK ] %s\n' "$1"
    else
        printf '\033[1;31m       [BLAD] %s\033[0m\n' "$1"
        fail=1
    fi
}

check "konto $KIOSK_USER istnieje"          "id $KIOSK_USER"
check "LightDM wlaczony"                    "systemctl is-enabled lightdm"
check "domyslny cel: graphical"             "[ \"\$(systemctl get-default)\" = graphical.target ]"
check "autostart Openboksa na miejscu"      "[ -s $OB_DIR/autostart ]"
check "rc.xml bez skrotow klawiszowych"     "grep -q '<keyboard>' $OB_DIR/rc.xml"
check "menu Openboksa puste"                "! grep -q 'Terminal' $OB_DIR/menu.xml"
check "skrypt przegladarki wykonywalny"     "[ -x /usr/local/bin/kiosk-chromium.sh ]"
check "przegladarka Chromium obecna"        "command -v chromium || command -v chromium-browser"
check "blokada VT (DontVTSwitch)"           "grep -q DontVTSwitch /etc/X11/xorg.conf.d/99-kiosk.conf"
check "ctrl-alt-del zamaskowany"            "[ \"\$(systemctl is-enabled ctrl-alt-del.target 2>&1)\" = masked ]"
check "nginx dziala"                        "systemctl is-active nginx"
check "gra odpowiada na localhoscie"        "curl -fsS -o /dev/null http://localhost/"
check "gra ma pliki dzwiekowe"              "curl -fsS -o /dev/null http://localhost/assets/sfx/music.wav"
check "dnsmasq dziala"                      "systemctl is-active dnsmasq"
# getent ahostsv4 jest jednoznaczne (tylko IPv4) i nie zalezy od tego,
# czy system woli najpierw zapytac o AAAA.
check "konfiguracja dnsmasq poprawna"       "dnsmasq --test"
check "resolv.conf wskazuje na dnsmasq"     "grep -q '^nameserver 127.0.0.1' /etc/resolv.conf"
check "filtr DNS blokuje spoza listy"       "[ \"\$(getent ahostsv4 facebook.com 2>/dev/null | awk 'NR==1{print \$1}')\" = 0.0.0.0 ]"
check "biala lista przepuszcza $UCZELNIA"   "ip=\$(getent ahostsv4 $UCZELNIA 2>/dev/null | awk 'NR==1{print \$1}'); [ -n \"\$ip\" ] && [ \"\$ip\" != 0.0.0.0 ]"
check "narzedzie kiosk-update gotowe"       "[ -x /usr/local/bin/kiosk-update ]"

echo
if [ "$fail" -eq 0 ]; then
    printf '\033[1;32m===========================================================\033[0m\n'
    printf '\033[1;32m  Kiosk skonfigurowany: %s\033[0m\n' "$GAME_NAME"
    printf '\033[1;32m===========================================================\033[0m\n'
    cat <<PODSUMOWANIE

  Po restarcie maszyna wchodzi prosto w gre na pelnym ekranie.

  Przydatne polecenia (z konta $ADMIN_USER przez SSH):

      sudo kiosk-update        pobierz i wgraj najnowsza wersje gry
      sudo kiosk-dns off|on    zdejmij / przywroc filtr DNS
      sudo systemctl stop lightdm    tymczasowe wyjscie z kiosku

PODSUMOWANIE
    if [ "${REBOOT:-0}" = "1" ]; then
        echo "  Restartuje maszyne za 5 sekund (Ctrl+C przerywa)..."
        sleep 5
        reboot
    else
        echo "  Uruchom teraz:  sudo reboot"
        echo
    fi
else
    warn "Czesc kontroli nie przeszla - popraw powyzsze punkty przed restartem."
    exit 1
fi
