from __future__ import annotations

import asyncio
import logging
import os
import uuid
from typing import TYPE_CHECKING

from fastapi import HTTPException, UploadFile, status

from .schemas import (
    TABLE_MODEL_NAME,
    AppSettings,
    JobStatus,
    JobView,
    RecognitionKind,
)
from .security import validate_image
from .store import QueueLimitError

if TYPE_CHECKING:
    from .app import ApplicationState

logger = logging.getLogger(__name__)


async def enqueue_formula_job(
    state: ApplicationState,
    upload: UploadFile,
    *,
    user_id: str,
    kind: RecognitionKind = RecognitionKind.FORMULA,
) -> JobView:
    job_id = str(uuid.uuid4())
    temporary = state.paths.uploads / f"{job_id}.upload"
    temporary_created = False
    image_path = None
    total_bytes = 0
    try:
        settings = state.store.get_settings()
        _check_queue_capacity(state, settings, user_id)
        descriptor = os.open(
            temporary,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
        )
        temporary_created = True
        with os.fdopen(descriptor, "wb") as destination:
            while chunk := await upload.read(1024 * 1024):
                total_bytes += len(chunk)
                if total_bytes > settings.max_upload_bytes:
                    raise HTTPException(status_code=413, detail="图片文件过大。")
                destination.write(chunk)

        extension = validate_image(temporary, max_pixels=settings.max_image_pixels)
        image_path = temporary.with_suffix(extension)
        temporary.replace(image_path)
        try:
            job = state.store.create_job(
                job_id=job_id,
                user_id=user_id,
                # The display name, original filename, and upload source are not
                # needed to run or authorize a job, so do not persist them.
                username="",
                image_path=image_path,
                model=(
                    TABLE_MODEL_NAME
                    if kind is RecognitionKind.TABLE
                    else settings.active_model
                ),
                runtime_profile=settings.runtime_profile,
                kind=kind,
                max_queue_size=settings.max_queue_size,
                max_queued_per_user=settings.max_queued_per_user,
            )
        except QueueLimitError as exc:
            raise _queue_http_error(exc) from exc
    except Exception:
        if temporary_created:
            temporary.unlink(missing_ok=True)
        if image_path is not None:
            image_path.unlink(missing_ok=True)
        raise
    finally:
        # FastAPI also closes UploadFile at the end of the request. Closing it
        # here releases Starlette's spooled copy immediately after our bounded
        # transient copy is ready, which matters for synchronous LAN requests.
        try:
            await upload.close()
        except Exception as exc:
            logger.warning("Unable to close uploaded image stream: %s", exc)

    state.queue.wake()
    return job


async def wait_for_formula_job(state: ApplicationState, job_id: str) -> JobView:
    settings = state.store.get_settings()
    timeout = settings.model_load_timeout_seconds + settings.execution_timeout_seconds
    started = asyncio.get_running_loop().time()
    while True:
        job = state.store.get_job(job_id)
        if job.status in {
            JobStatus.SUCCEEDED,
            JobStatus.FAILED,
            JobStatus.TIMED_OUT,
            JobStatus.CANCELLED,
        }:
            return job
        if asyncio.get_running_loop().time() - started > timeout:
            await state.queue.cancel(job_id)
            raise TimeoutError("公式识别超时。")
        await asyncio.sleep(0.15)


def _check_queue_capacity(state: ApplicationState, settings: AppSettings, user_id: str) -> None:
    if state.store.queued_count() >= settings.max_queue_size:
        raise HTTPException(status_code=429, detail="任务队列已满，请稍后重试。")
    if state.store.queued_count(user_id) >= settings.max_queued_per_user:
        raise HTTPException(status_code=429, detail="你的排队任务已达上限。")


def _queue_http_error(error: QueueLimitError) -> HTTPException:
    if error.scope == "user":
        return HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="你的排队任务已达上限。")
    return HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="任务队列已满，请稍后重试。")
