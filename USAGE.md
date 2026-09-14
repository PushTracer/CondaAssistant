# CondaAssistant 使用教程

CondaAssistant 是一个面向 AI / 深度学习场景的 VS Code Conda 环境助手：在侧边栏统一管理 Conda 环境，一键创建 PyTorch、TensorFlow 等框架环境，并对环境做健康检查、PyTorch 功能测试、磁盘诊断和 WSL 扫描。

---

## 目录

- [1. 安装](#1-安装)
- [2. 界面说明](#2-界面说明)
- [3. 常用操作](#3-常用操作)
- [4. 环境一键创建](#4-环境一键创建)
- [5. 环境健康检查](#5-环境健康检查)
- [6. 环境分析](#6-环境分析)
- [7. 包管理与依赖](#7-包管理与依赖)
- [8. WSL 支持](#8-wsl-支持)
- [9. 磁盘与缓存](#9-磁盘与缓存)
- [10. 全部命令](#10-全部命令)
- [11. 设置项](#11-设置项)
- [12. 常见问题](#12-常见问题)
- [13. 开发者指引](#13-开发者指引)

---

## 1. 安装

### 1.1 前置要求

| 项目 | 要求 |
|------|------|
| VS Code | 1.85.0 及以上 |
| Conda | Miniconda / Anaconda / Miniforge / Mambaforge 均可，已加入 PATH 或安装默认目录 |
| Python 扩展 | 推荐安装（解释器切换依赖它） |

### 1.2 从 VSIX 安装

方式一（命令行）：

```bash
code --install-extension conda-assistant-0.2.0.vsix
```

方式二（图形界面）：

1. 打开 VS Code，按 `Ctrl+Shift+X` 打开扩展面板；
2. 点击右上角 `...` → **Install from VSIX...**；
3. 选择 `conda-assistant-0.2.0.vsix` 并重载窗口。

### 1.3 首次启动

安装后左侧活动栏会出现 **Conda Manager** 图标。扩展会：

1. 自动探测本机与 WSL 中的 Conda；
2. 加载环境列表并通过窗口进度条提示；
3. 根据设置执行一次启动健康检查。

所有日志输出在 **输出面板 → Conda Manager** 中。若未检测到 Conda，会弹出提示与官网安装指南，你可以在设置中手动指定路径：

```json
{ "conda-assistant.condaPath": "C:\\Users\\you\\miniconda3\\Scripts\\conda.exe" }
```

### 1.4 界面语言

扩展支持中文（默认）与英文，跟随 VS Code 显示语言自动切换：

- 命令标题、视图名、设置说明：`package.nls.json`（中文）/ `package.nls.en.json`（英文）；
- 运行时提示、输出面板日志、健康检查报告：`l10n/bundle.l10n.en.json`；
- PyTorch 功能测试脚本的输出文案也会自动切换（扩展根据 VS Code 语言传入 `--lang zh|en`）。

切换到英文界面：`Ctrl+Shift+P` → **Configure Display Language** → 选择 `en` 并重载窗口。

---

## 2. 界面说明

侧边栏包含两个视图：

### 2.1 Conda 环境

- 每个环境是一个可展开节点，`✓` 表示当前激活环境；
- **展开节点**会异步加载详情：Python 版本、包数量、目录大小、路径；
- 点击 **`Python x.y`** 一行可直接把 VS Code 解释器切换到此环境；
- 右键菜单：删除、克隆、重命名、安装包、卸载包、PyTorch 功能测试；
- 悬停节点右侧的行内按钮：**激活环境**、**环境分析**；
- 视图标题栏的按钮：**刷新环境列表**、**创建环境**。

> WSL 环境以 `🐧 环境名 (WSL)` 显示，仅供查看，不可直接修改。

### 2.2 快速操作

| 操作 | 对应命令 |
|------|----------|
| 🔄 环境一键创建 | `conda-assistant.quickCreate` |
| 🏥 环境健康检查 | `conda-assistant.healthCheck` |
| 🧪 PyTorch 功能测试 | `conda-assistant.pytorchTest` |
| 🐍 切换解释器 | `conda-assistant.selectInterpreter` |

---

## 3. 常用操作

### 3.1 创建普通环境

1. 点击环境视图标题栏的创建按钮，或执行命令 **创建环境...**；
2. 输入环境名（不能为空）；
3. 输入 Python 版本（默认取设置 `conda-assistant.defaultPythonVersion`，如 `3.12`）。

等价于 `conda create -y -n <name> python=<version>`；创建过程在通知进度条中显示，完成后自动刷新列表。

### 3.2 激活环境

在环境节点上右键 → **激活环境**。扩展会：

1. 打开（或复用）终端并发送 `conda activate`；
2. 同时尝试把 VS Code 的 Python 解释器切换到该环境。

WSL 环境会提示你改用 WSL 终端手动激活。

### 3.3 切换解释器

- **按环境**：展开环境节点，点击 `Python x.y` 行；
- **从列表选择**：执行 **切换 Python 解释器**，在快速选择中挑选 Conda 环境。

扩展会写入 workspace/全局的 `python.defaultInterpreterPath`，并通过 Python 扩展 API 切换活动解释器（含结果校验）。切换过程日志可在输出面板查看。

### 3.4 删除 / 克隆 / 重命名

- **删除**：右键 → 删除环境，需在模态框中点击 **确认删除**；删除后询问是否顺带执行 `conda clean -afy` 清理包缓存；
- **克隆**：右键 → 克隆环境，输入新名称（等价 `conda create --clone`）；
- **重命名**：右键 → 重命名环境，实现方式为「克隆到新名称 + 删除旧环境」，大环境耗时较长，请耐心等待。

### 3.5 查看环境详情

右键 → **环境分析**，生成一个 Markdown 文档，包含：

- Python 版本、包总数、环境目录实际大小；
- 每个包的名称、版本、体积（按体积降序）；
- 「包净体积总计」与「环境目录实际总计」对比。

### 3.6 PyTorch 功能测试

在环境节点右键 → **PyTorch 功能测试**（或快速操作里的 🧪 入口、命令面板执行），选择环境后扩展会调用该环境的 Python 运行内置测试脚本，覆盖 23 项：

- 基础：CPU Tensor / Tensor 基础操作 / CUDA Tensor / CPU↔GPU 传输；
- 自动求导与网络：Autograd、CUDA Autograd、神经网络、GPU 神经网络、CNN；
- 训练链路：Loss、Optimizer、完整训练循环、DataLoader、GPU DataLoader；
- 精度与性能：AMP/FP16、BF16、CUDA 显存分配、CPU/GPU 计算正确性、GPU 压力测试、CUDA 算子；
- 生态：模型保存/加载、torch.compile、cuDNN。

运行日志实时输出到独立的 `PyTorch 测试 <环境名>` 输出通道，结束时弹出汇总：

- `PASS` 通过项数；`WARN` 为跳过/不支持（如无 GPU、BF16 不支持）；`FAIL` 为失败项数；
- 环境未安装 torch 时会提示先用「环境一键创建」或 pip 安装；
- 测试脚本位于扩展目录 `resources/pytorch_test.py`，也可单独复制出来手动运行。

---

## 4. 环境一键创建

执行 **环境一键创建** 后按提示操作。

### 4.1 内置模板

| 模板 | 默认 Python | 预装内容 |
|------|-------------|----------|
| PyTorch | 3.12 | torch / torchvision / torchaudio（CPU 或 CUDA，变体实时获取） |
| TensorFlow | 3.11 | tensorflow / tensorflow-datasets / tensorboard（CPU / GPU） |
| 数据科学基础 | 3.12 | numpy、pandas、matplotlib、scikit-learn、jupyter、scipy |
| 计算机视觉 | 3.12 | opencv-python、pillow + torch / torchvision（CPU / CUDA 12.4） |
| 自然语言处理 | 3.12 | transformers、datasets、tokenizers、sentence-transformers、accelerate、evaluate + torch |
| XGBoost / LightGBM | 3.12 | xgboost、lightgbm |

PyTorch / 计算机视觉 / NLP 模板会实时访问 `download.pytorch.org` 探测可用的 CUDA 版本，并自动过滤该版本下不存在的 torchvision / torchaudio；网络不可用时回退到内置版本列表（含 CUDA 13.0 / 12.6 / 12.4 / 12.1 与 Nightly）。

### 4.2 创建流程

1. **选择模板**；
2. **选择版本变体**（CPU / CUDA x.y / Nightly，含 RTX 50 系列推荐标记）；
3. **确认环境名**（默认 `<模板>-<cuda版本>`，如 `pytorch-cu130`）；
4. **确认 Python 版本**（需符合 `x.y` 格式）；
5. **输入额外 pip 包**（空格分隔，可留空）；
6. 扩展进行**磁盘预检**后开始安装。

### 4.3 磁盘预检

安装前会检查目标盘、临时目录空间与 inode 使用率：

- 目标盘剩余 < 8GB；
- 临时目录剩余 < 2GB（pip 下载可能失败）；
- inode 使用率 ≥ 90%（可能出现 ENOSPC）。

发现问题时弹窗提供两个选择：

- **清理缓存并继续**：执行 `conda clean -afy` 与 pip 缓存清理后复检；
- **忽略风险继续**：直接安装。

### 4.4 安装过程

- 打开独立输出通道 `安装 <环境名>`，实时输出 conda / pip 日志；
- 通知进度条显示下载速度与百分比，可取消；
- 若环境缺少 pip，会弹窗询问是否安装；
- pip 安装时自动为环境创建隔离的临时目录与缓存目录（`<env>/.pip-tmp`、`<env>/.pip-cache`）。

---

## 5. 环境健康检查

执行 **环境健康检查** 后打开健康面板，检查项包括：

| 检查项 | 说明 |
|--------|------|
| Conda | 版本与可用性 |
| 环境 | 环境数量、base Python 版本、解释器缺失标记 `(!)` |
| PyTorch | 在首个检测到 PyTorch 的环境中检查版本与 CUDA 可用性 |
| TensorFlow | 版本与 GPU 设备数量（未安装记为 info） |
| pip | 版本 |

评分规则：每项满分 10 分，`ok` 得 10 分、`warning` 得 5 分、`error` / `info` 得 0 分，最终换算为百分制。颜色：≥80 绿色、≥60 橙色、<60 红色。

启动时若 `healthCheckOnStartup` 为 `true`，会自动执行一次；存在错误时弹出警告。

---

## 6. 环境分析

见 [3.5 查看环境详情](#35-查看环境详情)。分析逻辑直接读取环境 `conda-meta/*.json`，无需启动 Python 进程，速度较快。

---

## 7. 包管理与依赖

| 操作 | 入口 | 说明 |
|------|------|------|
| 安装包 | 环境右键 → 安装包 | `conda install -y -n <env> <pkg>` |
| 卸载包 | 环境右键 → 卸载包 | 快速选择已装包列表（可按版本搜索） |
| 查看依赖 | 命令面板 → 查看依赖 | 输入包名，列出其依赖，或提示未被直接依赖 |
| 检测依赖冲突 | 命令面板 → 检测依赖冲突 | 扫描多父包对同一依赖的版本约束差异 |

---

## 8. WSL 支持

- 启动时若 `enableWSLSupport` 为 `true`，会自动枚举 WSL 发行版并检测其中的 Conda；发现的发行版里的环境会以 `🐧 名字 (WSL)` 附加到环境树，只读；
- **扫描 WSL Conda 环境**：选择一个发行版，浏览其中的环境及 Python 版本、路径；
- **打开 WSL 终端**：创建一个 `wsl.exe -d <发行版>` 终端。

> 当前版本对 WSL 环境仅支持浏览，删除 / 安装包等写操作请在 WSL 终端中手动执行。

---

## 9. 磁盘与缓存

### 10.1 磁盘空间诊断

执行 **磁盘空间诊断**，弹窗显示根目录、临时目录、用户目录、pip 缓存目录、Conda 安装目录的剩余空间；Linux / macOS 下还会显示 inode 使用率。

### 10.2 清理缓存

执行 **清理缓存（Conda / pip）**，可选择：

- 清理 Conda 缓存（`conda clean -afy`）；
- 清理 pip 缓存（Linux/macOS：删除 `~/.cache/pip`；Windows：`python -m pip cache purge`）；
- 全部清理。

完成后提示本次释放的空间大小与当前可用空间。

---

## 10. 全部命令

在命令面板（`Ctrl+Shift+P`）中搜索 `Conda` 即可看到：

| 命令 ID | 标题 |
|---------|------|
| `conda-assistant.refresh` | 刷新环境列表 |
| `conda-assistant.createEnvironment` | 创建环境... |
| `conda-assistant.deleteEnvironment` | 删除环境 |
| `conda-assistant.activateEnvironment` | 激活环境 |
| `conda-assistant.quickCreate` | 环境一键创建 |
| `conda-assistant.healthCheck` | 环境健康检查 |
| `conda-assistant.pytorchTest` | PyTorch 功能测试 |
| `conda-assistant.analyzeEnvironment` | 环境分析 |
| `conda-assistant.selectInterpreter` | 切换 Python 解释器 |
| `conda-assistant.switchInterpreter` | 切换解释器（指定环境） |
| `conda-assistant.installPackage` | 安装包 |
| `conda-assistant.uninstallPackage` | 卸载包 |
| `conda-assistant.showPackageDeps` | 查看依赖 |
| `conda-assistant.cloneEnvironment` | 克隆环境 |
| `conda-assistant.renameEnvironment` | 重命名环境 |
| `conda-assistant.detectConflict` | 检测依赖冲突 |
| `conda-assistant.scanWSL` | 扫描 WSL Conda 环境 |
| `conda-assistant.openWSLTerminal` | 打开 WSL 终端 |
| `conda-assistant.diskDiagnose` | 磁盘空间诊断 |
| `conda-assistant.cleanCache` | 清理缓存（Conda / pip） |

---

## 11. 设置项

在设置中搜索 `conda-assistant`：

| 设置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `conda-assistant.condaPath` | string | `""` | Conda 可执行文件路径，留空自动检测 |
| `conda-assistant.autoDetectConda` | boolean | `true` | 启动时自动检测 Conda |
| `conda-assistant.defaultPythonVersion` | string | `"3.12"` | 创建环境时的默认 Python 版本 |
| `conda-assistant.healthCheckOnStartup` | boolean | `true` | 启动时自动进行环境健康检查 |
| `conda-assistant.showInactiveEnvironments` | boolean | `true` | 显示非激活环境 |
| `conda-assistant.enableWSLSupport` | boolean | `true` | 启用 WSL Conda 检测 |
| `conda-assistant.condaInstallTimeout` | number | `600000` | Conda / pip 安装超时（毫秒） |

---

## 12. 常见问题

**Q：提示「未检测到 Conda」？**
安装 Miniconda / Anaconda 后重载窗口，或在设置中显式填写 `conda-assistant.condaPath`。Windows 常见路径为 `%USERPROFILE%\miniconda3\Scripts\conda.exe`。

**Q：安装大包时超时？**
调大 `conda-assistant.condaInstallTimeout`（默认 10 分钟）。安装前建议先用「清理缓存」释放空间。

**Q：pip 下载报 ENOSPC？**
多为临时目录或 inode 不足。执行「磁盘空间诊断」，清理缓存后重试；也可清理 `/tmp`。

**Q：该选哪个 CUDA 版本？**
RTX 50 系列显卡选 `cu130`（模板中会带「RTX 50 系列推荐」标记）；RTX 30/40 系列一般选 `cu126` 或 `cu124`；无 NVIDIA 显卡选 CPU。

**Q：切换解释器后仍显示旧环境？**
确认已安装 Python 扩展，并查看输出面板 `[setInterpreter]` 日志；部分工程在 `.vscode/settings.json` 中固定了解释器，以 workspace 设置为准。

**Q：WSL 中的环境不能安装包？**
设计如此，写操作请用 **打开 WSL 终端** 在 WSL 内执行。

**Q：重命名环境很慢？**
重命名为「克隆 + 删除」两步操作，环境越大越慢，属于正常现象。

---

## 13. 开发者指引

```bash
npm install          # 安装依赖
npm run compile      # 编译到 out/
npm run watch        # 监听编译
npm run lint         # 类型检查（tsc --noEmit）
npm run l10n:check   # 校验英文翻译是否覆盖全部 l10n.t 文案
npm test             # 启动 VS Code 扩展测试（9 个用例）
npm run package      # 打包生成 conda-assistant-0.2.0.vsix
```

代码结构：

```
src/
├── extension.ts        激活入口
├── models/types.ts     共享类型
├── core/               logger / config / platform / shell
├── util/               纯工具函数（format / parse）
├── services/           conda / health / interpreter / remote / disk / pytorchTest
├── ai/                 环境模板与 PyTorch CUDA 索引抓取
├── views/              环境树 / 快速操作树 / 健康面板
└── commands/           命令注册（按领域拆分）
resources/
└── pytorch_test.py     PyTorch 功能测试脚本（支持 --lang zh|en）
package.nls.json        声明式文案（中文默认）
package.nls.en.json     声明式文案（英文）
l10n/
└── bundle.l10n.en.json 运行时文案英文翻译
scripts/
└── verify-l10n.js      翻译覆盖率校验脚本
```
