# Paddle Formula OCR for fnOS

一个通过 fnOS 统一网关访问、离线优先的公式工作台。应用将单公式图片识别、可选裁剪、LaTeX 源码高亮与命令补全、MathLive 可视化输入、MathJax 高兼容预览、手写单符号检索和多种复制格式整合在同一界面中。

开发者与发布者：[realDGD](https://github.com/realDGD)。

鸣谢：[PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)、[visualtex](https://github.com/paulhe666/visualtex)、[detexify-next](https://github.com/kirel/detexify-next)、[MathLive](https://github.com/arnog/mathlive) 和 [MathJax](https://github.com/mathjax/MathJax)。

## 开发启动

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-control.txt
npm install
npm run build
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

卸载时会显示 fnOS 原生卸载向导；默认保留全部数据，便于重装。也可以仅保留控制环境、CPU/CUDA 识别运行时与模型，同时清除设置、任务记录、日志和缓存，用于排查异常配置；选择彻底删除后，应用会清理 `/vol*/@appdata/paddle-formula-ocr` 中的所有持久数据。

## 目录

- `src/formula_ocr/`：Web API、任务队列、Worker 协议、运行时管理。
- `frontend/app/`：按功能和状态所有权拆分的工作台源码，入口为 `main.js`。
- `static/`：可直接部署的页面与由 esbuild 生成的 `app.js`。
- `runtime-manifests/`：CPU/CUDA 运行时的固定依赖清单。
- `fnos-package/`：FPK 模板。
- `scripts/`：打包与目标机器预检脚本。

## 数据生命周期

- 上传图片只写入应用临时目录；任务成功、失败、超时或排队取消后立即删除，运行中的取消会在底层推理退出后删除。
- fnOS 环境优先使用 `$TRIM_PKGTMP/jobs`；应用启动和停止时都会清理残留图片。
- 上传流复制完成后会立即关闭，不等待同步局域网 API 请求完成。
- 任务记录不保存原始文件名、显示用户名或上传来源；新安装默认保留结果 1 天。
- Paddle 推理需要文件路径，因此任务排队和推理期间仍会存在一个临时图片文件。
