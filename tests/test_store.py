from __future__ import annotations

import tempfile
import unittest
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from formula_ocr.schemas import JobStatus, LaunchMode, RuntimeProfile, UserPreferences
from formula_ocr.store import QueueLimitError, Store, to_iso


class StoreSafetyTests(unittest.TestCase):
    def _create_job(self, store: Store, root: Path, user_id: str, **limits: int):
        image_path = root / f"{uuid.uuid4()}.png"
        image_path.touch()
        return store.create_job(
            job_id=str(uuid.uuid4()),
            user_id=user_id,
            username=user_id,
            image_path=image_path,
            model="PP-FormulaNet_plus-M",
            runtime_profile=RuntimeProfile.CPU,
            **limits,
        )

    def test_queue_limits_are_checked_inside_job_creation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            store = Store(root / "app.db")
            self._create_job(
                store,
                root,
                "user-a",
                max_queue_size=2,
                max_queued_per_user=1,
            )
            with self.assertRaisesRegex(QueueLimitError, "user"):
                self._create_job(
                    store,
                    root,
                    "user-a",
                    max_queue_size=2,
                    max_queued_per_user=1,
                )
            self._create_job(
                store,
                root,
                "user-b",
                max_queue_size=2,
                max_queued_per_user=1,
            )
            with self.assertRaisesRegex(QueueLimitError, "global"):
                self._create_job(
                    store,
                    root,
                    "user-c",
                    max_queue_size=2,
                    max_queued_per_user=1,
                )

    def test_job_storage_discards_display_name_and_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            store = Store(root / "app.db")
            image_path = root / "formula.png"
            image_path.touch()
            job = store.create_job(
                job_id=str(uuid.uuid4()),
                user_id="required-owner-id",
                username="Sensitive Display Name",
                image_path=image_path,
                model="PP-FormulaNet_plus-M",
                runtime_profile=RuntimeProfile.CPU,
                metadata={"original_filename": "private-formula.png"},
            )
            with store._connect() as connection:
                row = connection.execute(
                    "SELECT username, metadata_json FROM jobs WHERE id = ?",
                    (job.id,),
                ).fetchone()
            self.assertEqual(row["username"], "")
            self.assertEqual(row["metadata_json"], "{}")

            with store._connect() as connection:
                connection.execute(
                    "UPDATE jobs SET username = ?, metadata_json = ? WHERE id = ?",
                    ("Legacy Name", '{"original_filename":"legacy.png"}', job.id),
                )
            migrated = Store(root / "app.db")
            with migrated._connect() as connection:
                row = connection.execute(
                    "SELECT username, metadata_json FROM jobs WHERE id = ?",
                    (job.id,),
                ).fetchone()
            self.assertEqual(row["username"], "")
            self.assertEqual(row["metadata_json"], "{}")

    def test_prune_removes_only_old_terminal_jobs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            store = Store(root / "app.db")
            old = self._create_job(store, root, "old")
            recent = self._create_job(store, root, "recent")
            queued = self._create_job(store, root, "queued")
            store.update_job(old.id, status=JobStatus.SUCCEEDED)
            store.update_job(recent.id, status=JobStatus.FAILED)
            old_timestamp = to_iso(datetime.now(UTC) - timedelta(days=40))
            with store._connect() as connection:
                connection.execute(
                    "UPDATE jobs SET completed_at = ? WHERE id = ?",
                    (old_timestamp, old.id),
                )

            self.assertEqual(store.prune_completed_jobs(30), 1)
            with self.assertRaises(KeyError):
                store.get_job(old.id)
            self.assertEqual(store.get_job(recent.id).status, JobStatus.FAILED)
            self.assertEqual(store.get_job(queued.id).status, JobStatus.QUEUED)

    def test_running_transition_does_not_replace_started_at(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            store = Store(root / "app.db")
            job = self._create_job(store, root, "user")
            loading = store.update_job(job.id, status=JobStatus.LOADING_MODEL)
            running = store.update_job(job.id, status=JobStatus.RUNNING)
            self.assertEqual(loading.started_at, running.started_at)

    def test_restart_discards_every_nonterminal_job(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            store = Store(root / "app.db")
            queued = self._create_job(store, root, "queued")
            loading = self._create_job(store, root, "loading")
            running = self._create_job(store, root, "running")
            completed = self._create_job(store, root, "completed")
            store.update_job(loading.id, status=JobStatus.LOADING_MODEL)
            store.update_job(running.id, status=JobStatus.RUNNING)
            store.update_job(completed.id, status=JobStatus.SUCCEEDED)

            self.assertEqual(store.recover_after_restart(), 3)
            for job in (queued, loading, running):
                recovered = store.get_job(job.id)
                self.assertEqual(recovered.status, JobStatus.FAILED)
                self.assertEqual(recovered.error_code, "SERVICE_RESTARTED")
            self.assertEqual(store.get_job(completed.id).status, JobStatus.SUCCEEDED)

    def test_generated_api_token_is_persisted_across_store_restarts(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            database = Path(temporary) / "app.db"
            first_token = Store(database).get_settings().api_server_token
            second_token = Store(database).get_settings().api_server_token
            self.assertEqual(first_token, second_token)
            self.assertGreaterEqual(len(first_token), 32)

    def test_desktop_launch_mode_is_stored_per_user(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            store = Store(Path(temporary) / "app.db")
            store.save_user_preferences(
                "user-a",
                UserPreferences(launch_mode=LaunchMode.EMBEDDED),
            )
            self.assertIs(
                store.get_user_preferences("user-a").launch_mode,
                LaunchMode.EMBEDDED,
            )
            self.assertIs(
                store.get_user_preferences("user-b").launch_mode,
                LaunchMode.BROWSER_TAB,
            )
