# Paddle Formula OCR for fnOS

一个通过 fnOS 统一网关访问的 Native 公式识别应用。首版针对单个公式图片，支持文件上传、粘贴、可选裁剪、LaTeX 语法高亮与命令补全、公式预览及复制。

## 开发启动

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-control.txt
.venv/bin/python -m uvicorn formula_ocr.app:create_app --factory --app-dir src --reload
```

本地开发时默认不会加载 Paddle 模型。设置 `FORMULA_OCR_MOCK_RECOGNIZER=1` 和 `FORMULA_OCR_DEV_AUTH=1` 后可使用模拟识别器验证完整流程；生产环境必须先通过 CPU 或 CUDA 运行时检测。

## fnOS 打包

```bash
scripts/build_fpk.sh
cd dist/paddle-formula-ocr
fnpack build
```

生成的 FPK 不包含模型和 GPU 运行时。管理员首次进入设置页后可分别安装 CPU、NVIDIA CUDA 11.8 或 NVIDIA CUDA 12.6，再下载模型。CUDA 11.8 要求英伟达显卡驱动版本 ≥450.80.02；CUDA 12.6 要求英伟达显卡驱动版本 ≥550.54.14。两个 GPU 运行时相互隔离，安装后均需执行真实识别测试。部署前请在目标 x86_64 fnOS 机器执行 `scripts/preflight_fnos.sh`。

卸载时会显示 fnOS 原生卸载向导；默认保留运行时、模型与设置，便于重装。选择“删除所有应用数据”后，应用会在卸载完成时清理 `/vol*/@appdata/paddle-formula-ocr` 中的所有持久数据。

## 目录

- `src/formula_ocr/`：Web API、任务队列、Worker 协议、运行时管理。
- `static/`：无需 Node 构建即可部署的前端页面。
- `runtime-manifests/`：CPU/CUDA 运行时的固定依赖清单。
- `fnos-package/`：FPK 模板。
- `scripts/`：打包与目标机器预检脚本。
