import sys
import time
import platform
import traceback

import torch
import torch.nn as nn
import torch.optim as optim


# ============================================================
# PyTorch 全面功能测试 / PyTorch full functional test
# ============================================================

PASS = 0
FAIL = 0
WARN = 0

LANG = "zh"
if "--lang" in sys.argv:
    index = sys.argv.index("--lang")
    if index + 1 < len(sys.argv):
        LANG = sys.argv[index + 1].lower()
if LANG not in ("zh", "en"):
    LANG = "zh"

MESSAGES = {
    "zh": {
        "title": "PyTorch 环境测试",
        "label_python": "Python",
        "label_pytorch": "PyTorch",
        "label_platform": "Python平台",
        "label_cuda_build": "CUDA编译版本",
        "label_cuda_available": "CUDA可用",
        "label_gpu_count": "GPU数量",
        "gpu_header": "GPU {0}",
        "gpu_name": "  名称       : {0}",
        "gpu_compute_cap": "  Compute Cap: {0}",
        "gpu_memory": "  总显存     : {0:.2f} GB",
        "error_prefix": "  错误: {0}: {1}",
        "skip_cuda": "  CUDA 不可用，跳过 GPU 测试",
        "bf16_unsupported": "  当前 GPU / CUDA 不支持 BF16",
        "compile_unsupported": "  当前 PyTorch 不支持 torch.compile",
        "compile_failed": "  torch.compile 执行失败: {0}",
        "training_initial_loss": "  初始 Loss: {0:.6f}",
        "training_final_loss": "  最终 Loss: {0:.6f}",
        "gpu_stress_start": "  执行 GPU 矩阵计算...",
        "gpu_stress_done": "  10次 4096×4096 矩阵乘法: {0:.3f} 秒",
        "correctness_error": "  CPU/GPU 最大误差: {0:.10f}",
        "cudnn_available": "  cuDNN 可用: {0}",
        "cudnn_version": "  cuDNN 版本: {0}",
        "start": "开始测试",
        "done": "测试完成",
        "final_state": "CUDA 最终状态:",
        "final_gpu": "  GPU: {0}",
        "final_cuda": "  CUDA: {0}",
        "final_allocated": "  显存已分配: {0:.2f} MB",
        "final_reserved": "  显存缓存:   {0:.2f} MB",
        "conclusion_pass": "结论：PyTorch 核心功能全部通过。",
        "conclusion_warn": "存在部分 WARN，通常是功能不支持或可选功能未启用。",
        "conclusion_fail": "结论：存在功能测试失败，请查看上面的 [FAIL] 项。",
        "test_cpu_tensor": "CPU Tensor",
        "test_tensor_operations": "Tensor 基础操作",
        "test_cuda_tensor": "CUDA Tensor",
        "test_cpu_gpu_transfer": "CPU ↔ GPU 数据传输",
        "test_autograd": "Autograd 自动求导",
        "test_cuda_autograd": "CUDA Autograd",
        "test_neural_network": "神经网络",
        "test_cuda_neural_network": "GPU 神经网络",
        "test_loss": "Loss Function",
        "test_optimizer": "Optimizer",
        "test_training": "完整训练循环",
        "test_dataloader": "DataLoader",
        "test_gpu_dataloader": "GPU DataLoader",
        "test_amp": "AMP / FP16",
        "test_bfloat16": "BF16",
        "test_cuda_memory": "CUDA 显存分配",
        "test_cuda_correctness": "CPU/GPU 计算正确性",
        "test_gpu_stress": "GPU 压力测试",
        "test_cuda_operators": "CUDA 算子",
        "test_model_save_load": "模型保存/加载",
        "test_torch_compile": "torch.compile",
        "test_cudnn": "cuDNN",
        "test_cnn": "CNN",
    },
    "en": {
        "title": "PyTorch Environment Test",
        "label_python": "Python",
        "label_pytorch": "PyTorch",
        "label_platform": "Platform",
        "label_cuda_build": "CUDA build",
        "label_cuda_available": "CUDA available",
        "label_gpu_count": "GPU count",
        "gpu_header": "GPU {0}",
        "gpu_name": "  Name       : {0}",
        "gpu_compute_cap": "  Compute Cap: {0}",
        "gpu_memory": "  Total VRAM : {0:.2f} GB",
        "error_prefix": "  Error: {0}: {1}",
        "skip_cuda": "  CUDA unavailable, skipping GPU test",
        "bf16_unsupported": "  Current GPU / CUDA does not support BF16",
        "compile_unsupported": "  Current PyTorch does not support torch.compile",
        "compile_failed": "  torch.compile failed: {0}",
        "training_initial_loss": "  Initial loss: {0:.6f}",
        "training_final_loss": "  Final loss:   {0:.6f}",
        "gpu_stress_start": "  Running GPU matrix computation...",
        "gpu_stress_done": "  10x 4096x4096 matmul: {0:.3f} s",
        "correctness_error": "  Max CPU/GPU error: {0:.10f}",
        "cudnn_available": "  cuDNN available: {0}",
        "cudnn_version": "  cuDNN version: {0}",
        "start": "Starting tests",
        "done": "Tests finished",
        "final_state": "CUDA final state:",
        "final_gpu": "  GPU: {0}",
        "final_cuda": "  CUDA: {0}",
        "final_allocated": "  Memory allocated: {0:.2f} MB",
        "final_reserved": "  Memory reserved:  {0:.2f} MB",
        "conclusion_pass": "Conclusion: all core PyTorch features passed.",
        "conclusion_warn": "Some WARNs remain; usually optional features are unsupported or disabled.",
        "conclusion_fail": "Conclusion: some tests failed; see [FAIL] items above.",
        "test_cpu_tensor": "CPU Tensor",
        "test_tensor_operations": "Tensor basics",
        "test_cuda_tensor": "CUDA Tensor",
        "test_cpu_gpu_transfer": "CPU ↔ GPU transfer",
        "test_autograd": "Autograd",
        "test_cuda_autograd": "CUDA Autograd",
        "test_neural_network": "Neural network",
        "test_cuda_neural_network": "GPU neural network",
        "test_loss": "Loss Function",
        "test_optimizer": "Optimizer",
        "test_training": "Full training loop",
        "test_dataloader": "DataLoader",
        "test_gpu_dataloader": "GPU DataLoader",
        "test_amp": "AMP / FP16",
        "test_bfloat16": "BF16",
        "test_cuda_memory": "CUDA memory allocation",
        "test_cuda_correctness": "CPU/GPU correctness",
        "test_gpu_stress": "GPU stress test",
        "test_cuda_operators": "CUDA operators",
        "test_model_save_load": "Model save/load",
        "test_torch_compile": "torch.compile",
        "test_cudnn": "cuDNN",
        "test_cnn": "CNN",
    },
}


def t(key, *args):
    catalog = MESSAGES.get(LANG, MESSAGES["zh"])
    template = catalog.get(key) or MESSAGES["zh"].get(key, key)
    return template.format(*args) if args else template


def test(name, func):
    global PASS, FAIL, WARN

    print(f"\n[TEST] {name}")
    try:
        result = func()

        if result is True or result is None:
            print(f"  [PASS] {name}")
            PASS += 1
        elif result == "WARN":
            print(f"  [WARN] {name}")
            WARN += 1
        else:
            print(f"  [FAIL] {name}")
            FAIL += 1

    except Exception as e:
        print(f"  [FAIL] {name}")
        print(t("error_prefix", type(e).__name__, e))
        FAIL += 1


def separator():
    print("=" * 70)


# ============================================================
# 基础信息 / Basic information
# ============================================================

def show_info():
    separator()
    print(t("title"))
    separator()

    print(f"{t('label_python')}       : {sys.version.split()[0]}")
    print(f"{t('label_pytorch')}      : {torch.__version__}")
    print(f"{t('label_platform')}   : {platform.platform()}")
    print(f"{t('label_cuda_build')} : {torch.version.cuda}")
    print(f"{t('label_cuda_available')}     : {torch.cuda.is_available()}")
    print(f"{t('label_gpu_count')}      : {torch.cuda.device_count()}")

    if torch.cuda.is_available():
        for i in range(torch.cuda.device_count()):
            print()
            print(t("gpu_header", i))
            print(t("gpu_name", torch.cuda.get_device_name(i)))
            print(t("gpu_compute_cap", torch.cuda.get_device_capability(i)))
            print(t("gpu_memory", torch.cuda.get_device_properties(i).total_memory / 1024**3))

    separator()


# ============================================================
# 1. CPU Tensor
# ============================================================

def test_cpu_tensor():
    a = torch.randn(1000, 1000)
    b = torch.randn(1000, 1000)

    c = torch.matmul(a, b)

    assert c.shape == (1000, 1000)
    assert torch.isfinite(c).all()

    return True


# ============================================================
# 2. Tensor 基础操作 / Tensor basics
# ============================================================

def test_tensor_operations():
    x = torch.tensor([
        [1.0, 2.0, 3.0],
        [4.0, 5.0, 6.0]
    ])

    assert x.shape == (2, 3)

    y = x.reshape(3, 2)
    assert y.shape == (3, 2)

    assert torch.sum(x).item() == 21
    assert torch.max(x).item() == 6

    return True


# ============================================================
# 3. CUDA Tensor
# ============================================================

def test_cuda_tensor():
    if not torch.cuda.is_available():
        print(t("skip_cuda"))
        return "WARN"

    device = torch.device("cuda")

    x = torch.randn(2000, 2000, device=device)
    y = torch.randn(2000, 2000, device=device)

    z = torch.matmul(x, y)

    torch.cuda.synchronize()

    assert z.device.type == "cuda"
    assert z.shape == (2000, 2000)
    assert torch.isfinite(z).all()

    return True


# ============================================================
# 4. CPU ↔ GPU 数据传输 / CPU ↔ GPU transfer
# ============================================================

def test_cpu_gpu_transfer():
    if not torch.cuda.is_available():
        return "WARN"

    x = torch.randn(1000, 1000)

    gpu = x.cuda()
    cpu = gpu.cpu()

    assert torch.allclose(x, cpu)

    return True


# ============================================================
# 5. Autograd
# ============================================================

def test_autograd():
    x = torch.randn(100, 100, requires_grad=True)

    y = x ** 2
    loss = y.mean()

    loss.backward()

    assert x.grad is not None
    assert x.grad.shape == x.shape
    assert torch.isfinite(x.grad).all()

    return True


# ============================================================
# 6. GPU Autograd
# ============================================================

def test_cuda_autograd():
    if not torch.cuda.is_available():
        return "WARN"

    x = torch.randn(
        1000,
        1000,
        device="cuda",
        requires_grad=True
    )

    y = torch.sin(x) * x
    loss = y.mean()

    loss.backward()

    torch.cuda.synchronize()

    assert x.grad is not None
    assert torch.isfinite(x.grad).all()

    return True


# ============================================================
# 7. Neural Network
# ============================================================

def test_neural_network():
    model = nn.Sequential(
        nn.Linear(128, 256),
        nn.ReLU(),
        nn.Linear(256, 64),
        nn.ReLU(),
        nn.Linear(64, 10)
    )

    x = torch.randn(32, 128)

    output = model(x)

    assert output.shape == (32, 10)
    assert torch.isfinite(output).all()

    return True


# ============================================================
# 8. GPU Neural Network
# ============================================================

def test_cuda_neural_network():
    if not torch.cuda.is_available():
        return "WARN"

    device = torch.device("cuda")

    model = nn.Sequential(
        nn.Linear(512, 1024),
        nn.ReLU(),
        nn.Linear(1024, 512),
        nn.ReLU(),
        nn.Linear(512, 100)
    ).to(device)

    x = torch.randn(64, 512, device=device)

    output = model(x)

    torch.cuda.synchronize()

    assert output.shape == (64, 100)
    assert torch.isfinite(output).all()

    return True


# ============================================================
# 9. Loss Function
# ============================================================

def test_loss():
    model = nn.Linear(10, 2)

    x = torch.randn(32, 10)
    target = torch.randint(0, 2, (32,))

    output = model(x)

    criterion = nn.CrossEntropyLoss()
    loss = criterion(output, target)

    assert loss.ndim == 0
    assert torch.isfinite(loss)

    return True


# ============================================================
# 10. Optimizer
# ============================================================

def test_optimizer():
    model = nn.Linear(10, 2)

    optimizer = optim.Adam(model.parameters(), lr=0.001)

    x = torch.randn(32, 10)
    target = torch.randint(0, 2, (32,))

    criterion = nn.CrossEntropyLoss()

    old_weight = model.weight.detach().clone()

    optimizer.zero_grad()

    output = model(x)
    loss = criterion(output, target)

    loss.backward()
    optimizer.step()

    new_weight = model.weight.detach()

    assert not torch.equal(old_weight, new_weight)

    return True


# ============================================================
# 11. 完整训练循环 / Full training loop
# ============================================================

def test_training():
    device = torch.device(
        "cuda" if torch.cuda.is_available() else "cpu"
    )

    model = nn.Sequential(
        nn.Linear(20, 64),
        nn.ReLU(),
        nn.Linear(64, 10)
    ).to(device)

    optimizer = optim.Adam(model.parameters(), lr=0.01)
    criterion = nn.CrossEntropyLoss()

    x = torch.randn(256, 20, device=device)
    target = torch.randint(0, 10, (256,), device=device)

    losses = []

    for _ in range(20):
        optimizer.zero_grad()

        output = model(x)
        loss = criterion(output, target)

        loss.backward()
        optimizer.step()

        losses.append(loss.item())

    if not losses[-1] < losses[0]:
        print(t("training_initial_loss", losses[0]))
        print(t("training_final_loss", losses[-1]))
        return "WARN"

    return True


# ============================================================
# 12. DataLoader
# ============================================================

def test_dataloader():
    from torch.utils.data import TensorDataset, DataLoader

    x = torch.randn(1000, 32)
    y = torch.randint(0, 10, (1000,))

    dataset = TensorDataset(x, y)

    loader = DataLoader(
        dataset,
        batch_size=32,
        shuffle=True,
        num_workers=0
    )

    count = 0

    for batch_x, batch_y in loader:
        assert batch_x.shape[0] <= 32
        assert batch_y.shape[0] <= 32
        count += batch_x.shape[0]

    assert count == 1000

    return True


# ============================================================
# 13. GPU DataLoader
# ============================================================

def test_gpu_dataloader():
    if not torch.cuda.is_available():
        return "WARN"

    from torch.utils.data import TensorDataset, DataLoader

    x = torch.randn(5000, 64)
    y = torch.randint(0, 10, (5000,))

    dataset = TensorDataset(x, y)

    loader = DataLoader(
        dataset,
        batch_size=128,
        shuffle=True,
        num_workers=0,
        pin_memory=True
    )

    for batch_x, batch_y in loader:
        batch_x = batch_x.to("cuda", non_blocking=True)
        batch_y = batch_y.to("cuda", non_blocking=True)

        assert batch_x.is_cuda
        assert batch_y.is_cuda

        break

    torch.cuda.synchronize()

    return True


# ============================================================
# 14. AMP / Float16
# ============================================================

def test_amp():
    if not torch.cuda.is_available():
        return "WARN"

    device = torch.device("cuda")

    model = nn.Linear(1024, 1024).to(device)

    x = torch.randn(64, 1024, device=device)

    with torch.autocast(
        device_type="cuda",
        dtype=torch.float16
    ):
        output = model(x)

    torch.cuda.synchronize()

    assert torch.isfinite(output).all()

    return True


# ============================================================
# 15. BF16
# ============================================================

def test_bfloat16():
    if not torch.cuda.is_available():
        return "WARN"

    device = torch.device("cuda")

    if not torch.cuda.is_bf16_supported():
        print(t("bf16_unsupported"))
        return "WARN"

    x = torch.randn(
        1024,
        1024,
        device=device,
        dtype=torch.bfloat16
    )

    y = torch.matmul(x, x)

    torch.cuda.synchronize()

    assert y.dtype == torch.bfloat16
    assert torch.isfinite(y).all()

    return True


# ============================================================
# 16. CUDA 内存分配 / CUDA memory allocation
# ============================================================

def test_cuda_memory():
    if not torch.cuda.is_available():
        return "WARN"

    torch.cuda.empty_cache()

    before = torch.cuda.memory_allocated()

    x = torch.randn(
        4096,
        4096,
        device="cuda"
    )

    torch.cuda.synchronize()

    after = torch.cuda.memory_allocated()

    assert after > before

    del x

    torch.cuda.empty_cache()

    return True


# ============================================================
# 17. CUDA 同步计算正确性 / CPU-GPU correctness
# ============================================================

def test_cuda_correctness():
    if not torch.cuda.is_available():
        return "WARN"

    torch.manual_seed(1234)

    cpu_a = torch.randn(512, 512)
    cpu_b = torch.randn(512, 512)

    cpu_result = torch.matmul(cpu_a, cpu_b)

    gpu_result = torch.matmul(
        cpu_a.cuda(),
        cpu_b.cuda()
    ).cpu()

    torch.cuda.synchronize()

    max_error = torch.max(
        torch.abs(cpu_result - gpu_result)
    ).item()

    print(t("correctness_error", max_error))

    assert max_error < 1e-4

    return True


# ============================================================
# 18. 大规模 GPU 压力测试 / GPU stress test
# ============================================================

def test_gpu_stress():
    if not torch.cuda.is_available():
        return "WARN"

    device = torch.device("cuda")

    print(t("gpu_stress_start"))

    a = torch.randn(4096, 4096, device=device)
    b = torch.randn(4096, 4096, device=device)

    torch.cuda.synchronize()

    start = time.perf_counter()

    for _ in range(10):
        c = torch.matmul(a, b)

    torch.cuda.synchronize()

    elapsed = time.perf_counter() - start

    print(t("gpu_stress_done", elapsed))

    assert torch.isfinite(c).all()

    del a, b, c
    torch.cuda.empty_cache()

    return True


# ============================================================
# 19. CUDA 算子测试 / CUDA operators
# ============================================================

def test_cuda_operators():
    if not torch.cuda.is_available():
        return "WARN"

    x = torch.randn(256, 256, device="cuda")

    y = torch.relu(x)
    y = torch.sigmoid(y)
    y = torch.softmax(y, dim=1)
    y = torch.mean(y)
    y = torch.sqrt(y + 1e-6)

    torch.cuda.synchronize()

    assert torch.isfinite(y)

    return True


# ============================================================
# 20. 模型保存 / 加载 / Model save & load
# ============================================================

def test_model_save_load():
    import tempfile
    import os

    model1 = nn.Sequential(
        nn.Linear(10, 20),
        nn.ReLU(),
        nn.Linear(20, 5)
    )

    x = torch.randn(4, 10)

    output1 = model1(x)

    with tempfile.NamedTemporaryFile(delete=False) as f:
        path = f.name

    try:
        torch.save(model1.state_dict(), path)

        model2 = nn.Sequential(
            nn.Linear(10, 20),
            nn.ReLU(),
            nn.Linear(20, 5)
        )

        model2.load_state_dict(torch.load(
            path,
            map_location="cpu",
            weights_only=True
        ))

        output2 = model2(x)

        assert torch.allclose(output1, output2)

    finally:
        if os.path.exists(path):
            os.remove(path)

    return True


# ============================================================
# 21. torch.compile
# ============================================================

def test_torch_compile():
    if not hasattr(torch, "compile"):
        print(t("compile_unsupported"))
        return "WARN"

    model = nn.Sequential(
        nn.Linear(128, 256),
        nn.ReLU(),
        nn.Linear(256, 10)
    )

    try:
        compiled_model = torch.compile(model)

        x = torch.randn(32, 128)

        y = compiled_model(x)

        assert y.shape == (32, 10)
        assert torch.isfinite(y).all()

        return True

    except Exception as e:
        print(t("compile_failed", e))
        return "WARN"


# ============================================================
# 22. CUDA cuDNN
# ============================================================

def test_cudnn():
    if not torch.cuda.is_available():
        return "WARN"

    print(t("cudnn_available", torch.backends.cudnn.is_available()))
    print(t("cudnn_version", torch.backends.cudnn.version()))

    assert torch.backends.cudnn.is_available()

    return True


# ============================================================
# 23. CNN
# ============================================================

def test_cnn():
    device = torch.device(
        "cuda" if torch.cuda.is_available() else "cpu"
    )

    model = nn.Sequential(
        nn.Conv2d(3, 32, 3, padding=1),
        nn.BatchNorm2d(32),
        nn.ReLU(),
        nn.MaxPool2d(2),

        nn.Conv2d(32, 64, 3, padding=1),
        nn.BatchNorm2d(64),
        nn.ReLU(),
        nn.AdaptiveAvgPool2d(1),

        nn.Flatten(),
        nn.Linear(64, 10)
    ).to(device)

    x = torch.randn(
        8, 3, 224, 224,
        device=device
    )

    y = model(x)

    if torch.cuda.is_available():
        torch.cuda.synchronize()

    assert y.shape == (8, 10)
    assert torch.isfinite(y).all()

    return True


# ============================================================
# 主程序 / Main
# ============================================================

def main():
    show_info()

    tests = [
        (t("test_cpu_tensor"), test_cpu_tensor),
        (t("test_tensor_operations"), test_tensor_operations),
        (t("test_cuda_tensor"), test_cuda_tensor),
        (t("test_cpu_gpu_transfer"), test_cpu_gpu_transfer),
        (t("test_autograd"), test_autograd),
        (t("test_cuda_autograd"), test_cuda_autograd),
        (t("test_neural_network"), test_neural_network),
        (t("test_cuda_neural_network"), test_cuda_neural_network),
        (t("test_loss"), test_loss),
        (t("test_optimizer"), test_optimizer),
        (t("test_training"), test_training),
        (t("test_dataloader"), test_dataloader),
        (t("test_gpu_dataloader"), test_gpu_dataloader),
        (t("test_amp"), test_amp),
        (t("test_bfloat16"), test_bfloat16),
        (t("test_cuda_memory"), test_cuda_memory),
        (t("test_cuda_correctness"), test_cuda_correctness),
        (t("test_gpu_stress"), test_gpu_stress),
        (t("test_cuda_operators"), test_cuda_operators),
        (t("test_model_save_load"), test_model_save_load),
        (t("test_torch_compile"), test_torch_compile),
        (t("test_cudnn"), test_cudnn),
        (t("test_cnn"), test_cnn),
    ]

    separator()
    print(t("start"))
    separator()

    for name, func in tests:
        test(name, func)

    separator()
    print(t("done"))
    separator()

    print(f"PASS : {PASS}")
    print(f"WARN : {WARN}")
    print(f"FAIL : {FAIL}")

    if torch.cuda.is_available():
        print()
        print(t("final_state"))
        print(t("final_gpu", torch.cuda.get_device_name(0)))
        print(t("final_cuda", torch.version.cuda))
        print(t("final_allocated", torch.cuda.memory_allocated() / 1024**2))
        print(t("final_reserved", torch.cuda.memory_reserved() / 1024**2))

    separator()

    if FAIL == 0:
        print(t("conclusion_pass"))
        if WARN > 0:
            print(t("conclusion_warn"))
    else:
        print(t("conclusion_fail"))

    separator()


if __name__ == "__main__":
    main()
