#!/usr/bin/env bash
echo "======================================================================"
echo "Starting Ceova Local Camera Companion Service..."
echo "======================================================================"

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR/backend" || exit 1

if command -v python3 &>/dev/null; then
    python3 run_companion.py
elif command -v python &>/dev/null; then
    python run_companion.py
else
    echo "[ERROR] Python 3 not found on system PATH."
    exit 1
fi
