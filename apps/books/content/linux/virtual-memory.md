# 虚拟内存：页表、缺页与缓存

> 先修：操作系统抽象、文件引用；能进行简单二进制运算。目标：从虚拟地址推导页号与偏移，区分 TLB 未命中、缺页和缓存未命中，并理解映射、写时复制与回收的关系。

## 地址空间是一份映射，不是一整块物理内存

程序使用的地址通常是虚拟地址。内核为地址范围维护映射与权限，硬件地址转换机制将适用访问转换为物理地址。两个进程都访问同一个虚拟数值，不代表访问相同物理页；两个不同虚拟地址也可能映射共享对象。

映射还带有读写执行等约束。存在一个地址数值，不等于它属于合法映射；属于合法映射，也不等于它的物理页已经驻留。把“地址空间大小”“映射大小”和“实际物理占用”合并为一个内存数字，会误判很多程序。

## 页号与偏移的手工推导

若页大小为 $2^k$ 字节，虚拟地址 $v$ 可分解为：

$$
\mathrm{VPN}=\left\lfloor v/2^k\right\rfloor,\qquad d=v\bmod2^k.
$$

页表将 VPN 映射为物理页框号 PFN，若访问合法且映射已就绪，物理地址为 $\mathrm{PFN}\times2^k+d$。偏移不变，变化的是页框选择。

### 例题：4 KiB 页面

页大小为 4096，即 $k=12$。虚拟地址 `0x12345` 的页号为 `0x12`，偏移为 `0x345`。若页表给出 PFN=`0x9a`，物理地址为 `0x9a345`。

```python
# example: memory-address
address = 0x12345
page_size = 4096
vpn, offset = divmod(address, page_size)
physical = 0x9a * page_size + offset
assert (vpn, offset, physical) == (0x12, 0x345, 0x9a345)
print(hex(physical))
```

这只是地址转换模型，不读取真实页表。不能把任意虚拟地址直接按固定加法变成当前机器的物理地址。

![虚拟地址拆为页号与偏移，经 TLB 或页表查找得到页框，之后访问缓存与内存；缺少合法驻留映射时进入缺页处理。](asset:linux-virtual-memory)

## 页表为何分层，TLB 又解决什么？

假设一个简化系统使用 32 位虚拟地址、4 KiB 页、每页表项 4 字节。单层页表需 $2^{20}$ 项，即 4 MiB；若为许多进程和更宽地址空间分配平坦完整表，开销很大。多级页表利用地址空间通常稀疏的特点，只为实际使用区域分配相应层次。

TLB 缓存近期地址转换。TLB 未命中后可能由硬件或适用软件机制查页表；只要页表已有可用映射，就不需要让页面从存储设备读入。**TLB miss 不等于 page fault**。

CPU 数据缓存保存的是数据或指令相关缓存内容，与 TLB 的地址转换缓存承担不同职责。实际处理器可能重叠部分查找过程；教材的顺序图用于分清对象，不是所有芯片逐周期实现图。

### 两级页表的地址拆分

继续使用 32 位地址与 4 KiB 页，若页目录和每张叶页表都含 1024 项，可按 10 位目录索引、10 位页表索引、12 位偏移拆分。地址 `0x00403004` 对应目录项 1、叶表项 3、偏移 4。

假设每项 4 字节，一张目录占 4 KiB，一张叶表也占 4 KiB。如果有效映射只涉及两个目录槽位，页表结构可仅需一张目录和两张叶表，即 12 KiB；这不包含实际数据页，也忽略其他元数据。平坦单层表则仍需容纳全部 $2^{20}$ 个位置，达 4 MiB。

节省来自稀疏结构，不意味着每次查询免费。多一级查找可能增加未命中路径成本，因此层级页表与 TLB 缓存需要配合。大页又在转换覆盖、内部碎片和管理粒度之间作出不同取舍。

### 一个受限的访问时间模型

在不重叠、TLB 查询成本为 $t$、一次内存访问为 $m$、未命中需额外访问单层页表一次的简化模型中，命中率为 $h$ 时：

$$
E=t+h m+(1-h)2m.
$$

若 $t=1$ ns、$m=80$ ns、$h=0.99$，结果为 81.8 ns。真实多级页表、页表缓存、数据缓存和并行查找会改变公式，所以它只能说明“少量慢路径也会影响平均成本”。

## 缺页并不只有一种

### 合法映射的延迟建立

匿名映射首次被访问时可能需要建立零页相关映射或分配页；文件映射可能需要将相应内容读入；写时复制映射在写入时可能分配私有页。它们都可能涉及缺页处理，但不一定都访问磁盘。

### 非法访问与权限冲突

地址不属于合法区域、写入只读页面、执行不可执行区域等，可能最终导致进程收到错误信号。操作系统不能为了让任何地址都“工作”而无条件分配页面。

minor/major fault 等计数可以提供线索，但应按系统和工具定义解释。把所有缺页数增长当成 swap 激增，或者把没有磁盘读取的缺页当成完全免费，都是错误推断。

## mmap、页缓存与写时复制

文件映射让程序通过内存访问形式读取文件内容，不等于完全绕过内核、页缓存或缺页处理。共享映射与私有映射对写入可见性有不同规则；`MAP_PRIVATE` 的修改不能简单当成已经写回原文件。

fork 的写时复制让父子最初共享一部分物理页，写入时按需分开。假设简化模型有 100 个共享页，子进程修改其中 10 页且没有其他变化，则相关唯一物理页可能由 100 增至 110，而不是立刻变成 200。页面还包括元数据、共享只读代码等多种类型，不能用这个比例计算真实整个进程占用。

### 页级保护与堆分配是不同粒度

malloc 等用户态分配器通常管理比页更小的对象。free 一个对象可能只是让分配器复用该块，不一定立即解除映射并把页交回系统。因此“应用已释放对象但 RSS 没降”不自动证明泄漏，也不自动证明完全无问题；要看存活对象、分配器行为和长期趋势。

## 回收、工作集与抖动

工作集描述某段时间内任务频繁使用的数据范围。若可用内存装不下活跃工作集，系统可能反复回收又重新取回页面，花大量时间搬运而不是推进工作，形成抖动。

增大缓存不总能解决它，尤其当容器有独立上限或工作集随并发数增长时。减少并发、改变数据访问方式或缩小活跃数据范围，都可能比“看见 free 小就清缓存”更合适。回收策略还要区分干净文件页、脏页、匿名页等代价。

<!-- AI-INFRA-BEGIN -->
## AI Infra 进阶：加速器存储与在途并发

> 来源：李博杰《深入理解 AI Infra：量化分析与系统设计》，Copyright 2026 Bojie Li，Apache-2.0。固定版本 58636943ba89f24b854f04f0f8f2fffe7b323829。本节由 X-SIA 选编并重新归类：补充承接说明，调整标题层级、图片路径和脚注前缀，保留选定推导及上游图号；图号和节号不是本卷的新编号。下文的配置、题设和作者报告不代表 X-SIA 已完成对应实测。

这里把对象从 CPU 进程映射扩展到加速器存储。HBM、共享内存与寄存器不是 Linux 页表的同义词，但仍应区分驻留容量、每级接口流量和在途访问。下面的型号参数和模型配置作为上游固定版的给定条件使用，不能直接拿本机 free 的输出代入显存预算。

[manuscripts/04-加速器架构.md](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/manuscripts/04-%E5%8A%A0%E9%80%9F%E5%99%A8%E6%9E%B6%E6%9E%84.md)

### 原著 4.3.1 显存与统一内存

模型运行时，权重、KV 缓存与临时工作区同时占用内存。权重占用相对固定，KV 随请求数和上下文长度增长，工作区保存执行中的中间结果。先确定这三项，才能决定加速器能否再接收一个请求。

Qwen3-8B 的 BF16 权重约占 16.4 GB。模型有 36 层，每层有 8 个 KV 头，每头 128 维；K 和 V 各保存一份，每个元素两字节。因此，每个上下文 token 的 KV 占用为

$$
m_{\mathrm{KV}}=36\times2\times8\times128\times2=147\,456\ \mathrm{bytes}=144\ \mathrm{KiB}.
$$

每条请求保留 $S$ 个位置、同时服务 $B$ 条请求时，容量条件为

$$
W_{\mathrm{resident}}+BSm_{\mathrm{KV}}+M_{\mathrm{workspace}}\le C_{\mathrm{available}}.
$$

按 $B$ 求解，就得到固定长度下的最大请求数：

$$
B_{\max}=\left\lfloor\frac{C_{\mathrm{available}}-W_{\mathrm{resident}}-M_{\mathrm{workspace}}}{Sm_{\mathrm{KV}}}\right\rfloor.
$$

以 RTX 4090 的 24 GB 显存为可用容量，留 2 GiB 工作区。扣除权重后，约 5.47 GB 用于 KV。$S=8192$ 时每条请求需要 1.125 GiB，约 1.21 GB，四条请求的 KV 共约 4.83 GB，可以容纳；增加到五条后，共需约 6.04 GB，超过剩余容量。上下文翻倍后，每条请求 KV 翻倍，最大请求数降为两条。[^ai-linux-virtual-memory-04-capacity]

![RTX 4090 的 24 GB 显存中的权重、工作区和 KV。8K 四请求与 16K 两请求可以容纳，8K 五请求超过虚线标出的容量上限。](asset:aib-ch04-figure-4-6-capacity)

*图 4-13　RTX 4090 的 24 GB 显存中的权重、工作区和 KV。8K 四请求与 16K 两请求可以容纳，8K 五请求超过虚线标出的容量上限。*

图 4-13 中，权重与工作区的宽度保持不变，变化发生在右侧的 KV 区域。长上下文让每个 KV 块变宽，增加并发则增加块数；二者争用同一份剩余空间。

最大请求数的取整公式揭示了容量的阶梯效应。增加少量内存时，$B_{\max}$ 可能保持不变；只有剩余空间足以容纳一条新请求的全部 KV，才能多接收一条请求。压缩权重会增大公式分子中的剩余空间，因此也能容纳更多请求。对权重较大的模型，减少固定占用可明显提高并发；对长上下文任务，KV 已占较大比例，继续压缩权重的收益会逐渐减小。

降低 KV 位宽也能释放容量。第 2 章的 DeepSeek V4.1-Flash 同时使用全局历史与 SWA 局部窗口。一条主 KV 记录的 512 个值采用 FP4，连同分组 scale 共占 288 bytes；局部窗口的一条记录采用 FP8，连同 scale 共占 528 bytes。主 KV 在参与注意力乘法前反量化，即利用 scale 恢复为计算所用的数值格式。存储格式压缩了常驻状态，执行时再恢复操作数。[^ai-linux-virtual-memory-04-v41-case]

以上只计了推理时的状态。训练还使用梯度、优化器状态和为反向传播保存的激活。按照第 3 章介绍的张量生命周期计算这些状态的占用：在某一时刻仍需保存的所有张量共同决定内存占用峰值，已经释放的中间结果腾出空间给后续工作。容量规划因而既与每份张量大小有关，也与执行顺序有关。

显存容量最终由内存器件与接口提供。HBM 通过堆叠存储 die 和宽接口提供带宽；图形双倍数据速率内存（GDDR）通常以多颗存储芯片配合高速接口提供显存。两者都是内存器件与接口技术，而统一内存是处理器共享内存的组织方式。Apple 的 CPU 与 GPU 访问共享物理内存，两者可以先后使用同一个缓冲区，减少独立副本；相应地，CPU、GPU 与其他应用也共同消耗这份容量与带宽。[^ai-linux-virtual-memory-04-apple] 第 4.5 节会沿主机到加速器的路径分析这种组织对传输时间的影响。

> **思考：KV 压缩后能否再接纳一条请求？** 若每条请求 KV 需求从 1.21 GB 降低 10%，RTX 4090 能否容纳第五条请求？先求五条请求的总需求，再比较剩余空间。

### 原著 4.3.2 缓存、片上缓冲与寄存器

算一块输出时，输入中的同一个数往往还要参与邻近输出的计算，尚未算完的部分和也要继续累加。如果每做一次乘加都回到片外取数、写回结果，就会产生大量往返。把常用数据留在计算单元附近，如同把当前要用的材料放在手边的工作台上，可以减少这些搬移；但近处的空间有限。

寄存器保存线程与指令正在使用的值，缓存自动保留最近访问的数据，软件管理的缓冲则由程序明确安排加载和释放。三者都能保存反复使用的数据，但容量、访问方式与管理者各不相同。片上存储还要占用芯片面积，容量通常比片外内存小得多。下面跟踪两块输入和一块部分和，计算所需空间。

考虑 $m=n=128,k=64$ 的乘加块。BF16 输入与权重块各为 16 KiB，合计 32 KiB；FP32 输出累加器为 $128\times128\times4=64$ KiB。V100 每个 SM 最多可把 96 KB（即 96 KiB）配置为共享内存，若操作数与累加器都放在其中，恰好用满。[^ai-linux-virtual-memory-04-volta-evolution] 要同时准备下一对操作数，便需要 $2\times32+64=128$ KiB。

若累加器使用独立存储，同样的 96 KiB 就能容纳三组配对的输入块与权重块。局部缓冲的总容量没有增大，但存储分工改变了可以提前准备的输入块数。第 4.6.1 节将用 Blackwell 的专用累加存储说明这种分工。

前例把计算块的部分和留在片上，省去了反复写回。同样的思路也适用于多个计算块共同使用的输入。设四个输出块都要读取同一份 32 KiB 输入，它们共发出 128 KiB 的逻辑请求。L2 是计算单元之间共享的二级缓存。若第一次读取把数据留在 L2，后面三次命中，则片外只需提供 32 KiB，但 L2 仍要向各块提供全部 128 KiB。若四个输出块由同一计算组顺序处理，并将输入留在局部缓冲，后续访问就可以直接从局部缓冲取得数据。

因此，分析同一份数据时，需要区分三个量：数据本身占用的空间、各计算块请求读取的字节数、某一级接口实际传输的字节数。算术强度也随观察层次变化。用 L2 请求量计算的强度要与 L2 带宽一起使用，用 DRAM 流量计算的强度则与片外带宽一起使用。第 4.8 节将用实际计数展示这种差别。

增大计算块通常能增加数据复用，但也需要更大的缓冲。RTX 5090 与 RTX PRO 6000 采用 SM120 架构，每个 SM 的一级数据缓存与共享内存合计 128 KB，其中最多 100 KB 可配置为共享内存，由驻留在该 SM 上的计算组共用：每个计算组需要 32 KiB 时，可以驻留三组；每组扩到 64 KiB 后，只能驻留一组。[^ai-linux-virtual-memory-04-blackwell-evolution] 一组等待数据时，另一组可以继续计算。因此，同时运行的组数减少后，计算单元更容易闲置。选择块大小时，要同时考虑每组能减少多少重复读取，以及还能容纳多少组相互独立的计算。

片上缓冲容量也随代际增加。A100 每个 SM 的共享内存容量上限为 164 KB，H100 为 228 KB。[^ai-linux-virtual-memory-04-evolution] 更多计算组驻留在片上，也能发出更多相互独立的读取请求。

### 原著 4.3.3 容量、带宽与延迟分别限制什么

容量是某一时刻能够容纳多少数据，带宽是单位时间传输多少数据，延迟是一次请求从发出到完成经过多久。同时发出足够多的独立请求，则可以在等待一次访问返回时继续处理其他访问。

模型驻留和逐步执行对内存提出的要求不同。按第 4.1.3 节的 HBM 配置表，H100 SXM 为 80 GB、3.35 TB/s，H200 SXM 为 141 GB、4.8 TB/s，容量与带宽的增幅并不相同。Qwen3-235B-A22B 的一组 4-bit 方案中，权重与 scale 约为 123.1 GB，八条请求各保留 8,192 个 token 的 KV 约为 12.6 GB，加 2 GiB 工作区，共约 137.9 GB。H100 的容量缺口接近 58 GB，H200 则有约 3.1 GB 余量。容量增加，首先是让这些数据能够同时驻留。[^ai-linux-virtual-memory-04-storage]

全部专家的权重都保存在内存中，而每步需要读取哪些权重由路由结果决定。八条请求的专家选择分散时，权重、scale 与 KV 的每步访问约为 75.967 GB；集中选择相同专家时，降至约 24.737 GB。在 H200 上，仅传输这些字节分别需要约 15.8 ms 和 5.2 ms；改用 8 TB/s 的 HGX B200，分别为约 9.5 ms 和 3.1 ms。专家复用把流量减少到约三分之一，加速器升级则把传输一个字节所需的时间减少到原来的约六成，两种改动作用在公式 $T=V/R$ 的不同位置。

![读取请求从发出到返回一直占用请求记录空间。多个独立请求交叠，才能在单次访问等待期间持续利用接口；图中只画四个代表请求。](asset:aib-ch04-figure-4-memory-inflight)

*图 4-14　读取请求从发出到返回一直占用请求记录空间。多个独立请求交叠，才能在单次访问等待期间持续利用接口；图中只画四个代表请求。*

上述 $V/R$ 计算假定接口可以持续达到给定带宽。要维持这种速度，就必须在一次访问等待返回时继续发出其他请求。将内存接口一次传输的基本单位称为访存事务。设接口中最多同时有 $N_o$ 个在途事务，每个事务带回 $s$ bytes，平均完成延迟为 $L$。一个事务从发出到返回期间占用一个位置；每秒最多完成约 $N_o/L$ 个事务，于是

$$
R_{\mathrm{effective}}\le\min\left(R_{\mathrm{interface}},\frac{N_os}{L}\right).
$$

把式子按 $N_o$ 求解，维持目标吞吐需要

$$
N_o\ge\left\lceil\frac{R_{\mathrm{target}}L}{s}\right\rceil.
$$

这就是 Little 定律：平均在途请求数等于请求完成速率乘以平均请求延迟。硬件队列决定能容纳多少在途事务，而程序中相互独立的访问决定能否用满队列。若下一地址依赖上一读取结果，队列即使很深也无法填满；多个独立计算块则能提供互不等待的读取。

> **例 4-2：换上带宽更高的显卡，KV 读取也会同比加快吗？**
>
> **比较在途事务数与接口带宽对 KV 读取的限制。** 读取一条请求的 8,192 个上下文 token 所对应的 KV，共 1.125 GiB。显存接口取 RTX 4090 的 1,008 GB/s，每事务 128 bytes，完成延迟取 500 ns：内存性能测量工具 Mess 在 H100 上测得的显存空载延迟为 363 ns，接近饱和带宽时升到 699—1,433 ns，500 ns 位于二者之间。[^ai-linux-virtual-memory-04-mess] 分别计算最多允许 128 和 4,096 个在途事务时的有效读取带宽与耗时，再比较换成 RTX 5090 的 1,792 GB/s 后的结果。
>
> **由在途字节数和访问延迟求有效读取带宽。** 维持 1,008 GB/s 需要 $\lceil1.008\times10^{12}\times500\times10^{-9}/128\rceil=3938$ 个事务。128 个事务只能提供约 32.8 GB/s，读取时间至少为 36.9 ms；4,096 个事务足以维持 1,008 GB/s，时间降为约 1.20 ms。
>
> **在途事务不足时，更高的接口带宽收益有限。** 换成 RTX 5090 后，4,096 个事务仍只能支持约 $4096\times128/(500\ \mathrm{ns})=1.05$ TB/s，时间约为 1.15 ms。接口带宽提高了约 78%，吞吐率却受在途事务数限制，只提高约 4%。
>
> **用满更高带宽或应对更长延迟，需要多少在途事务？** 把在途事务数提高到至少 7,000 个，才能维持 1,792 GB/s；若延迟增至 800 ns，该要求又增至 11,200 个。[^ai-linux-virtual-memory-04-window-rtx]

![每事务 128 bytes、返回延迟 500 ns 时，增加在途请求数会提高带宽上界，直到碰到 RTX 4090 或 RTX 5090 显存接口本身的速率上限。](asset:aib-ch04-figure-4-7-memory)

*图 4-15　每事务 128 bytes、返回延迟 500 ns 时，增加在途请求数会提高带宽上界，直到碰到 RTX 4090 或 RTX 5090 显存接口本身的速率上限。*

图 4-15 的两条曲线在并发较小时重合，是因为限制来自在途字节数。越过各自拐点以后，接口带宽成为新的瓶颈。实际系统中，增加并发访问还会使队列变长，延迟也随负载变化；Mess 用延迟探针与可调背景流量同时观察这两项，得到带宽—延迟曲线。[^ai-linux-virtual-memory-04-mess] 这条曲线把“同时发起独立请求可以减少等待期间的空闲”与“请求过多会增加排队时间”放进同一张图中。

分析存储性能时，先根据容量判断数据能否驻留，再根据复用情况计算各级接口的流量，最后结合并发量和延迟判断接口能否持续传输。

> **实验 4-3 · 延伸：内存扩容与带宽提升分别能改善哪些 decode 瓶颈**
>
> 使用 Qwen3-8B 与 Qwen3-235B-A22B 的存储结果，分别只增加容量、只增加带宽，再改变 batch 和专家分布。先求最大可驻留请求数，再计算每步读取时间，最后求维持目标带宽需要的在途事务数。说明每种方案首先受容量、传输时间还是访存并发数限制。

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

[^ai-linux-virtual-memory-04-capacity]: [Qwen3-8B 配置](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/configs/models/qwen3-8b/config.json)；[存储代际完整结果](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/results/storage-generation-qwen8-235.md)。

[^ai-linux-virtual-memory-04-v41-case]: [DeepSeek V4.1 官方技术报告](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/sources/deepseek-v4.1-flash/DeepSeek_V41_Tech_Report.pdf)，第 1、2、3 节与第 6 节；[跨章会话的固定条件与复算](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/results/v41-throughline.json)。

[^ai-linux-virtual-memory-04-apple]: [M2 Pro／Max 官方规格](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/files/specs/apple-m2-pro-max.md)、[Apple GPU 架构说明](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/files/documents/apple-gpu-architecture.md)、[Metal 存储模式](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/files/documents/apple-metal-memory.json)、[M5 GPU Neural Accelerator 官方说明](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/outline-checks/2026-09-07/systems-cases/apple-m5-evolution.md)。

[^ai-linux-virtual-memory-04-volta-evolution]: [Volta 架构白皮书](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/files/specs/nvidia-v100.pdf)，Tensor Cores 与混合精度章节。

[^ai-linux-virtual-memory-04-blackwell-evolution]: [Blackwell Tuning Guide](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/files/specs/nvidia-blackwell-guide.md)、[CUTLASS Blackwell 功能说明](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/outline-checks/2026-09-07/systems-cases/cutlass-blackwell.md)及 [SM100 TMEM 示例](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/outline-checks/2026-09-07/systems-cases/cutlass-01_mma_sm100.cu)；SM120（计算能力 12.0）每个 SM 的 128 KB 一级数据缓存与 100 KB 共享内存上限见 [CUDA 编程指南的计算能力表](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/files/documents/cuda-compute-capabilities.md)。

[^ai-linux-virtual-memory-04-evolution]: [从负载变化理解芯片演进](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/case-studies/architecture-evolution.md)。

[^ai-linux-virtual-memory-04-storage]: [存储代际比较结果](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/results/storage-generation-qwen8-235.md)及[计算说明](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/research/storage-generation-comparison/README.md)。

[^ai-linux-virtual-memory-04-mess]: *Mess*，MICRO 2024，[作者接受稿](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/proceedings/MICRO/2024/paper-011.pdf)，选读物理页 3—6；[访存并发算例及限制](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/case-studies/memory-bandwidth-and-concurrency.md)。

[^ai-linux-virtual-memory-04-window-rtx]: [RTX 4090，128 个在途事务](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/results/window-qwen3-8b-rtx4090-n128.md)、[RTX 4090，4,096 个](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/results/window-qwen3-8b-rtx4090-n4096.md)、[RTX 5090，4,096 个](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/results/window-qwen3-8b-rtx5090-n4096.md)、[RTX 5090，延迟 800 ns](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/results/window-qwen3-8b-rtx5090-l800.md)；Mess 的 H100 延迟见其表 I 与图 3(h)。
<!-- AI-INFRA-END -->

## 练习与解题提示

1. 页大小为 8 KiB，偏移占几位？
2. 同一虚拟地址在两个进程中是否必然指向不同物理页？
3. TLB miss 是否一定引发设备读取？
4. fork 后子进程只改少数页，为什么不能用两个 RSS 的总和估算唯一物理占用？
5. 模型中 $h=0.9$ 时，平均访问时间是多少？

**答案：** 1. 13 位。2. 不必然，可能独立映射，也可能共享。3. 不一定，页表可能已有驻留映射。4. RSS 会重复计入共享页，且写时复制只分离被写部分。5. $1+0.9\times80+0.1\times160=89$ ns，仍仅适用于给定模型。

## 小结与参考

先区分地址、转换、驻留与缓存，再解释内存指标。虚拟内存既提供保护，也通过按需建立和共享提高利用率，但不会取消物理容量与数据移动成本。

- [OSTEP：Virtual Memory](https://pages.cs.wisc.edu/~remzi/OSTEP/)：分页、TLB、多级页表与交换应连续学习。
- [Linux memory management](https://docs.kernel.org/admin-guide/mm/index.html)：核对目标内核的实际行为与可观察接口。
- [mmap(2)](https://man7.org/linux/man-pages/man2/mmap.2.html)、[proc_pid_smaps(5)](https://man7.org/linux/man-pages/man5/proc_pid_smaps.5.html)：联系映射语义与统计口径。
