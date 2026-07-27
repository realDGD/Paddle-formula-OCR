from __future__ import annotations

import json
import sqlite3
import threading
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .schemas import AppSettings, JobStatus, JobView, RuntimeProfile, UserPreferences


class QueueLimitError(RuntimeError):
    def __init__(self, scope: str):
        super().__init__(scope)
        self.scope = scope


def utc_now() -> datetime:
    return datetime.now(UTC)


def to_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def from_iso(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


class Store:
    """Small SQLite persistence layer; all write operations are serialized."""

    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.RLock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA secure_delete=ON")
        return connection

    def _initialize(self) -> None:
        with self._lock, self._connect() as conn:
            conn.executescript(
                """
                PRAGMA journal_mode=WAL;
                PRAGMA foreign_keys=ON;
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS user_preferences (
                    user_id TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    image_path TEXT NOT NULL,
                    status TEXT NOT NULL,
                    model TEXT NOT NULL,
                    runtime_profile TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT,
                    latex_raw TEXT,
                    duration_ms INTEGER,
                    error_code TEXT,
                    error_message TEXT,
                    metadata_json TEXT NOT NULL DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS jobs_status_created_idx ON jobs(status, created_at);
                CREATE INDEX IF NOT EXISTS jobs_user_status_idx ON jobs(user_id, status);
                UPDATE jobs
                SET username = '', metadata_json = '{}'
                WHERE username <> '' OR metadata_json <> '{}';
                """
            )
            if conn.execute("SELECT 1 FROM settings WHERE key = 'app'").fetchone() is None:
                conn.execute(
                    "INSERT INTO settings(key, value) VALUES ('app', ?)",
                    (AppSettings().model_dump_json(),),
                )
            row = conn.execute("SELECT value FROM settings WHERE key = 'app'").fetchone()
            if row is not None:
                settings_data = json.loads(row["value"])
                updated = False
                if settings_data.get("runtime_profile") == RuntimeProfile.CUDA130.value:
                    # CUDA 13 was replaced by the Docker-verified CUDA 11.8
                    # profile. Do not let an old selected profile block startup.
                    settings_data["runtime_profile"] = RuntimeProfile.AUTO.value
                    updated = True
                if "api_server_enabled" not in settings_data:
                    settings_data["api_server_enabled"] = True
                    updated = True
                if "api_server_token" not in settings_data:
                    settings_data["api_server_token"] = secrets.token_urlsafe(32)
                    updated = True
                # These settings moved out of the global administrator record.
                # The API port now comes only from fnOS and launch mode is stored
                # per user in ``user_preferences``.
                for retired_key in ("api_server_port", "launch_mode"):
                    if retired_key in settings_data:
                        settings_data.pop(retired_key)
                        updated = True
                if updated:
                    conn.execute(
                        "UPDATE settings SET value = ? WHERE key = 'app'",
                        (json.dumps(settings_data, ensure_ascii=False),),
                    )

    def get_settings(self) -> AppSettings:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT value FROM settings WHERE key = 'app'").fetchone()
        return AppSettings.model_validate_json(row["value"])

    def save_settings(self, settings: AppSettings) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE settings SET value = ? WHERE key = 'app'",
                (settings.model_dump_json(),),
            )

    def get_user_preferences(self, user_id: str) -> UserPreferences:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT value FROM user_preferences WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        if row is None:
            return UserPreferences()
        return UserPreferences.model_validate_json(row["value"])

    def save_user_preferences(self, user_id: str, preferences: UserPreferences) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO user_preferences(user_id, value) VALUES (?, ?)
                ON CONFLICT(user_id) DO UPDATE SET value = excluded.value
                """,
                (user_id, preferences.model_dump_json()),
            )

    def create_job(
        self,
        *,
        job_id: str,
        user_id: str,
        username: str,
        image_path: Path,
        model: str,
        runtime_profile: RuntimeProfile,
        metadata: dict[str, Any] | None = None,
        max_queue_size: int | None = None,
        max_queued_per_user: int | None = None,
    ) -> JobView:
        # These arguments remain in the storage API for compatibility with
        # existing callers, but neither value is needed for task execution.
        # Persisting them would retain a display name or original filename.
        del username, metadata
        created_at = utc_now()
        with self._lock, self._connect() as conn:
            if max_queue_size is not None:
                queued = int(
                    conn.execute(
                        "SELECT COUNT(*) FROM jobs WHERE status = ?",
                        (JobStatus.QUEUED.value,),
                    ).fetchone()[0]
                )
                if queued >= max_queue_size:
                    raise QueueLimitError("global")
            if max_queued_per_user is not None:
                queued_for_user = int(
                    conn.execute(
                        "SELECT COUNT(*) FROM jobs WHERE status = ? AND user_id = ?",
                        (JobStatus.QUEUED.value, user_id),
                    ).fetchone()[0]
                )
                if queued_for_user >= max_queued_per_user:
                    raise QueueLimitError("user")
            conn.execute(
                """
                INSERT INTO jobs(
                    id, user_id, username, image_path, status, model, runtime_profile,
                    created_at, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    user_id,
                    "",
                    str(image_path),
                    JobStatus.QUEUED.value,
                    model,
                    runtime_profile.value,
                    to_iso(created_at),
                    "{}",
                ),
            )
        return self.get_job(job_id)

    def get_job(self, job_id: str) -> JobView:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if row is None:
            raise KeyError(job_id)
        return self._to_job(row)

    def job_owner(self, job_id: str) -> str:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT user_id FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if row is None:
            raise KeyError(job_id)
        return str(row["user_id"])

    def get_image_path(self, job_id: str) -> Path:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT image_path FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if row is None:
            raise KeyError(job_id)
        return Path(row["image_path"])

    def update_job(self, job_id: str, *, status: JobStatus | None = None, **updates: Any) -> JobView:
        changes: dict[str, Any] = dict(updates)
        if status is not None:
            changes["status"] = status.value
        if status in {JobStatus.LOADING_MODEL, JobStatus.RUNNING} and "started_at" not in changes:
            with self._lock, self._connect() as conn:
                row = conn.execute("SELECT started_at FROM jobs WHERE id = ?", (job_id,)).fetchone()
            if row is not None and row["started_at"] is None:
                changes["started_at"] = to_iso(utc_now())
        if status in {JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.TIMED_OUT, JobStatus.CANCELLED}:
            changes.setdefault("completed_at", to_iso(utc_now()))
        if not changes:
            return self.get_job(job_id)
        columns = ", ".join(f"{key} = ?" for key in changes)
        values = list(changes.values()) + [job_id]
        with self._lock, self._connect() as conn:
            conn.execute(f"UPDATE jobs SET {columns} WHERE id = ?", values)
        return self.get_job(job_id)

    def queued_users(self) -> list[str]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT user_id, MIN(created_at) AS first_created FROM jobs "
                "WHERE status = ? GROUP BY user_id ORDER BY first_created",
                (JobStatus.QUEUED.value,),
            ).fetchall()
        return [str(row["user_id"]) for row in rows]

    def next_queued_job(self, user_id: str) -> JobView | None:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM jobs WHERE user_id = ? AND status = ? ORDER BY created_at LIMIT 1",
                (user_id, JobStatus.QUEUED.value),
            ).fetchone()
        return self._to_job(row) if row else None

    def queued_count(self, user_id: str | None = None) -> int:
        where = "WHERE status = ?"
        values: list[str] = [JobStatus.QUEUED.value]
        if user_id is not None:
            where += " AND user_id = ?"
            values.append(user_id)
        with self._lock, self._connect() as conn:
            return int(conn.execute(f"SELECT COUNT(*) FROM jobs {where}", values).fetchone()[0])

    def queue_position(self, job_id: str) -> int | None:
        job = self.get_job(job_id)
        if job.status is not JobStatus.QUEUED:
            return None
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM jobs WHERE status = ? AND created_at < ?",
                (JobStatus.QUEUED.value, to_iso(job.created_at)),
            ).fetchone()
        return int(row[0]) + 1

    def recover_after_restart(self) -> int:
        with self._lock, self._connect() as conn:
            cursor = conn.execute(
                """
                UPDATE jobs
                SET status = ?, completed_at = ?, error_code = ?, error_message = ?
                WHERE status IN (?, ?, ?)
                """,
                (
                    JobStatus.FAILED.value,
                    to_iso(utc_now()),
                    "SERVICE_RESTARTED",
                    "服务重启后已丢弃临时任务数据，请重新提交。",
                    JobStatus.QUEUED.value,
                    JobStatus.LOADING_MODEL.value,
                    JobStatus.RUNNING.value,
                ),
            )
            return max(cursor.rowcount, 0)

    def prune_completed_jobs(self, retention_days: int) -> int:
        cutoff = to_iso(utc_now() - timedelta(days=retention_days))
        terminal = tuple(
            status.value
            for status in (
                JobStatus.SUCCEEDED,
                JobStatus.FAILED,
                JobStatus.TIMED_OUT,
                JobStatus.CANCELLED,
            )
        )
        placeholders = ", ".join("?" for _ in terminal)
        with self._lock, self._connect() as conn:
            cursor = conn.execute(
                f"DELETE FROM jobs WHERE status IN ({placeholders}) AND completed_at < ?",
                (*terminal, cutoff),
            )
            return max(cursor.rowcount, 0)

    def checkpoint_private_data(self) -> None:
        """Flush and truncate the WAL after privacy-related record deletion."""
        with self._lock, self._connect() as conn:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")

    @staticmethod
    def _to_job(row: sqlite3.Row) -> JobView:
        return JobView(
            id=row["id"],
            status=JobStatus(row["status"]),
            model=row["model"],
            runtime_profile=RuntimeProfile(row["runtime_profile"]),
            created_at=from_iso(row["created_at"]),
            started_at=from_iso(row["started_at"]),
            completed_at=from_iso(row["completed_at"]),
            latex_raw=row["latex_raw"],
            duration_ms=row["duration_ms"],
            error_code=row["error_code"],
            error_message=row["error_message"],
            metadata=json.loads(row["metadata_json"] or "{}"),
        )
