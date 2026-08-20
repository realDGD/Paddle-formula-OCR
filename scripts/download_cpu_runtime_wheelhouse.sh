#!/bin/bash
set -Eeuo pipefail

# Prepare Linux x86_64 / CPython 3.12 wheels for the built-in CPU runtime.
# Paddle's official PyPI release is used because Paddle's dedicated CPU index
# does not expose candidates during cross-platform wheel download. PaddleOCR
# and its transitive dependencies come from Aliyun's PyPI mirror.
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WHEELHOUSE_DIR="$ROOT_DIR/vendor/cpu-runtime-wheelhouse"
PADDLE_INDEX="https://pypi.org/simple"
PYPI_INDEX="https://mirrors.aliyun.com/pypi/simple/"

mkdir -p "$WHEELHOUSE_DIR"

python3 -m pip download \
  --dest "$WHEELHOUSE_DIR" \
  --only-binary=:all: \
  --platform manylinux1_x86_64 \
  --implementation cp \
  --python-version 3.12 \
  --abi cp312 \
  --no-deps \
  --index-url "$PADDLE_INDEX" \
  paddlepaddle==3.3.0

python3 -m pip download \
  --dest "$WHEELHOUSE_DIR" \
  --only-binary=:all: \
  --platform manylinux_2_17_x86_64 \
  --implementation cp \
  --python-version 3.12 \
  --abi cp312 \
  --index-url "$PYPI_INDEX" \
  paddleocr==3.5.0 \
  'paddlex[ocr]==3.5.2' \
  'protobuf>=3.20.2' \
  opt_einsum==3.3.0 \
  networkx \
  'safetensors>=0.6.0' \
  'tokenizers>=0.19' \
  'ftfy>=6.0'

echo "已准备 CPU 离线运行时 wheelhouse：$WHEELHOUSE_DIR"
