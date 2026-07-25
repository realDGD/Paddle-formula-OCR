from __future__ import annotations

import asyncio
import logging
import os
import socket
import uuid
from contextlib import nullcontext
from pathlib import Path
from typing import TYPE_CHECKING, Any

import uvicorn
from fastapi import FastAPI, File, UploadFile
from PIL import Image, ImageOps

from .schemas import AppSettings, JobStatus
from .security import validate_image

if TYPE_CHECKING:
    from .app import ApplicationState

logger = logging.getLogger("OCR_Server")


def preprocess_image_in_place(image_path: Path) -> None:
    """
    检查图片是否为黑底白字，如果是，则反转为白底黑字。
    这对 OCR 识别率至关重要。
    """
    try:
        img = Image.open(image_path).convert("RGB")
        w, h = img.size
        if w == 0 or h == 0:
            return
        sample_points = [
            (w // 2, h // 2),
            (max(0, w // 10), max(0, h // 10)),
            (min(w - 1, w * 9 // 10), max(0, h // 10)),
            (max(0, w // 10), min(h - 1, h * 9 // 10)),
            (min(w - 1, w * 9 // 10), min(h - 1, h * 9 // 10)),
        ]
        grays = [sum(img.getpixel(p)) / 3 for p in sample_points]
        avg_gray = sum(grays) / len(grays)
        if avg_gray < 100:
            logger.info("检测到黑底图片 (灰度 %.1f)，正在反向切为白底黑字...", avg_gray)
            inverted_img = ImageOps.invert(img)
            inverted_img.save(image_path)
            logger.info("颜色反转完成，已转为白底黑字。")
        else:
            logger.info("图片背景正常 (灰度 %.1f)，无需处理。", avg_gray)
    except Exception as exc:
        logger.warning("图像预处理失败: %s", exc)


from fastapi.responses import JSONResponse

async def handle_predict_formula(state: ApplicationState, file: UploadFile, *, check_enabled: bool = True) -> JSONResponse:
    """
    处理 /predict 接口请求，与用户给出的服务端和客户端代码标准 100% 兼容。
    返回格式：
      - 成功：{"status": "success", "latex": latex_code}
      - 无法识别/无公式：{"status": "fail", "message": "..."}
      - 出错：{"status": "error", "message": "..."}
    """
    settings = state.store.get_settings()
    if check_enabled and not settings.api_server_enabled:
        return JSONResponse({"status": "fail", "message": "局域网 API 端口服务已被管理员关闭。"}, status_code=403)

    unique_id = str(uuid.uuid4())
    temporary = state.paths.uploads / f"temp_{unique_id}.upload"

    try:
        total_bytes = 0
        with temporary.open("wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                total_bytes += len(chunk)
                if total_bytes > settings.max_upload_bytes:
                    return JSONResponse({"status": "fail", "message": "图片文件过大。"})
                buffer.write(chunk)

        # 1. 预处理 (检测黑底反色)
        preprocess_image_in_place(temporary)

        # 2. 校验图片格式
        try:
            extension = validate_image(temporary, max_pixels=settings.max_image_pixels)
            image_path = temporary.with_suffix(extension)
            temporary.replace(image_path)
        except Exception as exc:
            return JSONResponse({"status": "fail", "message": f"图片校验失败: {exc}"})

        # 3. 创建识别任务并提交到队列
        job = state.store.create_job(
            job_id=unique_id,
            user_id="lan_api",
            username="局域网API用户",
            image_path=image_path,
            model=settings.active_model,
            runtime_profile=settings.runtime_profile,
            metadata={"original_filename": Path(file.filename or "file").name, "source": "lan_api"},
        )
        state.queue.wake()

        # 4. 轮询等待同步结果返回
        timeout = settings.model_load_timeout_seconds + settings.execution_timeout_seconds
        start_time = asyncio.get_running_loop().time()

        while True:
            current_job = state.store.get_job(unique_id)
            if current_job.status is JobStatus.SUCCEEDED:
                latex = current_job.latex_raw or ""
                if latex.strip():
                    logger.info("识别成功: %s...", latex[:20])
                    return JSONResponse({"status": "success", "latex": latex})
                else:
                    return JSONResponse({"status": "fail", "message": "未检测到公式"})

            if current_job.status in (JobStatus.FAILED, JobStatus.TIMED_OUT, JobStatus.CANCELLED):
                error_msg = current_job.error_message or "解析结构失败"
                logger.warning("识别失败 [%s]: %s", current_job.status.value, error_msg)
                return JSONResponse({"status": "fail", "message": error_msg})

            if (asyncio.get_running_loop().time() - start_time) > timeout:
                await state.queue.cancel(unique_id)
                return JSONResponse({"status": "fail", "message": "公式识别超时。"})

            await asyncio.sleep(0.15)

    except Exception as exc:
        logger.error("发生错误: %s", exc, exc_info=True)
        return JSONResponse({"status": "error", "message": str(exc)})
    finally:
        temporary.unlink(missing_ok=True)


class ApiServerManager:
    """局域网独立 HTTP API 端口服务管理器"""

    def __init__(self, state: ApplicationState) -> None:
        self.state = state
        self._server: uvicorn.Server | None = None
        self._task: asyncio.Task[None] | None = None
        self._sock: socket.socket | None = None
        self._current_port: int | None = None

    async def sync(self, settings: AppSettings) -> None:
        if not settings.api_server_enabled:
            await self.stop()
            return

        env_port = os.environ.get("TRIM_SERVICE_PORT") or os.environ.get("FORMULA_OCR_API_PORT")
        target_port = int(env_port) if env_port else settings.api_server_port
        if self._server is not None and self._current_port == target_port and not self._server.should_exit:
            return

        await self.stop()
        await self._start(target_port)

    async def _start(self, port: int) -> None:
        api_app = FastAPI(title="Paddle Formula OCR LAN API", version="1.0.0", lifespan="off")

        @api_app.post("/predict")
        async def predict(file: UploadFile = File(...)):
            return await handle_predict_formula(self.state, file)

        @api_app.post("/api/predict")
        async def api_predict(file: UploadFile = File(...)):
            return await handle_predict_formula(self.state, file)

        logger.info("🚀 正在启动局域网 API 接口服务: http://0.0.0.0:%d/predict", port)

        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("0.0.0.0", port))
            sock.setblocking(False)
            self._sock = sock

            config = uvicorn.Config(app=api_app, log_level="warning", lifespan="off")
            server = uvicorn.Server(config)
            server.capture_signals = nullcontext
            self._server = server
            self._current_port = port

            async def _run_server() -> None:
                try:
                    await server.serve(sockets=[sock])
                except asyncio.CancelledError:
                    pass
                except Exception as exc:
                    logger.error("局域网 API 服务运行异常 (端口 %d): %s", port, exc)

            self._task = asyncio.create_task(_run_server(), name="formula-ocr-lan-api")
            logger.info("✅ 局域网 API 接口服务已在端口 %d 上启动完成！", port)
        except Exception as exc:
            logger.error("无法绑定局域网 API 接口服务端口 %d: %s", port, exc)
            self._server = None
            self._task = None

    async def stop(self) -> None:
        sock_to_close = self._sock
        self._sock = None
        if self._server:
            self._server.should_exit = True
            if self._task:
                try:
                    await asyncio.wait_for(asyncio.shield(self._task), timeout=1.0)
                except (TimeoutError, asyncio.CancelledError, Exception):
                    self._task.cancel()
                    try:
                        await self._task
                    except (asyncio.CancelledError, Exception):
                        pass
            self._server = None
            self._task = None
        if sock_to_close:
            try:
                sock_to_close.close()
            except Exception:
                pass
            self._current_port = None
            logger.info("🛑 局域网 API 接口服务已停止。")
