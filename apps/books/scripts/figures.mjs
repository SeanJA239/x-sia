import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ink = '#243b47',
  teal = '#21645d',
  copper = '#a15430',
  blue = '#345d91'
const esc = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
const text = (x, y, s, size = 18, color = ink, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}">${esc(s)}</text>`
const line = (x1, y1, x2, y2, color = ink, arrow = false, dash = '') =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2" ${arrow ? 'marker-end="url(#arrow)"' : ''} ${dash ? `stroke-dasharray="${dash}"` : ''}/>`
const rect = (x, y, w, h, fill = '#edf4f1', stroke = '#adc1bb') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${stroke}"/>`
const box = (x, y, w, h, title, sub = '', fill) =>
  rect(x, y, w, h, fill) +
  text(x + w / 2, y + 31, title, 18, ink, 'middle') +
  (sub ? text(x + w / 2, y + 56, sub, 14, ink, 'middle') : '')
const circle = (x, y, r, fill = teal) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`
const poly = (points, color = teal, width = 3, dash = '') =>
  `<polyline points="${points.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`
function svg(title, desc, content, height = 360) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 ${height}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(desc)}</desc><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${ink}"/></marker></defs><rect width="900" height="${height}" fill="#fafbf9"/><g font-family="Arial, 'Microsoft YaHei', sans-serif">${text(30, 35, title, 19, teal)}${content}</g></svg>`
}
function flow(title, entries, notes) {
  const w = 180,
    gap = 35,
    start = 35
  let s = ''
  entries.forEach(([a, b], i) => {
    const x = start + i * (w + gap)
    s += box(x, 100, w, 83, a, b)
    if (i < entries.length - 1) s += line(x + w + 4, 141, x + w + gap - 4, 141, ink, true)
  })
  notes.forEach((n, i) => {
    s += text(40, 235 + i * 30, n, 17)
  })
  return svg(title, notes.join(' '), s)
}
function chart({ title, desc, xLabel, yLabel, xmin, xmax, ymin, ymax, curves, xTicks, yTicks }) {
  const X = (x) => 95 + ((x - xmin) / (xmax - xmin)) * 650
  const Y = (y) => 275 - ((y - ymin) / (ymax - ymin)) * 190
  let s = line(95, 280, 770, 280, ink, true) + line(90, 280, 90, 70, ink, true)
  for (const x of xTicks) s += line(X(x), 280, X(x), 285) + text(X(x), 305, x, 14, ink, 'middle')
  for (const y of yTicks)
    s += line(95, Y(y), 745, Y(y), '#dce5e1') + text(80, Y(y) + 5, y, 14, ink, 'end')
  curves.forEach(({ fn, color, label }, i) => {
    const pts = Array.from({ length: 201 }, (_, j) => {
      const x = xmin + ((xmax - xmin) * j) / 200
      return [X(x), Y(fn(x))]
    })
    s +=
      poly(pts, color) +
      line(540, 43 + i * 21, 565, 43 + i * 21, color) +
      text(575, 48 + i * 21, label, 14)
  })
  s += text(775, 305, xLabel, 15) + text(25, 65, yLabel, 15)
  return svg(title, desc, s)
}

export function createFigures() {
  const figs = new Map()
  figs.set(
    'linux-process',
    flow(
      '进程与系统调用边界',
      [
        ['终端 / PTY', '输入与显示'],
        ['Shell', '解析与安排执行'],
        ['用户进程', 'PID / 地址空间'],
        ['Linux 内核', 'CPU / 内存 / 设备'],
      ],
      [
        '用户态与内核态之间通过系统调用进入受控接口。',
        '图示是职责关系，不代表每次命令都必须 fork。',
      ],
    ),
  )
  figs.set(
    'linux-files',
    svg(
      '名字、对象与打开状态',
      '两个硬链接共享 inode；文件描述符经过打开文件描述引用文件；软链接保存路径。',
      box(35, 80, 190, 75, '目录项 A', 'original.txt') +
        box(35, 205, 190, 75, '目录项 B', 'hard.txt') +
        box(335, 145, 190, 75, '同一 inode', '类型 / 权限 / 数据') +
        line(225, 117, 333, 171, ink, true) +
        line(225, 242, 333, 193, ink, true) +
        box(630, 70, 225, 75, '进程文件描述符', 'fd → 打开文件描述') +
        line(630, 118, 527, 168, ink, true) +
        box(620, 230, 235, 75, '独立符号链接 inode', '内容为目标路径字符串') +
        text(30, 330, '同一文件系统中，硬链接共享对象；独立 open 通常有独立偏移。', 16),
    ),
  )
  figs.set(
    'linux-shell',
    svg(
      '管道连接的是描述符',
      '生产者 stdout 通过管道连消费者 stdin，stderr 单独通向终端。',
      box(50, 95, 210, 85, 'producer', 'fd 1: stdout') +
        box(365, 95, 170, 85, '有界 pipe', '背压 / 字节流') +
        box(640, 95, 210, 85, 'consumer', 'fd 0: stdin') +
        line(260, 137, 362, 137, ink, true) +
        line(535, 137, 637, 137, ink, true) +
        line(155, 180, 155, 255, copper, true) +
        box(50, 260, 210, 60, '终端：stderr') +
        text(195, 230, 'fd 2（默认未进管道）', 17, copper) +
        text(400, 270, 'producer >file 2>&1', 20) +
        text(400, 305, '按从左到右的顺序改变连接', 17),
    ),
  )
  figs.set(
    'linux-observe',
    svg(
      '单条执行路径上的时间',
      '一条执行路径依次经历排队、计算和等待；并行线程的 CPU 时间可以重叠。',
      text(40, 88, '墙钟时间从请求开始计到完成', 19) +
        rect(40, 120, 160, 75, '#f4e9df') +
        rect(200, 120, 245, 75) +
        rect(445, 120, 245, 75, '#e8eef7') +
        rect(690, 120, 170, 75) +
        text(70, 165, '排队', 22) +
        text(265, 165, 'CPU 执行', 22) +
        text(520, 165, 'I/O 等待', 22) +
        text(735, 165, 'CPU', 22) +
        line(40, 215, 860, 215, ink, true) +
        text(40, 265, '这里只是阶段示意，宽度不代表测得的性能。', 18) +
        text(40, 302, '多线程 CPU 累计时间可超过墙钟时间；低 CPU 也可能有高延迟。', 17),
    ),
  )
  figs.set(
    'linux-lifecycle',
    svg(
      'fork、exec 与退出回收',
      '父进程创建子进程后仍有自己的执行路径；子进程用 exec 替换映像，退出后保留状态供父进程 wait 回收。',
      box(35, 65, 190, 70, '父进程', '创建前的执行上下文') +
        box(650, 65, 215, 70, '父进程继续 / wait', '等待方式由程序决定') +
        line(227, 100, 647, 100, ink, true) +
        text(380, 85, '父进程路径', 16) +
        line(125, 137, 125, 205, ink, true) +
        text(143, 180, 'fork', 16, copper) +
        box(35, 210, 190, 75, '子进程', '独立身份 / 继承资源') +
        box(340, 210, 200, 75, 'exec 新映像', 'PID 不因 exec 改变') +
        box(650, 210, 215, 75, '退出记录', '已退出，等待回收') +
        line(228, 247, 337, 247, ink, true) +
        line(543, 247, 647, 247, ink, true) +
        text(570, 232, 'exit', 15) +
        line(758, 208, 758, 138, copper, true) +
        text(773, 179, '回收', 15, copper) +
        text(
          35,
          329,
          '语义示意；Shell 可以采用其他创建接口或优化，并非每条命令都经历全部步骤。',
          16,
        ),
    ),
  )
  figs.set(
    'linux-unlink',
    flow(
      '名字消失与对象回收是两件事',
      [
        ['文件仍有名字', '目录项 + 打开引用'],
        ['最后名字 unlink', '链接计数变为 0'],
        ['读者继续使用', '打开引用仍存在'],
        ['最后引用关闭', '对象可进入回收'],
      ],
      [
        '中间阶段：du 可能找不到文件，但已打开的描述符仍可访问内容。',
        '回收不等于安全擦除；快照、备份与文件系统策略还会影响空间和数据保留。',
      ],
    ),
  )
  figs.set(
    'linux-expansion',
    svg(
      '普通参数位置：引用决定边界',
      '同一个变量在未引用的普通参数位置可能分词并展开路径名；双引号通常保留一个参数。数组保留每个元素边界。',
      box(30, 82, 215, 75, 'name 的内容', 'annual report.txt') +
        box(340, 65, 225, 75, '$name（未引用）', '按默认 IFS 分词') +
        box(655, 65, 215, 75, '两个参数', 'annual / report.txt') +
        box(340, 195, 225, 75, '"$name"（双引号）', '保留变量结果边界') +
        box(655, 195, 215, 75, '一个参数', 'annual report.txt') +
        line(247, 115, 337, 105, ink, true) +
        line(567, 105, 652, 105, ink, true) +
        line(247, 137, 337, 230, teal, true) +
        line(567, 232, 652, 232, teal, true) +
        text(35, 310, '若内容还有 * 等字符，未引用结果还可能发生路径名展开。', 17) +
        text(35, 339, '赋值、条件与算术等上下文规则不同；本图不是完整的 Bash 解析流程。', 16),
    ),
  )
  figs.set(
    'linux-diagnosis',
    flow(
      '让证据区分候选解释',
      [
        ['定义症状', '对象 / 输入 / 预期'],
        ['对齐观察范围', '时间窗 / 资源边界'],
        ['区分候选假设', 'CPU / 内存 / 等待'],
        ['有边界地验证', '单项变化 / 验收'],
      ],
      [
        '指标有定义，计数器有生命周期；利用率不等于延迟，进程退出不等于交付。',
        '仅示意诊断顺序，不是机器测量；候选瓶颈可能同时存在。',
      ],
    ),
  )
  const systemFlows = [
    [
      'os',
      '操作系统的三条主线',
      [
        ['程序请求', '进程 / 地址 / 文件'],
        ['抽象与保护', '受控入口 / 权限'],
        ['资源分配', '策略 / 状态 / 队列'],
        ['硬件执行', 'CPU / 内存 / 设备'],
      ],
      [
        '机制提供能力，策略决定何时分给谁；同一抽象可以有不同实现。',
        '进程、容器与虚拟机处在不同隔离层，不应混为一谈。',
      ],
    ],
    [
      'kernel',
      '请求、等待与重新运行',
      [
        ['进入内核', '参数 / 对象 / 权限'],
        ['数据尚不可用', '正确登记等待'],
        ['完成事件', '改变条件 / 唤醒'],
        ['再次获得 CPU', '检查状态 / 返回'],
      ],
      [
        '唤醒通常只让任务成为可运行；不等于马上开始执行。',
        '图示为阻塞路径；缓存命中与其他对象可以走不同路径。',
      ],
    ],
    [
      'threads',
      '共享状态的读改写',
      [
        ['初值 0', 'A 读取 0'],
        ['切换到 B', 'B 读取 0'],
        ['两次各自加一', 'A 写 1 / B 写 1'],
        ['更新丢失', '需要完整同步协议'],
      ],
      [
        '互斥保护整个不变量；只保护最后一次写入不够。',
        'C/C++ 普通对象的数据竞争还可能是未定义行为，不仅是计数少一。',
      ],
    ],
    [
      'virtual-memory',
      '从地址到数据',
      [
        ['虚拟地址', '页号 + 偏移'],
        ['转换查询', 'TLB / 页表'],
        ['物理地址', '页框 + 原偏移'],
        ['缓存与内存', '数据 / 指令访问'],
      ],
      [
        'TLB 未命中不等于缺页，缺页也不都需要磁盘读取。',
        '图为职责关系；实际处理器可以重叠部分查询。',
      ],
    ],
    [
      'io',
      'I/O 的跨层状态',
      [
        ['应用缓冲', '高层写入 / flush'],
        ['内核与缓存', '检查 / 暂存 / 写回'],
        ['设备队列', 'DMA / 执行'],
        ['完成与恢复', '逐项检查语义'],
      ],
      [
        '提交、完成和所需持久性不是同一事件。',
        '不同对象与 I/O 模式有不同路径；不是所有操作都经过每一层。',
      ],
    ],
    [
      'dataflow',
      '软件流水线与有界数据流',
      [
        ['读取', '输入契约'],
        ['有界队列', '容量 / 背压'],
        ['并发计算', '所有权 / 结果 ID'],
        ['写出与验收', '顺序 / 副作用'],
      ],
      [
        '队列满时必须阻塞、拒绝或按明确策略处理，不能无限积压。',
        '关闭和错误还需控制通道；队列暂时空不等于所有任务完成。',
      ],
    ],
    [
      'compiler',
      '从结构到语义保持',
      [
        ['词法 / 语法', 'token → AST'],
        ['语义分析', '作用域 / 类型'],
        ['IR 与优化', '数据流 / 控制流'],
        ['代码生成', '目标机器约束'],
      ],
      [
        'AST 保存结构，不只是原文；优化必须保持语言允许的可观察行为。',
        '重排和删代码需要语义依据，不能只按数学符号或文本替换。',
      ],
    ],
    [
      'toolchain',
      '程序运行前的构建边界',
      [
        ['源文件', '声明 / 定义'],
        ['目标文件', '符号 / 重定位'],
        ['链接结果', '可执行对象 / 库'],
        ['装载与启动', '映射 / ABI / main'],
      ],
      [
        '编译、汇编、链接、装载分工不同，即使一个命令串起全部步骤。',
        '目标格式和 ABI 与平台有关；Linux ELF 不等于 Windows PE。',
      ],
    ],
  ]
  for (const [id, title, entries, notes] of systemFlows)
    figs.set(`linux-${id}`, flow(title, entries, notes))
  let scheduling = text(30, 92, 'FCFS', 19) + text(30, 205, 'RR q=1', 19)
  let offset = 160
  for (const [label, duration, color] of [
    ['A', 6, '#dce8f5'],
    ['B', 2, '#deeee4'],
    ['C', 1, '#f4e5d9'],
  ]) {
    scheduling +=
      rect(offset, 60, duration * 70 - 3, 56, color) +
      text(offset + duration * 35, 94, label, 18, ink, 'middle')
    offset += duration * 70
  }
  for (const [i, label] of ['A', 'B', 'C', 'A', 'B', 'A', 'A', 'A', 'A'].entries()) {
    scheduling +=
      rect(
        160 + i * 70,
        170,
        67,
        56,
        label === 'A' ? '#dce8f5' : label === 'B' ? '#deeee4' : '#f4e5d9',
      ) +
      text(193 + i * 70, 204, label, 18, ink, 'middle') +
      text(160 + i * 70, 252, i, 14)
  }
  scheduling +=
    text(790, 252, '9 ms', 14) +
    text(35, 300, 'A=6、B=2、C=1，同时到达；忽略切换开销。', 17) +
    text(35, 333, 'RR 首次响应为 0、1、2；完成时刻为 A=9、B=5、C=3。', 17)
  figs.set(
    'linux-scheduling',
    svg(
      '调度时间表：响应与周转',
      '同一组任务在 FCFS 与时间片 1 的轮转中具有不同响应和完成时刻。',
      scheduling,
    ),
  )
  let pipeline = ''
  for (let cycle = 0; cycle < 8; cycle++)
    pipeline += text(188 + cycle * 78, 77, `C${cycle + 1}`, 15, ink, 'middle')
  for (let instruction = 0; instruction < 4; instruction++) {
    pipeline += text(35, 116 + instruction * 47, `指令 ${instruction + 1}`, 17)
    for (const [stage, label] of ['IF', 'ID', 'EX', 'MEM', 'WB'].entries()) {
      const x = 155 + (instruction + stage) * 78,
        y = 91 + instruction * 47
      pipeline +=
        rect(x, y, 69, 36, stage % 2 ? '#e3ecf7' : '#e3efe8') +
        text(x + 34, y + 24, label, 15, ink, 'middle')
    }
  }
  pipeline +=
    text(35, 314, '无停顿的四条指令共用八周期；首条延迟仍为五周期。', 17) +
    text(35, 343, '教学模型；真实结构、访存时序、分支和数据冒险会改变时间表。', 16)
  figs.set(
    'linux-cpu-pipeline',
    svg(
      '经典五级指令流水线',
      'IF、ID、EX、MEM、WB 各阶段按周期错位重叠，示意理想吞吐而非真实处理器测量。',
      pipeline,
    ),
  )
  figs.set(
    'servers-network',
    flow(
      '逐层建立可达性与信任',
      [
        ['DNS / 路由', '名字 → 地址 → 下一跳'],
        ['TCP', '监听 / 连接'],
        ['TLS 或 SSH', '加密与身份'],
        ['应用协议', '请求 / 响应 / 语义'],
      ],
      [
        'DNS 成功 ≠ 端口可达；连接成功 ≠ 身份正确；HTTP 200 ≠ 业务正确。',
        'TLS 与 SSH 是不同协议，这里表示传输之上的安全层选择。',
      ],
    ),
  )
  figs.set(
    'servers-services',
    flow(
      '服务启动与请求验收',
      [
        ['启动请求', '管理器接收'],
        ['进程存在', 'exec / PID'],
        ['就绪', '依赖与监听完成'],
        ['业务成功', '正确输入与响应'],
      ],
      [
        '停止：停止接收新请求 → 有限时间排空 → 清理 → 退出。',
        '健康端点应反映其检查范围，不用单个 active 标记替代全部证据。',
      ],
    ),
  )
  figs.set(
    'servers-storage',
    flow(
      '从写入到恢复',
      [
        ['应用缓冲', '语言运行库'],
        ['内核缓存', 'write / fsync'],
        ['持久设备', '驱动与硬件保证'],
        ['独立备份', '一致副本与恢复验证'],
      ],
      [
        '箭头概括数据流；备份还需要专门的一致性协议。',
        '原子可见性、断电持久性、故障后可恢复性是三个不同目标。',
      ],
    ),
  )
  figs.set(
    'servers-capacity',
    chart({
      title: '排队模型：接近满载时等待陡增',
      desc: 'M/M/1 平均系统时间除以平均服务时间，等于 1/(1-rho)。',
      xLabel: 'rho',
      yLabel: 'W / (1/mu)',
      xmin: 0,
      xmax: 0.95,
      ymin: 0,
      ymax: 20,
      xTicks: [0, 0.25, 0.5, 0.75, 0.95],
      yTicks: [0, 5, 10, 15, 20],
      curves: [{ fn: (r) => 1 / (1 - r), color: teal, label: '1 / (1 - rho)' }],
    }),
  )
  let circuit =
    text(50, 75, '低压 LED 示意', 19) +
    line(55, 145, 130, 145) +
    text(50, 128, 'GPIO', 17) +
    rect(130, 130, 90, 30, '#fff') +
    text(163, 120, 'R', 18) +
    line(220, 145, 300, 145) +
    '<path d="M300 127 L300 163 L330 145 Z" fill="none" stroke="#a15430" stroke-width="2"/>' +
    line(333, 125, 333, 165, copper) +
    line(333, 145, 395, 145) +
    line(395, 145, 395, 245) +
    line(372, 245, 418, 245) +
    line(380, 253, 410, 253) +
    line(388, 261, 402, 261) +
    text(283, 192, 'LED', 17) +
    line(310, 114, 330, 96, copper, true) +
    line(329, 117, 349, 99, copper, true)
  circuit +=
    text(480, 75, '开漏与 RC 上升', 19) +
    text(590, 110, 'VDD', 17) +
    line(610, 115, 610, 140) +
    rect(595, 140, 30, 65, '#fff') +
    text(635, 178, 'R pull-up', 16) +
    line(610, 205, 610, 230) +
    line(610, 230, 795, 230) +
    circle(610, 230, 4) +
    text(720, 215, 'bus', 16) +
    line(780, 230, 780, 260) +
    line(760, 260, 800, 260) +
    line(760, 270, 800, 270) +
    text(810, 270, 'C', 17) +
    line(780, 270, 780, 295) +
    line(760, 295, 800, 295) +
    line(610, 230, 610, 255) +
    line(610, 255, 625, 280) +
    line(610, 290, 610, 300) +
    line(590, 300, 630, 300) +
    text(480, 290, 'sink switch', 14) +
    text(40, 335, '连接实物前核对电压、极性、限流和引脚额定；图不含完整保护电路。', 17)
  figs.set(
    'embedded-circuits',
    svg(
      '从逻辑电平回到电路',
      'LED 串联电阻接地；开漏总线上拉到电源且带等效电容，释放后按 RC 规律上升。',
      circuit,
    ),
  )
  figs.set(
    'embedded-boot',
    svg(
      'Flash 与 RAM：main 之前的数据准备',
      '启动代码复制 data 初值，清零 bss，建立栈并进入运行库和 main。',
      text(95, 80, 'Flash', 22) +
        text(575, 80, 'RAM', 22) +
        box(60, 100, 260, 64, '向量表 / text / rodata') +
        box(60, 180, 260, 64, 'data 初值（LMA）') +
        box(540, 100, 290, 64, 'data（VMA）') +
        box(540, 180, 290, 64, 'bss：启动时清零') +
        box(540, 260, 290, 64, 'stack / heap / buffers') +
        line(320, 211, 536, 132, ink, true) +
        text(355, 142, '复制', 18) +
        text(50, 290, '向量 → Reset_Handler', 20) +
        text(50, 325, '初始化 → 运行库 → main', 20),
    ),
  )
  const ramp = []
  for (let k = 0; k < 3; k++)
    ramp.push([80 + k * 250, 170], [80 + k * 250 + 245, 75], [80 + k * 250 + 245, 170])
  let timer =
    poly(ramp) +
    text(20, 82, 'ARR', 16) +
    text(40, 177, '0', 16) +
    line(75, 175, 850, 175, ink, true) +
    text(35, 220, 'PWM', 17)
  for (let k = 0; k < 3; k++)
    timer +=
      poly(
        [
          [80 + k * 250, 248],
          [80 + k * 250, 215],
          [142.5 + k * 250, 215],
          [142.5 + k * 250, 248],
          [330 + k * 250, 248],
        ],
        blue,
      ) + line(325 + k * 250, 180, 325 + k * 250, 290, copper, false, '4 4')
  timer += text(80, 315, '示意：25% duty；更新事件与 ISR 开始之间可能有延迟。', 17)
  figs.set(
    'embedded-interrupts',
    svg('计数、比较匹配与更新事件', '边沿对齐向上计数及百分之二十五占空比 PWM。', timer),
  )
  const bits = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1]
  let uart = '',
    pts = []
  bits.forEach((b, i) => {
    const x = 55 + i * 65,
      y = b ? 135 : 225
    if (i) pts.push([x, bits[i - 1] ? 135 : 225])
    pts.push([x, y], [x + 65, y])
    uart +=
      line(x, 110, x, 255, '#dce5e1', false, '3 4') +
      text(
        x + 32,
        280,
        [
          'idle',
          'start',
          'd0=1',
          'd1=0',
          'd2=1',
          'd3=0',
          'd4=1',
          'd5=0',
          'd6=1',
          'd7=0',
          'stop',
          'idle',
        ][i],
        13,
        ink,
        'middle',
      )
  })
  uart += poly(pts) + text(40, 323, '0x55，8N1，LSB first；示意位宽相等，不是实测波形。', 17)
  figs.set(
    'embedded-interfaces',
    svg('UART 帧：字节如何成为时序', '先起始位，再从最低位发送 0x55 的八位，最后停止位。', uart),
  )
  figs.set(
    'systems-representation',
    svg(
      'IEEE 754 binary32 正规数',
      '符号一位，指数八位，小数字段二十三位。',
      rect(50, 100, 65, 85, '#f4e9df') +
        rect(115, 100, 210, 85, '#e8eef7') +
        rect(325, 100, 525, 85) +
        text(82, 140, 's', 24, ink, 'middle') +
        text(220, 140, 'E', 24, ink, 'middle') +
        text(585, 140, 'F', 24, ink, 'middle') +
        text(82, 170, '1 bit', 14, ink, 'middle') +
        text(220, 170, '8 bits', 14, ink, 'middle') +
        text(585, 170, '23 bits', 14, ink, 'middle') +
        text(55, 230, '1.5 = 1.1 (base 2) × 2^0', 22) +
        text(55, 267, 's = 0, E = 127, F = 2^22  →  0x3fc00000', 21) +
        text(55, 315, 'E = 0 或 255 时使用特殊编码规则，不能直接套正规数公式。', 17),
    ),
  )
  figs.set(
    'systems-toolchain',
    flow(
      '从源文件到运行映像',
      [
        ['预处理 / 编译', '.c → .i → .s'],
        ['汇编', '.s → .o / symbols'],
        ['链接', '符号 / 重定位 / 布局'],
        ['装载 / 运行库', 'ELF → 进程 → main'],
      ],
      [
        '多个目标文件与库在链接阶段组合；ABI 约束编译后的合作方式。',
        '实际工具可合并阶段或使用 LTO，图示强调职责。',
      ],
    ),
  )
  figs.set(
    'systems-memory',
    svg(
      '地址翻译与缓存定位',
      '虚拟地址页号通过 TLB 或页表映射，页内偏移保持；物理缓存地址再拆分标签、索引和行内偏移。',
      box(40, 80, 210, 72, 'VPN', '虚拟页号') +
        box(250, 80, 180, 72, 'offset', '页内偏移') +
        line(145, 152, 145, 185, ink, true) +
        box(40, 190, 210, 70, 'TLB / 页表', 'VPN → PFN') +
        line(250, 225, 505, 225, ink, true) +
        box(510, 190, 180, 70, 'PFN', '物理页框') +
        box(690, 190, 170, 70, 'offset', '保持不变') +
        line(430, 115, 770, 115) +
        line(770, 115, 770, 185, ink, true) +
        text(35, 305, '物理地址 → [ tag | set index | block offset ] → 缓存行', 21) +
        text(35, 337, '简化物理索引缓存模型；TLB miss 不等于需要磁盘 I/O。', 16),
    ),
  )
  figs.set(
    'systems-concurrency',
    svg(
      '读—改—写的丢失更新',
      '两个线程先后读取零又分别写入一，最终只增加一次；互斥保护整个操作可避免这种交错。',
      text(40, 78, '未同步', 20) +
        text(475, 78, '保护整个操作', 20) +
        line(95, 100, 95, 310, ink, true) +
        line(300, 100, 300, 310, ink, true) +
        text(65, 100, 'A', 18) +
        text(270, 100, 'B', 18) +
        text(112, 143, 'read 0', 19) +
        text(315, 178, 'read 0', 19) +
        text(112, 218, 'write 1', 19) +
        text(315, 253, 'write 1', 19) +
        rect(495, 105, 335, 80) +
        text(512, 140, 'A: lock → 0 + 1 → unlock', 18) +
        rect(495, 205, 335, 80, '#e8eef7') +
        text(512, 240, 'B: lock → 1 + 1 → unlock', 18) +
        text(60, 335, '结果 1：一次更新丢失', 17, copper) +
        text(515, 335, '结果 2：访问同一不变量需同一协议', 16),
    ),
  )
  const ox = 160,
    oy = 270,
    scale = 80
  const xy = (x, y) => [ox + scale * x, oy - scale * y]
  const projection =
    line(80, oy, 530, oy, ink, true) +
    line(ox, 305, ox, 55, ink, true) +
    line(...xy(0, 0), ...xy(2.2, 2.2), '#adc1bb', false, '5 4') +
    line(...xy(0, 0), ...xy(2, 0), blue, true) +
    line(...xy(0, 0), ...xy(1, 1), teal, true) +
    line(...xy(1, 1), ...xy(2, 0), copper, true) +
    text(330, 263, 'b = (2, 0)', 18, blue) +
    text(215, 165, 'b-hat = (1, 1)', 18, teal) +
    text(330, 215, 'r = (1, -1)', 18, copper) +
    text(520, 120, 'a = (1, 1)', 22) +
    text(520, 170, 'a · r = 0', 22) +
    text(520, 220, 'b = b-hat + r', 22) +
    text(60, 330, '原点到投影点沿允许方向；投影点到 b 的误差与该方向垂直。', 17)
  figs.set(
    'math-linear',
    svg('投影与正交残差', 'b=(2,0) 投影到 a=(1,1) 方向，投影为 (1,1)，残差为 (1,-1)。', projection),
  )
  let euler = '',
    X = (k) => 95 + k * 90,
    Y = (x) => 190 - x * 14
  euler += line(80, 190, 775, 190, ink, true) + line(90, 305, 90, 70, ink, true)
  for (const y of [-8, -4, 0, 4, 8])
    euler += text(75, Y(y) + 4, y, 14, ink, 'end') + line(95, Y(y), 725, Y(y), '#dce5e1')
  for (const [ah, color] of [
    [0.5, teal],
    [1.5, blue],
    [2.5, copper],
  ]) {
    const points = Array.from({ length: 6 }, (_, k) => [X(k), Y((1 - ah) ** k)])
    euler += poly(points, color) + points.map(([x, y]) => circle(x, y, 4, color)).join('')
  }
  euler +=
    text(610, 85, 'ah = 0.5', 16, teal) +
    text(610, 110, 'ah = 1.5', 16, blue) +
    text(610, 135, 'ah = 2.5', 16, copper)
  for (let k = 0; k < 6; k++) euler += text(X(k), 320, k, 14, ink, 'middle')
  euler += text(765, 320, 'step k', 16) + text(100, 55, 'x[k] = (1 - ah)^k, x[0] = 1', 17)
  figs.set(
    'math-calculus',
    svg(
      '连续稳定不等于离散稳定',
      'Euler 迭代在 ah 为 0.5 时正值衰减，1.5 时交替衰减，2.5 时交替发散。',
      euler,
    ),
  )
  figs.set(
    'math-probability',
    chart({
      title: '高斯密度：方差改变分布宽度',
      desc: '均值零、标准差为 0.5、1、2 的正态概率密度。纵轴是密度而非单点概率。',
      xLabel: 'x',
      yLabel: 'density',
      xmin: -4,
      xmax: 4,
      ymin: 0,
      ymax: 0.85,
      xTicks: [-4, -2, 0, 2, 4],
      yTicks: [0, 0.2, 0.4, 0.6, 0.8],
      curves: [0.5, 1, 2].map((s, i) => ({
        fn: (x) => Math.exp((-x * x) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI)),
        color: [teal, blue, copper][i],
        label: `sigma = ${s}`,
      })),
    }),
  )
  let sig =
    text(40, 80, 'RC：归一化频率 q = omega × tau', 18) +
    line(55, 250, 430, 250, ink, true) +
    line(55, 250, 55, 105, ink, true)
  const magnitude = [],
    phase = []
  for (let i = 0; i <= 200; i++) {
    const t = -2 + i / 50,
      q = 10 ** t
    magnitude.push([65 + i * 1.7, 245 - 120 / Math.sqrt(1 + q * q)])
    phase.push([65 + i * 1.7, 125 + (120 * Math.atan(q)) / (Math.PI / 2)])
  }
  sig +=
    poly(magnitude, teal) +
    poly(phase, copper) +
    text(65, 280, '0.01', 14) +
    text(235, 280, '1', 14) +
    text(390, 280, '100', 14) +
    text(70, 305, '幅值 0…1', 15, teal) +
    text(230, 305, '相位 0…-90°', 15, copper)
  sig +=
    text(480, 80, '采样歧义：0.3 fs 与 0.7 fs 的余弦', 18) + line(480, 205, 850, 205, ink, true)
  for (const [f, color] of [
    [0.3, blue],
    [0.7, copper],
  ]) {
    const points = Array.from({ length: 401 }, (_, i) => {
      const n = i / 100
      return [490 + n * 82, 195 - 65 * Math.cos(2 * Math.PI * f * n)]
    })
    sig += poly(points, color, 2)
  }
  for (let n = 0; n < 5; n++)
    sig +=
      circle(490 + n * 82, 195 - 65 * Math.cos(2 * Math.PI * 0.3 * n), 5) +
      text(490 + n * 82, 280, n, 14, ink, 'middle')
  sig +=
    text(505, 306, '实心点：整数采样时刻完全相同', 16) +
    text(40, 340, '左图横轴为对数；两条曲线分别按幅值和相位端点归一化显示。', 16)
  figs.set(
    'math-signals',
    svg(
      '频率响应与采样',
      '左图为 RC 幅值及相位趋势，右图为 0.3fs 和 0.7fs 余弦在整数时刻的相同样点。',
      sig,
    ),
  )
  const cover = svg(
    'ENGINEERING FOUNDATIONS',
    '工程基础五卷概念封面：系统层次、服务器、芯片和数学曲线。非功能电路图。',
    text(45, 135, '从工具到机制', 46) +
      text(45, 195, '从公式到工程', 46) +
      text(48, 260, 'LINUX / SERVERS / EMBEDDED / SYSTEMS / MATH', 16) +
      [0, 1, 2]
        .map((i) =>
          box(
            605 - i * 24,
            75 + i * 64,
            200,
            65,
            ['SYSTEM', 'COMPUTE', 'SILICON'][i],
            '',
            ['#e8eef7', '#edf4f1', '#f4e9df'][i],
          ),
        )
        .join('') +
      poly(
        Array.from({ length: 100 }, (_, i) => [520 + i * 3.1, 300 - 22 * Math.sin(i / 9)]),
        teal,
      ),
    360,
  )
  for (const [id, title, entries, notes] of [
    [
      'languages-c',
      '数组、指针与长度的接口',
      [
        ['数组对象', 'N 个有效元素'],
        ['首元素地址', 'const int *'],
        ['显式长度', 'size_t count'],
        ['函数访问', '0 <= i < count'],
      ],
      ['指针本身不携带完整边界；对象生命周期也必须覆盖访问。'],
    ],
    [
      'languages-cpp',
      'RAII 与资源所有权',
      [
        ['构造所有者', '建立不变量'],
        ['借用与操作', '所有权不随意复制'],
        ['作用域退出', '正常或异常展开'],
        ['析构释放', '一次且明确'],
      ],
      ['智能指针和标准容器表达所有权；RAII 不自动回滚业务状态。'],
    ],
    [
      'languages-python',
      '名字绑定与可变对象',
      [
        ['创建列表', 'a = [1, 2]'],
        ['共享绑定', 'b = a'],
        ['修改同一对象', 'b.append(3)'],
        ['由 a 观察', '[1, 2, 3]'],
      ],
      ['赋值不是复制；浅拷贝的新外层容器仍可能共享内层对象。'],
    ],
    [
      'languages-java',
      '从源码到 JVM 执行',
      [
        ['Java 源文件', '.java'],
        ['javac 编译', '.class 字节码'],
        ['装载与验证', 'JVM 运行时'],
        ['解释 / JIT', '执行与优化'],
      ],
      ['GC 管理可回收对象内存，不保证及时关闭文件与数据库连接。'],
    ],
    [
      'languages-web',
      '浏览器中的结构、样式与行为',
      [
        ['HTML', '文档与 DOM'],
        ['CSS', '层叠与布局约束'],
        ['JavaScript', '事件与状态更新'],
        ['浏览器输出', '布局与绘制'],
      ],
      ['图示概括职责而非严格时间顺序；用户输入应按数据处理。'],
    ],
  ])
    figs.set(id, flow(title, entries, notes))
  const referenceImages = JSON.parse(
    readFileSync(new URL('../assets/third-party/rust/sources.json', import.meta.url), 'utf8'),
  ).images
  for (const image of referenceImages) {
    if (!/^[a-z0-9-]+\.svg$/.test(image.file)) throw new Error('Invalid reference image filename')
    const svg = readFileSync(
      new URL(`../assets/third-party/rust/${image.file}`, import.meta.url),
      'utf8',
    )
    if (createHash('sha256').update(svg).digest('hex') !== image.sha256)
      throw new Error(`Reference image identity mismatch: ${image.id}`)
    figs.set(image.id, svg)
  }
  const aiRoot = new URL('../assets/third-party/ai-infra/', import.meta.url)
  const ai = JSON.parse(readFileSync(new URL('sources.json', aiRoot), 'utf8'))
  const license = readFileSync(new URL('LICENSE.txt', aiRoot))
  if (createHash('sha256').update(license).digest('hex') !== ai.licenseSha256)
    throw new Error('AI Infra license identity mismatch')
  for (const image of ai.images) {
    if (
      !/^[a-z0-9-]+\.svg$/.test(image.file) ||
      !/^aib-[a-z0-9-]+$/.test(image.id) ||
      figs.has(image.id)
    )
      throw new Error('Invalid AI Infra figure identity')
    const svg = readFileSync(new URL(image.file, aiRoot), 'utf8')
    if (createHash('sha256').update(svg).digest('hex') !== image.sha256)
      throw new Error(`AI Infra image mismatch: ${image.id}`)
    figs.set(image.id, svg)
  }
  return { figs, cover }
}

export async function writeFigures(assetDir) {
  const { figs, cover } = createFigures()
  await mkdir(path.join(assetDir, 'figures'), { recursive: true })
  await Promise.all(
    [...figs].map(([id, body]) => writeFile(path.join(assetDir, 'figures', `${id}.svg`), body)),
  )
  await writeFile(path.join(assetDir, 'cover.svg'), cover)
  return figs.size
}
