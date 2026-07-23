#!/bin/bash
set -euo pipefail

echo "== 系统架构 =="
uname -m
if [ "$(uname -m)" != "x86_64" ]; then
  echo "首版 FPK 仅支持 x86 架构。" >&2
  exit 2
fi

echo "== Python 运行时 =="
PYTHON_BIN=/var/apps/python312/target/bin/python3
if [ -x "$PYTHON_BIN" ]; then
  "$PYTHON_BIN" --version
else
  echo "缺少 /var/apps/python312/target/bin/python3" >&2
  exit 3
fi

echo "== NVIDIA 设备 =="
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi --query-gpu=name,driver_version,memory.total,compute_cap --format=csv,noheader
  echo "检测到 nvidia-smi。CUDA Worker 仍必须在应用安装后通过真实公式识别测试。"
else
  echo "未检测到 nvidia-smi；CPU Worker 仍可使用。"
fi

echo "== 磁盘空间 =="
df -h "${TRIM_PKGVAR:-/var/apps}" 2>/dev/null || df -h .

