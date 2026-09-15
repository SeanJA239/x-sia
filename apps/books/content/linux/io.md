# I/O 路径：缓存、设备与异步完成

> 先修：文件对象、内核上下文、虚拟内存。目标：沿数据从程序到设备的路径区分缓冲、队列、提交、完成和持久化；用量纲检查吞吐与并发，不把“异步”理解成零开销。

## 从应用缓冲到设备队列

一次高层写入可能先进入语言运行库缓冲，flush 后交给内核，普通缓冲文件 I/O 再通过页缓存与文件系统组织写回，最终进入块层和驱动。设备还可能有自己的缓存与内部调度。

不同对象的路径不同：网络套接字不经过普通磁盘文件系统，tmpfs 不等同于持久磁盘文件，直接 I/O 也有专门约束。先明确对象和接口，再讨论某层缓存是否存在。

![应用缓冲、页缓存、内核队列和设备是不同状态层。提交成功、设备完成与所需持久性是不同事件，读写路径也不必完全对称。](asset:linux-io)

### 三种“写完”不能混用

- 应用把字节交给运行库，只完成了应用层请求。
- write 返回成功，可能意味着字节进入内核管理的状态。
- 满足所需持久性协议，还可能需要同步文件、目录及检查设备与文件系统保证。

部分写入也需要处理。调用者不能把“返回值非负”自动当成请求的所有字节都已处理；中断、对象限制和资源条件会影响返回结果。

## DMA 与中断分工

DMA 允许设备在适用映射与控制下直接与内存交换数据，减少 CPU 逐字节搬运，不表示 CPU 完全不参与。CPU 和驱动仍需准备描述符、建立映射、提交工作并处理完成。

设备能访问的地址不应简单等同于用户虚拟地址。DMA 地址映射、IOMMU、缓存一致性和缓冲区生命周期都属于驱动契约。缓冲区过早释放可能让设备访问不再属于这项请求的内存。

完成可能通过中断通知，也可能由 CPU 轮询发现。中断适合避免持续空转，但频繁中断有管理成本；轮询减少通知路径，却消耗 CPU。实际系统可在不同负载下组合使用，不能只用“中断先进、轮询落后”判断。

## 阻塞、非阻塞与异步

| 模式 | 调用者等待方式 | 完成如何获知 |
|---|---|---|
| 阻塞 | 调用可能等待条件或操作进展 | 返回值与错误 |
| 非阻塞 | 暂不可完成时及时返回相应状态 | 之后重试或结合就绪机制 |
| 异步提交 | 提交与最终完成分离 | 完成记录、回调或其他协议 |

### 就绪通知不等于操作完成

epoll 一类接口通知某些对象的就绪状态，通常仍需执行实际读写并处理结果。通知和使用之间，其他线程可能改变状态；边沿触发与水平触发还有不同使用要求。普通磁盘文件不能简单当作“放进 epoll 就自动异步读盘”。

io_uring 等接口提供提交与完成分离的机制，但支持的操作、执行路径和安全限制与内核版本、文件系统及配置有关。提交成功不等于每个操作成功，完成队列中的结果仍需逐项检查。

### 生命周期是异步设计的核心

请求发出后，缓冲区、回调上下文和目标对象必须保持有效，直到相应完成或取消协议允许释放。取消请求也不必然意味着底层工作从未发生；必须定义与完成并发时的结果处理，避免双重释放、漏处理或重复业务动作。

## 吞吐、延迟与在途数量

串行操作每次耗时 $L$ 时，吞吐约受 $1/L$ 限制。在长期稳定、到达与离开统计一致的系统中，可用 Little 定律：

$$
Q=\lambda L,
$$

其中 $Q$ 是平均在途数量，$\lambda$ 是完成速率，$L$ 是平均停留时间。它表达三个统计量的关系，不是设备最大能力公式。

### 例题：维持目标吞吐需要多少在途请求？

若希望达到 2000 次每秒，平均停留时间为 4 毫秒，那么需要平均约 $2000\times0.004=8$ 个在途请求。若每个请求 16 KiB，数据率为 31.25 MiB/s。

如果增加并发导致平均延迟变成 10 毫秒，要维持相同完成速率便对应平均 20 个在途请求。不能拿低并发下的 4 毫秒一直推算高并发性能。更多队列还可能扩大尾延迟和故障时积压。

## 小块随机与大块顺序为何不同？

大块连续传输摊薄请求管理成本；随机小块访问更容易受操作数量、定位、映射和设备内部并行度影响。存储宣传的顺序峰值不能用于推断数据库随机读延迟。

读缓存命中能减少设备访问，但脏页写回把写入时间分散到后续过程。看见 write 很快不一定表示设备很快，可能只是积攒了待写回数据。应用突然卡顿可能发生在缓存或节流阈值到达时，而不是一开始。

直接 I/O 通常用于特定缓存管理需求，不是通用加速开关。它可能要求地址、长度和偏移对齐，并将缓存管理负担转交应用；仍需要根据操作与文件系统区分完成和持久性。

## 故障设计：超时之后还知道什么？

假设向服务发送一个“追加记录”请求，等待响应超时。可能的状态至少有：请求未送达、服务正在处理、处理完成但响应丢失。超时只证明调用者没有在期限内收到合格结果，不能证明副作用没有发生。

文件、设备和网络系统都需要明确幂等或去重策略。对纯读取重试通常与对追加、扣款等修改重试不同。设计请求 ID 和最终结果查询，比无条件循环重发更可靠。

本章只做给定数字推演，不运行磁盘压测、网络扫描或设备写入。真实 I/O 实验应使用可丢弃、范围明确的环境与恢复计划。

<!-- AI-INFRA-BEGIN -->
## AI Infra 进阶：主机、加速器与完成事件

> 来源：李博杰《深入理解 AI Infra：量化分析与系统设计》，Copyright 2026 Bojie Li，Apache-2.0。固定版本 58636943ba89f24b854f04f0f8f2fffe7b323829。本节由 X-SIA 选编并重新归类：补充承接说明，调整标题层级、图片路径和脚注前缀，保留选定推导及上游图号；图号和节号不是本卷的新编号。下文的配置、题设和作者报告不代表 X-SIA 已完成对应实测。

前面区分了 I/O 提交与完成，下面换成 CPU 与 GPU 协作的矩阵运算。这里的 GPU kernel 是设备上执行的计算程序，不是 Linux 内核；stream 是设备任务序列，也不是 Shell 的字节管道。相同的缓冲区生命周期原则仍然适用：提交返回、复制完成、计算用完与 CPU 可以读取结果，是不同时间点。

[manuscripts/05-算子与运行时.md](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/manuscripts/05-%E7%AE%97%E5%AD%90%E4%B8%8E%E8%BF%90%E8%A1%8C%E6%97%B6.md)

### 原著 5.1.1 从框架调用到 kernel launch

PyTorch 是表达张量运算并组织模型执行的软件框架。调用其矩阵乘法时，CPU 首先执行框架代码：读取张量形状和数据类型，选择实现，准备地址和参数，再通过运行时与驱动向 GPU 提交任务。向加速器发起一次 kernel 执行称为 **kernel launch**。运行时负责提交任务、管理内存和同步执行；编译器则事先或在首次调用时生成加速器代码。

这里有三个层次：算子描述数学工作，例如矩阵乘和激活；kernel 在加速器上完成这项工作；launch 是 CPU 发起这次执行的动作。一个矩阵乘可以由多个 kernel 完成，几个逐元素算子也可以由同一个 kernel 完成。因此，既可以优化加速器上的计算，也可以减少主机准备和提交任务的开销。

CUDA 执行一个 kernel 时会启动多个线程。若干线程组成一个线程块（thread block），所有线程块组成一个线程网格（grid）。矩阵乘通常把输出矩阵分成多个 tile，交给不同线程块计算，块内线程协作读取输入并累加结果。加速器将线程块安排到有可用资源的 SM 上。较早完成的块释放资源，后续块便可开始；因此，grid 中的线程块可以分批执行。

kernel launch 采用异步提交。调用返回时，CPU 已完成这次提交，GPU 则按照任务队列和依赖关系执行。CPU 可以立即准备下一项任务。只有当 CPU 要用加速器的结果，或者要覆盖加速器还在使用的数据时，CPU 才需要等相应的加速器操作完成。[^ai-linux-io-05-execution]

这种分工形成一条简单流水：CPU 准备并提交任务，GPU 执行任务。大矩阵计算持续较久，CPU 有时间准备下一次调用；小算子迅速结束，GPU 更容易执行完队列中的任务，停下来等待 CPU 提交下一项。因此，可以从两方面加速：减少加速器等待主机的时间，以及缩短 kernel 本身的执行时间。

### 原著 5.1.2 主机与加速器之间的数据复制

CPU 能够提前提交下一项任务，加速器却只有在输入到达后才能计算。先分析数据的传输过程，就能看清提交任务后、开始计算前还需要完成哪些工作。除了第 4 章介绍的 H2D 与 D2H，有独立显存的 GPU 还常在显存内部复制，常见的复制方向有三种：

| 名称 | 复制方向 | 典型对象 |
| --- | --- | --- |
| H2D | 主机内存 → 显存 | 当前 batch 的输入张量 |
| D2H | 显存 → 主机内存 | CPU 要使用的计算结果 |
| D2D | 显存 → 显存 | 固定输入缓冲或重排结果 |

上述矩阵乘的执行过程是：

> CPU 准备输入 → H2D → GPU 计算 → D2H → CPU 使用结果。

图 5-1 画出这些数据在两侧内存中的位置和复制方向。

![图 5-1 主机内存与显存之间的复制路径](asset:aib-ch05-figure-5-copy-paths)

*图 5-1：H2D 把输入从主机的锁页缓冲搬进显存，D2H 把结果搬回主机；权重加载一次后留在显存，kernel 直接读取显存中的输入并写出输出。普通内存中的数据要先复制到锁页缓冲，才能由复制引擎直接搬移。*

运行完整模型时，并非每次调用都要重新传入所有数据。权重加载后可以一直保留在显存中，层间激活可以由下一个 kernel 直接读取，KV 也可以在后续 decode 步中继续使用。如果采样在 GPU 上完成，CPU 只需接收少量 token ID。因此，主机与加速器之间的复制次数，与加速器内部的读取次数并不相同：一份权重可以只传入一次，却在加速器上读取多次。

**例 5-1：主机到 GPU 的输入传输需要多久？** $[8192,4096]$ 的 BF16 张量占 $8192\times4096\times2=64$ MiB。RTX PRO 6000 经 PCIe Gen5 x16 接到主机，每个方向的标称带宽为 64 GB/s，[^ai-linux-io-05-pcie]传输时间为：

$$
T_{\mathrm{H2D}}=\frac{64\ \mathrm{MiB}}{64\ \mathrm{GB/s}}\approx1.05\ \mathrm{ms}.
$$

将输入分成两份 32 MiB 张量，每份约需 0.52 ms，总传输量保持不变。这样做的好处是第一份数据可以更早到达：GPU 开始计算前半批时，复制引擎继续传送后半批。第 5.3 节将进一步计算传输与计算重叠后的总时间。[^ai-linux-io-05-buffer]

主机内存的类型也影响复制过程。普通内存的页面由操作系统管理；**锁页内存（pinned memory）**在使用期间保持驻留，便于加速器直接搬移。从普通内存传输数据时，运行时常先将数据复制到内部的锁页缓冲：CPU 先复制一遍，再由加速器读取。这就是图 5-1 左侧的主机内复制。若每批都把 64 MiB 数据复制进新建的锁页缓冲，就在 H2D 之前多做了一次主机复制。让 CPU 直接在可复用的锁页缓冲中准备输入，可以省去这次中转和反复分配。[^ai-linux-io-05-execution]

### 原著 5.1.3 stream、event 与完成顺序

数据传到哪里，决定哪个处理器能够使用它；数据何时传完，则决定后续计算何时能够开始。异步调用返回后，复制可能仍在进行，需要用执行顺序保证计算不会读到尚未传完的输入。CUDA 的 **stream（流）**是一串按顺序执行的加速器任务。把 H2D 和读取该输入的 kernel 放在同一 stream 中，计算就排在复制之后；CPU 可以连续提交两项工作。

若复制和计算放在不同 stream 中，就用 **event（事件）**指定跨流的执行顺序。复制流在 H2D 后记录事件，计算流等待事件，再使用这份输入。等待发生在计算流的加速器任务序列中，CPU 仍可继续提交其他工作。

图 5-2 把两条流和两个事件画在同一条时间线上。

![图 5-2 两条流之间用事件规定先后顺序](asset:aib-ch05-figure-5-stream-event)

*图 5-2：复制流依次传入各批输入，计算流读取它们。计算批 0 要等“批 0 已传完”事件；批 2 要重新写入槽 A，必须等“批 0 已用完”事件。虚线箭头表示等待事件，不搬移数据。两个槽的交替使用在第 5.3.2 节展开。*

事件也可以用来确定缓冲何时能够再次使用。设当前输入从主机缓冲复制到 GPU 的缓冲槽 A。复制完成后，CPU 就可以往主机缓冲写入下一批输入；槽 A 则要等 GPU 用完当前输入后才能覆盖。两块缓冲虽然保存同一批数据，却要在不同的时刻才能重新使用。

| 缓冲 | 最后使用者 | 随后的动作 |
| --- | --- | --- |
| H2D 的主机源缓冲 | 复制引擎读取 | CPU 写入下一批输入 |
| GPU 输入缓冲 | 读取该输入的 kernel | 复制引擎写入下一批输入 |
| D2H 的加速器源缓冲 | 复制引擎读取 | GPU 写入新结果 |
| D2H 的主机目标缓冲 | 复制引擎写入 | CPU 读取当前结果 |

因此，应在最后一次读写之后记录事件，让随后使用这块缓冲的操作等待该事件。CPU 需要 D2H 结果时，可以等待对应事件；其他无关的加速器任务继续运行。第 5.3 节的双缓冲正是把两套这样的使用顺序交错起来。

这套顺序也解释了程序为什么会停住不动。每一次等待都指向一个具体的事件，只要该事件始终未被记录，等待就不会结束；表现出来是程序停住，而不是变慢。上表中四块缓冲各自的最后使用者，就是四个容易漏记的事件：漏掉 GPU 输入缓冲的“已用完”事件，复制引擎就一直不能写入下一批。跨流的循环等待也一样：A 流等 B 流记录的事件，B 流的这项任务又排在 A 流尚未完成的工作之后，两条流都不会前进。多卡执行还多一种来源：集合通信要求参与的每张卡都发起同一次调用，只要有一张卡少发起一次，其余的卡就会一直等待这个不会到来的对端（第 6.4 节）。

排查时先看被等的那一侧是否还在前进：仍有结果产出，就只是慢，应回到第 5.1.4 节的时间线逐段计时；完全不动，才是在等一个不会到来的事件，第 10.4.5 节的慢节点属于前一种。为等待设置超时，超时后打印各流尚未完成的任务，就能确定缺的是哪个事件。

### 原著 5.1.4 从提交时间到结果可用时间

把复制、计算和缓冲使用的顺序连起来，才能确定结果何时可用。图 5-3 将这一顺序画成时间线。

**例 5-2：为什么提交耗时、加速器耗时与完整调用耗时不同？** 输入已在主机准备好。CPU 在 0–3 μs 内提交全部任务，第一项加速器工作从 3 μs 开始；H2D、kernel、D2H 分别用 8、20、4 μs，加速器按依赖连续执行。

![图 5-3 提交、执行与结果可用的时间](asset:aib-ch05-figure-5-1-execution)

*图 5-3：CPU 提交、H2D 输入复制、kernel 执行与 D2H 结果返回依次发生。上方 kernel 执行 20 μs，结果在第 35 μs 可用；下方 kernel 执行 5 μs，结果在第 20 μs 可用。*

CPU 提交任务用时 3 μs，kernel 执行用时 20 μs，CPU 到第 35 μs 才能使用结果。若把 kernel 的执行时间从 20 μs 缩短到 5 μs，结果就能在 $3+8+5+4=20$ μs 时使用。kernel 速度提高到原来的四倍，整次执行则从 35 μs 降至 20 μs，加速比约为 1.8；剩余 15 μs 由提交和复制构成。

例 5-2 问到的三种耗时，正对应三种计时位置。测量结果取决于在什么位置开始和结束计时。在异步调用前后读取 CPU 时钟，测得提交所用的时间；若在结束计时前等待结果，则测得从发起到完成的时间。CUDA event 在加速器任务序列中标出起止位置，测得加速器执行这段任务所用的时间。性能分析工具（profiler）把主机调用、加速器计算和复制画在同一条时间线上，提交之后的排队、依赖等待和执行就能逐段看清。

图 5-3 的时间线从输入准备好开始。若程序尚未编译，时间线之前还要加上一次准备工作：首次调用可能需要编译代码或分配工作区。假设首次编译用 100 ms，随后每次执行 1 ms，调用一次共 101 ms，调用 100 次共 200 ms，平均每次 2 ms。调用次数越多，平均分摊的编译时间越少，而每次执行所需的 1 ms 保持不变。第 5.5 节将用同一方法判断分桶（把输入补齐到少数代表形状）和特化（为具体形状生成专门程序）需要重复多少次才值得。

### 原著许可与整理说明

原创正文与图按原著 Apache-2.0 许可选编；未导入第三方论文、字体、模板或实验原始数据。完整许可如下，原图的固定来源与 SHA256 另存于教材源工程的 assets/third-party/ai-infra/sources.json。

```license
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or Derivative
          Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright 2026 Bojie Li

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

[^ai-linux-io-05-execution]: [CUDA 执行模型](https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/intro-to-cuda.html)；[CUDA Runtime API 的同步语义](https://docs.nvidia.com/cuda/cuda-runtime-api/api-sync-behavior.html)；[CUDA stream 管理](https://docs.nvidia.com/cuda/cuda-runtime-api/group__CUDART__STREAM.html)与[event 管理](https://docs.nvidia.com/cuda/cuda-runtime-api/group__CUDART__EVENT.html)；[PyTorch 锁页内存与异步复制教程](https://docs.pytorch.org/tutorials/intermediate/pinmem_nonblock.html)。主机复制与缓冲复用另见本章引用的本地计算材料。

[^ai-linux-io-05-pcie]: [RTX PRO 6000 Blackwell 工作站版规格](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/files/specs/nvidia-rtx-pro6000-spec.pdf)列出系统接口为 PCIe 5.0 x16；[NVIDIA H100 规格](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/files/specs/nvidia-h100-spec.md)给出 PCIe Gen5 x16 为 128 GB/s，是收发两个方向的合计，每个方向 64 GB/s。

[^ai-linux-io-05-buffer]: [流式顺序与缓冲预算](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/case-studies/stream-order-and-buffer.md)；[主机搬移与缓冲区占用时间](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/case-studies/host-transfer-and-buffer-lifetime.md)。
<!-- AI-INFRA-END -->

## 练习与解题提示

1. DMA 为什么仍需要管理缓冲区生命周期？
2. epoll 通知可读后，为什么仍要检查 read 的实际返回值？
3. 平均延迟 5 毫秒、完成速率 800 次每秒，平均在途数量是多少？
4. write 很快能否证明数据已经具备断电恢复保证？
5. 超时后重发一项追加操作，可能产生什么问题？

**答案：** 1. 设备可能仍在访问，提前释放会造成失效访问。2. 状态可能改变，且通知不是代替读操作。3. 4。4. 不能，可能只进入缓冲或缓存。5. 原操作已经完成而响应丢失时会重复追加，需要业务去重或幂等设计。

## 小结与参考

I/O 不是一个“访问磁盘”动作，而是跨层状态机。用对象、队列、完成和持久性四条线去读系统，才能判断异步方案真正改善了什么。

- [Linux block documentation](https://docs.kernel.org/block/index.html)、[DMA API](https://docs.kernel.org/core-api/dma-api.html)：按内核版本理解设备路径与映射契约。
- [epoll(7)](https://man7.org/linux/man-pages/man7/epoll.7.html)：重点比较就绪模型与触发方式。
- [io_uring(7)](https://man7.org/linux/man-pages/man7/io_uring.7.html)：核对提交与完成语义，而不是直接照搬性能宣传。
