from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from pathlib import Path

from .runtime import RuntimeManager
from .schemas import AppSettings, JobStatus, RuntimeProfile
from .store import Store
from .supervisor import WorkerSupervisor

logger = logging.getLogger(__name__)
TERMINAL_STATES = {JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.TIMED_OUT, JobStatus.CANCELLED}


class JobQueue:
    def __init__(self, store: Store, runtimes: RuntimeManager):
        self.store = store
        self.runtimes = runtimes
        self.supervisor = WorkerSupervisor(runtimes)
        self._wake = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self._current_job_id: str | None = None
        self._round_robin: deque[str] = deque()

    async def start(self) -> None:
        self.store.recover_after_restart()
        self._task = asyncio.create_task(self._run(), name="formula-ocr-queue")
        self._wake.set()

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        await self.supervisor.close()

    def wake(self) -> None:
        self._wake.set()

    async def cancel(self, job_id: str) -> None:
        job = self.store.get_job(job_id)
        if job.status in TERMINAL_STATES:
            return
        if job.status is JobStatus.QUEUED:
            self.store.update_job(job_id, status=JobStatus.CANCELLED)
            self._delete_input(job_id)
            return
        if job_id == self._current_job_id:
            # Paddle's synchronous predictor cannot be safely interrupted in
            # place. Mark the user task cancelled and discard its eventual
            # result, but leave the Worker and the loaded model alive.
            self.store.update_job(job_id, status=JobStatus.CANCELLED)

    async def switch_runtime(self, profile: RuntimeProfile) -> None:
        # Jobs already queued retain their requested profile. Administrators must
        # drain/cancel a queue before changing the global setting in the API.
        await self.supervisor.restart()

    async def diagnose(self, profile: RuntimeProfile) -> dict[str, object]:
        return await self.supervisor.diagnose(profile)

    async def prepare_model(self, profile: RuntimeProfile, model_name: str) -> dict[str, object]:
        return await self.supervisor.prepare(profile, model_name, self.store.get_settings().cpu_threads)

    async def smoke_runtime(self, profile: RuntimeProfile, model_name: str, image_path: Path) -> dict[str, object]:
        return await self.supervisor.smoke(profile, model_name, image_path, self.store.get_settings().cpu_threads)

    async def _run(self) -> None:
        while True:
            job = self._next_job()
            if job is None:
                self._wake.clear()
                # A short timeout also closes the tiny clear/set race between a
                # newly submitted job and this idle transition.
                try:
                    await asyncio.wait_for(self._wake.wait(), timeout=1)
                except TimeoutError:
                    pass
                continue
            await self._execute(job.id)

    def _next_job(self):
        queued_users = self.store.queued_users()
        if not queued_users:
            return None
        for user_id in queued_users:
            if user_id not in self._round_robin:
                self._round_robin.append(user_id)
        while self._round_robin:
            user_id = self._round_robin.popleft()
            if user_id not in queued_users:
                continue
            job = self.store.next_queued_job(user_id)
            if self.store.next_queued_job(user_id):
                self._round_robin.append(user_id)
            if job:
                return job
        return None

    async def _execute(self, job_id: str) -> None:
        job = self.store.get_job(job_id)
        if job.status is not JobStatus.QUEUED:
            return
        settings = self.store.get_settings()
        self._current_job_id = job_id
        phase = JobStatus.LOADING_MODEL
        phase_started = time.monotonic()

        async def on_status(new_status: JobStatus) -> None:
            nonlocal phase, phase_started
            if self.store.get_job(job_id).status is JobStatus.CANCELLED:
                return
            phase = new_status
            phase_started = time.monotonic()
            self.store.update_job(job_id, status=new_status)

        try:
            profile = self.runtimes.resolve(job.runtime_profile)
            self.store.update_job(job_id, runtime_profile=profile.value, status=JobStatus.LOADING_MODEL)
            image_path = self.store.get_image_path(job_id)
            result_task = asyncio.create_task(
                self.supervisor.recognize(
                    profile=profile,
                    job_id=job_id,
                    image_path=image_path,
                    model_name=job.model,
                    cpu_threads=settings.cpu_threads,
                    on_status=on_status,
                )
            )
            while not result_task.done():
                maximum = (
                    settings.model_load_timeout_seconds
                    if phase is JobStatus.LOADING_MODEL
                    else settings.execution_timeout_seconds
                )
                if time.monotonic() - phase_started > maximum:
                    result_task.cancel()
                    try:
                        await result_task
                    except asyncio.CancelledError:
                        pass
                    raise TimeoutError("模型加载或公式识别超时。")
                await asyncio.sleep(0.1)
            result = await result_task
            if self.store.get_job(job_id).status is JobStatus.CANCELLED:
                return
            self.store.update_job(
                job_id,
                status=JobStatus.SUCCEEDED,
                latex_raw=result["latex_raw"],
                duration_ms=int(result.get("duration_ms", 0)),
            )
        except TimeoutError as exc:
            await self.supervisor.restart()
            if self.store.get_job(job_id).status is not JobStatus.CANCELLED:
                self.store.update_job(
                    job_id,
                    status=JobStatus.TIMED_OUT,
                    error_code="WORKER_TIMEOUT",
                    error_message=str(exc),
                )
        except Exception as exc:
            logger.exception("Job %s failed", job_id)
            if self.store.get_job(job_id).status is not JobStatus.CANCELLED:
                self.store.update_job(
                    job_id,
                    status=JobStatus.FAILED,
                    error_code="WORKER_ERROR",
                    error_message=str(exc)[:1000],
                )
        finally:
            final = self.store.get_job(job_id)
            if final.status in TERMINAL_STATES:
                self._delete_input(job_id)
            self._current_job_id = None
            self._wake.set()

    def _delete_input(self, job_id: str) -> None:
        try:
            self.store.get_image_path(job_id).unlink(missing_ok=True)
        except OSError:
            logger.warning("Unable to delete input image for job %s", job_id)
