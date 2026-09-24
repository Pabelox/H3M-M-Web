#!/bin/bash
# Uruchamia przegladarke w trybie kiosk i pilnuje, zeby dzialala.
# Plik instalowany jako /usr/local/bin/kiosk-chromium.sh
#
# Petla na koncu jest istotna dla bezpieczenstwa kiosku: gdyby przegladarka
# zostala zamknieta lub sie wysypala, uzytkownik zobaczylby goly pulpit
# Openboksa. Zamiast tego po sekundzie wraca pelnoekranowa gra.

set -u

URL="${KIOSK_URL:-http://localhost/}"
PROFILE="/home/kiosk/.config/chromium-kiosk"

# Na Ubuntu 22.04 "chromium-browser" to pakiet przejsciowy instalujacy snapa,
# wiec binarka ladujacy w roznych miejscach zaleznie od sposobu instalacji.
find_browser() {
    for candidate in chromium-browser chromium /snap/bin/chromium \
                     /usr/bin/chromium-browser /usr/bin/chromium; do
        if command -v "$candidate" >/dev/null 2>&1; then
            command -v "$candidate"
            return 0
        fi
    done
    return 1
}

BROWSER="$(find_browser)" || {
    echo "kiosk: nie znaleziono przegladarki Chromium" >&2
    exit 1
}

# Po twardym wylaczeniu maszyny Chromium pokazuje pasek "Przywroc strony".
# W kiosku nie ma jak go zamknac, wiec kasujemy znaczniki awaryjnego zamkniecia.
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
        --fast \
        --fast-start \
        --disable-pinch \
        --overscroll-history-navigation=0 \
        --disable-translate \
        --check-for-update-interval=31536000 \
        --password-store=basic \
        `# gra ma muzyke tla i efekty - bez tej flagi przegladarka` \
        `# zablokowalaby dzwiek do pierwszego klikniecia uzytkownika` \
        --autoplay-policy=no-user-gesture-required \
        "$URL"

    # Przegladarka zakonczyla dzialanie - dajemy chwile i wracamy do gry.
    sleep 1
done
