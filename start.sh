#!/usr/bin/env bash
#
# start.sh - Launch the Markdown Viewer Flask app
#
#   ./start.sh                run in the foreground (banner + Ctrl+C to stop)
#   ./start.sh --background   run detached: no terminal window needed, logs to
#                             md-viewer.log, opens your browser, and keeps
#                             running after the launching window is closed.
#                             (this is what the md-viewer.desktop launcher uses)
#   ./start.sh --stop         stop a running background instance
#                             (this is what stop-md-viewer.desktop uses)
#
set -euo pipefail

cd "$(dirname "$0")"

# Defaults (override by exporting before running, or editing here)
HOST="${FLASK_HOST:-127.0.0.1}"
PORT="${FLASK_PORT:-5000}"
PYTHON="${PYTHON:-python3}"

URL="http://${HOST}:${PORT}"
LOGFILE="$(pwd)/md-viewer.log"
PIDFILE="$(pwd)/md-viewer.pid"

# --- Parse arguments ------------------------------------------------------
BACKGROUND=0
STOP=0
for arg in "$@"; do
    case "$arg" in
        -b|--background) BACKGROUND=1 ;;
        -k|--stop)       STOP=1 ;;
    esac
done
[ "${MDV_BACKGROUND:-0}" = "1" ] && BACKGROUND=1

# Show a desktop notification if one is available (there's no terminal when
# launched by double-click), otherwise just print to stdout/log.
notify() {
    echo "$1"
    command -v notify-send >/dev/null 2>&1 && notify-send "Markdown Viewer" "$1" || true
}

# --- Stop mode: kill a running background instance ------------------------
if [ "$STOP" = "1" ]; then
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then
        pid="$(cat "$PIDFILE")"
        kill "$pid" 2>/dev/null || true
        rm -f "$PIDFILE"
        notify "Stopped (PID $pid)."
    else
        rm -f "$PIDFILE" 2>/dev/null || true
        notify "Not running."
    fi
    exit 0
fi

# Open the browser once the server is accepting connections (best effort).
open_browser() {
    command -v xdg-open >/dev/null 2>&1 || return 0
    (
        set +e
        for _ in $(seq 1 40); do
            if (exec 3<>"/dev/tcp/${HOST}/${PORT}") 2>/dev/null; then
                exec 3>&- 3<&-
                break
            fi
            sleep 0.25
        done
        xdg-open "$URL" >/dev/null 2>&1
    ) &
}

# --- Background mode: relaunch detached, then hand control back -----------
# The re-launched copy sets MDV_DETACHED=1 and falls through to the normal
# foreground path below, but with no controlling terminal and output logged.
if [ "$BACKGROUND" = "1" ] && [ "${MDV_DETACHED:-0}" != "1" ]; then
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then
        notify "Already running (PID $(cat "$PIDFILE")). Opening ${URL}"
        open_browser
        exit 0
    fi
    MDV_DETACHED=1 setsid "$0" "$@" </dev/null >>"$LOGFILE" 2>&1 &
    open_browser
    notify "Starting at ${URL}"
    exit 0
fi

cat <<'BANNER'
  __  __ ____   __     ___
 |  \/  |  _ \  \ \   / (_) _____      _____ _ __
 | |\/| | | | |  \ \ / /| |/ _ \ \ /\ / / _ \ '__|
 | |  | | |_| |   \ V / | |  __/\ V  V /  __/ |
 |_|  |_|____/     \_/  |_|\___| \_/\_/ \___|_|
BANNER

echo
echo "  Markdown Viewer - Flask app for browsing & rendering markdown"
echo "  -----------------------------------------------------------"
echo "  Host    : ${HOST}"
echo "  Port    : ${PORT}"
echo "  URL     : ${URL}"
echo "  Python  : $(${PYTHON} --version 2>&1)"
echo "  Logs    : security.log"
echo

if [ -z "${SECRET_KEY:-}" ]; then
    echo "  [!] SECRET_KEY not set - a random key will be generated"
    echo "      (sessions won't persist across restarts)"
    echo
fi

export FLASK_HOST="${HOST}"
export FLASK_PORT="${PORT}"

echo $$ > "$PIDFILE"

if [ "${MDV_DETACHED:-0}" = "1" ]; then
    echo "  Started in background (PID $$)."
    echo "  Stop it with:  kill $$    (or: kill \$(cat md-viewer.pid))"
    echo
else
    echo "  Starting server... (Ctrl+C to stop)"
    echo
fi

exec "${PYTHON}" app.py
