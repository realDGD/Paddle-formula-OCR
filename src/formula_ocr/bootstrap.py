from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import UTC, datetime

from .config import AppPaths
from .fixtures import ensure_smoke_formula
from .queue import JobQueue
from .runtime import RuntimeManager
from .schemas import RuntimeProfile
from .store import Store


class BootstrapManager:
    """Background first-run setup: runtime, model download, then a real OCR test."""

    def __init__(self, paths: AppPaths, runtimes: RuntimeManager, queue: JobQueue, store: Store) -> None:
        self.paths = paths
        self.runtimes = runtimes
        self.queue = queue
        self.store = store
        self._task: asyncio.Task[None] | None = None
        self._progress: dict[str, object] = self._new_progress()

    @staticmethod
    def _timestamp() -> str:
        return datetime.now(UTC).isoformat()

    @staticmethod
    def _new_progress() -> dict[str, object]:
        return {"state": "idle", "phase": "等待开始。", "profiles": [], "logs": [], "result": None, "error": None}

    async def nvidia_info(self) -> dict[str, object]:
        try:
            process = await asyncio.create_subprocess_exec(
                "nvidia-smi",
                "--query-gpu=name,driver_version",
                "--format=csv,noheader",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
        except FileNotFoundError:
            return {"available": False, "reason": "未找到 nvidia-smi；未安装或未加载英伟达显卡驱动。", "gpus": []}
        output, _ = await process.communicate()
        text = (output or b"").decode("utf-8", errors="replace").strip()
        if process.returncode != 0 or not text:
            return {"available": False, "reason": text or "英伟达显卡驱动不可用。", "gpus": []}
        gpus = [line.strip() for line in text.splitlines() if line.strip()]
        return {"available": bool(gpus), "reason": None, "gpus": gpus}

    async def plan(self) -> dict[str, object]:
        return {"nvidia": await self.nvidia_info(), "runtimes": self.runtimes.installed_profiles()}

    def status(self) -> dict[str, object]:
        result = dict(self._progress)
        result["logs"] = list(self._progress["logs"])
        return result

    def start(self, profiles: list[RuntimeProfile], model_name: str) -> dict[str, object]:
        profiles = list(dict.fromkeys(profiles))
        if not profiles or any(profile is RuntimeProfile.AUTO for profile in profiles):
            raise ValueError("至少选择一个可安装的识别组件。")
        if self._task and not self._task.done():
            raise RuntimeError("一键安装正在进行，请等待其完成。")
        self._progress = self._new_progress()
        self._progress.update({"state": "running", "phase": "正在创建后台安装任务…", "profiles": [item.value for item in profiles]})
        self._task = asyncio.create_task(self._run(profiles, model_name), name="formula-ocr-bootstrap")
        return self.status()

    def _report(self, phase: str | None = None, line: str | None = None) -> None:
        if phase:
            self._progress["phase"] = phase
        if line:
            logs = self._progress["logs"]
            assert isinstance(logs, list)
            logs.append(line)
            del logs[:-60]

    async def _run(self, profiles: list[RuntimeProfile], model_name: str) -> None:
        try:
            results: list[dict[str, object]] = []
            for profile in profiles:
                if not self.runtimes.is_installed(profile):
                    self._report(f"正在后台安装 {profile.value} 识别组件…")
                    await self.runtimes.install(profile, report=self._report)
                else:
                    self._report(f"{profile.value} 识别组件已安装，跳过下载。")
                self._report(f"正在检测 {profile.value} 识别组件…")
                diagnostics = await self.runtimes.diagnose(profile)
                if self.runtimes.is_gpu_profile(profile) and not diagnostics.get("cuda_available"):
                    raise RuntimeError(f"{profile.value} 未检测到可用 NVIDIA CUDA 设备。")
                self._report(f"正在下载模型并执行 {profile.value} 真实识别测试…")
                fixture = ensure_smoke_formula(self.paths.data / "fixtures" / "smoke_formula.png")
                smoke = await self.queue.smoke_runtime(profile, model_name, fixture)
                if not str(smoke.get("latex_raw", "")).strip():
                    raise RuntimeError(f"{profile.value} 真实识别测试未返回 LaTeX。")
                results.append({"profile": profile.value, "diagnostics": diagnostics, "smoke_test": smoke})
            self._progress.update({"state": "succeeded", "phase": "识别组件、模型下载与真实识别测试已完成。", "result": results})
        except Exception as exc:
            self._progress.update({"state": "failed", "phase": "一键安装失败。", "error": str(exc)})
