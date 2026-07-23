#!/usr/bin/env python3
"""Generate minimal valid PNG icons without external build dependencies."""
from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path


def png(size: int) -> bytes:
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            radius = max(abs(x - size / 2), abs(y - size / 2))
            color = (23, 105, 224, 255) if radius < size * 0.39 else (244, 247, 251, 0)
            row.extend(color)
        rows.append(bytes(row))
    def chunk(tag: bytes, value: bytes) -> bytes:
        return struct.pack(">I", len(value)) + tag + value + struct.pack(">I", zlib.crc32(tag + value) & 0xFFFFFFFF)
    header = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return header + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    output = Path(sys.argv[1])
    output.mkdir(parents=True, exist_ok=True)
    for size in (64, 256):
        (output / f"icon_{size}.png").write_bytes(png(size))

