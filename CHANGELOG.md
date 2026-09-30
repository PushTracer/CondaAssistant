# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格。

## [0.3.1] - 2026-09-30

### 重构

- 拆分 `core/shell.ts`：通用进程原语（spawn、超时、进程树终止、行流解析）移至新的 `core/process.ts`，`shell.ts` 仅保留 conda/pip 语义封装。
- 从 `commands/aiCommands.ts` 抽出 `ai/pipProgress.ts`（pip/conda 下载输出解析与进度节流）与 `ai/quickCreate.ts`（一键创建向导），命令文件变为薄注册层。
- 新增 `commands/helpers.ts` 共享助手：环境选择器 `pickEnvironment`、WSL 发行版列表 `listWslDistros`，消除多处重复。
- 环境路径解析统一为 `platform.resolveEnvPathFromInfo`；pip 工作目录统一为 `platform.getPipWorkDirs`。
- 字节数量解析 `parseByteAmount` 归入 `util/format.ts`。

### 修复

- Windows 磁盘空间查询不再使用已被新版本 Windows 移除的 `wmic`，改用 .NET `DriveInfo`。
- 激活环境与 WSL 命令中的环境名/参数经过转义（`quotePosix`），避免空格或元字符被解释为 shell 语法。
- `condaService` 中原本被静默吞掉的错误（获取包数量等）现在写入输出通道日志。
- `renameEnvironment` 改为优先调用 conda 原生的 `conda rename`（conda ≥ 4.14），旧版本回退到克隆 + 删除；删除旧环境失败时会显式告警。
- `core/platform.ts` 新增 `setPlatformErrorHandler`，磁盘空间 / inode / pip 工作目录探测失败会经由注入的回调上报到输出通道，不再静默吞掉。
- pip 下载进度不再显示百分比（总量按包计算、可能误导），改为「速度 + 已下载 / 总量」。
- 修复 pip 进度「已下载」超过「总大小」的问题：磁盘字节兜底改为只统计当前包的增量，并将已下载量钳制在总大小以内。

### 其他

- 移除死代码：`RemoteService.execInWSL`、`RemoteService.isRemote()`、未使用的 `PackageInfo` 类型。
- 新增 GitHub Actions CI（`.github/workflows/ci.yml`），执行 `lint` + `l10n:check` + 扩展测试。
- 精简 `.vscodeignore`：发布包不再包含 TypeScript 源码、source map、测试与构建脚本，文件数由 132 缩减到 45。
- 重做图标：市场图标改为深色底 + 绿色「C」 + AI 星芒（`resources/icon.svg`、`icon.png` 128×128、`icon-256.png` 256×256）；新增符合 VS Code 规范的 24×24 单色活动栏图标 `resources/activitybar.svg`，`viewsContainers` 改指向它。
- 新增 `scripts/make-icon.ps1`：按 `resources/icon.svg` 的同一套几何重新生成各尺寸 PNG（`-Sizes 128,256,512` 可扩展）。

### 文档与测试

- 新增 `README.md` 与 `CHANGELOG.md`；重写已过期的 `PROJECT_REPORT.md`。
- 新增下载进度解析与 `parseByteAmount` 单元测试，测试用例由 8 个增加到 17 个。

## [0.3.0]

- 界面与命令名称优化，增强本地化（中英双语）支持。
- 更新 VSIX 安装说明。

## [0.1.0] - 初始版本

- 首个可用版本：环境管理、AI 环境一键创建、健康检查、PyTorch 测试、WSL 扫描。
