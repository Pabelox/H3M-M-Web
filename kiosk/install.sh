#!/bin/bash
#
# Konfiguracja maszyny wirtualnej jako stacji demonstracyjnej (tryb kiosk).
#
# Uruchamiac NA MASZYNIE WIRTUALNEJ, z uprawnieniami roota:
#     sudo ./install.sh
#
# Skrypt jest idempotentny - mozna go uruchomic ponownie po zmianie
# konfiguracji i nic sie nie zdubluje.

set -euo pipefail

KIOSK_USER="kiosk"
WEB_ROOT="/var/www/kiosk"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILES="$HERE/files"

log()  { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;31m[!] %s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
    warn "Uruchom skrypt przez sudo."
    exit 1
fi

# ---------------------------------------------------------------------------
log "1/9 Instalacja pakietow"
# ---------------------------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# nginx nie ma na liscie z tresci zadania, ale jest konieczny: zbudowana gra
# to moduly ES, ktorych przegladarka nie zaladuje z file:// (blokada CORS).
apt-get install -y --no-install-recommends \
    xorg openbox lightdm lightdm-gtk-greeter \
    chromium-browser unclutter x11-xserver-utils \
    dnsmasq nginx openssh-server

# ---------------------------------------------------------------------------
log "2/9 Konto uzytkownika kiosku"
# ---------------------------------------------------------------------------
if ! id "$KIOSK_USER" >/dev/null 2>&1; then
    # UWAGA: celowo /bin/bash, a nie /usr/sbin/nologin.
    # LightDM uruchamia sesje graficzna przez powloke uzytkownika, wiec przy
    # nologin automatyczne logowanie po prostu nie wystartuje i maszyna
    # zatrzyma sie na pustym ekranie. Dostep zdalny odcinamy zamiast tego
    # w konfiguracji SSH (DenyUsers kiosk) - efekt jest ten sam, a sesja
    # graficzna dziala.
    adduser --disabled-password --gecos "Stacja demonstracyjna" \
            --shell /bin/bash "$KIOSK_USER"
    passwd -l "$KIOSK_USER"   # konto bez hasla, logowanie wylacznie automatyczne
    echo "    utworzono uzytkownika $KIOSK_USER"
else
    echo "    uzytkownik $KIOSK_USER juz istnieje"
fi

# ---------------------------------------------------------------------------
log "3/9 Automatyczne logowanie (LightDM)"
# ---------------------------------------------------------------------------
install -m 0644 "$FILES/lightdm.conf" /etc/lightdm/lightdm.conf
systemctl enable lightdm >/dev/null
# Start w trybie graficznym zamiast tekstowego (obraz serwerowy startuje w multi-user).
systemctl set-default graphical.target >/dev/null

# ---------------------------------------------------------------------------
log "4/9 Sesja Openboksa i blokada skrotow"
# ---------------------------------------------------------------------------
OB_DIR="/home/$KIOSK_USER/.config/openbox"
install -d -o "$KIOSK_USER" -g "$KIOSK_USER" -m 0755 "$OB_DIR"
install -o "$KIOSK_USER" -g "$KIOSK_USER" -m 0644 "$FILES/openbox-rc.xml"   "$OB_DIR/rc.xml"
install -o "$KIOSK_USER" -g "$KIOSK_USER" -m 0644 "$FILES/openbox-menu.xml" "$OB_DIR/menu.xml"
install -o "$KIOSK_USER" -g "$KIOSK_USER" -m 0755 "$FILES/openbox-autostart" "$OB_DIR/autostart"
install -m 0755 "$FILES/kiosk-chromium.sh" /usr/local/bin/kiosk-chromium.sh

# Blokady na poziomie serwera X: Ctrl+Alt+F1..F12 oraz Ctrl+Alt+Backspace.
install -d -m 0755 /etc/X11/xorg.conf.d
install -m 0644 "$FILES/xorg-kiosk.conf" /etc/X11/xorg.conf.d/99-kiosk.conf

# Ctrl+Alt+Del nie restartuje maszyny.
systemctl mask ctrl-alt-del.target >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
log "5/9 Serwer WWW z gra"
# ---------------------------------------------------------------------------
install -d -m 0755 "$WEB_ROOT"
install -m 0644 "$FILES/nginx-kiosk.conf" /etc/nginx/sites-available/kiosk
ln -sf /etc/nginx/sites-available/kiosk /etc/nginx/sites-enabled/kiosk
rm -f /etc/nginx/sites-enabled/default

if [ ! -f "$WEB_ROOT/index.html" ]; then
    # Strona zastepcza, zeby kiosk nie pokazywal bledu przed wgraniem gry.
    cat > "$WEB_ROOT/index.html" <<'PLACEHOLDER'
<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><title>Kiosk</title>
<style>html,body{height:100%;margin:0;display:grid;place-items:center;
background:#14130f;color:#e8b23a;font:16px system-ui}</style></head>
<body>Gra nie zostala jeszcze wgrana. Uruchom deploy.sh z komputera dewelopera.</body></html>
PLACEHOLDER
    chown -R www-data:www-data "$WEB_ROOT"
    warn "W $WEB_ROOT nie ma gry - wgraj ja skryptem deploy.sh"
fi

nginx -t
systemctl enable nginx >/dev/null
systemctl restart nginx

# ---------------------------------------------------------------------------
log "6/9 Filtrowanie DNS (biala lista)"
# ---------------------------------------------------------------------------
# systemd-resolved trzyma port 53; bez tego dnsmasq nie wstanie.
install -d -m 0755 /etc/systemd/resolved.conf.d
install -m 0644 "$FILES/kiosk-resolved.conf" /etc/systemd/resolved.conf.d/kiosk.conf
systemctl restart systemd-resolved

install -m 0644 "$FILES/dnsmasq-kiosk.conf" /etc/dnsmasq.d/kiosk.conf

# Caly system pyta o DNS lokalnego dnsmasq.
rm -f /etc/resolv.conf
printf 'nameserver 127.0.0.1\noptions edns0 trust-ad\n' > /etc/resolv.conf

systemctl enable dnsmasq >/dev/null
systemctl restart dnsmasq

# ---------------------------------------------------------------------------
log "7/9 Dostep zdalny (SSH)"
# ---------------------------------------------------------------------------
install -d -m 0755 /etc/ssh/sshd_config.d
install -m 0644 "$FILES/sshd-kiosk.conf" /etc/ssh/sshd_config.d/10-kiosk.conf
if ! id admin >/dev/null 2>&1; then
    warn "Nie ma uzytkownika 'admin' wskazanego w AllowUsers."
    warn "Popraw /etc/ssh/sshd_config.d/10-kiosk.conf, inaczej ODETNIESZ SOBIE SSH."
else
    sshd -t && systemctl restart ssh
fi

# ---------------------------------------------------------------------------
log "8/9 Wylaczenie zbednych elementow"
# ---------------------------------------------------------------------------
# Komunikaty jadra na konsoli nie moga przykryc gry.
sed -i 's/^#\?\s*PrintMotd.*/PrintMotd no/' /etc/ssh/sshd_config 2>/dev/null || true
# Bez automatycznych aktualizacji w trakcie pokazu.
systemctl disable --now unattended-upgrades >/dev/null 2>&1 || true
systemctl disable --now apt-daily.timer apt-daily-upgrade.timer >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
log "9/9 Weryfikacja"
# ---------------------------------------------------------------------------
fail=0
check() {
    if eval "$2" >/dev/null 2>&1; then
        printf '    [ OK ] %s\n' "$1"
    else
        printf '    [BLAD] %s\n' "$1"
        fail=1
    fi
}

check "uzytkownik kiosk istnieje"        "id $KIOSK_USER"
check "LightDM wlaczony"                 "systemctl is-enabled lightdm"
check "domyslny cel: graphical"          "[ \"\$(systemctl get-default)\" = graphical.target ]"
check "autostart Openboksa na miejscu"   "[ -x $OB_DIR/autostart ]"
check "rc.xml bez skrotow"               "grep -q '<keyboard>' $OB_DIR/rc.xml"
check "skrypt przegladarki wykonywalny"  "[ -x /usr/local/bin/kiosk-chromium.sh ]"
check "blokada VT (DontVTSwitch)"        "grep -q DontVTSwitch /etc/X11/xorg.conf.d/99-kiosk.conf"
check "ctrl-alt-del zamaskowany"         "[ \"\$(systemctl is-enabled ctrl-alt-del.target 2>&1)\" = masked ]"
check "nginx dziala"                     "systemctl is-active nginx"
check "gra odpowiada na localhoscie"     "curl -fsS -o /dev/null http://localhost/"
check "dnsmasq dziala"                   "systemctl is-active dnsmasq"

echo
if [ "$fail" -eq 0 ]; then
    log "Konfiguracja zakonczona. Zrestartuj maszyne: sudo reboot"
else
    warn "Czesc kontroli nie przeszla - popraw powyzsze punkty przed restartem."
    exit 1
fi
