# C：从第一个程序到内存边界

> 先修：会保存文件、打开终端；不要求学过另一门语言。环境：C17、GCC 或 Clang。本章目标：独立编译一个带函数、数组和输入检查的小程序，理解对象、指针、长度与生命周期。它是 C 教材的第一章，不代表已覆盖全部语言与工程实践。

## 1.1 源文件、编译器与程序入口

将下面内容保存为 `hello.c`。文件名后缀表示源码类型，不会让文本自动变成能执行的程序。

```c
#include <stdio.h>

int main(void) {
    printf("Hello, C!\n");
    return 0;
}
```

`#include` 让编译器看到标准 I/O 的声明。`int main(void)` 声明一个不接受参数、返回整数的程序入口函数；花括号包含函数体；分号结束语句；`\n` 表示换行。`return 0` 通常向调用者报告成功，不是向屏幕打印数字零。

```bash
cc -std=c17 -Wall -Wextra -Wpedantic hello.c -o hello
./hello
```

第二条命令是在 Linux/macOS 或类 Unix 环境运行当前目录的程序。Windows 的可执行文件命名和启动方式可能不同。警告选项不是把代码自动变正确，但能及早暴露不少类型和接口问题。编译、链接的区别可继续读[工具链章节](book:systems/toolchain)。

## 1.2 类型是对值和操作的约束

`int count = 3;` 定义一个整数对象并初始化。C 类型影响可表示值、存储大小、对齐、运算和函数调用。不要假定所有机器的 `int` 都是 32 位；需要明确宽度时查看 `<stdint.h>` 的精确宽度类型是否可用。`sizeof` 的结果类型是 `size_t`，它用来表达对象大小与长度。

整数除法和浮点除法不是同一操作：`5 / 2` 得到 2；`5.0 / 2.0` 得到近似的 2.5。改变显示格式不能追回先前已经丢掉的小数。浮点值也不能精确表示全部实数，详见[数据表示](book:systems/representation)。

C 不会普遍帮你检查数组越界。有符号整数溢出也不是可移植的循环计数技巧。编写表达式时应先想清楚类型与范围，再考虑缩短代码。

## 1.3 条件、循环与函数如何组合

一个函数应说明输入、输出和失败方式。下面计算整数数组的平均值，使用返回状态与输出参数区分“平均值恰为零”和“没有有效输入”。

```c
#include <stddef.h>
#include <stdio.h>

int mean(const int *values, size_t count, double *out) {
    if (values == NULL || out == NULL || count == 0) {
        return 0;
    }
    double total = 0.0;
    for (size_t i = 0; i < count; ++i) {
        total += values[i];
    }
    *out = total / (double)count;
    return 1;
}

int main(void) {
    int samples[] = {2, 4, 9};
    double result = 0.0;
    size_t n = sizeof samples / sizeof samples[0];
    if (!mean(samples, n, &result)) {
        fputs("no valid samples\n", stderr);
        return 1;
    }
    printf("mean=%.2f\n", result);
    return 0;
}
```

输出应为 `mean=5.00`。循环的条件是 `i < count`，因为 N 个元素的下标从 0 到 N-1。`++i` 增加索引；`&result` 取得结果对象地址；`*out` 访问该地址所指的对象。这里用 double 累加避免小范围教学整数的 int 累加溢出，但大数据仍需考虑浮点范围和精度。

数学目标是 $\bar x=N^{-1}\sum_{i=0}^{N-1}x_i$，前提 $N>0$。函数不能证明 `values` 后面真有 count 个有效元素，这仍是调用者的契约。

## 1.4 指针不是自带长度的容器

![图 1-1：数组参数传入的是地址与另外提供的长度；函数通过二者访问对象，不能仅从裸指针恢复数组边界。](asset:languages-c)

数组对象和指针不同，但数组表达式在许多场合会转换为首元素指针。`sizeof samples / sizeof samples[0]` 在上例定义数组的作用域里可以算长度；若把它搬进接收 `const int *values` 的函数，`sizeof values` 只得到指针对象大小。

`const int *values` 表示不能通过这个指针修改所指整数，不表示外部绝不可能修改原数组。接口设计要区分只读访问、独占修改与所有权。

## 1.5 字符串、终止符与对象寿命

C 字符串常使用以零字节终止的字符序列。`char word[] = "cat";` 需要四个 char，最后一个是 `\0`。缓冲区容量、实际字符数量和是否终止是三个不同问题。读取外部输入时必须限制长度，并检查读取函数的返回值；不要使用无法限制长度的旧式接口。

局部自动对象在离开作用域后结束生命周期。返回指向局部数组的指针会留下悬空地址，即使旧字节暂时还能读到也不能使用。动态分配的对象由程序管理释放，分配失败需处理，释放后不能继续使用，也不能重复释放。

C 没有自动把裸指针的这些契约全部编码进类型系统。因此好的 C 接口往往显式携带长度、状态和所有权说明，而不是只写“参数为一个指针”。

## 1.6 从能运行到可检查

练习时可以在支持的环境添加 AddressSanitizer、UndefinedBehaviorSanitizer，例如编译选项 `-fsanitize=address,undefined -g`。它们能检测部分实际执行路径中的错误，不是完整证明，也不保证所有平台都支持。

先测试空输入、单元素、正常数组和不应接受的参数，再测试大输入。不要为了展示错误而在真实程序里执行越界访问；可以先用代码审查指出边界被破坏的位置。

下一阶段应系统学习预处理、多文件模块、结构体与布局、文件 I/O、动态数组、错误约定、构建、调试和测试，最后完成一个能处理真实边界情况的小工具。

## 练习与解题提示

1. 把样本改为 `{1, 2}`，预期输出是多少？为什么不能先用整数累加后执行整数除法再转换？
2. count 为 0 时，mean 应修改 out 吗？上面的实现实际如何处理？
3. 为什么指针非 NULL 仍不证明访问安全？

**提示与答案：** 1. 1.50；整数除法先截断会丢失小数。2. 接口需约定，本例在失败路径不修改 out。3. 指针可能悬空、未对齐或指向不足长度的对象。

## 小结与参考

先让程序的类型、长度和生命周期明确，再学习复杂语法。不要把某台机器上的偶然输出当成 C 语言规则。

- [cppreference：C 语言参考](https://en.cppreference.com/w/c/language.html)：用于核对类型、表达式、对象与生命周期，不建议当作第一遍的线性课程。
- [GNU C Language Manual](https://www.gnu.org/software/c-intro-and-ref/manual/): 从表达式与控制流进入 C；其中 GNU 扩展应与标准 C 区分。
- [阮一峰 C 语言教程](https://wangdoc.com/clang/)：中文入门路线，可对照变量、指针、数组与内存管理章节。
- [CS50x](https://cs50.harvard.edu/x/)：结合练习理解编译、算法和内存；本页不转载课程图片。
