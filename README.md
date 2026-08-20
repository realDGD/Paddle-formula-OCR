# 公式与表格 OCR 工作台 for fnOS

面向 fnOS 的原生公式与表格识别应用。它可以在 NAS 上完成图片 OCR、LaTeX/Markdown 编辑与预览、Word/WPS 公式复制和手写单符号检索。

当前版本：`0.3.132`。开发者与发布者：[realDGD](https://github.com/realDGD)。

> 这是 fnOS 原生 FPK 应用，不是浏览器扩展。识别服务、模型和用户数据均运行或保存在自己的 NAS 上。

## 功能

- 选择、拖放或粘贴 PNG、JPEG、WebP 图片，支持识别前裁剪。
- 使用 PaddleOCR PP-FormulaNet 系列模型识别公式，可选择 CPU、CUDA 11.8 或 CUDA 12.6 运行环境。
- 使用 PaddleOCR Table Recognition V2 识别表格，输出可编辑、复制并实时预览的 Markdown。
- 编辑 LaTeX 源码并实时预览，提供语法高亮、命令补全、常用符号和公式模板。
- 在 MathLive 可视化编辑器与 LaTeX 源码之间双向同步。
- 将结果复制为原始 LaTeX、行内/独立公式、MathML，或直接复制到 Word/WPS。
- 使用内置 Detexify 数据集手写检索单个 LaTeX 符号。
- 通过带 Bearer Token 的局域网 API 从其他电脑提交截图并获取 LaTeX。
- 使用 fnOS 用户身份控制访问；管理员设置与普通用户个人设置相互分离。

## 运行要求

| 项目 | 要求 |
| --- | --- |
| fnOS | `1.1.3100` 或更高版本 |
| 处理器架构 | x86_64（当前 FPK 不支持 ARM） |
| 系统依赖 | fnOS Python 3.12 应用；安装 FPK 时由系统处理依赖 |
| CPU 模式 | 无需 NVIDIA 显卡；CPU 识别组件已包含在 FPK 中，可离线安装 |
| GPU 模式 | NVIDIA 显卡及可用的 fnOS 主机驱动；安装识别组件时需要联网 |
| 浏览器 | 建议使用当前版本的 Chrome 或 Edge |

首次真实识别需要从 PaddlePaddle BOS 下载所选模型。CUDA 11.8 需要 NVIDIA 驱动版本不低于 `450.80.02`，CUDA 12.6 需要不低于 `550.54.14`。不确定时先只安装 CPU 组件，应用可以正常使用。

## 在 fnOS 安装

### 1. 下载 FPK

从 [GitHub Releases](https://github.com/realDGD/Paddle-formula-OCR/releases) 下载最新的 `.fpk` 文件。请不要下载 GitHub 自动生成的 “Source code” 压缩包，它不能直接在 fnOS 中安装。

如果 Releases 暂时没有对应版本，也可以按照下方“从源码构建 FPK”自行打包。

### 2. 手动安装

1. 使用管理员账户登录 fnOS。
2. 打开“应用中心”，点击左下角的“手动安装”。
3. 选择下载好的 `.fpk` 文件并确认安装。
4. 在安装向导中设置局域网 API 端口；默认值为 `8504`，可填写 `1024`—`65535` 范围内未被占用的端口。
5. 等待系统安装 Python 3.12 依赖并完成应用初始化。
6. 安装完成后，从 fnOS 桌面打开“公式与表格 OCR 工作台”。

### 3. 首次配置识别环境

1. 以 fnOS 管理员身份打开应用，进入“管理员设置” → “软件安装”。
2. 点击“一键安装”，至少选择“CPU 识别组件”。
3. 如果 NAS 有 NVIDIA 显卡，可同时选择与驱动匹配的 CUDA 11.8 或 CUDA 12.6 组件。
4. 等待组件检测、模型下载和真实公式识别测试全部完成。首次运行耗时取决于网络和硬件。
5. 在“识别性能”中保留“自动选择”即可；应用会优先使用已安装的 CUDA 组件，否则使用 CPU。

CPU 组件从 FPK 内置 wheelhouse 安装，不访问网络；CUDA 组件和首次模型下载需要 NAS 能访问对应的软件源。应用只安装识别软件，不会安装或升级 NVIDIA 驱动。

表格管线包含多个模型，第一次识别表格时还会下载并加载对应模型；后续任务会复用本地缓存。

## 使用教程

### 图片公式识别

1. 打开“图片识别”页面。
2. 点击“选择图片”、把图片拖入上传区，或按 `Ctrl/⌘ + V` 粘贴截图。
3. 如图片包含多余内容，点击“裁剪公式区域”后保留需要识别的部分。
4. 点击“识别公式”，等待 LaTeX 结果出现。
5. 直接修改 LaTeX 源码，并在下方检查 MathJax 预览。输入反斜杠和命令前缀可以使用自动补全。
6. 选择复制格式后点击“复制”；需要粘贴到 Word/WPS 时使用“复制到 Word”。
7. 需要更多编辑工具时，点击“进入高级编辑”。

默认单张图片上限为 10 MiB、2500 万像素，管理员可以在设置中调整限制。应用仅接受 PNG、JPEG 和 WebP。

### 图片表格识别与表格编辑器

1. 打开独立的“表格识别”页面。
2. 选择、拖放或粘贴包含表格的图片；如有无关内容，可先裁剪识别区域。
3. 点击“识别表格”，等待 Markdown 结果出现并检查预览。
4. 复制结果，或点击“进入表格编辑器”继续编辑；也可以直接打开独立的“表格编辑器”从空白 Markdown 开始。

带合并单元格的结果会展平为空占位格并输出 Markdown；结构化 HTML 仅用于安全预览，不执行识别结果中的脚本或事件属性。

### 公式编辑器

1. 切换到“公式编辑器”。
2. 选择“LaTeX 源码”或“可视化输入”；两种输入方式会保持同步。
3. 使用“快捷工具”插入符号，或从“公式模板”插入常见结构。
4. 需要查找陌生符号时，在“手写单符号识别”画布中书写，点击候选即可插入当前光标位置。
5. 确认预览后，复制为 LaTeX、MathML 或 Word/WPS 公式。

### 个人设置与管理员设置

- “个人设置”只影响当前 fnOS 用户，可选择在浏览器新标签页或 fnOS 桌面内打开应用，并保存编辑器字号、预览缩放等偏好。
- “管理员设置”可以限制应用访问范围、选择模型与运行环境、设置超时和队列、管理识别组件，以及查看安装/运行日志。
- 默认模型为 `PP-FormulaNet_plus-M`；也可以选择 `PP-FormulaNet_plus-S` 或 `PP-FormulaNet_plus-L`。

### 局域网 API

管理员可以在“管理员设置” → “局域网 API”中启用独立 API 服务、查看客户端示例和重新生成 Token。应用内提供了可直接复制的 Python 截图客户端。

也可以使用 `curl` 调用：

```bash
curl -X POST "http://FNOS_IP:8504/predict" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@formula.png"
```

成功响应示例：

```json
{"status":"success","latex":"x^2+y^2=z^2"}
```

局域网 API 使用 HTTP 明文传输，只应在可信局域网或 VPN 中启用。不要把 Token 写入仓库、聊天记录或公开日志；Token 泄露后请立即在管理员设置中重新生成。

局域网 `/predict` 端点保持原有公式 LaTeX 协议；表格识别目前只在 fnOS 工作台中提供，避免破坏现有客户端。

## fnOS Open API 适配评估

当前版本继续兼容 fnOS `1.1.3100`，并沿用现有网关身份鉴权。官方新 Open API 中，与本项目直接相关的能力有：

- `getPlatformConfig`、主题/语言事件和 `setTitle`：可替代现有兼容代码，但要求 fnOS `1.2.0401` 与应用中心 `1.34.0`；适合在提高最低系统版本时一起接入。
- `pickUserFile`：可增加“从 NAS 选择图片”，但返回的是 NAS 路径，需要同时实现后端 Scope、用户 ACL 校验和受限路径读取；不应只做前端选择器。
- 文件路径转换与 ACL API：只在实现 NAS 文件选择时需要；当前浏览器上传临时文件链路不需要这些权限。

因此本次没有新增 Open API Scope，也不会保存 `TRIM_API_TOKEN`。参考：[fnOS Open API 总览](https://developer.fnnas.com/api/overview/)与[调用方式](https://developer.fnnas.com/api/calling/)。

## 升级与卸载

- 升级时从 Releases 下载新版 FPK，再通过 fnOS 应用中心安装；应用会刷新控制环境依赖。
- 卸载向导默认保留 fnOS 持久共享目录中的运行环境、模型、设置和任务数据，便于以后重装；可重建的控制环境仍由安装程序重新创建。
- “仅保留运行环境与模型”会删除设置、任务记录、日志和缓存，用于排查异常配置。
- “彻底删除”会清空应用的 fnOS 持久共享目录。该操作不可恢复，请先确认不再需要模型和配置。

## 从源码构建 FPK

构建需要 Bash、Node.js `22.18` 或更高版本、npm、Python 3 和 fnOS 的 `fnpack` 工具。先准备前端资源与 Linux x86_64 离线依赖：

```bash
npm ci
bash scripts/download_wheelhouse.sh
bash scripts/download_cpu_runtime_wheelhouse.sh
bash scripts/build_fpk.sh
```

然后在装有 `fnpack` 的目标环境执行：

```bash
cd dist/paddle-formula-ocr
fnpack build
```

打包前建议在目标 x86_64 fnOS 设备运行：

```bash
bash scripts/preflight_fnos.sh
```

构建产物不包含公式模型和 GPU 运行环境；CPU 运行环境会随 FPK 离线打包。

## 本地开发

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-control.txt
npm ci
npm run build
FORMULA_OCR_MOCK_RECOGNIZER=1 \
FORMULA_OCR_DEV_AUTH=1 \
.venv/bin/python -m uvicorn formula_ocr.app:create_app \
  --factory --app-dir src --reload
```

打开终端显示的本地地址即可。模拟识别器只用于开发测试；生产环境必须先通过 CPU 或 CUDA 运行环境检测。

运行测试：

```bash
.venv/bin/python -m pytest
node --test tests/js/*.mjs tests/js/*.js
```

## 项目结构

- `src/formula_ocr/`：Web API、任务队列、Worker 协议和运行环境管理。
- `frontend/app/`：TypeScript 工作台源码，入口为 `main.ts`。
- `static/`：可直接部署的页面和由 esbuild 生成的前端包。
- `runtime-manifests/`：CPU/CUDA 运行环境的固定依赖清单。
- `fnos-package/`：FPK 模板、生命周期脚本和安装/卸载向导。
- `scripts/`：打包、依赖下载和目标机器预检脚本。

## 隐私与数据生命周期

- 上传图片只写入应用临时目录；任务成功、失败、超时或排队取消后立即删除，运行中的取消会在底层推理退出后删除。
- fnOS 环境优先使用 `$TRIM_PKGTMP/jobs`；应用启动和停止时都会清理残留图片。
- 上传流复制完成后会立即关闭，不等待同步局域网 API 请求完成。
- 任务记录不保存原始文件名、显示用户名或上传来源；新安装默认保留结果 1 天。
- Paddle 推理需要文件路径，因此任务排队和推理期间仍会短暂存在一个临时图片文件。
- 模型、运行环境、设置和任务数据库保存在 fnOS 持久 data-share 中，选择保留数据卸载后仍可复用。

## 致谢

本项目使用或参考了 [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)、[visualtex](https://github.com/paulhe666/visualtex)、[detexify-next](https://github.com/kirel/detexify-next)、[MathLive](https://github.com/arnog/mathlive) 和 [MathJax](https://github.com/mathjax/MathJax)。
