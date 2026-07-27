from __future__ import annotations

import os
from pathlib import Path

from fastapi import HTTPException, Request, status

from .schemas import AccessMode, AppSettings, UserContext

ALLOWED_IMAGE_TYPES = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}


def current_user(request: Request) -> UserContext:
    """Read identity only from fnOS gateway headers.

    Local development has an explicit opt-in fallback so production never accepts
    a client-supplied development identity.
    """
    user_id = request.headers.get("x-trim-userid")
    username = request.headers.get("x-trim-username")
    admin = request.headers.get("x-trim-isadmin", "").lower() == "true"
    if user_id and username:
        return UserContext(user_id=user_id, username=username, is_admin=admin)
    if os.environ.get("FORMULA_OCR_DEV_AUTH") == "1":
        return UserContext(user_id="local", username="local-admin", is_admin=True)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="需要通过 fnOS 登录访问应用。")


def require_access(user: UserContext, settings: AppSettings) -> None:
    if settings.access_mode is AccessMode.ADMINS_ONLY and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="此应用仅允许管理员使用。")


def require_admin(user: UserContext) -> None:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限。")


def validate_image(path: Path, *, max_pixels: int) -> str:
    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError as exc:  # pragma: no cover - runtime dependency error
        raise HTTPException(status_code=500, detail="图像验证依赖未安装。") from exc
    try:
        with Image.open(path) as image:
            detected = image.format
            if detected not in ALLOWED_IMAGE_TYPES:
                raise HTTPException(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    detail="只支持 PNG、JPEG 和 WebP 图片。",
                )
            if image.width * image.height > max_pixels:
                raise HTTPException(status_code=413, detail="图片像素过大。")
            image.verify()
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="无法读取图片内容。") from exc
    return ALLOWED_IMAGE_TYPES[detected]
