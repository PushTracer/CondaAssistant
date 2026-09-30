# Conda Manager (conda-assistant)

面向 AI / 深度学习场景的 VS Code Conda 环境助手：在侧边栏统一管理 Conda 环境，一键创建 PyTorch、TensorFlow 等框架环境，并对环境做健康检查、PyTorch 功能测试、磁盘诊断和 WSL 扫描。

An AI-oriented Conda environment manager for VS Code: manage environments from the sidebar, one-click create PyTorch/TensorFlow setups, run health checks, PyTorch smoke tests, disk diagnostics and WSL scanning.

## 功能特性

- **环境一键创建**：PyTorch / TensorFlow / 计算机视觉 / NLP / 数据科学 / XGBoost 模板，实时抓取 PyTorch 官网可用 CUDA 版本。
- **环境管理**：创建、激活、克隆、重命名、删除，查看 Python 版本 / 包数量 / 目录大小。
- **健康检查**：Conda、Python、PyTorch、TensorFlow、pip 综合评分（Webview 面板）。
- **PyTorch 功能测试**：调用环境内 Python 运行内置脚本，覆盖 23 项功能。
- **包管理**：安装、卸载、查看依赖、检测依赖冲突。
- **磁盘与缓存**：安装前空间/inode 预检，Conda / pip 缓存清理，磁盘空间诊断。
- **WSL 支持**：枚举 WSL 发行版及其中的 Conda 环境，打开 WSL 终端。
- **中英双语**：跟随 VS Code 显示语言自动切换。

## 安装

需要 VS Code 1.85.0 及以上，以及 Miniconda / Anaconda / Miniforge / Mambaforge 之一。

```bash
code --install-extension conda-assistant-0.3.1.vsix
```

也可在扩展面板右上角 `...` → **Install from VSIX...** 选择 `.vsix` 文件。

详细使用说明见 [USAGE.md](USAGE.md)。

## 设置项

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `conda-assistant.condaPath` | `""` | Conda 可执行文件路径，留空自动检测 |
| `conda-assistant.autoDetectConda` | `true` | 启动时自动检测 Conda |
| `conda-assistant.defaultPythonVersion` | `"3.12"` | 创建环境时的默认 Python 版本 |
| `conda-assistant.healthCheckOnStartup` | `true` | 启动时自动健康检查 |
| `conda-assistant.showInactiveEnvironments` | `true` | 显示非激活环境 |
| `conda-assistant.enableWSLSupport` | `true` | 启用 WSL Conda 检测 |
| `conda-assistant.condaInstallTimeout` | `600000` | 安装过程的「无输出超时」（毫秒） |

## 开发

```bash
npm install
npm run compile      # 编译到 out/
npm run watch        # 监听编译
npm run lint         # 类型检查（tsc --noEmit）
npm run l10n:check   # 校验英文翻译覆盖率
npm test             # 启动 VS Code 扩展测试宿主
npm run package      # 打包 .vsix

# 重新生成图标位图（设计母版为 resources/icon.svg）
powershell -ExecutionPolicy Bypass -File scripts/make-icon.ps1
```

代码结构见 [PROJECT_REPORT.md](PROJECT_REPORT.md)。

## 许可证

[MIT](LICENSE)
