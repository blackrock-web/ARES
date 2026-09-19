#!/usr/bin/env bash
# ARES-Upgraded launcher (Linux / macOS)
set -e
cd "$(dirname "$0")"

echo "=============================================="
echo "  ARES-Upgraded — Linux launcher"
echo "=============================================="

PYTHON="${PYTHON:-python3}"
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  PYTHON=python
fi

echo "[1/3] Python: $($PYTHON --version 2>&1)"
echo "[2/3] Installing dependencies (if needed)…"
"$PYTHON" -m pip install -q -r requirements.txt

CMD="${1:-ui}"
shift || true

case "$CMD" in
  ui|dashboard|gradio)
    echo "[3/3] Starting Live UI on http://127.0.0.1:7860"
    echo "      Open that URL in your browser."
    exec "$PYTHON" main.py ui --port "${PORT:-7860}" "$@"
    ;;
  benchmark|bench)
  research|benchmark-research)
    echo "[3/3] Research validation benchmark…"
    exec "$PYTHON" main.py benchmark-research --n-images "${N_IMAGES:-15}" --resolution "${RES:-256}" "$@"
    ;;
  analyze)
    exec "$PYTHON" main.py analyze-results
    ;;
  report)
    exec "$PYTHON" main.py generate-report
    ;;
    echo "[3/3] Running CLI multi-model benchmark…"
    exec "$PYTHON" main.py benchmark "$@"
    ;;
  list|models)
    exec "$PYTHON" main.py list-models
    ;;
  train-hybrid)
    echo "[3/3] Pilot-training ARES-Hybrid-INN…"
    exec "$PYTHON" training/train_hybrid_inn.py --pilot --epochs "${EPOCHS:-3}" "$@"
    ;;
  train)
    echo "[3/3] Pilot-training ARES-Upgraded…"
    exec "$PYTHON" training/train_ares.py --pilot --epochs "${EPOCHS:-3}" "$@"
    ;;
  help|-h|--help)
    cat <<EOF
Usage: ./run_linux.sh [command]

  ui          Start Gradio live benchmark UI (default)
  benchmark   CLI full multi-model benchmark
  list        List registered models
  train       Pilot-train ARES-Upgraded CNN
  train-hybrid  Pilot-train ARES-Hybrid-INN
  help        Show this help

Examples:
  ./run_linux.sh
  ./run_linux.sh ui
  PORT=7861 ./run_linux.sh ui
  ./run_linux.sh benchmark
EOF
    ;;
  *)
    echo "Unknown command: $CMD  (try: ./run_linux.sh help)"
    exit 1
    ;;
esac
