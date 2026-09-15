# 交叉编译、链接与启动

> 先修：基础 C、[电气边界](book:embedded/circuits)。目标：解释从源码到 main 的完整链路。教学目标为典型 STM32F4/Cortex-M4 裸机模型；实际内存尺寸、时钟和启动方式以具体器件手册为准。代码片段不是完整板级工程。

## 2.1 为什么不能直接使用宿主编译器？

编译器目标不仅是 C 语言，还包括指令集、ABI、浮点约定和运行环境。`arm-none-eabi-gcc` 名字中的目标描述表明面向裸机 Arm EABI；主机上的 `gcc` 可能生成 x86-64 Linux 程序，既不是相同机器码，也不使用相同系统运行时。

`-mcpu=cortex-m4 -mthumb` 描述处理器与指令状态；浮点相关选项还必须与芯片能力、库和调用约定一致。一个目标使用 hard-float ABI，另一个使用 soft-float ABI，并不能仅因为都能编译而安全链接运行。

CMake 是构建系统生成器，不是编译器。首次配置时选择错误工具链，后续只替换一个命令可能留下错误缓存；应使用独立构建目录，而不是习惯性删除不确认归属的目录。

```cmake
# cmake/arm-none-eabi.cmake：最小工具链描述片段
set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR arm)
set(CMAKE_C_COMPILER arm-none-eabi-gcc)
set(CMAKE_ASM_COMPILER arm-none-eabi-gcc)
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)
```

这并没有定义完整固件。CPU 标志、启动文件、链接脚本、厂商头文件、运行库和目标源文件仍需由工程明确配置。

## 2.2 ELF 不是裸二进制

ELF 可以保存代码、数据、符号、节与装载信息。调试器依赖符号和调试信息把地址对应回源码。BIN 通常只有原始字节，缺少通用的地址和符号描述；烧录 BIN 时必须明确加载地址。HEX 可以包含地址记录，但不是 ELF 符号表的替代品。

```bash
arm-none-eabi-readelf -h firmware.elf
arm-none-eabi-readelf -S firmware.elf
arm-none-eabi-size firmware.elf
arm-none-eabi-objdump -d firmware.elf
```

以上命令只检查已有文件，不烧录硬件。检查机器类型、入口、节地址和反汇编，比只看 `[100%] Built target` 更接近验证真正的产物身份。

## 2.3 Flash 与 RAM 的两份地址

典型裸机布局中，`.text` 和只读常量位于 Flash；带初值的可写全局变量在 RAM 使用，但初值常存于 Flash；`.bss` 在 RAM 占空间，启动时清零，不需要把全部零字节保存在 Flash 镜像中。

![图 2-1：Flash 保存代码、向量表与 data 初值；启动代码复制 data 到 RAM，清零 bss，设置运行环境后进入 main。](asset:embedded-boot)

运行地址 VMA 与加载地址 LMA 可能不同：`.data` 的运行位置在 RAM，而初始化镜像来自 Flash。链接脚本给出边界符号，启动代码按这些边界复制和清零。

仅考虑这些区域时，容量预算可近似写成：

$$
F\approx |\text{text}|+|\text{rodata}|+|\text{data init}|,
$$

$$
R\geq |\text{data}|+|\text{bss}|+R_{\text{stack,max}}+R_{\text{heap,max}}+R_{\text{other}}.
$$

对齐、向量表、库、DMA 缓冲与链接器实现会改变实际统计。Flash 没超并不说明 RAM 安全；链接通过也不自动证明最深调用和中断嵌套时栈不会溢出。

## 2.4 Cortex-M 从复位走向 main

在典型 Cortex-M 启动模型中，向量表起始项提供初始主栈指针，下一项提供复位处理入口。具体从哪里取得向量表，受芯片启动映射与引导配置影响，不能把某个 Flash 地址当成所有芯片通用规则。

复位处理通常完成 `.data` 复制、`.bss` 清零、必要的系统初始化以及 C/C++ 运行时初始化，再进入 `main`。具体顺序由启动代码与库决定；C++ 静态构造函数也可能在 main 前执行。

为什么在 main 第一行打断点却到不了？因为故障可以出现在更早阶段：栈地址错误、向量入口错误、复制边界错误、时钟初始化失败或链接布局不符。调试应从 Reset_Handler、PC、SP 和异常状态逐步收窄，而不只在 main 中加 printf。

## 2.5 构建、烧录、功能验证是三道门

明确工具链后，可在项目根目录配置独立构建目录：

```bash
cmake -S . -B build-arm -DCMAKE_TOOLCHAIN_FILE=cmake/arm-none-eabi.cmake
cmake --build build-arm --parallel 2
```

这仍要求项目已定义完整目标。烧录前确认板卡、探针序列号、固件路径与目标配置，不自动选择目录里的“第一个 ELF”。以下 OpenOCD 命令会修改目标 Flash，仅供持有并确认目标设备后手动使用：

```bash
openocd -f interface/stlink.cfg -f target/stm32f4x.cfg \
  -c "program build-arm/firmware.elf verify reset exit"
```

不默认加 sudo。设备访问问题应优先检查受限 udev 权限与探针归属，而不是放大权限或杀掉所有 OpenOCD 进程。`verify` 说明所检查地址的写入内容匹配，不说明时钟、通信和控制逻辑正确。功能验证还需要断点、寄存器与外部测量。

## 2.6 例题：RAM 预算

假设 `.data` 为 8 KiB，`.bss` 为 20 KiB，计划最坏栈为 6 KiB，堆为 4 KiB，DMA 缓冲另占 10 KiB，则预算至少为 48 KiB，再考虑对齐和其他运行时需求。这里的 DMA 缓冲若已经在 `.bss` 中，就不能再次加一次；容量计算必须避免重复计数。

## 练习与解题提示

1. 为什么 `.data` 常同时消耗 Flash 和 RAM？
2. `.bss` 为 30 KiB，是否一定让 BIN 增大 30 KiB？
3. 烧录 verify 成功但 LED 不亮，列出软件和电气层各两个可能原因。

**提示与答案：** 1. 一份保存初值，一份保存运行时可写状态。2. 通常不会；清零空间由启动代码建立，具体格式与链接布局另查。3. 软件如复用错误、时钟未开；电气如极性、限流或接线不符。

## 小结与参考

main 是运行链路的中点，不是计算机开始工作的起点。每个产物都应能追溯到工具链、地址布局与目标器件。

- CMake：[Cross Compiling for Bare Metal](https://cmake.org/cmake/help/latest/manual/cmake-toolchains.7.html#cross-compiling-for-bare-metal-arm)。
- Arm CMSIS-Core：[Startup File](https://arm-software.github.io/CMSIS_6/main/Core/startup_c_pg.html)。
- [OpenOCD User’s Guide](https://openocd.org/doc/html/)，Flash Programming 与 GDB。
- [GNU Binutils Documentation](https://sourceware.org/binutils/docs/)，readelf、objdump、ld。
