from __future__ import annotations

import argparse
import asyncio
import logging
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from . import __version__
from .api_server import ApiServerManager, handle_predict_formula
from .bootstrap import BootstrapManager
from .config import (
    available_cpu_count,
    configured_api_server_port,
    paths_from_environment,
    resolve_cpu_threads,
)
from .fixtures import ensure_smoke_formula
from .prediction import enqueue_formula_job
from .queue import JobQueue
from .runtime import RuntimeManager, RuntimeNotInstalledError
from .schemas import (
    SUPPORTED_MODELS,
    AppSettings,
    RuntimeProfile,
    SettingsUpdate,
    UserContext,
    UserPreferencesUpdate,
)
from .security import current_user, require_access, require_admin
from .store import Store

logging.basicConfig(level=os.environ.get("FORMULA_OCR_LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)


class ApplicationState:
    def __init__(self) -> None:
        self.paths = paths_from_environment()
        self.store = Store(self.paths.database)
        self.runtimes = RuntimeManager(self.paths)
        self.queue = JobQueue(self.store, self.runtimes)
        self.bootstrap = BootstrapManager(self.paths, self.runtimes, self.queue, self.store)
        self.api_server = ApiServerManager(self)


class RevalidatingStaticFiles(StaticFiles):
    """Require browsers to revalidate web assets after an fnOS package update."""

    async def get_response(self, path, scope):  # type: ignore[no-untyped-def]
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache, max-age=0, must-revalidate"
        return response


def create_app() -> FastAPI:
    state = ApplicationState()
    gateway_prefix = os.environ.get("FORMULA_OCR_GATEWAY_PREFIX", "").rstrip("/")

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        settings = state.store.get_settings()
        pruned = state.store.prune_completed_jobs(settings.job_retention_days)
        state.store.checkpoint_private_data()
        if pruned:
            logger.info("已清理 %d 条过期识别任务记录。", pruned)
        await state.queue.start()
        try:
            await state.api_server.sync(settings)
        except RuntimeError:
            logger.exception("局域网 API 未能启动；fnOS 网关服务仍将继续运行。")

        async def watch_fnos_api_port(last_port: int) -> None:
            while True:
                await asyncio.sleep(2)
                current_port = configured_api_server_port(state.paths.data)
                if current_port == last_port:
                    continue
                try:
                    await state.api_server.sync(state.store.get_settings())
                    logger.info("已同步 fnOS 局域网 API 端口：%d", current_port)
                except RuntimeError:
                    logger.exception("同步 fnOS 局域网 API 端口失败：%d", current_port)
                last_port = current_port

        async def prune_job_history() -> None:
            while True:
                await asyncio.sleep(3600)
                retention_days = state.store.get_settings().job_retention_days
                removed = state.store.prune_completed_jobs(retention_days)
                state.store.checkpoint_private_data()
                if removed:
                    logger.info("已清理 %d 条过期识别任务记录。", removed)

        port_watch_task = asyncio.create_task(
            watch_fnos_api_port(configured_api_server_port(state.paths.data)),
            name="formula-ocr-fnos-port-watch",
        )
        history_prune_task = asyncio.create_task(
            prune_job_history(),
            name="formula-ocr-history-prune",
        )
        try:
            yield
        finally:
            port_watch_task.cancel()
            history_prune_task.cancel()
            await asyncio.gather(
                port_watch_task,
                history_prune_task,
                return_exceptions=True,
            )
            await state.api_server.stop()
            await state.queue.stop()
            state.store.checkpoint_private_data()

    app = FastAPI(title="公式 OCR 工作台", version=__version__, lifespan=lifespan)
    app.state.formula_ocr = state

    def api_path(path: str) -> str:
        return f"{gateway_prefix}{path}"

    def verified_user(request: Request) -> UserContext:
        user = current_user(request)
        require_access(user, state.store.get_settings())
        return user

    def settings_payload(settings: AppSettings) -> dict[str, object]:
        payload = settings.model_dump()
        payload.pop("api_server_token", None)
        return payload

    def cpu_payload(settings: AppSettings) -> dict[str, int]:
        return {
            "available_threads": available_cpu_count(),
            "configured_threads": settings.cpu_threads,
            "effective_threads": resolve_cpu_threads(settings.cpu_threads),
        }

    @app.get(api_path("/health/live"), include_in_schema=False)
    async def health_live() -> dict[str, str]:
        return {"status": "ok"}

    @app.get(api_path("/health/ready"), include_in_schema=False)
    async def health_ready() -> JSONResponse:
        profiles = state.runtimes.installed_profiles()
        ready = any(profiles.values())
        return JSONResponse(
            {"status": "ready" if ready else "runtime_not_installed", "runtimes": profiles},
            status_code=200 if ready else 503,
        )

    @app.get(api_path("/launcher.html"), include_in_schema=False, response_class=HTMLResponse)
    async def launcher(user: UserContext = Depends(verified_user)) -> HTMLResponse:
        launcher_file = state.paths.static / "launcher.html"
        if not launcher_file.is_file():
            raise RuntimeError(f"桌面启动页不存在：{launcher_file}")
        content = launcher_file.read_text(encoding="utf-8")
        launch_mode = state.store.get_user_preferences(user.user_id).launch_mode.value
        content = content.replace("__FORMULA_OCR_LAUNCH_MODE__", launch_mode)
        return HTMLResponse(content, headers={"Cache-Control": "no-store, max-age=0"})

    @app.get(api_path("/api/system-info"))
    async def system_info(user: UserContext = Depends(verified_user)) -> dict[str, object]:
        settings = state.store.get_settings()
        return {
            "runtimes": state.runtimes.installed_profiles(),
            "settings": settings_payload(settings),
            "preferences": state.store.get_user_preferences(user.user_id).model_dump(),
            "user": user.model_dump(),
            "cpu": cpu_payload(settings),
            "download_sources": state.runtimes.download_sources(),
            "gateway_prefix": gateway_prefix or "/",
        }

    @app.get(api_path("/api/settings"))
    async def get_settings(user: UserContext = Depends(verified_user)) -> dict[str, object]:
        require_admin(user)
        settings = state.store.get_settings()
        return {
            "settings": settings_payload(settings),
            "cpu": cpu_payload(settings),
            "runtimes": state.runtimes.installed_profiles(),
            "download_sources": state.runtimes.download_sources(),
            "api_server_status": state.api_server.status,
        }

    @app.get(api_path("/api/preferences"))
    async def get_preferences(user: UserContext = Depends(verified_user)) -> dict[str, object]:
        return {"preferences": state.store.get_user_preferences(user.user_id).model_dump()}

    @app.put(api_path("/api/preferences"))
    async def update_preferences(
        update: UserPreferencesUpdate,
        user: UserContext = Depends(verified_user),
    ) -> dict[str, object]:
        preferences = state.store.get_user_preferences(user.user_id)
        next_preferences = preferences.model_copy(update=update.model_dump(exclude_none=True))
        state.store.save_user_preferences(user.user_id, next_preferences)
        return {"preferences": next_preferences.model_dump()}

    @app.get(api_path("/api/admin/api-client"))
    async def api_client_credentials(user: UserContext = Depends(verified_user)) -> dict[str, object]:
        require_admin(user)
        settings = state.store.get_settings()
        return {
            "api_server_port": configured_api_server_port(state.paths.data),
            "api_server_token": settings.api_server_token,
            "request_timeout_seconds": (
                settings.model_load_timeout_seconds
                + settings.execution_timeout_seconds
                + 30
            ),
        }

    @app.post(api_path("/api/admin/api-token"))
    async def rotate_api_token(user: UserContext = Depends(verified_user)) -> dict[str, object]:
        require_admin(user)
        settings = state.store.get_settings()
        next_settings = settings.model_copy(
            update={"api_server_token": secrets.token_urlsafe(32)}
        )
        state.store.save_settings(next_settings)
        return {
            "api_server_port": configured_api_server_port(state.paths.data),
            "api_server_token": next_settings.api_server_token,
        }

    @app.get(api_path("/api/admin/bootstrap/plan"))
    async def bootstrap_plan(user: UserContext = Depends(verified_user)) -> dict[str, object]:
        require_admin(user)
        return await state.bootstrap.plan()

    @app.post(api_path("/api/admin/bootstrap"), status_code=status.HTTP_202_ACCEPTED)
    async def start_bootstrap(payload: dict[str, object], user: UserContext = Depends(verified_user)) -> dict[str, object]:
        require_admin(user)
        requested = payload.get("profiles")
        if not isinstance(requested, list):
            raise HTTPException(status_code=422, detail="必须提供待安装识别组件列表。")
        try:
            profiles = [RuntimeProfile(str(item)) for item in requested]
            model_name = str(payload.get("model_name") or state.store.get_settings().active_model)
            if model_name not in SUPPORTED_MODELS:
                raise ValueError("不支持的公式识别模型。")
            result = state.bootstrap.start(profiles, model_name)
        except Exception as exc:
            raise HTTPException(status_code=409, detail=f"无法启动一键安装：{exc}") from exc
        return {"bootstrap": result}

    @app.get(api_path("/api/admin/bootstrap/status"))
    async def bootstrap_status(user: UserContext = Depends(verified_user)) -> dict[str, object]:
        require_admin(user)
        return {"bootstrap": state.bootstrap.status()}

    @app.get(api_path("/api/admin/logs"))
    async def read_logs(user: UserContext = Depends(verified_user)) -> dict[str, object]:
        require_admin(user)
        log_file = state.paths.data / "app.log"
        try:
            lines = log_file.read_text(encoding="utf-8", errors="replace").splitlines()[-400:]
        except OSError:
            lines = []
        return {"lines": lines, "path": str(log_file)}

    @app.put(api_path("/api/settings"))
    async def update_settings(update: SettingsUpdate, user: UserContext = Depends(verified_user)) -> dict[str, object]:
        require_admin(user)
        if update.runtime_profile is RuntimeProfile.CUDA130:
            raise HTTPException(status_code=422, detail="CUDA 13.0 组件已被 CUDA 11.8 组件替代，请重新选择。")
        current = state.store.get_settings()
        data = current.model_dump()
        data.update(update.model_dump(exclude_none=True))
        next_settings = AppSettings.model_validate(data)
        if next_settings.runtime_profile != current.runtime_profile:
            try:
                if next_settings.runtime_profile is not RuntimeProfile.AUTO:
                    state.runtimes.interpreter_for(next_settings.runtime_profile)
            except RuntimeNotInstalledError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc
            await state.queue.switch_runtime(next_settings.runtime_profile)
        try:
            await state.api_server.sync(next_settings)
        except RuntimeError as exc:
            try:
                await state.api_server.sync(current)
            except RuntimeError:
                logger.exception("恢复原局域网 API 设置失败。")
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        state.store.save_settings(next_settings)
        return {
            "settings": settings_payload(next_settings),
            "cpu": cpu_payload(next_settings),
            "api_server_status": state.api_server.status,
        }

    async def predict_formula(
        file: UploadFile = File(...),
        user: UserContext = Depends(verified_user),
    ) -> JSONResponse:
        return await handle_predict_formula(
            state,
            file,
            check_enabled=False,
            user_id=user.user_id,
        )

    for predict_path in {
        "/predict",
        "/api/predict",
        api_path("/predict"),
        api_path("/api/predict"),
    }:
        app.add_api_route(predict_path, predict_formula, methods=["POST"])

    @app.post(api_path("/api/admin/runtimes/{profile}/install"), status_code=status.HTTP_202_ACCEPTED)
    async def install_runtime(profile: RuntimeProfile, user: UserContext = Depends(verified_user)) -> dict[str, object]:
        require_admin(user)
        if profile not in {RuntimeProfile.CPU, RuntimeProfile.CUDA118, RuntimeProfile.CUDA126}:
            raise HTTPException(status_code=422, detail="必须选择 CPU、CUDA 11.8 或 CUDA 12.6 识别组件。")
        try:
            result = state.runtimes.start_install(profile)
        except Exception as exc:
            raise HTTPException(status_code=409, detail=f"无法启动识别组件安装：{exc}") from exc
        return {"installation": result}

    @app.get(api_path("/api/admin/runtimes/{profile}/install-status"))
    async def runtime_install_status(profile: RuntimeProfile, user: UserContext = Depends(verified_user)) -> dict[str, object]:
        require_admin(user)
        if profile not in {RuntimeProfile.CPU, RuntimeProfile.CUDA118, RuntimeProfile.CUDA126}:
            raise HTTPException(status_code=422, detail="必须选择 CPU、CUDA 11.8 或 CUDA 12.6 识别组件。")
        return {"installation": state.runtimes.installation_status(profile)}

    @app.delete(api_path("/api/admin/runtimes/{profile}/install"), status_code=status.HTTP_202_ACCEPTED)
    async def cancel_runtime_install(profile: RuntimeProfile, user: UserContext = Depends(verified_user)) -> dict[str, object]:
        require_admin(user)
        if profile not in {RuntimeProfile.CPU, RuntimeProfile.CUDA118, RuntimeProfile.CUDA126}:
            raise HTTPException(status_code=422, detail="必须选择 CPU、CUDA 11.8 或 CUDA 12.6 识别组件。")
        try:
            result = state.runtimes.cancel_install(profile)
        except Exception as exc:
            raise HTTPException(status_code=409, detail=f"无法中断识别组件安装：{exc}") from exc
        return {"installation": result}

    @app.post(api_path("/api/admin/runtimes/{profile}/diagnose"))
    async def diagnose_runtime(profile: RuntimeProfile, user: UserContext = Depends(verified_user)) -> dict[str, object]:
        require_admin(user)
        if profile not in {RuntimeProfile.CPU, RuntimeProfile.CUDA118, RuntimeProfile.CUDA126}:
            raise HTTPException(status_code=422, detail="必须选择 CPU、CUDA 11.8 或 CUDA 12.6 识别组件。")
        try:
            return {"profile": profile.value, "diagnostics": await state.runtimes.diagnose(profile)}
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"识别组件检测失败：{exc}") from exc

    @app.get(api_path("/api/models"))
    async def models(_: UserContext = Depends(verified_user)) -> dict[str, object]:
        return {
            "models": [
                {"name": "PP-FormulaNet_plus-S", "label": "轻量", "storage_mb": 248},
                {"name": "PP-FormulaNet_plus-M", "label": "均衡", "storage_mb": 592},
                {"name": "PP-FormulaNet_plus-L", "label": "高质量", "storage_mb": 698},
            ],
            "model_directory": str(state.paths.models),
        }

    @app.post(api_path("/api/admin/models/{model_name}/prepare"))
    async def prepare_model(model_name: str, user: UserContext = Depends(verified_user)) -> dict[str, object]:
        require_admin(user)
        if model_name not in SUPPORTED_MODELS:
            raise HTTPException(status_code=422, detail="不支持的公式识别模型。")
        settings = state.store.get_settings()
        try:
            profile = state.runtimes.resolve(settings.runtime_profile)
            result = await state.queue.prepare_model(profile, model_name)
            return {"profile": profile.value, "model": model_name, "result": result}
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"模型准备失败：{exc}") from exc

    @app.post(api_path("/api/admin/runtimes/{profile}/smoke-test"))
    async def smoke_runtime(profile: RuntimeProfile, user: UserContext = Depends(verified_user)) -> dict[str, object]:
        require_admin(user)
        if profile not in {RuntimeProfile.CPU, RuntimeProfile.CUDA118, RuntimeProfile.CUDA126}:
            raise HTTPException(status_code=422, detail="必须选择 CPU、CUDA 11.8 或 CUDA 12.6 识别组件。")
        settings = state.store.get_settings()
        try:
            diagnostics = await state.runtimes.diagnose(profile)
            if state.runtimes.is_gpu_profile(profile) and not diagnostics.get("cuda_available"):
                raise RuntimeError("Paddle 未检测到可用 CUDA 设备。")
            fixture = ensure_smoke_formula(state.paths.data / "fixtures" / "smoke_formula.png")
            result = await state.queue.smoke_runtime(profile, settings.active_model, fixture)
            if not str(result.get("latex_raw", "")).strip():
                raise RuntimeError("测试识别未返回 LaTeX。")
            return {"profile": profile.value, "diagnostics": diagnostics, "smoke_test": result}
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"识别组件真实测试失败：{exc}") from exc

    @app.post(api_path("/api/jobs"), status_code=status.HTTP_202_ACCEPTED)
    async def create_job(
        image: UploadFile = File(description="PNG, JPEG or WebP image"),
        user: UserContext = Depends(verified_user),
    ) -> dict[str, object]:
        job = await enqueue_formula_job(
            state,
            image,
            user_id=user.user_id,
        )
        return {"job": _job_payload(job, state.store.queue_position(job.id))}

    @app.get(api_path("/api/jobs/{job_id}"))
    async def get_job(job_id: str, user: UserContext = Depends(verified_user)) -> dict[str, object]:
        try:
            job = state.store.get_job(job_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="任务不存在。") from exc
        if state.store.job_owner(job_id) != user.user_id and not user.is_admin:
            raise HTTPException(status_code=403, detail="无权查看此任务。")
        return {"job": _job_payload(job, state.store.queue_position(job.id))}

    @app.delete(
        api_path("/api/jobs/{job_id}"),
        status_code=status.HTTP_204_NO_CONTENT,
        response_class=Response,
    )
    async def cancel_job(job_id: str, user: UserContext = Depends(verified_user)) -> Response:
        try:
            owner = state.store.job_owner(job_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="任务不存在。") from exc
        if owner != user.user_id and not user.is_admin:
            raise HTTPException(status_code=403, detail="无权取消此任务。")
        await state.queue.cancel(job_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    if not state.paths.static.is_dir():
        raise RuntimeError(f"静态页面目录不存在：{state.paths.static}")
    app.mount(gateway_prefix or "/", RevalidatingStaticFiles(directory=state.paths.static, html=True), name="web")
    return app


def _job_payload(job, queue_position: int | None) -> dict[str, object]:
    payload = job.model_dump(mode="json")
    payload["queue_position"] = queue_position
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--socket", help="Unix socket path used by fnOS unified gateway")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    arguments = parser.parse_args()
    kwargs: dict[str, object] = {"factory": True, "log_level": "info"}
    if arguments.socket:
        Path(arguments.socket).unlink(missing_ok=True)
        kwargs["uds"] = arguments.socket
    else:
        kwargs.update({"host": arguments.host, "port": arguments.port})
    uvicorn.run("formula_ocr.app:create_app", **kwargs)


if __name__ == "__main__":
    main()
