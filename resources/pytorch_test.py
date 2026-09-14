import sys
import time
import platform
import traceback

import torch
import torch.nn as nn
import torch.optim as optim


# ============================================================
# PyTorch 全面功能测试
# ============================================================

PASS = 0
FAIL = 0
WARN = 0


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
        print(f"  错误: {type(e).__name__}: {e}")
        FAIL += 1


def separator():
    print("=" * 70)


# ============================================================
# 基础信息
# ============================================================

def show_info():
    separator()
    print("PyTorch 环境测试")
    separator()

    print(f"Python       : {sys.version.split()[0]}")
    print(f"PyTorch      : {torch.__version__}")
    print(f"Python平台   : {platform.platform()}")
    print(f"CUDA编译版本 : {torch.version.cuda}")
    print(f"CUDA可用     : {torch.cuda.is_available()}")
    print(f"GPU数量      : {torch.cuda.device_count()}")

    if torch.cuda.is_available():
        for i in range(torch.cuda.device_count()):
            print(f"\nGPU {i}")
            print(f"  名称       : {torch.cuda.get_device_name(i)}")
            print(f"  Compute Cap: {torch.cuda.get_device_capability(i)}")
            print(f"  总显存     : {torch.cuda.get_device_properties(i).total_memory / 1024**3:.2f} GB")

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
# 2. Tensor 基础操作
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
        print("  CUDA 不可用，跳过 GPU 测试")
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
# 4. CPU ↔ GPU 数据传输
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
# 11. 完整训练循环
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
        print(f"  初始 Loss: {losses[0]:.6f}")
        print(f"  最终 Loss: {losses[-1]:.6f}")
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
        print("  当前 GPU / CUDA 不支持 BF16")
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
# 16. CUDA 内存分配
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
# 17. CUDA 同步计算正确性
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

    print(f"  CPU/GPU 最大误差: {max_error:.10f}")

    assert max_error < 1e-4

    return True


# ============================================================
# 18. 大规模 GPU 压力测试
# ============================================================

def test_gpu_stress():
    if not torch.cuda.is_available():
        return "WARN"

    device = torch.device("cuda")

    print("  执行 GPU 矩阵计算...")

    a = torch.randn(4096, 4096, device=device)
    b = torch.randn(4096, 4096, device=device)

    torch.cuda.synchronize()

    start = time.perf_counter()

    for _ in range(10):
        c = torch.matmul(a, b)

    torch.cuda.synchronize()

    elapsed = time.perf_counter() - start

    print(f"  10次 4096×4096 矩阵乘法: {elapsed:.3f} 秒")

    assert torch.isfinite(c).all()

    del a, b, c
    torch.cuda.empty_cache()

    return True


# ============================================================
# 19. CUDA 算子测试
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
# 20. 模型保存 / 加载
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
        print("  当前 PyTorch 不支持 torch.compile")
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
        print(f"  torch.compile 执行失败: {e}")
        return "WARN"


# ============================================================
# 22. CUDA cuDNN
# ============================================================

def test_cudnn():
    if not torch.cuda.is_available():
        return "WARN"

    print(f"  cuDNN 可用: {torch.backends.cudnn.is_available()}")
    print(f"  cuDNN 版本: {torch.backends.cudnn.version()}")

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
# 主程序
# ============================================================

def main():
    show_info()

    tests = [
        ("CPU Tensor", test_cpu_tensor),
        ("Tensor 基础操作", test_tensor_operations),
        ("CUDA Tensor", test_cuda_tensor),
        ("CPU ↔ GPU 数据传输", test_cpu_gpu_transfer),
        ("Autograd 自动求导", test_autograd),
        ("CUDA Autograd", test_cuda_autograd),
        ("神经网络", test_neural_network),
        ("GPU 神经网络", test_cuda_neural_network),
        ("Loss Function", test_loss),
        ("Optimizer", test_optimizer),
        ("完整训练循环", test_training),
        ("DataLoader", test_dataloader),
        ("GPU DataLoader", test_gpu_dataloader),
        ("AMP / FP16", test_amp),
        ("BF16", test_bfloat16),
        ("CUDA 显存分配", test_cuda_memory),
        ("CPU/GPU 计算正确性", test_cuda_correctness),
        ("GPU 压力测试", test_gpu_stress),
        ("CUDA 算子", test_cuda_operators),
        ("模型保存/加载", test_model_save_load),
        ("torch.compile", test_torch_compile),
        ("cuDNN", test_cudnn),
        ("CNN", test_cnn),
    ]

    separator()
    print("开始测试")
    separator()

    for name, func in tests:
        test(name, func)

    separator()
    print("测试完成")
    separator()

    print(f"PASS : {PASS}")
    print(f"WARN : {WARN}")
    print(f"FAIL : {FAIL}")

    if torch.cuda.is_available():
        print("\nCUDA 最终状态:")
        print(f"  GPU: {torch.cuda.get_device_name(0)}")
        print(f"  CUDA: {torch.version.cuda}")
        print(f"  显存已分配: {torch.cuda.memory_allocated() / 1024**2:.2f} MB")
        print(f"  显存缓存:   {torch.cuda.memory_reserved() / 1024**2:.2f} MB")

    separator()

    if FAIL == 0:
        print("结论：PyTorch 核心功能全部通过。")
        if WARN > 0:
            print("存在部分 WARN，通常是功能不支持或可选功能未启用。")
    else:
        print("结论：存在功能测试失败，请查看上面的 [FAIL] 项。")

    separator()


if __name__ == "__main__":
    main()
