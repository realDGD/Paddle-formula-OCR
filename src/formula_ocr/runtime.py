from __future__ import annotations

import asyncio
import json
import os
import signal
import shutil
import sys
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from .config import AppPaths, control_python
from .schemas import RuntimeProfile

PYPI_MIRROR_URL = "https://mirrors.aliyun.com/pypi/simple/"
PYPI_OFFICIAL_URL = "https://pypi.org/simple"
PADDLE_CPU_INDEX_URL = "https://www.paddlepaddle.org.cn/packages/stable/cpu/"
PADDLE_CUDA118_INDEX_URL = "https://www.paddlepaddle.org.cn/packages/stable/cu118/"
PADDLE_CUDA126_INDEX_URL = "https://www.paddlepaddle.org.cn/packages/stable/cu126/"
PADDLE_MODEL_SOURCE = "BOS"
CPU_RUNTIME_WHEELHOUSE_DIRECTORY = "runtime-wheelhouses/cpu"
INSTALL_LOG_LIMIT = 40
RUNTIME_MANIFEST_FILES = {
    RuntimeProfile.CPU: "cpu.txt",
    RuntimeProfile.CUDA118: "cuda118.txt",
    RuntimeProfile.CUDA126: "cuda126.txt",
}
GPU_RUNTIME_PROFILES = (RuntimeProfile.CUDA118, RuntimeProfile.CUDA126)


class RuntimeNotInstalledError(RuntimeError):
    pass


class RuntimeManager:
    """Manages independently installed Paddle runtime profiles.

    The control-plane Python process deliberately does not import Paddle. Each
    worker is launched with the selected profile's interpreter instead.
    """

    def __init__(self, paths: AppPaths):
        self.paths = paths
        self._install_lock = asyncio.Lock()
        self._install_task: asyncio.Task[None] | None = None
        self._install_process: asyncio.subprocess.Process | None = None
        self._install_progress: dict[str, object] = self._new_install_progress()

    @staticmethod
    def _timestamp() -> str:
        return datetime.now(UTC).isoformat()

    @staticmethod
    def _new_install_progress(profile: RuntimeProfile | None = None) -> dict[str, object]:
        return {
            "profile": profile.value if profile else None,
            "state": "idle",
            "phase": "等待开始。",
            "started_at": None,
            "updated_at": None,
            "logs": [],
            "result": None,
            "error": None,
        }

    def installation_status(self, profile: RuntimeProfile) -> dict[str, object]:
        if profile is RuntimeProfile.AUTO:
            raise ValueError("必须指定 CPU 或 CUDA 识别组件。")
        if self._install_progress["profile"] not in {None, profile.value}:
            progress = dict(self._install_progress)
            progress["logs"] = list(self._install_progress["logs"])
            return progress
        progress = dict(self._install_progress)
        progress["logs"] = list(self._install_progress["logs"])
        return progress

    def start_install(self, profile: RuntimeProfile) -> dict[str, object]:
        if profile is RuntimeProfile.AUTO:
            raise ValueError("必须指定 CPU 或 CUDA 识别组件。")
        if self._install_task and not self._install_task.done():
            if self._install_progress["profile"] == profile.value:
                return self.installation_status(profile)
            raise RuntimeError(f"{self._install_progress['profile']} 识别组件正在安装，请等待其完成。")
        self._install_progress = self._new_install_progress(profile)
        self._install_progress.update(
            {
                "state": "installing",
                "phase": "正在准备安装任务…",
                "started_at": self._timestamp(),
                "updated_at": self._timestamp(),
            }
        )
        self._install_task = asyncio.create_task(self._install_in_background(profile), name=f"formula-ocr-install-{profile.value}")
        return self.installation_status(profile)

    def cancel_install(self, profile: RuntimeProfile) -> dict[str, object]:
        """Stop the single active runtime installation, including its pip process."""
        if profile is RuntimeProfile.AUTO:
            raise ValueError("必须指定 CPU 或 CUDA 识别组件。")
        if not self._install_task or self._install_task.done():
            raise RuntimeError("当前没有可中断的识别组件安装任务。")
        active_profile = self._install_progress["profile"]
        if active_profile != profile.value:
            raise RuntimeError(f"当前正在安装 {active_profile}，不能中断 {profile.value}。")
        self._install_progress.update(
            {"state": "cancelling", "phase": "正在中断安装与下载…", "updated_at": self._timestamp()}
        )
        self._stop_install_process()
        self._install_task.cancel()
        return self.installation_status(profile)

    async def _install_in_background(self, profile: RuntimeProfile) -> None:
        try:
            result = await self.install(profile, report=self._record_install_progress)
        except asyncio.CancelledError:
            self._install_progress.update(
                {"state": "cancelled", "phase": "安装任务已中断。", "updated_at": self._timestamp()}
            )
            raise
        except Exception as exc:
            self._install_progress.update(
                {
                    "state": "failed",
                    "phase": "安装失败。",
                    "error": str(exc),
                    "updated_at": self._timestamp(),
                }
            )
            logger_message = f"{profile.value} runtime installation failed: {exc}"
            print(logger_message, file=sys.stderr)
        else:
            self._install_progress.update(
                {
                    "state": "succeeded",
                    "phase": "识别组件已安装并通过 Paddle 验证。",
                    "result": result,
                    "updated_at": self._timestamp(),
                }
            )

    def _record_install_progress(self, phase: str | None = None, line: str | None = None) -> None:
        if phase:
            self._install_progress["phase"] = phase
        if line:
            logs = self._install_progress["logs"]
            assert isinstance(logs, list)
            logs.append(line)
            del logs[:-INSTALL_LOG_LIMIT]
            if "Downloading" in line or "Collecting" in line or "Installing collected packages" in line:
                self._install_progress["phase"] = line
        self._install_progress["updated_at"] = self._timestamp()

    def profile_dir(self, profile: RuntimeProfile) -> Path:
        if profile is RuntimeProfile.AUTO:
            raise ValueError("auto is not an installable runtime")
        return self.paths.runtimes / profile.value

    @staticmethod
    def is_gpu_profile(profile: RuntimeProfile) -> bool:
        return profile in GPU_RUNTIME_PROFILES

    def manifest_for(self, profile: RuntimeProfile) -> Path:
        if profile is RuntimeProfile.AUTO:
            raise ValueError("auto is not an installable runtime")
        return self.paths.root / "runtime-manifests" / RUNTIME_MANIFEST_FILES[profile]

    def cpu_wheelhouse(self) -> Path:
        return self.paths.root / CPU_RUNTIME_WHEELHOUSE_DIRECTORY

    @staticmethod
    def download_sources() -> dict[str, str]:
        return {
            "python_runtime": "fnOS 内置 Python 3.12（不下载）",
            "cpu_paddle": "FPK 内置 CPU Paddle/PaddleOCR 离线 wheelhouse（不联网）",
            "cuda118_paddle": f"Paddle 官方 CUDA 11.8 源：{PADDLE_CUDA118_INDEX_URL}",
            "cuda126_paddle": f"Paddle 官方 CUDA 12.6 源：{PADDLE_CUDA126_INDEX_URL}",
            "cuda_paddleocr": f"阿里云 PyPI：{PYPI_MIRROR_URL}（失败时回退官方 PyPI）",
            "formula_models": "PaddlePaddle BOS（国内对象存储）",
        }

    @staticmethod
    def paddle_sources(profile: RuntimeProfile) -> tuple[tuple[str, str], ...]:
        if profile is RuntimeProfile.CPU:
            return ((PADDLE_CPU_INDEX_URL, "Paddle 官方 CPU 源"),)
        if profile is RuntimeProfile.CUDA118:
            return ((PADDLE_CUDA118_INDEX_URL, "Paddle 官方 CUDA 11.8 源"),)
        if profile is RuntimeProfile.CUDA126:
            return ((PADDLE_CUDA126_INDEX_URL, "Paddle 官方 CUDA 12.6 源"),)
        raise ValueError("auto is not an installable runtime")

    def interpreter_for(self, profile: RuntimeProfile) -> Path:
        path = self.profile_dir(profile) / "venv" / "bin" / "python"
        if not path.is_file():
            raise RuntimeNotInstalledError(f"{profile.value} 识别组件尚未安装。")
        return path

    def is_installed(self, profile: RuntimeProfile) -> bool:
        try:
            self.interpreter_for(profile)
            metadata = json.loads((self.profile_dir(profile) / "installed.json").read_text(encoding="utf-8"))
            current_manifest = self.manifest_for(profile).read_text(encoding="utf-8")
        except (RuntimeNotInstalledError, OSError, ValueError, AttributeError, json.JSONDecodeError):
            return False
        return (
            metadata.get("profile") == profile.value
            and metadata.get("verified_paddle") is True
            and metadata.get("manifest") == current_manifest
        )

    def installed_profiles(self) -> dict[str, bool]:
        return {
            profile.value: self.is_installed(profile)
            for profile in (RuntimeProfile.CPU, *GPU_RUNTIME_PROFILES)
        }

    def resolve(self, requested: RuntimeProfile) -> RuntimeProfile:
        if requested is not RuntimeProfile.AUTO:
            if not self.is_installed(requested):
                raise RuntimeNotInstalledError(f"{requested.value} 识别组件尚未完整安装。")
            return requested
        if self.installed_profiles()[RuntimeProfile.CUDA126.value]:
            return RuntimeProfile.CUDA126
        if self.installed_profiles()[RuntimeProfile.CUDA118.value]:
            return RuntimeProfile.CUDA118
        if not self.is_installed(RuntimeProfile.CPU):
            raise RuntimeNotInstalledError("CPU 识别组件尚未完整安装。")
        return RuntimeProfile.CPU

    def worker_environment(self, profile: RuntimeProfile) -> dict[str, str]:
        env = dict(os.environ)
        source_root = self.paths.root / "src"
        env["PYTHONPATH"] = str(source_root) + os.pathsep + env.get("PYTHONPATH", "")
        env["HOME"] = str(self.paths.home)
        env["XDG_CACHE_HOME"] = str(self.paths.cache / "xdg")
        env["TMPDIR"] = str(self.paths.temporary)
        env["PADDLE_HOME"] = str(self.paths.cache / "paddle")
        env["FORMULA_OCR_MODEL_DIR"] = str(self.paths.models)
        env["PADDLE_PDX_MODEL_SOURCE"] = env.get("PADDLE_PDX_MODEL_SOURCE", PADDLE_MODEL_SOURCE)
        env["PADDLE_PDX_CACHE_HOME"] = str(self.paths.models / "paddlex-cache")
        env["FORMULA_OCR_RUNTIME_PROFILE"] = profile.value
        for directory in (
            self.paths.home,
            self.paths.cache / "xdg",
            self.paths.cache / "paddle",
            self.paths.temporary,
            self.paths.models / "paddlex-cache",
        ):
            directory.mkdir(parents=True, exist_ok=True)
        return env

    async def diagnose(self, profile: RuntimeProfile) -> dict[str, object]:
        """Probe Paddle in a short-lived runtime process.

        This intentionally does not use the long-lived inference worker.  A
        diagnosis must stay useful even when a previous worker is unhealthy or
        was started before an application upgrade.
        """
        interpreter = self.interpreter_for(profile)
        probe = (
            "import json, paddle; "
            "compiled = paddle.is_compiled_with_cuda(); "
            "count = paddle.device.cuda.device_count() if compiled else 0; "
            "devices = ([{'index': index, 'name': paddle.device.cuda.get_device_name(index), "
            "'compute_capability': list(paddle.device.cuda.get_device_capability(index))} "
            "for index in range(count)] if compiled else []); "
            "data = {'paddle_version': paddle.__version__, "
            "'compiled_with_cuda': compiled, "
            "'cuda_available': bool(count), "
            "'device_count': count, "
            "'cuda_version': paddle.version.cuda() if compiled else None, "
            "'cudnn_version': paddle.version.cudnn() if compiled else None, "
            "'devices': devices}; "
            "print('FORMULA_OCR_DIAGNOSTICS=' + json.dumps(data))"
        )
        process = await asyncio.create_subprocess_exec(
            str(interpreter),
            "-c",
            probe,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=self.worker_environment(profile),
        )
        output, _ = await process.communicate()
        text = (output or b"").decode("utf-8", errors="replace")
        if process.returncode != 0:
            raise RuntimeError(text[-4000:] or "Paddle 识别组件检测失败。")
        for line in reversed(text.splitlines()):
            if not line.startswith("FORMULA_OCR_DIAGNOSTICS="):
                continue
            diagnostics = json.loads(line.removeprefix("FORMULA_OCR_DIAGNOSTICS="))
            if isinstance(diagnostics, dict):
                return diagnostics
        raise RuntimeError(f"Paddle 未返回可解析的检测结果。\n{text[-4000:]}")

    async def install(
        self,
        profile: RuntimeProfile,
        report: Callable[[str | None, str | None], None] | None = None,
    ) -> dict[str, str]:
        if profile is RuntimeProfile.AUTO:
            raise ValueError("必须指定 CPU 或 CUDA 识别组件。")
        async with self._install_lock:
            profile_dir = self.profile_dir(profile)
            profile_dir.mkdir(parents=True, exist_ok=True)
            venv_dir = profile_dir / "venv"
            (profile_dir / "installed.json").unlink(missing_ok=True)
            manifest = self.manifest_for(profile)
            if not manifest.is_file():
                raise FileNotFoundError(manifest)
            self._report(report, "正在创建隔离 Python 环境…")
            await self._run_with_progress(
                [control_python(), "-m", "venv", str(venv_dir)], cwd=profile_dir, report=report
            )
            interpreter = venv_dir / "bin" / "python"
            packages = self._packages_from_manifest(manifest)
            paddle_package = next(item for item in packages if item.startswith("paddlepaddle"))
            paddleocr_package = next(item for item in packages if item.startswith("paddleocr"))
            if profile is RuntimeProfile.CPU:
                source = await self._install_cpu_offline(interpreter, profile_dir, manifest, report=report)
                paddle_source = source
                paddleocr_source = source
            else:
                paddle_source = await self._install_with_fallback(
                    interpreter,
                    profile_dir,
                    package=paddle_package,
                    sources=self.paddle_sources(profile),
                    force_reinstall=True,
                    report=report,
                )
                paddleocr_source = await self._install_with_fallback(
                    interpreter,
                    profile_dir,
                    package=paddleocr_package,
                    sources=(
                        (PYPI_MIRROR_URL, "阿里云 PyPI 镜像"),
                        (PYPI_OFFICIAL_URL, "官方 PyPI"),
                    ),
                    report=report,
                )
                for package in packages:
                    if package in {paddle_package, paddleocr_package}:
                        continue
                    await self._install_with_fallback(
                        interpreter,
                        profile_dir,
                        package=package,
                        sources=(
                            (PYPI_MIRROR_URL, "阿里云 PyPI 镜像"),
                            (PYPI_OFFICIAL_URL, "官方 PyPI"),
                        ),
                        report=report,
                    )
            self._report(report, "正在验证 Paddle 导入与 CUDA 构建信息…")
            await self._verify_paddle(interpreter, profile_dir, profile, report=report)
            metadata = {
                "profile": profile.value,
                "interpreter": str(interpreter),
                "manifest": manifest.read_text(encoding="utf-8"),
                "sources": {"paddle": paddle_source, "paddleocr": paddleocr_source},
                "verified_paddle": True,
            }
            (profile_dir / "installed.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
            return metadata

    @staticmethod
    def _packages_from_manifest(manifest: Path) -> list[str]:
        return [
            line.strip()
            for line in manifest.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]

    async def _install_cpu_offline(
        self,
        interpreter: Path,
        cwd: Path,
        manifest: Path,
        report: Callable[[str | None, str | None], None] | None = None,
    ) -> str:
        wheelhouse = self.cpu_wheelhouse()
        if not wheelhouse.is_dir() or not any(wheelhouse.glob("*.whl")):
            raise RuntimeError("CPU 离线识别组件缺失，请重新安装 Paddle Formula OCR。")
        self._report(report, "正在从 FPK 内置离线 wheelhouse 安装 CPU 识别组件…")
        await self._run_with_progress(
            [
                str(interpreter),
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                "--no-cache-dir",
                "--no-index",
                "--find-links",
                str(wheelhouse),
                "--force-reinstall",
                "--requirement",
                str(manifest),
            ],
            cwd=cwd,
            report=report,
        )
        return "FPK 内置 CPU 离线 wheelhouse"

    async def _install_with_fallback(
        self,
        interpreter: Path,
        cwd: Path,
        *,
        package: str,
        sources: tuple[tuple[str, str], ...],
        force_reinstall: bool = False,
        report: Callable[[str | None, str | None], None] | None = None,
    ) -> str:
        errors: list[str] = []
        for index_url, label in sources:
            self._report(report, f"正在从 {label} 安装 {package}…")
            command = [
                str(interpreter),
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                "--no-cache-dir",
                "--timeout",
                "180",
                "--retries",
                "5",
                "--progress-bar",
                "off",
                "--index-url",
                index_url,
            ]
            if force_reinstall:
                command.append("--force-reinstall")
            command.append(package)
            try:
                await self._run_with_progress(command, cwd=cwd, report=report)
                return label
            except RuntimeError as exc:
                errors.append(f"{label}（{index_url}）：{exc}")
        raise RuntimeError(f"安装 {package} 失败。\n" + "\n\n".join(errors))

    async def _verify_paddle(
        self,
        interpreter: Path,
        cwd: Path,
        profile: RuntimeProfile,
        report: Callable[[str | None, str | None], None] | None = None,
    ) -> None:
        verification = (
            "import paddle; "
            "assert paddle.__version__; "
            "print('Paddle verified:', paddle.__version__, "
            "paddle.is_compiled_with_cuda())"
        )
        try:
            await self._run_with_progress(
                [str(interpreter), "-c", verification],
                cwd=cwd,
                env=self.worker_environment(profile),
                report=report,
            )
        except RuntimeError as exc:
            raise RuntimeError(
                f"{profile.value} 识别组件安装后无法导入 Paddle；"
                "已保留未完成状态，可再次点击安装以强制重装。\n"
                f"{exc}"
            ) from exc

    async def remove(self, profile: RuntimeProfile) -> None:
        if profile is RuntimeProfile.AUTO:
            raise ValueError("不能移除 auto。")
        async with self._install_lock:
            directory = self.profile_dir(profile)
            if directory.exists():
                shutil.rmtree(directory)

    @staticmethod
    def _report(
        report: Callable[[str | None, str | None], None] | None,
        phase: str | None = None,
        line: str | None = None,
    ) -> None:
        if report:
            report(phase, line)

    def _stop_install_process(self) -> None:
        process = self._install_process
        if not process or process.returncode is not None:
            return
        try:
            # Every installer command starts a separate process group, so pip
            # and any helper it launches are stopped together on fnOS/Linux.
            os.killpg(process.pid, signal.SIGTERM)
        except (AttributeError, ProcessLookupError):
            process.terminate()

    async def _run_with_progress(
        self,
        command: list[str],
        *,
        cwd: Path,
        env: dict[str, str] | None = None,
        report: Callable[[str | None, str | None], None] | None = None,
    ) -> None:
        if report is None:
            if env is None:
                await self._run(command, cwd=cwd)
            else:
                await self._run(command, cwd=cwd, env=env)
            return
        callback = lambda line: self._report(report, line=line)
        if env is None:
            await self._run(command, cwd=cwd, on_output=callback)
        else:
            await self._run(command, cwd=cwd, env=env, on_output=callback)

    async def _run(
        self,
        command: list[str],
        cwd: Path,
        env: dict[str, str] | None = None,
        on_output: Callable[[str], None] | None = None,
    ) -> None:
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
            start_new_session=True,
        )
        self._install_process = process
        try:
            assert process.stdout is not None
            output_lines: list[bytes] = []
            while line := await process.stdout.readline():
                output_lines.append(line)
                if on_output:
                    on_output(line.decode("utf-8", errors="replace").rstrip())
            await process.wait()
            if process.returncode != 0:
                message = b"".join(output_lines).decode("utf-8", errors="replace")[-4000:]
                raise RuntimeError(message or "识别组件安装失败。")
        except asyncio.CancelledError:
            self._stop_install_process()
            await process.wait()
            raise
        finally:
            if self._install_process is process:
                self._install_process = None
