from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from .runtime import RuntimeManager
from .schemas import JobStatus, RuntimeProfile

logger = logging.getLogger(__name__)
StatusCallback = Callable[[JobStatus], Awaitable[None]]


class WorkerSupervisor:
    """Owns one long-lived, killable inference subprocess."""

    def __init__(self, runtimes: RuntimeManager):
        self.runtimes = runtimes
        self._process: asyncio.subprocess.Process | None = None
        self._profile: RuntimeProfile | None = None
        self._reader_task: asyncio.Task[None] | None = None
        self._stderr_task: asyncio.Task[None] | None = None
        self._ready = asyncio.Event()
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}
        self._callbacks: dict[str, StatusCallback] = {}
        self._lock = asyncio.Lock()

    async def recognize(
        self,
        *,
        profile: RuntimeProfile,
        job_id: str,
        image_path: Path,
        model_name: str,
        cpu_threads: int,
        on_status: StatusCallback,
    ) -> dict[str, Any]:
        async with self._lock:
            await self._ensure_started(profile)
            if self._process is None or self._process.stdin is None:
                raise RuntimeError("推理 Worker 未启动。")
            future: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
            self._pending[job_id] = future
            self._callbacks[job_id] = on_status
            device = "gpu:0" if self.runtimes.is_gpu_profile(profile) else "cpu"
            self._process.stdin.write(
                (json.dumps(
                    {
                        "action": "recognize",
                        "job_id": job_id,
                        "image_path": str(image_path),
                        "model_name": model_name,
                        "device": device,
                        "cpu_threads": cpu_threads,
                    },
                    ensure_ascii=False,
                ) + "\n").encode()
            )
            await self._process.stdin.drain()
        try:
            return await future
        finally:
            self._pending.pop(job_id, None)
            self._callbacks.pop(job_id, None)

    async def diagnose(self, profile: RuntimeProfile) -> dict[str, Any]:
        return await self._request(profile, {"action": "diagnose"}, timeout=30)

    async def prepare(self, profile: RuntimeProfile, model_name: str, cpu_threads: int) -> dict[str, Any]:
        return await self._request(
            profile,
            {
                "action": "prepare",
                "model_name": model_name,
                "device": "gpu:0" if self.runtimes.is_gpu_profile(profile) else "cpu",
                "cpu_threads": cpu_threads,
            },
            timeout=900,
        )

    async def smoke(self, profile: RuntimeProfile, model_name: str, image_path: Path, cpu_threads: int) -> dict[str, Any]:
        return await self._request(
            profile,
            {
                "action": "smoke",
                "model_name": model_name,
                "image_path": str(image_path),
                "device": "gpu:0" if self.runtimes.is_gpu_profile(profile) else "cpu",
                "cpu_threads": cpu_threads,
            },
            timeout=900,
        )

    async def _request(self, profile: RuntimeProfile, payload: dict[str, Any], *, timeout: int) -> dict[str, Any]:
        async with self._lock:
            await self._ensure_started(profile)
            if self._process is None or self._process.stdin is None:
                raise RuntimeError("推理 Worker 未启动。")
            request_id = f"request-{uuid.uuid4()}"
            future: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
            self._pending[request_id] = future
            payload = {**payload, "request_id": request_id}
            self._process.stdin.write((json.dumps(payload) + "\n").encode())
            await self._process.stdin.drain()
        try:
            return await asyncio.wait_for(future, timeout=timeout)
        finally:
            self._pending.pop(request_id, None)

    async def restart(self) -> None:
        async with self._lock:
            await self._stop_locked()

    async def close(self) -> None:
        await self.restart()

    async def _ensure_started(self, profile: RuntimeProfile) -> None:
        if self._process and self._process.returncode is None and self._profile is profile:
            return
        await self._stop_locked()
        interpreter = self.runtimes.interpreter_for(profile)
        self._ready.clear()
        self._process = await asyncio.create_subprocess_exec(
            str(interpreter),
            "-m",
            "formula_ocr.worker",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=self.runtimes.worker_environment(profile),
        )
        self._profile = profile
        self._reader_task = asyncio.create_task(self._read_stdout(), name="formula-ocr-worker-stdout")
        self._stderr_task = asyncio.create_task(self._read_stderr(), name="formula-ocr-worker-stderr")
        try:
            await asyncio.wait_for(self._ready.wait(), timeout=20)
        except TimeoutError as exc:
            await self._stop_locked()
            raise RuntimeError("推理 Worker 启动超时。") from exc

    async def _stop_locked(self) -> None:
        process = self._process
        self._process = None
        self._profile = None
        if process and process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=10)
            except TimeoutError:
                process.kill()
                await process.wait()
        for task in (self._reader_task, self._stderr_task):
            if task:
                task.cancel()
        self._reader_task = None
        self._stderr_task = None
        error = RuntimeError("推理 Worker 已重启。")
        for future in self._pending.values():
            if not future.done():
                future.set_exception(error)
        self._pending.clear()
        self._callbacks.clear()

    async def _read_stdout(self) -> None:
        assert self._process and self._process.stdout
        try:
            while line := await self._process.stdout.readline():
                try:
                    message = json.loads(line)
                except json.JSONDecodeError:
                    logger.warning("Worker emitted invalid JSON: %s", line.decode(errors="replace").rstrip())
                    continue
                message_type = message.get("type")
                if message_type == "ready":
                    self._ready.set()
                    continue
                job_id = message.get("job_id")
                if message_type == "status" and job_id in self._callbacks:
                    callback = self._callbacks[job_id]
                    status = JobStatus(message["status"])
                    await callback(status)
                    continue
                request_id = message.get("request_id")
                key = job_id if job_id in self._pending else request_id
                future = self._pending.get(key)
                if future is None or future.done():
                    continue
                if message_type == "result":
                    future.set_result(message.get("data", message))
                elif message_type == "error":
                    detail = message.get("message", "推理 Worker 失败。")
                    trace = message.get("traceback")
                    if trace:
                        detail = f"{detail}\n\n详细原因：\n{trace}"
                    future.set_exception(RuntimeError(detail))
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Worker stdout reader failed")
        finally:
            error = RuntimeError("推理 Worker 意外退出。")
            for future in self._pending.values():
                if not future.done():
                    future.set_exception(error)

    async def _read_stderr(self) -> None:
        assert self._process and self._process.stderr
        try:
            while line := await self._process.stderr.readline():
                logger.warning("worker: %s", line.decode(errors="replace").rstrip())
        except asyncio.CancelledError:
            raise
