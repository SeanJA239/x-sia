# 软件流水线：有界队列、背压与失败传播

> 先修：Shell 管道、线程同步、I/O 完成语义。目标：设计“读取—解析—计算—写出”的阶段模型，计算瓶颈与缓冲需求，明确顺序、关闭、失败与重试。本章的软件流水线不同于 CPU 指令流水线，但同样需要分析阶段依赖。

## 先画数据契约，再安排线程

假设处理一组记录。每阶段应说明输入类型、输出类型、可否重排、失败时是否产生副作用，以及谁拥有缓冲区。若只画四个框，却不说明“坏记录如何处理”“输出是否必须保序”，还没有完成设计。

阶段不一定一对一对应线程。一个事件循环可以管理多个 I/O 阶段，一个计算阶段可以有多个工作线程；进程间还可能需要序列化和数据复制。拆得更细也意味着更多排队和协调成本。

![有界队列连接读取、计算与写出阶段；队列满向上游施加背压，关闭与错误沿独立控制路径传播，不能只靠数据暂时为空判断结束。](asset:linux-dataflow)

## 吞吐由有效服务能力限制

若第 $i$ 阶段单个工作者的平均服务时间为 $s_i$，有 $w_i$ 个理想可并行工作者，则其候选容量为 $w_i/s_i$。在输入单位一致、忽略共享资源竞争等前提下：

$$
\lambda_{\max}\leq\min_i\frac{w_i}{s_i}.
$$

### 例题：应给哪一阶段加工作者？

读取、计算、写出的单条时间分别为 2、10、4 毫秒，各一个工作者，容量为 500、100、250 条每秒。给读取增加一倍工作者仍受计算限制；把计算增加到两个工作者，候选上限增为 200；增加到三个后，上限被写出的 250 限制。

这些结果假定计算阶段真能并行，且没有共享锁、内存带宽或磁盘竞争。Python 线程运行 CPU 密集代码是否能并行还取决于实现与工作类型，不能把算式当成部署后的保证。

## 有界缓冲与背压

若上游以 300 条每秒输入、下游仅处理 200 条每秒，积压速率为 100 条每秒。容量为 500 条的抽象队列从空到满约需 5 秒。无界队列只是把过载延迟成内存故障，没有消除瓶颈。

队列满时，可以阻塞上游、拒绝新输入、丢弃特定记录或落盘缓冲。每种策略改变业务语义：丢弃监控采样与丢弃交易记录不能用同一默认配置。

### 队列有界不等于整个系统内存有界

设队列容量为 $Q$，每条最多 $d$ 字节，工作者数为 $w$，则只计算队列与每个工作者持有的一条记录，容量约为 $(Q+w)d$。输入预读、输出重排、重试缓存和结果列表都可能在这个公式之外继续增长。

应规定单条记录最大大小，或者使用按字节预算的缓冲；“最多一千条”若每条可能达到一百 MiB，就不是可靠的内存上限。

## 完整示例：两个消费者与明确关闭

这个 Python 标准库例子只处理六个整数，结果量固定，演示队列背压、哨兵和结果收集，不测试性能。

```python
# example: dataflow-bounded
from queue import Queue
from threading import Thread, Lock

queue = Queue(maxsize=2)
results = []
lock = Lock()

def worker():
    while True:
        item = queue.get()
        try:
            if item is None:
                return
            value = item * item
            with lock:
                results.append((item, value))
        finally:
            queue.task_done()

threads = [Thread(target=worker) for _ in range(2)]
for thread in threads:
    thread.start()
for item in range(6):
    queue.put(item)
for _ in threads:
    queue.put(None)
queue.join()
for thread in threads:
    thread.join()
assert sorted(results) == [(i, i * i) for i in range(6)]
print(sorted(results))
```

每个消费者都需要结束信号，所以放入两个 None。None 在这个协议里不属于合法数据；若真实数据允许空值，应使用不会混淆的控制消息类型。`task_done()` 对每个取出元素调用一次，包括哨兵；队列 join 等待未完成计数归零，线程 join 则确认执行流结束。

本例让计算只做不会主动抛业务异常的给定整数运算。扩展到任意解析任务时，工作者异常可能使后续数据无人消费，main 卡在 put 或 join；必须增加错误通道、停止协议和有界等待，不能把这个教学程序直接当生产框架。

## 保序会引入另一条队列

多个工作者完成顺序可能与输入顺序不同。若业务只需要集合结果，可以带 ID 后无序消费；若必须保持原顺序，需要为每条分配序号，在输出端等待缺失的前项。

假设第 0 条很慢，第 1 到第 999 条都完成了，重排缓冲就可能保存 999 个结果。这是头部阻塞和内存压力的来源。解决方法包括限制在途窗口、设置明确超时和失败占位协议，或在业务允许时放弃全局保序。

把输出最终 sort 一下在六条演示中合理，但对无限流意味着一直收集全部结果，不能保持流式与有界内存。

## 关闭、取消与失败传播

正常关闭通常意味着上游不再产生数据，下游排空已经接收的工作，再结束并确认产物。取消则可能要求尽快停止，丢弃尚未开始的工作；二者应使用不同状态，而不是一律发送一个“空对象”。

写出阶段失败后，若上游仍不断生产，系统会堵住或继续消耗资源。需要让故障沿控制路径反馈，使其他阶段停止接受工作，并说明已经完成的副作用怎样处理。

### 重试不是重复运行那么简单

读取和纯计算可能容易重试，追加到数据库或发送外部消息则可能重复产生副作用。至少要识别请求身份，区分“没有成功响应”和“确定没有提交”。所谓 exactly-once 需要限定作用域与存储/协议条件，不能靠一个内存队列名字保证。

## 如何验收一条流水线？

分别测每阶段服务时间、输入输出数量、队列深度和错误数，再检查整个输入集合与输出集合的对应关系。只看工作者 CPU 活跃或队列暂时为空，不能证明全部工作完成。

增加坏记录、慢记录、重复输入、写出失败和中途取消的测试用例。每种用例应提前规定允许的结果，尤其明确“哪些记录已经被接收”和“哪些结果已经持久化”。这里不自动访问外部数据或真实服务。

<!-- AI-INFRA-BEGIN -->
## AI Infra 进阶：搬移流水与模型流水线并行

> 来源：李博杰《深入理解 AI Infra：量化分析与系统设计》，Copyright 2026 Bojie Li，Apache-2.0。固定版本 58636943ba89f24b854f04f0f8f2fffe7b323829。本节由 X-SIA 选编并重新归类：补充承接说明，调整标题层级、图片路径和脚注前缀，保留选定推导及上游图号；图号和节号不是本卷的新编号。下文的配置、题设和作者报告不代表 X-SIA 已完成对应实测。

前面讲软件队列的容量和关闭协议，下面分别把同一思路用于单设备搬移缓冲与跨设备模型阶段。第一种模型关心输入槽从发出请求到最后使用的生命周期，第二种模型关心相互独立的 micro-batch。原著给定的 tick 是其加速器算例单位，不是本机实测；同一自回归会话尚未生成的未来 token 也不能当成独立微批。

[manuscripts/04-加速器架构.md](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/manuscripts/04-%E5%8A%A0%E9%80%9F%E5%99%A8%E6%9E%B6%E6%9E%84.md)；[manuscripts/06-超节点.md](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/manuscripts/06-%E8%B6%85%E8%8A%82%E7%82%B9.md)

### 原著 4.4.2 异步搬移与双缓冲

找到并取出一块数据之后，还要让下一块及时到达：若总等当前块算完才开始读取，计算单元就会反复停顿。准备两个缓冲后，可以一边使用第一个缓冲中的数据，一边把下一块加载到第二个缓冲；当前块用完，两块缓冲交换角色。这就是双缓冲：以额外空间换取加载与计算在时间上的重叠。

设共有 $n$ 块数据，每块加载耗时 $t_l$、计算耗时 $t_c$。若取得一块、算完一块，再开始下一块，总时间为 $n(t_l+t_c)$。加载与计算使用独立资源时，采用双缓冲，第一块先加载、再计算，后续各块以较慢阶段的节奏完成：

$$
T_{\mathrm{pipe}}=t_l+t_c+(n-1)\max(t_l,t_c).
$$

八块数据每块加载 2 μs、计算 1 μs，串行需 24 μs，流水需 $2+1+7\times2=17$ μs。节省的 7 μs 来自重叠，传输字节和乘加次数都保持不变。再把计算加快一倍，总时间仅降到 16.5 μs，因为加载仍然每两微秒才能提供一块。

上述分析把加载看作一个完整阶段。下面将加载拆成传输与等待返回，计算多个请求同时进行时需要多少缓冲。这里用 tick 表示 B200 一个 SM 的时钟周期，并区分**发起间隔**与**完成延迟**：若每隔 64 tick 发出一次读取请求，而每块数据要在请求发出 192 tick 后才可使用，就会有多块同时等待返回。计算开始前，输入必须已经到达。把保存一个输入块的缓冲区称为一个输入槽：从发出读取请求，到该块计算结束，该槽一直被占用。增加槽位可以更早发起后续数据的读取，但也占用更多局部存储。

用注意力的 QK 计算具体推导。两个输入都是 $128\times128$，沿头维度切成四个 $k=32$ 的累加块。每块 Q/K 输入合计 16 KiB，计算量为 1,048,576 FLOPs，四次计算依次更新同一份 FP32 结果，结果保存在独立的 64 KiB 累加存储中。矩阵速率取 FlashAttention-4 论文给出的 B200 每个 SM 每周期 8,192 FLOPs；输入传输速率取 256 bytes/tick，传输结束后再等 128 tick 数据才可用。[^ai-linux-dataflow-04-pipeline][^ai-linux-dataflow-04-fa4]

于是每块输入传输耗时 64 tick，发起后 192 tick 就绪，计算再用 128 tick。

![一个输入槽从发起到释放的完整生命周期。传输 64 tick，额外等待 128 tick，数据在 192 tick 就绪，再计算 128 tick，于 320 tick 释放。](asset:aib-ch04-figure-4-slot-lifetime)

*图 4-17　一个输入槽从发起到释放的完整生命周期。传输 64 tick，额外等待 128 tick，数据在 192 tick 就绪，再计算 128 tick，于 320 tick 释放。一个 tick 为 B200 SM 的一个时钟周期。*

只有一个输入槽时，该槽经历加载、等待、计算，共 $64+128+128=320$ tick 后才能复用，四块在 1280 tick 结束。

图 4-18 至图 4-20 依次画出一槽、两槽和三槽的执行，并保持时间尺度一致。先沿绿色计算区间寻找空闲，再向上查看下一块输入何时就绪，就能判断等待从何而来。

![一个输入槽的四块时序。蓝条为传输，橙线为就绪，绿条为计算，浅灰为槽占用；上一块用完后才能再次发起，完成时刻为 1280 tick。](asset:aib-ch04-figure-4-9-pipeline)

*图 4-18　一个输入槽的四块时序。蓝条为传输，橙线为就绪，绿条为计算，浅灰为槽占用；上一块用完后才能再次发起，完成时刻为 1280 tick。一个 tick 为 B200 SM 的一个时钟周期。*

![两个输入槽使用相同时间尺度。前两块可提前发起，但第三块到 512 tick 才就绪，第二块在 448 tick 已结束，留下 64 tick 空闲。](asset:aib-ch04-figure-4-pipeline-two)

*图 4-19　两个输入槽使用相同时间尺度。前两块可提前发起，但第三块到 512 tick 才就绪，第二块在 448 tick 已结束，留下 64 tick 空闲。横轴一个 tick 为 B200 SM 的一个时钟周期；各行对应一个数据块，灰色表示输入槽占用，蓝色表示传输，绿色表示计算，竖标记表示数据就绪。*

两个槽允许在时刻 0 和 64 发出前两块的读取请求。第一块在 192 开始计算、320 结束，释放的槽用于第三块，第三块在 512 就绪；第二块在 448 已算完，因此中间留下 64 tick 空闲。继续按同样次序，第四块在 768 结束。第二个槽让一部分数据加载与计算重叠，但矩阵单元仍会在两块计算之间空闲。

要连续计算四块，最早完成时间是首块等待加四次计算，即

$$
T_{\min}=192+4\times128=704\ \mathrm{tick}.
$$

![三个输入槽提前发起前三块，第一槽释放后接收第四块。矩阵单元从 192 连续计算到 704 tick，第四槽不再缩短完成时间。](asset:aib-ch04-figure-4-pipeline-three)

*图 4-20　三个输入槽提前发起前三块，第一槽释放后接收第四块。矩阵单元从 192 连续计算到 704 tick，第四槽不再缩短完成时间。横轴一个 tick 为 B200 SM 的一个时钟周期；各行对应一个数据块，灰色表示输入槽占用，蓝色表示传输，绿色表示计算，竖标记表示数据就绪。*

三个槽已足以实现这一时间。前三块的读取请求分别在时刻 0、64、128 发出，分别在 192、256、320 就绪；计算从 192 开始依次进行。第一块在 320 释放槽位，立即发出第四块的读取请求，第四块在 512 就绪，早于计划开始计算的时刻 576。矩阵单元因此从 192 到 704 tick 一直连续计算，中途没有空闲。[^ai-linux-dataflow-04-pipeline-extra]

| 输入槽数 | 输入缓冲 | 完成时间 | 相对前一项节省 |
| --- | ---: | ---: | ---: |
| 1 | 16 KiB | 1280 tick | — |
| 2 | 32 KiB | 768 tick | 512 tick |
| 3 | 48 KiB | 704 tick | 64 tick |
| 4 | 64 KiB | 704 tick | 0 |

这一例子给出了一种寻找缓冲配置的方法：先用首块到达时间与连续计算时间求出目标，再逐个检查每块能否按时到达，最后寻找满足目标的最少槽位。第四个槽虽然让最后一块更早就绪，却没有让计算更早开始；提前取得的数据只是多等待了一段时间。

缓冲配置还随计算速度变化。矩阵速率翻倍后，每块计算只需 64 tick，连续计算的目标变为 $192+4\times64=448$ tick。只有三个槽时，第四块最早在 256 tick 发出读取请求，到 448 tick 才可使用，来不及在原计划的 384 tick 开始计算，完成时间为 512 tick；四个槽则能提前发出全部请求，达到 448 tick。矩阵计算加快以后，原来的加载安排已经来不及准备下一块数据，输入缓冲也需要重新配置。

有了异步搬移，计算线程发起加载后可以继续做其他工作，到要用数据时再等待完成事件。搬移单元向空槽写入数据，完成事件标记数据就绪；计算结束后再释放槽位。NVIDIA 的异步拷贝、昇腾 MTE／NDDMA 与 Metal 的任务依赖机制都用于安排这类交接。[^ai-linux-dataflow-04-transfer]

> **思考：输入可用前的额外等待翻倍，三个缓冲槽是否够用？** 保持原来的传输和计算速率，将数据传输结束到输入可用的额外等待时间从 128 增至 256 tick。三个槽能否继续实现无间隙计算？分别写出第四块的就绪时刻与所需时刻。

### 原著 6.2.5 流水线并行：按层划分阶段

上述几种方式都在一层内部分工。**流水线并行**（pipeline parallelism，PP）改为按层分工：把模型的层按顺序分成若干阶段，每个阶段由一张或一组卡负责。图 6-13 把 Qwen3-32B 的 64 层分成两个阶段。

![流水线并行：按层划分阶段](asset:aib-ch06-figure-6-pp)

*图 6-13：两个阶段各保存自己那些层的权重。相邻阶段之间只交接激活；训练时梯度沿同一边界反向传递。*

前一个阶段算完自己负责的层，把激活传给下一个阶段接着算。每个阶段只保存自己那些层的权重，阶段之间只传递中间结果。

送入流水线的输入按 micro-batch 组织：一个 batch 拆成多个 micro-batch，不同阶段就能同时处理不同的 micro-batch。设模型分成 $q$ 个阶段，每个阶段的执行时间（含传递激活）为 $t$，输入是 $b$ 个已经就绪、互不依赖的 micro-batch。考虑四个阶段、每阶段 1 ms 的情形。micro-batch 0 在 0 ms 进入阶段 0，经过四个阶段，在 4 ms 完成；阶段 0 在 1 ms 就能接收 micro-batch 1，后者在 5 ms 完成。其余 micro-batch 依次跟进，每隔 1 ms 完成一个。

![四阶段流水的填充与排空](asset:aib-ch06-figure-6-4-pipeline)

*图 6-14：四个等时阶段处理四个独立 micro-batch。每格为 1 ms，同色表示同一 micro-batch。第一项结果在 4 ms 产生，最后一项在 7 ms 产生；左上到右下的空白来自流水填充与排空。*

第一个 micro-batch 花费 $qt$，其后每增加一个 micro-batch 只增加 $t$，所以

$$
T_{\mathrm{PP}}=(q+b-1)t,\qquad
\eta_{\mathrm{PP}}=\frac{qb\,t}{q(q+b-1)t}=\frac{b}{q+b-1}. \tag{6-7}
$$

分子是所有阶段实际工作的时间总和，分母是阶段数乘以处理全部 micro-batch 所需的时间。四阶段、四个 micro-batch 的利用率为 $4/7$，约 57%；增加到 16 个 micro-batch 时为 $16/19$，约 84%。独立 micro-batch 越多，流水填充与排空造成的空闲时间占比就越小。

各阶段执行时间不均也会让卡空闲。若四个阶段分别需要 1、1、2、1 ms，第一个 micro-batch 在 5 ms 完成，此后最快每 2 ms 完成一个。送到耗时 2 ms 阶段的输入到达速度超过其处理速度，队列逐渐积压；缓冲用满后，上游阶段只能暂停。按各层的实际执行时间划分阶段，可以让各阶段的耗时更接近，减少积压。[^ai-linux-dataflow-06-pipeline]

自回归会话的下一步输入，要等当前 token 生成后才就绪。四个独立会话可以提供四个 micro-batch，同一会话未来的四个 token 则是一条先后依赖链。流水利用率因此直接取决于同时有多少 micro-batch 可以开始执行。

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

[^ai-linux-dataflow-04-pipeline]: [Qwen 注意力输入流水基线](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/results/attention-input-base.md)、[矩阵速率翻倍](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/results/attention-input-matrix-double.md)、[建模与独立检查](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/research/attention-input-pipeline/README.md)。

[^ai-linux-dataflow-04-fa4]: *FlashAttention-4*，MLSys 2026，[论文](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/proceedings/MLSys/2026/papers/mlsys2026-ae8b0b5838ba510daff1198474e7b984.pdf)，§2.2、§3.1.1、公式 1—3 与表 1；[单 SM 独立复算](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/results/fa4-qwen8-resource-balance.md)。

[^ai-linux-dataflow-04-pipeline-extra]: 三槽流水、计算翻倍变体及设计转折点由[教学推导脚本](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/manuscripts/ch04/derive.py)生成，完整时序见[推导数据](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/manuscripts/ch04/teaching-data.json)。

[^ai-linux-dataflow-04-transfer]: [Hopper Tuning Guide](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/files/documents/nvidia-hopper-tuning.md)、[昇腾 950 白皮书](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/files/specs/ascend-950-official.pdf)、[Rubin 官方架构说明](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/outline-checks/2026-09-07/systems-cases/rubin-rechecked.md)。

[^ai-linux-dataflow-06-pipeline]: [有限槽位与背压计算](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/results/pipeline-finite-1-slots.md)、[基础 TP／PP 通信路径](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/results/dense-comm-qwen8-tp8-pp1-t1.md)。
<!-- AI-INFRA-END -->

## 练习与解题提示

1. 读取 500、计算 100、写出 250 条每秒，为什么加快读取可能只增加等待？
2. 两个消费者只收到一个哨兵，可能发生什么？
3. 上游 80、下游 50 条每秒，容量 300，从空到满约需多久？
4. 结果必须保序，为什么一个慢任务能拖住很多快任务？
5. queue.join 返回能否证明文件已经同步落盘？

**答案：** 1. 瓶颈仍是计算。2. 另一个消费者可能一直等待。3. 10 秒，忽略波动与在途状态。4. 输出等前项，后项进入重排缓冲。5. 不能，它只验证队列的任务计数协议，持久性是另外的约定。

## 小结与参考

软件流水线的设计单位是带语义的记录与状态转换。容量、顺序、关闭和副作用必须一起设计；只增加线程和队列，既不能保证吞吐，也不能保证正确性。

- [Python queue](https://docs.python.org/3/library/queue.html)：核对有界容量、任务跟踪与阻塞语义。
- [Google SRE Book：Handling Overload](https://sre.google/sre-book/handling-overload/)：理解背压、拒绝和过载控制的业务意义。
- [OSTEP](https://pages.cs.wisc.edu/~remzi/OSTEP/)：条件变量和信号量章节可用于推导生产者—消费者协议。
