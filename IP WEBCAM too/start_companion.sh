#!/usr/bin/env bash
# Ceova AI Vision - Local Camera Companion Service
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR/backend"

echo "======================================================================"
echo "Starting Ceova Local Camera Companion Service..."
echo "======================================================================"

python3 run_companion.py || python run_companion.py
