#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/dist/paddle-formula-ocr"
MATHJAX_DIR="$ROOT_DIR/node_modules/mathjax/es5"
MATHLIVE_DIR="$ROOT_DIR/node_modules/mathlive"
WHEELHOUSE_DIR="$ROOT_DIR/vendor/wheelhouse"
CPU_RUNTIME_WHEELHOUSE_DIR="$ROOT_DIR/vendor/cpu-runtime-wheelhouse"
ICON_ASSET_DIR="$ROOT_DIR/assets/icons"
EDITOR_BUNDLE="$ROOT_DIR/static/vendor/codemirror/latex-editor.js"

if [ ! -f "$MATHJAX_DIR/tex-chtml.js" ]; then
  echo "缺少本地 MathJax 资源。请先执行：npm install" >&2
  exit 1
fi

if [ ! -f "$MATHLIVE_DIR/mathlive.min.js" ] || [ ! -f "$MATHLIVE_DIR/mathlive-fonts.css" ]; then
  echo "缺少本地 MathLive 资源。请先执行：npm install" >&2
  exit 1
fi

if [ ! -x "$ROOT_DIR/node_modules/.bin/esbuild" ]; then
  echo "缺少本地 CodeMirror 构建工具。请先执行：npm install" >&2
  exit 1
fi

"$ROOT_DIR/node_modules/.bin/esbuild" "$ROOT_DIR/frontend/latex-editor.js" \
  --bundle \
  --minify \
  --format=iife \
  --platform=browser \
  --target=es2020 \
  --outfile="$EDITOR_BUNDLE"

if [ ! -d "$WHEELHOUSE_DIR" ] || ! find "$WHEELHOUSE_DIR" -maxdepth 1 -type f \( -name '*.whl' -o -name '*.tar.gz' \) -print -quit | grep -q .; then
  echo "缺少 Linux x86_64 / Python 3.12 离线 wheelhouse。请执行：bash scripts/download_wheelhouse.sh" >&2
  exit 1
fi

if [ ! -d "$CPU_RUNTIME_WHEELHOUSE_DIR" ] || ! find "$CPU_RUNTIME_WHEELHOUSE_DIR" -maxdepth 1 -type f -name '*.whl' -print -quit | grep -q .; then
  echo "缺少 CPU 离线运行时 wheelhouse。请执行：bash scripts/download_cpu_runtime_wheelhouse.sh" >&2
  exit 1
fi

if [ ! -f "$ICON_ASSET_DIR/icon_64.png" ] || [ ! -f "$ICON_ASSET_DIR/icon_256.png" ]; then
  echo "缺少应用图标资源：$ICON_ASSET_DIR/icon_64.png 和 icon_256.png" >&2
  exit 1
fi

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/app/server" "$OUT_DIR/app/ui/images"
cp -R "$ROOT_DIR/fnos-package/." "$OUT_DIR/"
cp -R "$ROOT_DIR/src" "$ROOT_DIR/static" "$ROOT_DIR/runtime-manifests" "$OUT_DIR/app/server/"
cp "$ROOT_DIR/requirements-control.txt" "$ROOT_DIR/pyproject.toml" "$OUT_DIR/app/server/"
cp -R "$WHEELHOUSE_DIR" "$OUT_DIR/app/server/wheelhouse"
mkdir -p "$OUT_DIR/app/server/runtime-wheelhouses"
cp -R "$CPU_RUNTIME_WHEELHOUSE_DIR" "$OUT_DIR/app/server/runtime-wheelhouses/cpu"
mkdir -p "$OUT_DIR/app/server/static/vendor/mathjax"
cp -R "$MATHJAX_DIR/." "$OUT_DIR/app/server/static/vendor/mathjax/"
mkdir -p "$OUT_DIR/app/server/static/vendor/mathlive/fonts"
cp "$MATHLIVE_DIR/mathlive.min.js" "$MATHLIVE_DIR/mathlive-fonts.css" "$OUT_DIR/app/server/static/vendor/mathlive/"
cp -R "$MATHLIVE_DIR/fonts/." "$OUT_DIR/app/server/static/vendor/mathlive/fonts/"
find "$OUT_DIR/app/server/src" -type d \( -name '__pycache__' -o -name '*.egg-info' \) -prune -exec rm -rf {} +

cp "$ICON_ASSET_DIR/icon_64.png" "$OUT_DIR/app/ui/images/icon_64.png"
cp "$ICON_ASSET_DIR/icon_256.png" "$OUT_DIR/app/ui/images/icon_256.png"
cp "$OUT_DIR/app/ui/images/icon_64.png" "$OUT_DIR/ICON.PNG"
cp "$OUT_DIR/app/ui/images/icon_256.png" "$OUT_DIR/ICON_256.PNG"
chmod +x "$OUT_DIR/cmd/"*

echo "已生成 FPK 目录：$OUT_DIR"
echo "在目标环境安装 fnpack 后执行：cd $OUT_DIR && fnpack build"
