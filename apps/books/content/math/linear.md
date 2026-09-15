# 向量、投影与最小二乘

> 先修：代数、坐标几何。目标：从距离最小化推导投影和最小二乘，理解解何时唯一、为何不能总是显式求逆。本章向量默认实列向量，矩阵转置写作 $A^T$。

## 1.1 向量既是箭头，也是一组可组合的量

温度传感器在 n 个时刻的读数可以组成向量 $x\in\mathbb R^n$。向量加法与数乘意味着逐元素组合，线性模型意味着输入组合会按相同权重组合输出。

标准欧氏内积与范数为：

$$
\langle x,y\rangle=x^Ty=\sum_{i=1}^n x_i y_i,\qquad
\|x\|_2=\sqrt{x^Tx}.
$$

内积能描述方向关系：非零向量满足 $x^Ty=\|x\|\|y\|\cos\theta$。但当不同分量有不同单位时，直接求欧氏距离可能没有明确物理意义。例如米与摄氏度不能未经缩放就当作同一尺度；应先定义权重或无量纲化。

## 1.2 从最短距离推导投影

把 b 近似成非零向量 a 的倍数，即寻找 $\hat b=\alpha a$。定义平方误差：

$$
J(\alpha)=\|b-\alpha a\|_2^2
=b^Tb-2\alpha a^Tb+\alpha^2a^Ta.
$$

对 $\alpha$ 求导并令其为零：

$$
J'(\alpha)=-2a^Tb+2\alpha a^Ta=0
\quad\Rightarrow\quad
\alpha=\frac{a^Tb}{a^Ta}.
$$

由于 $a^Ta>0$，二阶导数为正，这个驻点是唯一最小值。残差 $r=b-\hat b$ 满足 $a^Tr=0$，即最短误差方向与允许的拟合方向垂直。

![图 1-1：向量 b 投影到 a 所张成的直线上得到 b-hat，残差 r 与该直线正交。](asset:math-linear)

**例题。** 取 $a=(1,1)^T$、$b=(2,0)^T$，得到 $\alpha=1$，投影为 $(1,1)^T$，残差为 $(1,-1)^T$，内积为零。投影不是“每个坐标分别四舍五入”，而是遵守允许子空间的全局近似。

## 1.3 从一条直线推广到矩阵列空间

设 $A\in\mathbb R^{m\times n}$，各列是允许组合的基方向，参数 $x\in\mathbb R^n$，观测 $b\in\mathbb R^m$。若方程 $Ax=b$ 无精确解，最小二乘求：

$$
\min_x\frac12\|Ax-b\|_2^2.
$$

展开并对 x 求梯度：

$$
\nabla J(x)=A^T(Ax-b).
$$

于是最优点满足正规方程：

$$
A^TA\hat x=A^Tb.
$$

几何解释仍是正交：残差与 A 的每一列正交。若 A 满列秩，$A^TA$ 正定，解唯一；若列线性相关，可能有多个参数给出同一最优拟合，需要额外规则选择，例如最小范数解。

## 1.4 完整例题：拟合直线

给定教学数据 $(t,y)=(0,1),(1,2),(2,2)$，模型 $y\approx\beta_0+\beta_1t$。设计矩阵为：

$$
A=\begin{bmatrix}1&0\\1&1\\1&2\end{bmatrix},\qquad
b=\begin{bmatrix}1\\2\\2\end{bmatrix}.
$$

计算：

$$
A^TA=\begin{bmatrix}3&3\\3&5\end{bmatrix},\qquad
A^Tb=\begin{bmatrix}5\\6\end{bmatrix}.
$$

两方程相减可得 $2\beta_1=1$，所以 $\beta_1=1/2$、$\beta_0=7/6$。预测为 $(7/6,5/3,13/6)^T$，残差 $b-A\hat\beta=(-1/6,1/3,-1/6)^T$。

检查残差和为 0，与时间向量的内积也为 0，符合正交条件；残差平方和为 $1/6$。这是一组可手算的确定性例题，不是对真实传感器性能的评估。

## 1.5 为什么推导求逆，计算却不推荐求逆？

形式上满列秩时可以写 $(A^TA)^{-1}A^Tb$，但实际计算显式逆矩阵通常增加工作和误差。更重要的是，二范数条件数满足：

$$
\kappa_2(A^TA)=\kappa_2(A)^2
$$

（对满列秩 A）。病态程度可能被平方放大。QR 分解把 A 写为正交部分与上三角部分，SVD 用奇异值揭示秩与不稳定方向，通常更适合作为数值求解工具。

小残差不等于参数准确。若 A 的两列几乎平行，很多不同参数都能产生相近输出，微小观测变化可能导致很大的参数变化。问题出在可辨识性，而不只是求解器精度。

## 1.6 加权与正则化的含义

不同测量可信度不同时，可使用正定权重矩阵 W：

$$
\min_x (Ax-b)^TW(Ax-b).
$$

如果误差独立且方差为 $\sigma_i^2$，常取 $W_{ii}=1/\sigma_i^2$。这不是“喜欢哪个点就增加权重”，而是把噪声模型纳入目标。

岭式正则化加入 $\lambda\|x\|_2^2$，使参数不沿弱约束方向任意增大，但会引入偏差并依赖变量尺度。它是新的建模选择，不是无代价修复坏数据。

<!-- AI-INFRA-BEGIN -->
## AI Infra 进阶：由矩阵工作量推导资源预算

> 来源：李博杰《深入理解 AI Infra：量化分析与系统设计》，Copyright 2026 Bojie Li，Apache-2.0。固定版本 58636943ba89f24b854f04f0f8f2fffe7b323829。本节由 X-SIA 选编并重新归类：补充承接说明，调整标题层级、图片路径和脚注前缀，保留选定推导及上游图号；图号和节号不是本卷的新编号。下文的配置、题设和作者报告不代表 X-SIA 已完成对应实测。

承接本章的矩阵模型，下面把运算次数与数据字节数分别换成执行时间。原著采用的 70B 模型是 DeepSeek-R1-Distill-Llama-70B，约 705.54 亿参数；BF16 权重约 141.11 GB，含分组量化附加数据的 8 位方案给定为 73.73 GB。这些容量沿用原著 1.2.3 的配置结果，不等于直接把参数个数乘一字节。下文再用约 70 GB 的主要权重读取量做简化推导，容量、每步流量和实际可并发请求数必须分开。

[manuscripts/01-初识 AI Infra.md](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/manuscripts/01-%E5%88%9D%E8%AF%86%20AI%20Infra.md)

### 原著 1.2.2 分析 AI 系统需要哪些关键数字

设某任务同时需要保存 $M$ 字节，执行 $F$ 次浮点运算，并通过某个存储接口读写 $R$ 字节。加速器提供容量 $M_{\mathrm{cap}}$、计算吞吐 $\Pi$ 和接口带宽 $\beta$。这三类需求必须分别与加速器提供的资源比较：

$$
M\le M_{\mathrm{cap}},\qquad
T_{\mathrm{compute}}=\frac{F}{\Pi},\qquad
T_{\mathrm{memory}}=\frac{R}{\beta}.
$$

容量决定能否同时保存所需数据；后两项把工作量换算为时间。一份数据可以保存一次、读取多次，所以 $M$ 与 $R$ 要分别计算。若 $\Pi$ 和 $\beta$ 取峰值，得到的就是完成指定计算与读写所需的时间下界。

峰值由芯片的计算单元数量、工作频率和存储接口决定，所以这个下界就是硬件的物理极限，软件无论怎样组织都不可能更快。下界与实际耗时 $T$ 之比，反映硬件能力被用掉了多少。计算方面的比值 $F/(\Pi T)$ 称为 **MFU**（model FLOPs utilization，模型 FLOPs 利用率），带宽方面的比值 $R/(\beta T)$ 称为 **MBU**（memory bandwidth utilization，带宽利用率），两者都不超过 1。全书反复使用这两个比值，回答的是同一个问题：设计离硬件的物理极限还有多远。

除了容量、计算吞吐和带宽，还需要认识操作延迟。下面分别说明这四类数字如何进入估算。

**容量**回答能同时放下多少数据。例如，一张加速卡有多少显存，决定了能否容纳模型权重、上下文状态和运行时的临时工作区。容量以 byte（字节）计量。

**计算吞吐**回答单位时间内能完成多少运算。常见的 FLOP 表示一次浮点运算，FLOPs 表示运算总次数，FLOP/s 表示每秒的浮点运算数。GFLOPs、TFLOPs 分别表示十亿、万亿次浮点运算，GFLOP/s、TFLOP/s 则表示相应的每秒速率。矩阵计算中一次乘法加一次加法通常计为两次运算。矩阵峰值对应特定的输入精度、累加精度和稀疏条件。稠密计算按完整矩阵执行；稀疏计算利用零元素或规定的稀疏结构跳过部分运算。

**带宽**回答单位时间内能传送多少数据。显存带宽描述显存与芯片之间的数据搬移能力，卡间链路和网络带宽描述其他路径的能力。估算哪一段传输，就使用该段接口的带宽。

**延迟**回答发起一次操作以后需要等多久。高带宽接口也可能有不可忽略的启动或往返时间。传输大数据块时，耗时主要取决于数据量与带宽的比值；请求较小且必须逐次等待时，启动和往返时间就可能占据主要部分。

以一款真实加速器为例。H100 是 NVIDIA 的一代 GPU，SXM 指本例采用的模块形态。BF16 是每个数占 16 位（2 字节）的浮点格式，FP32 是每个数占 32 位（4 字节）的浮点格式；矩阵乘法可以读取 BF16 输入，用 FP32 保存累加结果。H100 SXM 的显存容量为 80 GB，HBM 带宽为 3.35 TB/s，BF16 输入、FP32 累加的稠密矩阵峰值约为 989.4 TFLOP/s。[^ai-math-linear-01-h100]

将 H100 与 NVIDIA 的 A100 80GB SXM、GeForce RTX 4090 放在一起，就得到一张 GPU 资源速查表。三者分别采用 Hopper、Ampere 和 Ada 架构。表中的容量使用厂商名义 GB，带宽使用十进制 TB/s；矩阵算力统一采用 BF16 输入、FP32 累加、稠密计算的峰值。最后一行由 1 GB 除以显存带宽得到。[^ai-math-linear-01-gpu-numbers]

| 资源或操作 | RTX 4090 | A100 80GB SXM | H100 SXM |
| --- | ---: | ---: | ---: |
| 显存容量（GB） | 24 | 80 | 80 |
| 显存带宽（TB/s） | 1.008 | 2.039 | 3.35 |
| BF16 矩阵峰值（TFLOP/s） | 165.2 | 312 | 989.4 |
| 按带宽峰值读取 1 GB（ms） | 0.99 | 0.49 | 0.30 |

这张表提供了把工作量换算成时间所需的硬件性能数据。例如，读写量保持不变而带宽增加一倍，$R/\beta$ 减半；计算量保持不变而算力增加一倍，$F/\Pi$ 减半。

### 原著 1.3.1 生成一个 token，先检查什么

**例题 1-1：70B 模型的单步生成如何接近 10 ms 目标？** 给定一张 H100 SXM，能否让上一节的 DeepSeek-R1-Distill-Llama-70B 在 10 ms 内生成一个新 token？先考虑每参数一字节存储，再比较算力翻倍、带宽翻倍和批内权重复用。

**解：先检查显存容量，再计算运算量和读取量。**

为便于手算，将该模型的参数量近似取为 $N=70\times10^9$，先按每个参数一字节估算主要权重的数据量，读入后转换为 BF16 参加矩阵运算。单个请求每步处理一个新 token，每步从显存读取一遍这些权重。

**估算条件：权重读取与矩阵计算充分重叠。** 容量采用上一节计入量化附加数据的 73.73 GB 结果；本节先将主要权重的读取量近似为 70 GB。时间模型只计主要权重矩阵的乘加和一次完整权重读取，采用资源表中的 BF16 矩阵峰值与 HBM 带宽；读取和计算按充分重叠估算。

单请求的容量预算上一节已经检查。生成速度方面，权重加载到显存之后，每一步仍需将参与计算的权重送到计算单元；按上述近似，每步读取约 70 GB。

![本例按每参数一字节，将主要权重读取量近似取为 70 GB。权重驻留显存，计算单元每步沿同一接口读取一遍；用读取量除以接口带宽，得到 20.90 ms 的读取下界。](asset:aib-ch01-figure-1-read-path)

*图 1-8　本例按每参数一字节，将主要权重读取量近似取为 70 GB。权重驻留显存，计算单元每步沿同一接口读取一遍；用读取量除以接口带宽，得到 20.90 ms 的读取下界。*

这 20.90 ms 的读取开销会在每个生成步骤重复出现。对单个请求，下一步的输入由当前输出确定，后续步骤要沿这条依赖逐次推进。

计算量也可以先做近似。一次矩阵与向量的乘法中，每个权重通常参与一次乘法，所得乘积再累加到结果中；按乘法与加法分别计数，大约对应两次浮点运算。因此，本例的主要矩阵运算量近似为：

$$
\begin{aligned}\text{每步矩阵运算量}&\approx2\times\text{参数数}\\&\approx2\times70\times10^9\ \mathrm{FLOPs}\\&=140\ \mathrm{GFLOPs}.\end{aligned}
$$

$2N$ 的来源是：在投影（用权重矩阵对特征向量做的线性变换）中，每个权重与一个 token 特征向量中的对应分量相乘，再将乘积累加到输出中。参数矩阵中的权重越多，这部分工作量就越大；一批中参与计算的 token 数增加时，同一权重矩阵处理更多 token 的特征向量，运算量随之增加。第 2 章将展开真实模型，在这部分线性工作之外加入随上下文长度变化的注意力交互。

把 batch size 记为 $B$，并让这 $B$ 个请求共同使用一次读入的权重，就得到这一教学模型的三个量：

$$
M_W=b_WN,\qquad R_W=b_WN,\qquad F\approx2BN.
$$

前两个式子在这一步恰好相等，是因为权重保存一份、读取一遍。执行下一步生成时，驻留量仍是 $M_W$，却会再增加一次 $R_W$ 的读取。$B$ 增大则增加本次运算量：同一份权重要与更多请求的当前输入 token 向量做乘加运算。第 2 章将进一步加入各请求独立的上下文状态。

### 原著 1.3.2 计算与读取分别需要多久

把 $F=140\ \mathrm{GFLOPs}$ 与 $R_W=70\ \mathrm{GB}$ 分别除以相应的资源能力，得到单请求的两项时间下界。

$$
\begin{aligned}\text{纯权重读取时间}&\geq\frac{70\ \mathrm{GB}}{3350\ \mathrm{GB/s}}\approx20.90\ \mathrm{ms},\\\text{矩阵计算时间}&\geq\frac{140\ \mathrm{GFLOPs}}{989400\ \mathrm{GFLOP/s}}\approx0.1415\ \mathrm{ms}.\end{aligned}
$$

权重读取的时间下界约为矩阵计算的 148 倍。按标称算力，矩阵运算耗时极短；显存把权重送到计算单元却需要长得多的时间。完成当前步骤之前，这些数据必须全部读入。[^ai-math-linear-01-budget]

原因在于，本例每读取一个权重只做一次乘加。计算单元迅速处理完已读入的数据后，又要等待后续数据。提高算力只能缩短乘加耗时，无法加快显存读取。

这两项时间应当相加，还是取其中较大者，取决于读取与计算能否重叠。若数据分块到达，计算当前块时可以继续读取下一块；在充分重叠的简化模型中，耗时下界为：

$$
T_{\mathrm{step}}\ge T_{\mathrm{lower}}=\max\!\left(\frac{F}{\Pi},\frac{R_W}{\beta}\right).
$$

进入稳定阶段后，每块数据都要经过读取和计算，较慢的一项决定处理速度。本例中，读取权重远慢于矩阵计算，因此优化应首先针对这 20.90 ms 的读取时间。

**讨论：算力、带宽与批内复用分别能缩短多少生成时间？** 仅权重读取就至少需要 20.90 ms，已经超过 10 ms 的目标。虽然显存能容纳这些数据，读取速度仍然达不到要求。先分别比较增加算力与增加带宽的效果。

把计算能力翻倍，矩阵计算时间从约 0.1415 ms 变为 0.0707 ms，纯权重读取仍需要约 20.90 ms，决定执行时间的读取下界保持不变。把 HBM 带宽翻倍，读取时间才会降为约 10.45 ms，当前下界随之下降。两种改动都提升了一项硬件能力，但对任务耗时的影响不同。

另一种办法是减少需要读取的数据。运算量不变时，把权重减半，读取下界也降到约 10.45 ms。带宽翻倍让读取速度加倍，权重减半则让待读取的数据减少一半，两种办法在这条算式中取得相同结果。第 2 章和第 5 章将讨论低位宽表示的格式和转换过程。

![保持运算量与读取量不变，分别把算力或带宽翻倍。蓝条是权重读取下界，橙条是矩阵计算下界；较长的读取项决定这组条件下的优化方向。](asset:aib-ch01-figure-1-5-budget)

*图 1-9　保持运算量与读取量不变，分别把算力或带宽翻倍。蓝条是权重读取下界，橙条是矩阵计算下界；较长的读取项决定这组条件下的优化方向。各柱分别表示计算或数据读取的时间下界，完整执行仍须满足依赖关系。*

接着改变请求组织。假设 8 个请求同时处理并共享一次权重读取，整批的权重读取仍是 70 GB，矩阵运算量则约为单请求的 8 倍。这时矩阵计算的时间下界约为 1.13 ms，读取下界仍为 20.90 ms。若这一批产生 8 个输出，每个输出分摊的权重读取时间约为 2.61 ms。

整批执行产生八个输出，吞吐因而从单请求模型的约 47.9 token/s 提高到约 383 token/s，而每个请求仍须等待整批执行完成。**批内复用增加同一时间内生成的输出数，单请求延迟则取决于它经历的执行与等待。**

![一批八个请求共享一次权重读取，各产生一个输出。整批读取仍需约 20.90 ms，除以八得到每输出分摊的服务时间；每个请求经历整批执行。](asset:aib-ch01-figure-1-batch-reuse)

*图 1-10　一批八个请求共享一次权重读取，各产生一个输出。整批读取仍需约 20.90 ms，除以八得到每输出分摊的服务时间；每个请求经历整批执行。“每输出 token 分摊”是整批耗时除以输出 token 数，用于换算吞吐，不是单个请求的响应延迟。*

batch 增大到一定程度后，计算时间将追平权重读取时间。令 $2BN/\Pi=b_WN/\beta$，得到转折点

$$
B_* = \frac{b_W\Pi}{2\beta}.
$$

本例取 $b_W=1$、$\Pi=989.4\times10^{12}\ \mathrm{FLOP/s}$、$\beta=3.35\times10^{12}\ \mathrm{bytes/s}$，得到 $B_*\approx147.7$。在这一只计主要矩阵运算与权重读取的模型中，batch 较小时，增加请求可以分摊权重读取开销；超过约 148 后，计算耗时超过权重读取耗时，继续增加 batch 会近似按比例增加整批时间。该转折点只比较矩阵运算与权重读取，没有计入各请求的上下文状态：按 1.2.3 节的容量预算，一张 H100 SXM 容纳 73.73 GB 权重后只剩约 6.27 GB，无法容纳 148 条请求的 KV。

![批内请求增加时，矩阵运算量随请求数成正比增长，权重读取保持每批 70 GB。约 148 个请求处两项下界相等，随后计算耗时决定整体速度。](asset:aib-ch01-figure-1-batch-transition)

*图 1-11　批内请求增加时，矩阵运算量按 $2BN$ 增长，权重读取保持每批 70 GB。约 148 个请求处两项下界相等，随后计算耗时决定整体速度。*

把每批输出数 $B$ 除以上图中的时间下界，便得到这组题设对应的吞吐上界。转折前，共享的读取由更多输出分摊；转折后，计算时间与输出数一起增长，曲线逐渐趋于平坦。

![上述批处理模型的理想输出吞吐率。每批输出数除以时间下界得到曲线；竖虚线与前图对应同一个约 148 请求的转折点。](asset:aib-ch01-figure-1-batch-throughput)

*图 1-12　上述批处理模型的理想输出吞吐率。每批输出数除以时间下界得到曲线；竖虚线与前图对应同一个约 148 请求的转折点。*

同一转折也可以用算术强度 $I=F/R_W=2B/b_W$ 描述，即每读取一字节数据所完成的运算次数。当 $I$ 小于加速器的算力与带宽之比 $\Pi/\beta$ 时，读取所需时间更长；超过该比值后，计算所需时间更长。这就是第 4 章 Roofline（屋顶线）模型的出发点。[^ai-math-linear-01-roofline]

> **练习 1-3〔核心〕：带宽与 batch size 如何影响单步生成时限**
>
> 采用例题 1-1 的模型与加速器，将有效带宽设为标称值的 70%，有效计算吞吐率设为峰值的 50%。分别取 $B=1,16,64$，计算整批执行时间的下界、平均每个输出 token 分摊的执行时间，以及理想吞吐率。目标是每请求每步不超过 10 ms：哪些 batch size 仅根据时间下界就可以判定无法满足目标？再把权重读取量减半、运算量保持不变，重新判断。求计算时间与读取时间相等时的 batch size $B_*$，并解释为什么每个输出分摊的执行时间减少，并不意味着每个请求的单步延迟缩短。

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

[^ai-math-linear-01-h100]: NVIDIA，[H100 架构白皮书](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/files/specs/nvidia-h100.pdf)与[规格页面快照](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/files/specs/nvidia-h100-spec.md)。本章采用 SXM 形态与 BF16 稠密矩阵运算规格；原始输入版本和校验值见[配图来源清单](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/manuscripts/ch01/sources.json)。

[^ai-math-linear-01-gpu-numbers]: 数字取自[固定 GPU 规格与逐项出处](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/configs/hardware.json)，对应 `rtx4090`、`a100-80gb-sxm`、`h100-sxm`；各精度、累加方式与稠密条件分别核对。GB 与 TB 在本表均为十进制单位。

[^ai-math-linear-01-budget]: [70B 近似预算复算](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/results/decode-budget-base.md)及配套场景；[单位与逐卡容量复算](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/results/basics-70b-bf16-balanced.md)。1.3 的时间估算图读取这组固定的 70B 近似结果；1.2.3 的容量图使用真实权重索引与分组量化结果。

[^ai-math-linear-01-roofline]: Williams、Waterman、Patterson，[Roofline 论文](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/files/papers/roofline.pdf)。
<!-- AI-INFRA-END -->

## 练习与解题提示

1. 将 $b=(3,1)^T$ 投影到 $a=(1,0)^T$，求残差。
2. A 有两列完全相同，为什么一般不能唯一确定两个系数？
3. 若 $\kappa_2(A)=100$，正规方程矩阵条件数是多少？为什么小残差仍不保证小参数误差？

**提示与答案：** 1. 投影 $(3,0)^T$，残差 $(0,1)^T$。2. 只能约束系数之和。3. 10000；弱约束方向可能放大误差。

## 小结与参考

最小二乘的核心不是一个求逆公式，而是把观测投影到模型允许的空间。模型、秩、单位与误差条件共同决定解能否被解释。

- MIT OCW：[18.06 Linear Algebra](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/)，Projections、Least Squares、QR 与 SVD。
- NumPy：[numpy.linalg.lstsq](https://numpy.org/doc/stable/reference/generated/numpy.linalg.lstsq.html)。
- Lloyd N. Trefethen, David Bau III, *Numerical Linear Algebra*，QR 与条件数章节。
