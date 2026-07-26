#!/usr/bin/env bash
#
# start.sh - Launch the Markdown Viewer Flask app
#
set -euo pipefail

cd "$(dirname "$0")"

# Defaults (override by exporting before running, or editing here)
HOST="${FLASK_HOST:-127.0.0.1}"
PORT="${FLASK_PORT:-5000}"
PYTHON="${PYTHON:-python3}"

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
echo "  URL     : http://${HOST}:${PORT}"
echo "  Python  : $(${PYTHON} --version 2>&1)"
echo "  Logs    : security.log"
echo

if [ -z "${SECRET_KEY:-}" ]; then
    echo "  [!] SECRET_KEY not set - a random key will be generated"
    echo "      (sessions won't persist across restarts)"
    echo
fi

echo "  Starting server... (Ctrl+C to stop)"
echo

export FLASK_HOST="${HOST}"
export FLASK_PORT="${PORT}"

exec "${PYTHON}" app.py
