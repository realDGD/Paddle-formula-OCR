from __future__ import annotations

import asyncio
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import AsyncMock

from PIL import Image

from formula_ocr.config import AppPaths
from formula_ocr.queue import JobQueue
from formula_ocr.runtime import RuntimeManager
from formula_ocr.schemas import TABLE_MODEL_NAME, JobStatus, RecognitionKind, RuntimeProfile
from formula_ocr.store import Store


class MockWorkerQueueTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancelling_active_job_keeps_worker_and_input_until_predictor_finishes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            data = Path(temporary)
            paths = AppPaths(root=data, data=data, static=data)
            paths.uploads.mkdir(parents=True)
            store = Store(paths.database)
            image_path = paths.uploads / "formula.png"
            Image.new("RGB", (20, 20), "white").save(image_path)
            job = store.create_job(
                job_id=str(uuid.uuid4()),
                user_id="user-a",
                username="User A",
                image_path=image_path,
                model="PP-FormulaNet_plus-M",
                runtime_profile=RuntimeProfile.CPU,
            )
            store.update_job(job.id, status=JobStatus.RUNNING)
            queue = JobQueue(store, RuntimeManager(paths))
            queue._current_job_id = job.id
            queue.supervisor.restart = AsyncMock()  # type: ignore[method-assign]

            await queue.cancel(job.id)

            self.assertEqual(store.get_job(job.id).status, JobStatus.CANCELLED)
            self.assertTrue(image_path.exists())
            queue.supervisor.restart.assert_not_awaited()

    async def test_mock_worker_completes_and_removes_input(self) -> None:
        project_root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temporary:
            data = Path(temporary)
            paths = AppPaths(root=project_root, data=data, static=project_root / "static")
            for directory in (paths.uploads, paths.logs, paths.models, paths.runtimes):
                directory.mkdir(parents=True, exist_ok=True)
            runtime_python = paths.runtimes / "cpu" / "venv" / "bin" / "python"
            runtime_python.parent.mkdir(parents=True, exist_ok=True)
            runtime_python.symlink_to(Path(os.sys.executable))
            manifest = project_root / "runtime-manifests" / "cpu.txt"
            (paths.runtimes / "cpu" / "installed.json").write_text(
                __import__("json").dumps(
                    {
                        "profile": "cpu",
                        "verified_paddle": True,
                        "manifest": manifest.read_text(encoding="utf-8"),
                    }
                ),
                encoding="utf-8",
            )
            old_mock = os.environ.get("FORMULA_OCR_MOCK_RECOGNIZER")
            os.environ["FORMULA_OCR_MOCK_RECOGNIZER"] = "1"
            try:
                store = Store(paths.database)
                queue = JobQueue(store, RuntimeManager(paths))
                await queue.start()
                try:
                    image_path = paths.uploads / "formula.png"
                    Image.new("RGB", (20, 20), "white").save(image_path)
                    job = store.create_job(
                        job_id=str(uuid.uuid4()),
                        user_id="user-a",
                        username="User A",
                        image_path=image_path,
                        model="PP-FormulaNet_plus-M",
                        runtime_profile=RuntimeProfile.CPU,
                    )
                    queue.wake()
                    for _ in range(80):
                        await asyncio.sleep(0.05)
                        result = store.get_job(job.id)
                        if result.status in {JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.TIMED_OUT}:
                            break
                    self.assertEqual(result.status, JobStatus.SUCCEEDED, result.error_message)
                    self.assertEqual(result.latex_raw, r"\mathrm{OCR\ runtime\ is\ ready}")
                    self.assertFalse(image_path.exists())

                    table_path = paths.uploads / "table.png"
                    Image.new("RGB", (20, 20), "white").save(table_path)
                    table_job = store.create_job(
                        job_id=str(uuid.uuid4()),
                        user_id="user-a",
                        username="User A",
                        image_path=table_path,
                        model=TABLE_MODEL_NAME,
                        runtime_profile=RuntimeProfile.CPU,
                        kind=RecognitionKind.TABLE,
                    )
                    queue.wake()
                    for _ in range(80):
                        await asyncio.sleep(0.05)
                        table_result = store.get_job(table_job.id)
                        if table_result.status in {
                            JobStatus.SUCCEEDED,
                            JobStatus.FAILED,
                            JobStatus.TIMED_OUT,
                        }:
                            break
                    self.assertEqual(
                        table_result.status,
                        JobStatus.SUCCEEDED,
                        table_result.error_message,
                    )
                    self.assertIs(table_result.kind, RecognitionKind.TABLE)
                    self.assertIsNone(table_result.latex_raw)
                    self.assertTrue(table_result.tables[0].markdown)
                    self.assertFalse(table_path.exists())

                    smoke_image = paths.data / "smoke.png"
                    Image.new("RGB", (20, 20), "white").save(smoke_image)
                    smoke = await queue.smoke_runtime(RuntimeProfile.CPU, "PP-FormulaNet_plus-M", smoke_image)
                    self.assertEqual(smoke["device"], "cpu")
                    self.assertTrue(smoke["latex_raw"])
                finally:
                    await queue.stop()
            finally:
                if old_mock is None:
                    os.environ.pop("FORMULA_OCR_MOCK_RECOGNIZER", None)
                else:
                    os.environ["FORMULA_OCR_MOCK_RECOGNIZER"] = old_mock

    async def test_start_discards_interrupted_jobs_and_upload_residue(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            data = Path(temporary)
            paths = AppPaths(root=data, data=data, static=data)
            paths.uploads.mkdir(parents=True)
            paths.legacy_uploads.mkdir(parents=True)
            transient_image = paths.uploads / "interrupted.png"
            legacy_image = paths.legacy_uploads / "old.upload"
            transient_image.touch()
            legacy_image.touch()
            store = Store(paths.database)
            job = store.create_job(
                job_id=str(uuid.uuid4()),
                user_id="user-a",
                username="User A",
                image_path=transient_image,
                model="PP-FormulaNet_plus-M",
                runtime_profile=RuntimeProfile.CPU,
            )
            queue = JobQueue(store, RuntimeManager(paths))

            await queue.start()
            try:
                recovered = store.get_job(job.id)
                self.assertEqual(recovered.status, JobStatus.FAILED)
                self.assertEqual(recovered.error_code, "SERVICE_RESTARTED")
                self.assertFalse(transient_image.exists())
                self.assertFalse(legacy_image.exists())
            finally:
                await queue.stop()
