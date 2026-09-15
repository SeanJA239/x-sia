# Python：对象、函数与可维护脚本

> 先修：会使用终端和文本编辑器；无需其他语言基础。环境：Python 3.11 及以上；本章只用标准库。目标：写出输入可检查、函数可测试、入口明确的小工具，理解名字绑定与可变对象。

## 3.1 解释器、脚本与环境

Python 源码由 Python 实现读取并执行；CPython 通常先生成字节码，再由虚拟机执行。它不是“不需要任何编译”，也不意味着与 CPU 或内存无关。

```python
print("Hello, Python!")
```

保存为 hello.py，在合适的环境使用 `python3 hello.py` 或 `python hello.py`。先通过 `python --version` 核对所用解释器，不要仅凭命令名判断环境。创建虚拟环境可以隔离项目依赖；它不是操作系统级安全沙箱。

```bash
python -m venv .venv
# Linux/macOS Bash:
source .venv/bin/activate
python -m pip --version
```

Windows 的激活脚本路径不同。`python -m pip` 有助于明确 pip 属于哪个解释器，但包来源与版本仍需审查；不要对来源不明的安装命令默认提权。

## 3.2 名字绑定对象，而不是给变量贴永久类型

`a = [1, 2]` 建立列表对象，并把名字 a 绑定到它。`b = a` 不复制列表，而是让另一个名字指向同一对象。随后 `b.append(3)`，通过 a 也能观察到新元素。

![图 3-1：赋值让两个名字引用同一可变列表；显式创建新列表后，外层容器才独立。浅拷贝仍可能共享内层对象。](asset:languages-python)

```python
a = [1, 2]
b = a
b.append(3)
print(a)          # [1, 2, 3]
c = list(a)
c.append(4)
print(a, c)       # [1, 2, 3] [1, 2, 3, 4]
```

`is` 比较对象身份，`==` 比较由类型定义的相等关系。字符串、整数等不可变对象不能原地改值，但名字可以重新绑定。元组不可变也不意味着其中引用的列表不可变。

## 3.3 控制流、函数与明确的输入契约

Python 使用缩进形成语句块。函数把可复用行为命名，返回值让调用者组合计算，而不是只能从打印文本中猜结果。

```python
from math import fsum, isfinite


def mean(values):
    numbers = [float(value) for value in values]
    if not numbers:
        raise ValueError("at least one number is required")
    if not all(isfinite(value) for value in numbers):
        raise ValueError("numbers must be finite")
    return fsum(numbers) / len(numbers)


assert mean([2, 4, 9]) == 5.0
print(mean([1, 2]))  # 1.5
```

`float(value)` 可能拒绝非法输入；不能通过捕获所有异常后返回 0 来伪装成功。`fsum` 为浮点求和减少某些累积误差，但不能把任意精度问题都消除。计算目标仍是 $\bar x=N^{-1}\sum_i x_i$，必须先拒绝空集合。

这里先构造列表以便重复检查和计数，适合较小输入。大数据流应采用流式累计或更稳定的在线算法，并说明精度与空间权衡。

## 3.4 默认参数与可变性陷阱

默认参数表达式在函数定义时求值，而不是每次调用重新创建。因此下面的 list 可能被多次调用共享：

```python
# 不推荐的接口：默认列表跨调用共享。
def collect_bad(value, bucket=[]):
    bucket.append(value)
    return bucket

# 明确每次缺省调用创建新列表。
def collect(value, bucket=None):
    if bucket is None:
        bucket = []
    bucket.append(value)
    return bucket
```

这不是 Python 随机出错，而是对象与求值时机的规则。函数若接受调用者传入的 bucket，仍会修改那个对象，应在接口说明中写清楚。类型注解可帮助检查，但默认不强制运行时验证。

## 3.5 文件、异常与资源生命周期

文件操作不仅是读字符串，还涉及编码、路径、异常与句柄。使用 with 把资源释放绑定到块的退出：

```python
from pathlib import Path

path = Path("measurements.txt")
with path.open("r", encoding="utf-8") as stream:
    for number, line in enumerate(stream, start=1):
        text = line.strip()
        if not text:
            continue
        print(number, float(text))
```

该片段需要读者自己准备文本文件。逐行读取避免一次加载全部文件，但输出仍可能包含敏感内容，不能盲目上传日志。把 `except Exception: pass` 作为通用修复，会丢掉失败原因；应捕获能处理的异常，并让其他失败保留清晰上下文。

## 3.6 模块、测试与脚本入口

模块导入会执行其顶层语句。把网络访问、修改文件等动作放在模块顶层，会让“只是想导入一个函数”的测试产生副作用。入口应明确：

```python
def main():
    print(mean([2, 4, 9]))

if __name__ == "__main__":
    main()
```

生成器通过逐步产出数据减少中间存储，不保证计算更快，也不自动提供并行。CPython 的 GIL、线程、进程与异步 I/O 需要按具体版本和负载讨论，不能用“Python 不能并发”一句话概括。

下一阶段应依次学习常用容器、迭代协议、异常、模块、包、类型检查、测试、日志、性能与并发，再完成带 CLI、输入格式和错误码的小工具。

## 练习与解题提示

1. `b = a` 与 `b = a.copy()` 对二维列表分别复制了什么？
2. 为什么文件读取需要明确编码？
3. 对空输入与 `float('nan')`，mean 应成功吗？如何测试？

**提示与答案：** 1. 赋值共享全部对象；浅拷贝只复制外层列表，内层列表仍可共享。2. 字节到字符需要约定，系统默认值不一定相同。3. 本接口都拒绝，应断言抛出 ValueError，而不是把异常当意外。

## 小结与参考

Python 的简洁不意味着可以忽略对象、资源和错误。把脚本写成有输入契约、独立函数和可测试入口的程序，才能持续维护。

- [Python 官方中文教程](https://docs.python.org/zh-cn/3/tutorial/)：按控制流、数据结构、模块、异常与类循序阅读。
- [Python 英文文档](https://docs.python.org/3/)：核对与实际解释器匹配的版本和标准库行为。
- [廖雪峰 Python 教程](https://www.liaoxuefeng.com/wiki/1016959663602400)：中文练习与应用路线，和官方语义交叉核对。
- [Real Python](https://realpython.com/)：按具体工程问题选读；并非所有文章免费或允许转载，本页不复制其图片。
