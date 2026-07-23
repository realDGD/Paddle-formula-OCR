from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class AppPaths:
    root: Path
    data: Path
    static: Path

    @property
    def database(self) -> Path:
        return self.data / "app.db"

    @property
    def uploads(self) -> Path:
        return self.data / "jobs"

    @property
    def logs(self) -> Path:
        return self.data / "logs"

    @property
    def models(self) -> Path:
        return self.data / "models"

    @property
    def runtimes(self) -> Path:
        return self.data / "runtimes"

    @property
    def cache(self) -> Path:
        return self.data / "cache"

    @property
    def home(self) -> Path:
        return self.data / "home"

    @property
    def temporary(self) -> Path:
        return self.data / "tmp"


def paths_from_environment() -> AppPaths:
    package_root = Path(__file__).resolve().parents[2]
    root = Path(os.environ.get("FORMULA_OCR_APP_ROOT", package_root)).resolve()
    data = Path(os.environ.get("FORMULA_OCR_DATA_DIR", root / "data")).resolve()
    static = Path(os.environ.get("FORMULA_OCR_STATIC_DIR", root / "static")).resolve()
    for directory in (
        data,
        data / "jobs",
        data / "logs",
        data / "models",
        data / "runtimes",
        data / "cache",
        data / "home",
        data / "tmp",
    ):
        directory.mkdir(parents=True, exist_ok=True)
    return AppPaths(root=root, data=data, static=static)


def control_python() -> str:
    return os.environ.get("FORMULA_OCR_CONTROL_PYTHON", sys.executable)
