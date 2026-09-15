# 编译原理：词法、语法、语义与中间表示

> 先修：Shell 参数边界、程序执行与基础 Python。目标：为一个小表达式语言写出词法和递归下降解析器，理解 AST、符号表、类型检查、控制流与优化合法性。编译器不只是把每行源代码翻译成一条汇编。

## 从源语言到目标语言的分层

一个常见编译链包含词法分析、语法分析、语义分析、中间表示、优化与代码生成。阶段可以在实现中交错，但各自回答的问题不同：字符形成什么 token？token 能否组成合法结构？名字和类型是否有意义？怎样保持语义地转换结构？最终如何满足目标机器约束？

![源字符经词法得到 token，再解析为 AST；语义分析与 IR 表达程序含义，优化和代码生成必须保持该含义而不是仅替换文字。](asset:linux-compiler)

预处理、编译、汇编、链接又是构建链中的不同边界。C 宏展开会在主体编译前影响输入，但宏不是 C 的完整语法和类型系统。下一章从目标文件继续追踪运行前的工作。

## 定义一个足够小的语言

本章语言只有非负整数、括号与四则二元运算，不支持变量、赋值、一元负号或函数。语法写成：

```text
expr := term { ("+" | "-") term }
term := atom { ("*" | "/") atom }
atom := INT | "(" expr ")"
```

term 嵌在 expr 中，使乘除比加减结合得更紧；循环以已有左子树为起点，使同级操作左结合。`8-3-2` 因而解释为 `(8-3)-2`，不是 `8-(3-2)`。

### 为什么不要只按空格切分？

`2+3*4` 没有空格也应合法，`12` 应当是一个整数 token。词法分析根据规则识别字符序列，同时拒绝不在语言中的字符。实际编译器还要处理注释、字符串转义、位置记录和错误恢复，不能用一次 split 替代。

## 可运行的递归下降解析器

程序只解析传入的短字符串，不使用 eval，也不执行用户输入作为 Python 代码。

```python
# example: compiler-parser
import re

def parse(source):
    tokens, position = [], 0
    pattern = re.compile(r"\s*([0-9]+|[()+*/-])")
    while position < len(source):
        if source[position:].isspace():
            break
        match = pattern.match(source, position)
        if not match:
            raise ValueError(f"invalid character near {position}")
        tokens.append(match.group(1))
        position = match.end()
    tokens.append("<end>")
    index = 0

    def atom():
        nonlocal index
        token = tokens[index]
        if token.isdecimal():
            index += 1
            return ("int", int(token))
        if token == "(":
            index += 1
            node = expr()
            if tokens[index] != ")":
                raise ValueError("expected closing parenthesis")
            index += 1
            return node
        raise ValueError("expected integer or parenthesis")

    def term():
        nonlocal index
        node = atom()
        while tokens[index] in ("*", "/"):
            operator = tokens[index]
            index += 1
            node = (operator, node, atom())
        return node

    def expr():
        nonlocal index
        node = term()
        while tokens[index] in ("+", "-"):
            operator = tokens[index]
            index += 1
            node = (operator, node, term())
        return node

    tree = expr()
    if tokens[index] != "<end>":
        raise ValueError("unexpected remaining token")
    return tree

expected = ("+", ("int", 2), ("*", ("int", 3), ("int", 4)))
assert parse("2 + 3 * 4") == expected
assert parse("8-3-2") == ("-", ("-", ("int", 8), ("int", 3)), ("int", 2))
for invalid in ("", "2+", "(2", "2 3", "2@3", "-1"):
    try:
        parse(invalid)
    except ValueError:
        pass
    else:
        raise AssertionError(invalid)
print(expected)
```

AST 保存结构而不是原始排版；乘法子树成为加法右操作数，因此后续阶段能直接按树工作。括号控制结构，却不一定需要作为单独 AST 节点保留。

这个例子没有深度限制，Python 递归栈和超大整数转换还会限制可接受输入。因此它是短输入教学解析器，不是可直接公开暴露给不可信海量输入的服务。实际工具应增加长度、嵌套、时间和错误恢复预算。

## 语法正确不等于语义正确

加入变量后，需要符号表把名字关联到声明、作用域和类型。同一个名字在嵌套作用域可能遮蔽外层声明；变量先声明后使用、函数参数数量、可赋值性等规则不是括号匹配能够决定的。

### 类型与错误阶段

一个表达式在语法上能组成树，却可能把字符串加到不允许的指针上。还有一些错误取决于运行数据，例如除数是否为零。编译器应区分可静态判定的错误、运行时检查与语言允许但需约束的行为，不能承诺编译通过就排除所有运行故障。

本章解析器没有实现变量类型系统，也没有给除法定义整数截断还是实数语义。它只建立结构；若要继续生成和执行结果，必须先明确语言语义，不能让 Python 自己的除法行为悄悄替代设计。

## 从树到 IR：显式表达数据依赖

表达式 `a+b*c` 可形成三地址表示：

```text
t0 = mul b, c
t1 = add a, t0
```

每条指令操作数有限，临时值显式表达依赖，便于优化与代码生成。遇到 if 和循环，需要基本块与控制流图：基本块内部顺序执行，边表示可能的后继。

SSA 让每个名字只定义一次。在控制流汇合点，可能需要 phi 一类合流表示选择来自不同前驱的值；它是 IR 语义，不应机械理解为机器一定有一条同名 phi 指令。

### 数据流分析为什么常要迭代？

例如活跃变量分析，一个块出口活跃集合来自各后继入口集合的并集；入口集合再由本块使用、定义和出口推导。循环使后继可能绕回自身，通常需要迭代到不再变化。集合的传播方向和合并规则由分析问题决定，不是一遍从上到下扫描所有变量名就够。

### 具体例子：分支合流与活跃变量

设入口根据条件跳向 B1 或 B2，B1 执行 `a=1`，B2 执行 `a=2`，二者都跳向 B3，在 B3 返回 a。SSA 可分别命名 `a1=1`、`a2=2`，在 B3 写 `a3=phi(B1:a1, B2:a2)`。phi 根据实际进入的前驱选择值，不是把 1 和 2 相加、取平均或同时执行两条分支。

活跃变量分析问“当前值是否可能在被重新定义前使用”。记一个块内先使用的变量为 USE，定义集合为 DEF，则：

$$
\mathrm{OUT}[B]=\bigcup_{S\in\mathrm{succ}(B)}\mathrm{IN}[S],\qquad
\mathrm{IN}[B]=\mathrm{USE}[B]\cup(\mathrm{OUT}[B]-\mathrm{DEF}[B]).
$$

在原始非 SSA 例子中，B3 入口需要 a，所以 IN[B3]={a}；B1 出口同样需要 a，但 B1 自己已经定义 a，所以仅考虑这项变量时，IN[B1] 为空。这说明“后面用到了变量”不等于“必须保留它在前面所有位置的旧值”。

如果 B3 还能跳回某个前驱，后继信息会沿环传播，就需要迭代。实现中可使用工作列表，只重新处理信息发生变化的块；这比反复扫描源代码字符串更接近真正的编译分析。

## 优化必须保持语义

常量折叠可把明确语义下的 `3*4` 化成 12，公共子表达式消除可避免重复计算，死代码消除可移除不影响可观察结果的工作。但“结果没被使用”不代表调用可以删除：设备访问、文件写入或异常等都可能有可观察效果。

浮点运算不普遍满足实数代数的任意重排。整数溢出的规则也随语言和类型不同。编译器能否使用某种变换，取决于语言规则、已证明事实及明确启用的选项，而不是公式在纸面上看起来相等。

若词法与解析在适当实现和输入约束下对 $n$ 个 token 做常数次访问，时间可以达到 $O(n)$；这不意味着整个优化器都线性。全程序分析、别名分析、寄存器分配等问题有不同复杂度和工程折中。

<!-- AI-INFRA-BEGIN -->
## AI Infra 进阶：循环分块、融合与数值合法性

> 来源：李博杰《深入理解 AI Infra：量化分析与系统设计》，Copyright 2026 Bojie Li，Apache-2.0。固定版本 58636943ba89f24b854f04f0f8f2fffe7b323829。本节由 X-SIA 选编并重新归类：补充承接说明，调整标题层级、图片路径和脚注前缀，保留选定推导及上游图号；图号和节号不是本卷的新编号。下文的配置、题设和作者报告不代表 X-SIA 已完成对应实测。

本章的解析器只解决结构问题，下面继续看后端怎样安排已经确定语义的张量计算。原著沿用 FFN 投影 M=1024、K=4096、N=12288，输入和输出使用 BF16、累加使用 FP32。以下 load_tile、round_to_bf16 等名称用于说明调度的伪代码，不是我们已经提供实现并运行过的 Python 函数。变换顺序必须同时满足依赖和舍入规则。

[manuscripts/05-算子与运行时.md](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/manuscripts/05-%E7%AE%97%E5%AD%90%E4%B8%8E%E8%BF%90%E8%A1%8C%E6%97%B6.md)

### 原著 5.4.2 用循环变换表达分块与融合

第 5.2 节决定了每次处理多大一块，还要决定这些块按什么顺序计算。同样切好的数据，若刚用过就换走，随后又要重新搬回，仍然会产生不必要的访问。循环变换让程序表达这些安排：split 将循环拆成“第几块”和“块内第几个位置”；reorder 调整遍历顺序，让即将再次使用的数据有机会留在局部存储中。再选择在哪一层循环保存或使用中间结果，就能明确它要留下多久。

取 $Y=\operatorname{SiLU}(AW)$，沿用 $M=1024,K=4096,N=12288$，矩阵乘用 FP32 累加，结果舍入为 BF16 后再激活。最直接的程序先生成完整 C，再遍历 C 生成 Y：

```python
for i in range(M):
    for j in range(N):
        acc = 0.0
        for k in range(K):
            acc += A[i, k] * W[k, j]
        C[i, j] = round_to_bf16(acc)

for i in range(M):
    for j in range(N):
        Y[i, j] = silu(C[i, j])
```

第一项变换是**拆分（split）**。把 i 拆成块号 $i_o$ 与块内坐标 $i_i$，令 $i=64i_o+i_i$。原来的 1024 行就成为 16 个块，每块 64 行。对 j 同样处理，得到 192 个列块。同时拆分两个输出维度，就形成 64×64 的 tile。

拆分首先改变了索引的表示方式。要连续完成一个 tile，还需要**重排（reorder）**：在外层循环中遍历输出块，在内层循环中遍历块内元素。再把 K 按 32 拆成 128 个归约块。程序先选定一个输出 tile，逐块加载所需 A、W，累加到同一个输出块中。

采用这种循环结构后，就能确定输入块需要保留多久。A、W 的当前块各占 4 KiB，在一次归约块计算后即可替换；4096 个 FP32 累加器占 16 KiB，要一直保留到全部 128 次归约块计算结束。因此，两类缓冲应在不同的循环层分配和释放。

最后调整激活的**计算位置**。一个输出 tile 完成全部 K 归约后，其 4096 个 C 值已经全部算好，可以立即做 SiLU 并写出 Y；其他输出 tile 尚未完成也不影响这一片结果。这样只需在局部保存当前输出块的结果，不再需要完整 24 MiB 的 C，也就省去了 48 MiB 写回与重读。

```python
for io in range(ceil_div(M, BM)):
    for jo in range(ceil_div(N, BN)):
        acc = zeros_fp32(BM, BN)
        for ko in range(ceil_div(K, BK)):
            a = load_tile(A, io, ko, BM, BK)
            w = load_tile(W, ko, jo, BK, BN)
            matmul_accumulate(acc, a, w)
        c = round_to_bf16(acc)
        store_tile(Y, io, jo, silu(c))
```

这里 `load_tile` 和 `matmul_accumulate` 分别表示成块读取和矩阵累加；最后一个不足整块的 tile 用掩码标出有效位置。伪代码的缩进清楚地标出了这些先后关系：输入块在 ko 循环内更新，累加器在整个 ko 循环期间始终保留，激活计算在 ko 循环结束后执行。

![图 5-21 循环层级决定临时数据的生命周期](asset:aib-ch05-figure-5-9-polyhedral)

*图 5-21：循环层次决定临时数据需要保存多久。外层选输出块，创建 16 KiB 累加器；内层 ko 反复读取 A、W 块，全部归约结束后再舍入并计算激活函数。*

这些调度动作在编程系统中有对应的表达。Halide 是把“计算什么”和“如何调度”分开表达的编程系统，程序员用 split、tile、reorder 等动作改变执行方式。这里把生成中间结果的算子称为生产者，使用该结果的算子称为消费者。`compute_at` 指定生产者在消费者的哪一层循环内执行。TVM 是面向张量计算的编译系统，也通过调度指定计算位置和缓存读写，让相邻算子在同一块数据上连续计算。[^ai-linux-compiler-05-schedule]

计算位置同时决定复用和重算。把生成中间结果的计算放在最外层，会先算出完整结果，供所有后续计算读取；放到后续计算的分块循环内，就只算当前需要的部分。如果多个输出块需要同一部分中间结果，在每个块内计算就会造成重复。编译器因此要比较两种做法：先保存中间结果供多次读取，或在每次使用前重新计算。

循环中的 `fuse` 还可以把多个迭代维合成一个维度。例如，可以将 16×192 个输出块的二维坐标转换为 0 到 3071 的一维编号，再分配给加速器工作组。这改变了遍历输出块和分配任务的方式；将 SiLU 紧接在矩阵乘的 tile 后面，则省去了中间矩阵的写回和重读。两者可以在同一份调度中组合使用。

### 原著 5.4.3 依赖与舍入如何限制变换

上一小节把激活移入输出 tile，但仍安排在 ko 循环结束后执行，原因可以用两个数说明。设一个输出的两个部分和为 1 与 −1，完整和为 0，SiLU(0)=0。若在每个部分和之后先做 SiLU，再相加，结果为 $\operatorname{SiLU}(1)+\operatorname{SiLU}(-1)\approx0.4621$。把激活计算移到完整求和之前，已经改变了运算。

![图 5-22 激活与归约的顺序](asset:aib-ch05-figure-5-activation-order)

*图 5-22：同样两个部分和，先相加得到零，再做 SiLU 仍为零；先对各部分做 SiLU 再相加，得到约 0.4621。两个数说明把激活计算移到求和之前会改变结果。*

编译器需要遵守的依赖关系因此有两个层次：同一输出的部分和要按归约规则合并，后续算子要等所需的结果算好。不同输出可以并行计算；同一输出的归约和后续运算则必须按依赖顺序执行。

分块归约同样受这条依赖约束。第 5.3.3 节的 FlashAttention 能逐块完成计算，是因为它保留了 m、$\ell$、u，并在最大值改变时，同时调整之前累加的指数和与加权值。若只保留每块已经归一化的输出，就丢失了各块分母的相对大小。例如两个块各自只有一个值，分别为 1 和 3，块内输出仍是 1 和 3；仅凭这两个输出，无法判断整行 Softmax 应给它们分配 1:2 还是 2:1 的权重。因此，分块归约必须保存足够的统计量，才能正确合并各块的结果。

浮点舍入进一步限制了变换。原程序将 FP32 累加结果舍入为 BF16，再激活，融合后的程序也要在激活之前执行 `round_to_bf16`。中间值可以从寄存器直接传给激活，但这次舍入仍然存在。数据存放位置与数值格式是两项独立选择。

**例 5-7：整行量化 scale 如何约束分块计算顺序？** 一行包含 256 个元素，分成两个块，每块各含 128 个元素，两个块的首个元素分别为 1 和 10，其余为零。量化使用 E4M3FN 格式：一种含符号位、四位指数和三位尾数的八位浮点表示，最大有限值为 448。scale 由整行最大绝对值决定；随后做点积，权重仅第一个元素为 1。因此结果完全取决于第一个元素如何量化。

![图 5-23 整行 scale 与第一次舍入](asset:aib-ch05-figure-5-quantization-scale)

*图 5-23：一行分成两个块，后一块中的 10 决定整行 scale。第一项要先按这一 scale 映射，再舍入到格式允许的值，最后反量化。*

先读完整行，最大值为 10。第一项缩放为 $1\times448/10=44.8$，舍入到该格式可表示的 44，反量化结果为 $44\times10/448=55/56$。若读完第一块就量化，当时最大值为 1，第一项可表示为 448，反量化结果恰好为 1。

读到后一块中的 10 后，即使调整后续计算所用的 scale，第一项也不可能重新经历 44.8→44 的舍入。两种做法的结果相差 $1/56$，约 1.8%。因此，按整行最大值确定 scale 时，应先读完一行求出最大值，再量化。[^ai-linux-compiler-05-numerics]

这些例子说明了哪些变换可以做，哪些运算顺序必须保留。输出之间可以交换执行顺序，输入可以分块缓存，算好的结果可以直接供后续运算使用；归约的合并方式和量化的舍入位置则属于运算定义，需要在变换中保留。

### 原著 5.4.4 AKG：用多面体编译组织循环与存储

AKG 是面向张量算子的自动代码生成与优化系统，其核心技术是**多面体编译（Polyhedral Compilation）**。该方法把规则循环表示为三类信息：有哪些迭代要执行，每次迭代读写哪些数组元素，以及哪些读写必须保持先后顺序。循环边界和规则下标可以用线性约束描述，这就是“多面体”名称的来源。借助这种表示，编译器能够推导迭代之间的依赖，并据此调整执行顺序。[^ai-linux-compiler-05-akg]

以矩阵乘为例，编译器可以确定不同 i、j 对应不同输出，沿 k 的更新则指向同一个累加结果。选定 64×64×32 的 tile 后，还可以由数组访问推导当前需要的 A、W 区域：A 为 64×32，W 为 32×64。这样既能确定循环的执行顺序，也能确定需要读入哪些数据，以及这些数据要保存多久。

AKG 从张量表达式生成多面体表示，将分块与分层融合结合起来：在外层安排完整算子的执行顺序，在内层安排各块的连续计算和局部缓存。存储管理根据这些区域分配片上空间、插入搬移，代码生成再将计算映射到硬件执行方式，调优阶段选择块形状等参数。前文手工完成的“拆分循环—确定读取区域—保留累加结果—完成归约后激活”，在这里成为相互联系的编译步骤。

将计算和存储一起分析，也能解释融合为什么会增加访存。前面的逐元素链通过融合少读了中间值；若中间结果采用位数更少的表示，又要供后续计算反复读取，保留它反而可以减少读取。

**例 5-8：量化单独执行还是融合进矩阵乘，哪种方式读写更少？** 取 $[4096,4096]$ 的 FP16 输入 A，占 32 MiB，量化为 FP8 后占 16 MiB；FP8 权重为 $[4096,1536]$，占 6 MiB，FP16 输出占 12 MiB。输出按 128×128 分块，共有 32 个行块、12 个列块。各输出块独立读取所需数据，量化 scale 来自整行最大值。

先看单独执行量化的做法。每处理一行，就用 8 KiB 局部空间保存该行输入，求出 scale 后再量化。全部输入共读入 32 MiB，量化结果共写出 16 MiB。随后，12 个输出列块各读取一遍 FP8 输入，共 192 MiB。因此，与输入有关的读写量为 $32+16+192=240$ MiB。

把量化合并到矩阵乘中后，先读取 32 MiB 原输入求出每行的 scale；12 个列块随后各读一次原来的 32 MiB 输入，并在本地量化。输入相关访问为 $32+12\times32=416$ MiB。虽然省去了 16 MiB 量化结果的写出，但每个列块读取的输入从 16 MiB 增至 32 MiB，12 次读取增加了 192 MiB。

两种方案都由 32 个行块各读取 6 MiB 权重，再写出 12 MiB 输出，共 $32\times6+12=204$ MiB。因此总访问量分别为 $240+204=444$ MiB 与 $416+204=620$ MiB，融合后增加约 40%。

![图 5-24 保留量化结果如何减少后续读取](asset:aib-ch05-figure-5-10-quantization)

*图 5-24：两种方案都先读完整输入以确定每行的 scale。保存 FP8 结果后 12 个列块合计重读 192 MiB；融合方案重读 FP16 输入 384 MiB。权重与输出另有相同的 204 MiB。*

图 5-24 中，决定差距的是通向 12 个列块的重复读取：每次读取的数据量相差一倍。输出列块数因而直接决定两种做法的访存量差异。每增加一个列块，保留量化结果的方案多读 16 MiB，融合方案多读 32 MiB。将 1536 个输出列放入同一块，可消除这种跨列块重复；相应输出累加器也从 128 列扩大为 1536 列，需要 12 倍空间。因此，选择是否融合量化时，仍要比较第 5.2 节讨论过的局部存储占用与数据复用。[^ai-linux-compiler-05-numerics]

AKG 将融合与分块共同考虑，正是为了处理这样的相互作用。中间结果的计算位置改变后，各输出块读取哪些数据、读取多少次都会改变；缓冲需求随之变化，又影响能够采用的块大小。

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

[^ai-linux-compiler-05-schedule]: [TVM](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/files/papers/tvm.pdf)、[TensorIR](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/files/papers/tensorir.pdf)。

[^ai-linux-compiler-05-numerics]: [融合合法性、FP8 舍入和量化投影](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/case-studies/fusion-legality-and-precision.md)；[RedFuser 后端阅读](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/experiments/ch05/05-04/redfuser/README.md)。444／620 MiB 计数包括 A、W 与输出；行 scale 的辅助读写另见配套计算。

[^ai-linux-compiler-05-akg]: Zhao 等，2021，[AKG: Automatic Kernel Generation for Neural Processing Units using Polyhedral Transformations](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/references/files/papers/akg-pldi21.pdf)。
<!-- AI-INFRA-END -->

## 练习与解题提示

1. 画出 `2*(3+4)` 的 AST，与 `2*3+4` 比较。
2. 为什么解析器最后必须检查输入已用完？
3. 给语言增加一元负号，应该简单地允许 INT 前可选短横线吗？
4. 一个返回值未使用的函数调用能否总被删除？
5. 为什么“编译成功”不能证明没有除零错误？

**答案：** 1. 前者根是乘法，右子树为加法；后者根是加法。2. 否则可能只解析前缀而忽略非法尾部。3. 需要定义优先级与结合规则，通常增加 unary 层，而不是混淆词法数字和减法。4. 不能，要考虑副作用和语言语义。5. 除数可能由运行输入决定，且本例仅做语法解析。

## 小结与参考

学习编译原理的主线是“结构—含义—保持含义的变换”，而非背诵阶段名字。这个小解析器提供了真实起点，后续还需扩展类型、控制流、优化与目标代码生成。

- [LLVM Kaleidoscope Tutorial](https://llvm.org/docs/tutorial/)：从词法和 AST 逐步生成 LLVM IR，注意版本接口差异。
- [Crafting Interpreters](https://craftinginterpreters.com/)：用完整语言实现学习扫描、解析、作用域与执行；解释器与编译器共享不少前端知识。
- [北京大学编译实践课程](https://pku-minic.github.io/online-doc/)：中文小型编译器实践路线，结合前端、中间表示与目标代码逐步实现；可作为本章之后的综合项目参考。
