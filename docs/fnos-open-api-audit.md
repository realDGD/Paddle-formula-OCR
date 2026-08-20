# fnOS Open API 适配审计

> 审计日期：2026-08-13。结论：本次表格 OCR 与 TypeScript 迁移不接入 `@trimjs/web-app` 或 fnOS Open API，不新增 `api-scope`，不声明 `micro_app=true`，不读取或保存 `TRIM_API_TOKEN`，继续保留 `os_min_version=1.1.3100`。现有统一网关已经满足当前登录态、用户识别和应用路由需求。

## 范围与判定依据

仓库此前没有 `docs/`、ADR 或 notes 目录约定，因此本审计放在 `docs/`。外部事实只采用 fnOS 官方开发文档；“当前是否使用”只按本仓库源代码和包配置判断。

fnOS 官方在 [2026-07-31 更新日志](https://developer.fnnas.com/docs/update-log/)中将这一批 Open API 标为新增能力，并统一要求 fnOS `1.2.0401+`、宿主 App `1.34.0+`。当前项目的包资源声明为空（[`fnos-package/config/resource`](../fnos-package/config/resource#L1)），前端依赖没有 `@trimjs/web-app`（[`package.json`](../package.json#L12-L30)），manifest 没有 `micro_app=true` 且最低版本仍为 `1.1.3100`（[`fnos-package/manifest`](../fnos-package/manifest#L9-L18)）。

## 逐项审计矩阵

“最低版本”列中的 `1.2.0401 / 1.34.0` 分别指 fnOS / 宿主 App。官方没有为统一网关单列最低宿主版本，故不做推测。

| 能力 | 当前项目状态 | 最低版本 | Scope | 安全边界 | 未来接入触发条件 |
|---|---|---|---|---|---|
| [统一网关](https://developer.fnnas.com/docs/core-concepts/gateway-registration/) | **已使用，应保留。** UI 注册 `gatewayPrefix` 与 `gatewaySocket`（[`app/ui/config`](../fnos-package/app/ui/config#L7-L10)）；启动脚本监听 `app.sock` 并传入网关前缀（[`cmd/main`](../fnos-package/cmd/main#L57-L65)）；后端将前缀用于全部路由（[`app.py`](../src/formula_ocr/app.py#L64-L66)、[`app.py`](../src/formula_ocr/app.py#L128-L134)）。 | 官方页未注明 / 不适用 | 无 | 网关只校验登录态；项目仍以可信 `X-Trim-*` 头识别用户并执行普通用户/管理员业务鉴权（[`security.py`](../src/formula_ocr/security.py#L13-L36)）。不能信任客户端自报 UID；文件路径仍需单独校验。 | 无；它是当前架构，不属于本次新增 Open API。 |
| 前端 [`getPlatformConfig`](https://developer.fnnas.com/api/platform-config/) | **未使用。** 当前主题由 `theme.js` 读取宿主 DOM/localStorage，并以浏览器色彩偏好兜底（[`theme.js`](../static/theme.js#L17-L58)）。 | 1.2.0401 / 1.34.0 | 无 | 只读取宿主状态；独立浏览器和不支持 SDK 的宿主必须保留可用兜底。 | 项目愿意把 `os_min_version` 提升到 `1.2.0401`，并决定用受支持接口替换主题兼容读取时。 |
| 后端 [`trim.system.getPlatformConfig`](https://developer.fnnas.com/api/platform-config/) | **未使用。** 后端没有 Open API socket、请求名或 `TRIM_API_TOKEN` 调用。 | 1.2.0401 / 1.34.0 | `trim.system.getPlatformConfig` | 只能由服务端经 `/var/run/trim_open_gateway_apiscope.socket` 调用；token 每次从环境变量读取，不持久化、不记录、不交给前端。 | 后端确实需要按系统语言或系统版本改变响应时；前端初始化不构成理由。 |
| [`theme`](https://developer.fnnas.com/api/page/ui/) / `os/theme` | **SDK 未使用；已有兼容实现。** `theme.js` 同步浅/深色，跨域失败时安全回退。 | 1.2.0401 / 1.34.0 | 无 | `$on` 仅支持 Web 宿主且 `isStandaloneWeb === false`；移动端内嵌页和独立浏览器不能依赖该事件。 | 提升最低版本并替换现有兼容实现；否则不为“更标准”而增加依赖。 |
| [`language`](https://developer.fnnas.com/api/page/ui/) / `os/language` | **未使用。** 页面固定 `lang="zh-CN"`（[`index.html`](../static/index.html#L1-L7)），当前没有 i18n 文案层。 | 1.2.0401 / 1.34.0 | 无 | 与主题事件相同，`$on` 仅限 Web 宿主；初值应先读 `getPlatformConfig`。 | 产品真正支持多语言并有可切换文案后。 |
| [`setTitle`](https://developer.fnnas.com/api/page/ui/) | **未使用。** 桌面入口和 HTML 使用静态标题（[`app/ui/config`](../fnos-package/app/ui/config#L3-L5)、[`index.html`](../static/index.html#L7)）。 | 1.2.0401 / 1.34.0 | 无 | 只影响宿主标题，不应成为业务状态存储。 | 出现任务详情等需要动态宿主标题的页面，并且已经接入 SDK 时。 |
| [`setExitPageTips`](https://developer.fnnas.com/api/page/ui/) | **未使用。** 未发现应用级离开提示调用。 | 1.2.0401 / 1.34.0 | 无 | 只在确有未保存内容时设置，保存后必须清除；不能代替服务端持久化。 | 编辑器引入可丢失的脏状态，并验证宿主退出会造成实际数据损失时。 |
| [`close`](https://developer.fnnas.com/api/page/ui/) | **未使用。** 现有 `.close()` 只关闭 HTML dialog，不是关闭 fnOS 应用页。 | 1.2.0401 / 1.34.0 | 无 | 关闭当前应用页面；调用前应处理或提示未保存内容。 | 产品加入明确的“退出工作台”动作且已接入 SDK 时。 |
| [`pickUserFile`](https://developer.fnnas.com/api/authorization/user-access/) | **未使用。** 当前识别入口上传浏览器文件，不读取 NAS 路径；`disable_authorization_path=true`（[`manifest`](../fnos-package/manifest#L18)）。 | 1.2.0401 / 1.34.0 | `trim.file.userAccess` | 用户选择会给应用用户授予路径 ACL，但不会绕过当前用户权限。文件授权不进入 `getUserAccessibleFolders`；独立浏览器需 `openAppAuth`、校验 `state` 和同源 `postMessage`，并由用户手势触发。 | 明确增加“从 NAS 选择图片/批量目录”功能，并同时实现后端受限路径读取与当前用户 ACL 校验时。 |
| [共享授权 `sharedAccess`](https://developer.fnnas.com/api/authorization/shared-access/) | **未使用。** `config/resource` 为空。 | 1.2.0401 / 1.34.0 | `trim.file.sharedAccess` | 仅管理员可授权；只支持目录，不支持文件；应用仍需按当前用户 ACL 过滤内容。 | 管理员需要为所有用户配置固定素材目录、监听目录或批量库时；单次用户选图不需要。 |
| [`trim.file.getUserAccessibleFolders`](https://developer.fnnas.com/api/authorization/user-access/) | **未使用。** | 1.2.0401 / 1.34.0 | `trim.file.userAccess` | UID 必须来自统一网关身份；接口只返回该用户授权的**目录**，不返回文件授权。 | 已接入用户目录授权，且页面刷新、服务重启或后端任务需要重新同步目录时。 |
| [`trim.file.checkUserACL`](https://developer.fnnas.com/api/authorization/file-acl/) | **未使用。** 当前请求只处理上传临时文件，不向应用用户开放 NAS 路径。 | 1.2.0401 / 1.34.0 | `trim.file.userAcl` | 授权解决“应用用户能否访问”，ACL 检查解决“当前用户能否访问”。读取、列出、预览、写入、删除前按网关 UID 检查；不存在或不可探测路径按全 `false` 处理。 | 任何 NAS 路径进入后端处理链路时，与授权功能同批接入，不允许后补。 |
| [`trim.file.convertPath`](https://developer.fnnas.com/api/authorization/path-convert/) | **未使用。** UI 不展示 `/vol*/...` 内部路径。 | 1.2.0401 / 1.34.0 | `trim.file.path` | 只做展示语义转换，不授权、不证明路径可访问；必须传当前界面语言。 | 授权功能接入后需要向用户展示 NAS 内部路径时。 |
| [`openFile`](https://developer.fnnas.com/api/page/routing/) | **未使用。** | 1.2.0401 / 1.34.0 | 无 | 页面路由不会完成授权或权限判断；目标文件必须先处于授权范围并通过当前用户 ACL。 | 工作台产出或选择了 NAS 文件，且需要交给系统默认应用打开时。 |
| [`showFileDetails`](https://developer.fnnas.com/api/page/routing/) | **未使用。** | 1.2.0401 / 1.34.0 | 无 | 可进入元数据/权限界面，但调用前仍要确认路径来源和用户权限。 | 已有合法 NAS 路径，并需要查看元数据或调整权限时。 |
| [`openFileManager`](https://developer.fnnas.com/api/page/routing/) | **未使用。** | 1.2.0401 / 1.34.0 | 无 | 定位路径不代表授权；不能把未经校验的用户输入直接作为路径。 | 增加“在文件管理器中显示输入/输出目录”且路径已授权时。 |
| [`openAppSetting`](https://developer.fnnas.com/api/page/routing/) | **未使用。** 当前应用自己提供设置界面。 | 1.2.0401 / 1.34.0 | 无 | 只负责路由，不替代应用自己的业务设置和鉴权。 | 需要引导管理员去 fnOS 应用设置管理系统级授权或应用状态时。 |
| [`openURL`](https://developer.fnnas.com/api/page/routing/) | **SDK 未使用。** 启动页当前直接用 `window.open` 并保留用户点击链接兜底（[`launcher.js`](../static/launcher.js#L1-L16)）。 | 1.2.0401 / 1.34.0 | 无 | Web 宿主遵循 `window.open`，移动 WebView 通常交给系统浏览器；返回与刷新状态需应用自行处理。 | 已经因其他能力引入 SDK，且需要统一 Web/移动宿主的外链体验时；当前单独替换没有收益。 |
| [`@trimjs/web-app`](https://developer.fnnas.com/api/calling/) | **未安装。** `package.json` 只有现有编辑器、MathJax、MathLive 与构建依赖。 | 所调用能力决定；本批为 1.2.0401 / 1.34.0 | 所调用能力决定 | 调用前区分宿主/独立浏览器；只声明实际 Scope。不能把后端 token 放入 SDK 或静态资源。 | 至少有一个上述 SDK 能力成为已确认需求，并接受提高最低 fnOS 版本时。 |
| [`micro_app=true`](https://developer.fnnas.com/api/calling/) | **未声明。** 当前 manifest 没有该项。 | 本批 SDK 能力：1.2.0401 / 1.34.0 | 无 | 未声明时 SDK 相关能力可能无法初始化；声明会改变页面宿主模型，应与 SDK 接入一起验证，而非提前开启。 | 首次正式接入 JS SDK 时，同一个变更中加入并做 fnOS 宿主回归。 |
| [`os_min_version`](https://developer.fnnas.com/docs/core-concepts/manifest/) | **保留 `1.1.3100`。** 这是当前 manifest 的兼容下限。 | 当前项目：1.1.3100 | 无 | 官方要求最低版本应反映真实测试范围；接入 `1.2.0401+` API 后不能继续声称旧系统完整支持。 | 只有在决定接入 Open API、完成 `1.2.0401+` 真机回归并接受放弃旧系统后，才提升到至少 `1.2.0401`。 |

## 本次实施决定

1. 保留现有统一网关：它已完成稳定同域入口、登录态校验、UID/管理员身份转发和后端 Unix Socket 路由。
2. 表格 OCR 与 TypeScript 迁移继续使用现有浏览器上传、静态标题和主题兼容链路；这些改动不产生 NAS 路径授权、系统页面路由或后端平台配置需求。
3. 不安装 `@trimjs/web-app`，不新增 `micro_app=true`，`fnos-package/config/resource` 继续为空，不接 Open API socket，也不处理 `TRIM_API_TOKEN`。
4. `os_min_version=1.1.3100` 保持不变。为仅有潜在收益的宿主 UI 适配抬高最低版本，会无必要地缩小兼容范围。

## 推荐的未来接入边界

- **仅做宿主 UI 适配：** 在提高最低版本后一次性接入前端 `getPlatformConfig`，再按实际需求接主题/语言事件和标题；不需要后端 Scope。
- **从 NAS 导入文件：** `pickUserFile`、统一网关 UID、后端路径范围校验、`checkUserACL` 和现有图片内容验证必须作为一个完整安全链路交付。只有展示内部路径时再加 `convertPath`。
- **管理员固定目录：** 只有固定共享库场景才使用 `sharedAccess`；不要同时声明用户与共享 Scope 作为“备用”。
- **系统页面跳转：** 只在已经拥有合法、已授权的 NAS 路径后加入 `openFile`、`showFileDetails` 或 `openFileManager`。页面路由不能替代授权与 ACL。
- **后端 Open API：** 所有请求统一经官方 socket，`TRIM_API_TOKEN` 每次从当前进程环境读取，永不持久化、永不返回前端。

## 官方资料

- [fnOS 开发指南](https://developer.fnnas.com/docs/guide/)
- [Open API 概述](https://developer.fnnas.com/api/overview/)
- [调用方式：Scope、JS SDK、micro_app、后端 socket 与 token](https://developer.fnnas.com/api/calling/)
- [平台配置](https://developer.fnnas.com/api/platform-config/)
- [授权与文件概览](https://developer.fnnas.com/api/authorization/overview/)
- [用户个人授权路径](https://developer.fnnas.com/api/authorization/user-access/)
- [应用共享授权路径](https://developer.fnnas.com/api/authorization/shared-access/)
- [文件权限检查](https://developer.fnnas.com/api/authorization/file-acl/)
- [路径转换](https://developer.fnnas.com/api/authorization/path-convert/)
- [页面交互](https://developer.fnnas.com/api/page/ui/)
- [页面路由](https://developer.fnnas.com/api/page/routing/)
- [统一网关](https://developer.fnnas.com/docs/core-concepts/gateway-registration/)
- [Manifest](https://developer.fnnas.com/docs/core-concepts/manifest/)
- [文档更新日志](https://developer.fnnas.com/docs/update-log/)
