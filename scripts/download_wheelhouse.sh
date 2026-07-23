#!/bin/bash
set -Eeuo pipefail

# Download only the wheels required by fnOS x86 (CPython 3.12).  The resulting
# directory is bundled into the FPK, so install_init never needs network access.
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WHEELHOUSE_DIR="$ROOT_DIR/vendor/wheelhouse"

mkdir -p "$WHEELHOUSE_DIR"
python3 -m pip download \
  --dest "$WHEELHOUSE_DIR" \
  --only-binary=:all: \
  --platform manylinux_2_17_x86_64 \
  --implementation cp \
  --python-version 3.12 \
  --abi cp312 \
  --requirement "$ROOT_DIR/requirements-control.txt"

echo "已准备离线 wheelhouse：$WHEELHOUSE_DIR"
