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
    transient: Path | None = None

    @property
    def database(self) -> Path:
        return self.data / "app.db"

    @property
    def uploads(self) -> Path:
        return self.temporary / "jobs"

    @property
    def legacy_uploads(self) -> Path:
        """Upload directory used before job inputs became transient."""
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
        return self.transient or self.data / "tmp"


def paths_from_environment() -> AppPaths:
    package_root = Path(__file__).resolve().parents[2]
    root = Path(os.environ.get("FORMULA_OCR_APP_ROOT", package_root)).resolve()
    data = Path(os.environ.get("FORMULA_OCR_DATA_DIR", root / "data")).resolve()
    static = Path(os.environ.get("FORMULA_OCR_STATIC_DIR", root / "static")).resolve()
    transient = Path(os.environ.get("FORMULA_OCR_TEMP_DIR", data / "tmp")).resolve()
    for directory in (
        data,
        data / "logs",
        data / "models",
        data / "runtimes",
        data / "cache",
        data / "home",
        transient,
        transient / "jobs",
    ):
        directory.mkdir(parents=True, exist_ok=True)
    # Job inputs may contain sensitive material and are only shared with the
    # worker process running as the same application user.
    (transient / "jobs").chmod(0o700)
    return AppPaths(root=root, data=data, static=static, transient=transient)


def control_python() -> str:
    return os.environ.get("FORMULA_OCR_CONTROL_PYTHON", sys.executable)


def configured_api_server_port(data_dir: Path | None = None) -> int:
    """Read the fnOS-owned API port, preferring its live config file."""
    raw: str | None = None
    if data_dir is not None:
        try:
            for line in (data_dir / "env").read_text(encoding="utf-8").splitlines():
                key, separator, value = line.partition("=")
                if separator and key in {"FORMULA_OCR_API_PORT", "TRIM_SERVICE_PORT"}:
                    raw = value.strip()
        except OSError:
            pass
    raw = raw or (
        os.environ.get("FORMULA_OCR_API_PORT")
        or os.environ.get("TRIM_SERVICE_PORT")
        or os.environ.get("service_port")
        or "8504"
    )
    try:
        port = int(raw)
    except (TypeError, ValueError):
        return 8504
    return port if 1024 <= port <= 65535 else 8504


def _cgroup_cpu_limit() -> int | None:
    """Return the Linux cgroup CPU quota as a whole-thread limit."""
    candidates = (
        (Path("/sys/fs/cgroup/cpu.max"), None),
        (
            Path("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"),
            Path("/sys/fs/cgroup/cpu/cpu.cfs_period_us"),
        ),
    )
    for quota_path, period_path in candidates:
        try:
            if period_path is None:
                quota_text, period_text = quota_path.read_text(encoding="utf-8").split()[:2]
                if quota_text == "max":
                    continue
                quota, period = int(quota_text), int(period_text)
            else:
                quota = int(quota_path.read_text(encoding="utf-8").strip())
                period = int(period_path.read_text(encoding="utf-8").strip())
            if quota > 0 and period > 0:
                return max(1, quota // period)
        except (OSError, ValueError):
            continue
    return None


def available_cpu_count() -> int:
    """Detect CPUs available to this process, including fnOS/cgroup limits."""
    detected: list[int] = []
    host_count = os.cpu_count()
    if host_count:
        detected.append(host_count)
    try:
        affinity_count = len(os.sched_getaffinity(0))
        if affinity_count:
            detected.append(affinity_count)
    except (AttributeError, OSError):
        pass
    cgroup_limit = _cgroup_cpu_limit()
    if cgroup_limit:
        detected.append(cgroup_limit)
    return max(1, min(min(detected) if detected else 1, 64))


def resolve_cpu_threads(configured: int) -> int:
    """Resolve 0 (automatic) and clamp manual values to available CPUs."""
    available = available_cpu_count()
    if configured <= 0:
        return available
    return max(1, min(configured, available))
