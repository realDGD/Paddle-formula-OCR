from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


SUPPORTED_MODELS = {
    "PP-FormulaNet_plus-S",
    "PP-FormulaNet_plus-M",
    "PP-FormulaNet_plus-L",
}


class JobStatus(str, Enum):
    QUEUED = "queued"
    LOADING_MODEL = "loading_model"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    TIMED_OUT = "timed_out"
    CANCELLED = "cancelled"


class RuntimeProfile(str, Enum):
    AUTO = "auto"
    CPU = "cpu"
    CUDA118 = "cuda118"
    CUDA126 = "cuda126"
    # Retained to read records created by 0.3.3 and earlier. New settings are
    # migrated to ``auto`` at application startup.
    CUDA130 = "cuda130"


class AccessMode(str, Enum):
    ALL_USERS = "all_users"
    ADMINS_ONLY = "admins_only"


class LaunchMode(str, Enum):
    BROWSER_TAB = "browser_tab"
    EMBEDDED = "embedded"


class UserContext(BaseModel):
    user_id: str
    username: str
    is_admin: bool = False


class AppSettings(BaseModel):
    access_mode: AccessMode = AccessMode.ALL_USERS
    launch_mode: LaunchMode = LaunchMode.BROWSER_TAB
    runtime_profile: RuntimeProfile = RuntimeProfile.AUTO
    active_model: str = "PP-FormulaNet_plus-M"
    execution_timeout_seconds: int = Field(default=120, ge=30, le=600)
    model_load_timeout_seconds: int = Field(default=300, ge=60, le=900)
    max_queue_size: int = Field(default=20, ge=1, le=200)
    max_queued_per_user: int = Field(default=5, ge=1, le=50)
    max_upload_bytes: int = Field(default=10 * 1024 * 1024, ge=1024 * 1024, le=100 * 1024 * 1024)
    max_image_pixels: int = Field(default=25_000_000, ge=1_000_000, le=100_000_000)
    cpu_threads: int = Field(default=4, ge=1, le=64)

    @field_validator("active_model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        if value not in SUPPORTED_MODELS:
            raise ValueError("不支持的公式识别模型。")
        return value


class JobView(BaseModel):
    id: str
    status: JobStatus
    model: str
    runtime_profile: RuntimeProfile
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    queue_position: int | None = None
    latex_raw: str | None = None
    duration_ms: int | None = None
    error_code: str | None = None
    error_message: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SettingsUpdate(BaseModel):
    access_mode: AccessMode | None = None
    launch_mode: LaunchMode | None = None
    runtime_profile: RuntimeProfile | None = None
    active_model: str | None = None
    execution_timeout_seconds: int | None = Field(default=None, ge=30, le=600)
    model_load_timeout_seconds: int | None = Field(default=None, ge=60, le=900)
    max_queue_size: int | None = Field(default=None, ge=1, le=200)
    max_queued_per_user: int | None = Field(default=None, ge=1, le=50)
    max_upload_bytes: int | None = Field(default=None, ge=1024 * 1024, le=100 * 1024 * 1024)
    max_image_pixels: int | None = Field(default=None, ge=1_000_000, le=100_000_000)
    cpu_threads: int | None = Field(default=None, ge=1, le=64)

    @field_validator("active_model")
    @classmethod
    def validate_model(cls, value: str | None) -> str | None:
        if value is not None and value not in SUPPORTED_MODELS:
            raise ValueError("不支持的公式识别模型。")
        return value
