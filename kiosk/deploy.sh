#!/bin/bash
#
# Wgrywa zbudowana gre na maszyne kiosku.
# Uruchamiac Z KOMPUTERA DEWELOPERA (Git Bash na Windowsie tez zadziala):
#
#     ./kiosk/deploy.sh karty 192.168.0.42
#     ./kiosk/deploy.sh glowna 192.168.0.42 admin
#
# Pierwszy argument wybiera gre: "karty" albo "glowna".

set -euo pipefail

GAME="${1:-karty}"
HOST="${2:-}"
USER_NAME="${3:-admin}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "$HOST" ]; then
    echo "Uzycie: $0 <karty|glowna> <adres-ip-maszyny> [uzytkownik]" >&2
    exit 1
fi

case "$GAME" in
    karty)  SRC_DIR="$ROOT/karty" ;;
    glowna) SRC_DIR="$ROOT" ;;
    *) echo "Nieznana gra: $GAME (dozwolone: karty, glowna)" >&2; exit 1 ;;
esac

echo "==> Budowanie gry: $GAME"
( cd "$SRC_DIR" && npm run build )

if [ ! -f "$SRC_DIR/dist/index.html" ]; then
    echo "Budowanie nie wyprodukowalo dist/index.html" >&2
    exit 1
fi

echo "==> Kopiowanie na $USER_NAME@$HOST"
# Katalog posredni w /tmp, bo /var/www nalezy do roota, a scp loguje sie
# jako zwykly uzytkownik.
ssh "$USER_NAME@$HOST" 'rm -rf /tmp/kiosk-dist && mkdir -p /tmp/kiosk-dist'
scp -r "$SRC_DIR/dist/." "$USER_NAME@$HOST:/tmp/kiosk-dist/"

echo "==> Podmiana zawartosci i restart przegladarki"
ssh "$USER_NAME@$HOST" 'sudo rsync -a --delete /tmp/kiosk-dist/ /var/www/kiosk/ \
    && sudo chown -R www-data:www-data /var/www/kiosk \
    && rm -rf /tmp/kiosk-dist \
    && sudo pkill -u kiosk -f chromium || true'

echo "==> Gotowe. Kiosk sam wznowi przegladarke z nowa wersja gry."
