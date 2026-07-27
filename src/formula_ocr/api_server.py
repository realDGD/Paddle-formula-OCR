from __future__ import annotations

import asyncio
import hashlib
import logging
import secrets
import socket
from contextlib import nullcontext
from typing import TYPE_CHECKING

import uvicorn
from fastapi import FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse

from .config import configured_api_server_port
from .image_processing import preprocess_image_in_place
from .latex_formatter import format_latex_source, has_equivalent_tokens
from .prediction import enqueue_formula_job, wait_for_formula_job
from .schemas import AppSettings, JobStatus

if TYPE_CHECKING:
    from .app import ApplicationState

logger = logging.getLogger("OCR_Server")


def verify_lan_api_token(request: Request, settings: AppSettings) -> str:
    authorization = request.headers.get("authorization", "")
    scheme, _, supplied_token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not supplied_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="需要 Bearer Token。",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not secrets.compare_digest(supplied_token, settings.api_server_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer Token 无效。",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return hashlib.sha256(supplied_token.encode("utf-8")).hexdigest()[:16]


async def handle_predict_formula(
    state: ApplicationState,
    file: UploadFile,
    *,
    check_enabled: bool = True,
    user_id: str = "lan_api",
) -> JSONResponse:
    settings = state.store.get_settings()
    if check_enabled and not settings.api_server_enabled:
        return JSONResponse(
            {"status": "fail", "message": "局域网 API 端口服务已被管理员关闭。"},
            status_code=403,
        )

    try:
        job = await enqueue_formula_job(
            state,
            file,
            user_id=user_id,
        )
        completed = await wait_for_formula_job(state, job.id)
        if completed.status is JobStatus.SUCCEEDED:
            latex_raw = completed.latex_raw or ""
            if latex_raw.strip():
                format_result = format_latex_source(latex_raw)
                latex = (
                    format_result.formatted
                    if format_result.safe
                    and has_equivalent_tokens(latex_raw, format_result.formatted)
                    else latex_raw
                )
                return JSONResponse({"status": "success", "latex": latex})
            return JSONResponse({"status": "fail", "message": "未检测到公式"})
        if completed.status is JobStatus.TIMED_OUT:
            return JSONResponse({"status": "fail", "message": "公式识别超时。"}, status_code=504)
        if completed.status is JobStatus.CANCELLED:
            return JSONResponse({"status": "fail", "message": "公式识别已取消。"}, status_code=409)
        return JSONResponse(
            {"status": "fail", "message": completed.error_message or "公式识别失败。"},
            status_code=422,
        )
    except HTTPException as exc:
        return JSONResponse(
            {"status": "fail", "message": str(exc.detail)},
            status_code=exc.status_code,
            headers=exc.headers,
        )
    except TimeoutError:
        return JSONResponse({"status": "fail", "message": "公式识别超时。"}, status_code=504)
    except Exception:
        logger.exception("同步公式识别请求失败")
        return JSONResponse(
            {"status": "error", "message": "服务端处理请求失败。"},
            status_code=500,
        )


class ApiServerManager:
    """Own the authenticated HTTP listener exposed to the local network."""

    def __init__(self, state: ApplicationState) -> None:
        self.state = state
        self._server: uvicorn.Server | None = None
        self._task: asyncio.Task[None] | None = None
        self._sock: socket.socket | None = None
        self._current_port: int | None = None
        self._request_slots: asyncio.Semaphore | None = None
        self._max_concurrent_requests: int | None = None
        self._last_error: str | None = None

    @property
    def status(self) -> dict[str, object]:
        running = (
            self._server is not None
            and self._task is not None
            and not self._task.done()
            and not self._server.should_exit
        )
        return {
            "running": running,
            "port": self._current_port if running else None,
            "max_concurrent_requests": self._max_concurrent_requests if running else None,
            "error": self._last_error,
        }

    async def sync(self, settings: AppSettings) -> None:
        if not settings.api_server_enabled:
            await self.stop()
            self._last_error = None
            return

        # fnOS install/configuration is the single source of truth for this
        # listener. The application UI deliberately cannot override the port.
        target_port = configured_api_server_port(self.state.paths.data)
        if (
            self._server is not None
            and self._task is not None
            and not self._task.done()
            and self._current_port == target_port
            and not self._server.should_exit
        ):
            target_concurrency = settings.max_queue_size + 1
            if target_concurrency != self._max_concurrent_requests:
                self._request_slots = asyncio.Semaphore(target_concurrency)
                self._max_concurrent_requests = target_concurrency
            return

        await self.stop()
        await self._start(target_port, settings.max_queue_size + 1)

    async def _start(self, port: int, max_concurrent_requests: int) -> None:
        api_app = FastAPI(title="Paddle Formula OCR LAN API", version="1.1.0", lifespan="off")

        async def predict(request: Request, file: UploadFile = File(...)) -> JSONResponse:
            settings = self.state.store.get_settings()
            token_id = verify_lan_api_token(request, settings)
            slots = self._request_slots
            if slots is None:
                return JSONResponse(
                    {"status": "fail", "message": "局域网 API 服务尚未就绪。"},
                    status_code=503,
                )
            try:
                await asyncio.wait_for(slots.acquire(), timeout=0.05)
            except TimeoutError:
                return JSONResponse(
                    {"status": "fail", "message": "并发请求已达上限，请稍后重试。"},
                    status_code=429,
                )
            try:
                return await handle_predict_formula(
                    self.state,
                    file,
                    user_id=f"lan_api:{token_id}",
                )
            finally:
                slots.release()

        api_app.add_api_route("/predict", predict, methods=["POST"])
        api_app.add_api_route("/api/predict", predict, methods=["POST"])
        logger.info("正在启动局域网 API 服务：http://0.0.0.0:%d/predict", port)

        sock: socket.socket | None = None
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("0.0.0.0", port))
            sock.setblocking(False)
            config = uvicorn.Config(
                app=api_app,
                log_level="warning",
                lifespan="off",
                limit_concurrency=max_concurrent_requests + 4,
            )
            server = uvicorn.Server(config)
            server.capture_signals = nullcontext

            async def run_server() -> None:
                try:
                    await server.serve(sockets=[sock])
                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.exception("局域网 API 服务运行异常（端口 %d）", port)

            self._sock = sock
            self._server = server
            self._current_port = port
            self._request_slots = asyncio.Semaphore(max_concurrent_requests)
            self._max_concurrent_requests = max_concurrent_requests
            self._task = asyncio.create_task(run_server(), name="formula-ocr-lan-api")
            self._last_error = None
            logger.info("局域网 API 服务已在端口 %d 启动。", port)
        except Exception as exc:
            if sock is not None:
                sock.close()
            self._sock = None
            self._server = None
            self._task = None
            self._current_port = None
            self._request_slots = None
            self._max_concurrent_requests = None
            self._last_error = f"无法绑定端口 {port}：{exc}"
            logger.error(self._last_error)
            raise RuntimeError(self._last_error) from exc

    async def stop(self) -> None:
        server = self._server
        task = self._task
        sock = self._sock
        self._server = None
        self._task = None
        self._sock = None
        self._current_port = None
        self._request_slots = None
        self._max_concurrent_requests = None

        if server is not None:
            server.should_exit = True
        if task is not None and not task.done():
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=1.0)
            except (TimeoutError, asyncio.CancelledError):
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
        if sock is not None:
            sock.close()
