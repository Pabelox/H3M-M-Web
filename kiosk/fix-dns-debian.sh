#!/bin/bash
#
# Naprawa filtrowania DNS na maszynie skonfigurowanej wcześniejszą wersją
# bootstrap-debian.sh. Usuwa dwie usterki:
#
#   1. "kiosk-dns off" nic nie wylaczal - plik chowany byl pod nazwa
#      20-kiosk-filter.conf.disabled, a Debian ma
#      "conf-dir=/etc/dnsmasq.d/,.bak", wiec wczytuje z tego katalogu KAZDY
#      plik poza koncowka .bak.
#
#   2. Plik bazowy zawieral bezwarunkowy "server=1.1.1.1". Domyslny serwer
#      nadrzedny istnial takze przy wlaczonym filtrze, wiec gdy plik z filtrem
#      nie wszedl, wszystko rozwiazywalo sie normalnie - awaria byla cicha.
#
# Uruchomienie na maszynie kiosku, jako root:
#     sudo bash fix-dns-debian.sh

set -euo pipefail

UCZELNIA="${UCZELNIA:-wsi.edu.pl}"

[ "$(id -u)" -eq 0 ] || { echo "Uruchom przez sudo." >&2; exit 1; }

echo "==> 1/5  Upewniam sie, ze dnsmasq w ogole czyta /etc/dnsmasq.d"
if ! grep -qE '^[[:space:]]*conf-dir=/etc/dnsmasq\.d' /etc/dnsmasq.conf 2>/dev/null; then
    printf '\n# Kiosk: wczytaj konfiguracje z katalogu.\nconf-dir=/etc/dnsmasq.d/,.bak\n' \
        >> /etc/dnsmasq.conf
    echo "    dopisano conf-dir do /etc/dnsmasq.conf"
else
    echo "    conf-dir juz aktywny"
fi

echo "==> 2/5  Sprzatam po starym ukladzie plikow"
rm -f /etc/dnsmasq.d/20-kiosk-filter.conf.disabled
rm -f /etc/dnsmasq.d/20-kiosk-open.conf
install -d -m 0755 /etc/kiosk

echo "==> 3/5  Zapisuje konfiguracje bez domyslnego serwera nadrzednego"
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

# CELOWO brak wpisu "server=" bez domeny. Serwer nadrzedny istnieje wylacznie
# przy zdjetym filtrze (plik 20-kiosk-open.conf tworzony przez "kiosk-dns off").
cat > /etc/dnsmasq.d/20-kiosk-filter.conf <<DNSFILTER
# --- CZARNA LISTA (domyslna) ---
address=/#/0.0.0.0

# --- BIALA LISTA ---
server=/$UCZELNIA/1.1.1.1
server=/www.$UCZELNIA/1.1.1.1
DNSFILTER

echo "==> 4/5  Podmieniam przelacznik kiosk-dns"
cat > /usr/local/bin/kiosk-dns <<'DNSTOOL'
#!/bin/bash
# Wlacza albo wylacza filtrowanie DNS kiosku.
#   kiosk-dns off | on | stan
#
# Schowek jest POZA /etc/dnsmasq.d, bo dnsmasq wczytuje z tego katalogu
# kazdy plik poza koncowka .bak - samo dopisanie ".disabled" nie wystarcza.
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

echo "==> 5/5  Restart i weryfikacja"
printf 'nameserver 127.0.0.1\noptions edns0 trust-ad\n' > /etc/resolv.conf
dnsmasq --test
systemctl restart dnsmasq
sleep 1

blok=$(getent ahostsv4 facebook.com 2>/dev/null | awk 'NR==1{print $1}')
biala=$(getent ahostsv4 "$UCZELNIA" 2>/dev/null | awk 'NR==1{print $1}')

echo
echo "    facebook.com  -> ${blok:-<brak odpowiedzi>}   (oczekiwane: 0.0.0.0)"
echo "    $UCZELNIA -> ${biala:-<brak odpowiedzi>}   (oczekiwane: prawdziwy adres)"
echo

if [ "$blok" = "0.0.0.0" ] && [ -n "$biala" ] && [ "$biala" != "0.0.0.0" ]; then
    echo "    [ OK ] Filtr DNS dziala poprawnie."
else
    echo "    [BLAD] Filtr nadal nie dziala. Zbierz diagnostyke:"
    echo "           cat /etc/resolv.conf; ls -la /etc/dnsmasq.d/; grep -n conf-dir /etc/dnsmasq.conf"
    echo "           journalctl -u dnsmasq -n 30 --no-pager"
    exit 1
fi
