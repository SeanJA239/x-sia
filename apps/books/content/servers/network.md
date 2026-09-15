# 网络路径与 SSH 信任

> 先修：[Linux 进程](book:linux/process)和[文件权限](book:linux/files)。目标：按层定位连接故障，理解地址、路由、监听与密码学身份的区别。命令示例只用于自己的主机；示例网段使用文档保留地址。

## 1.1 “连接服务器”实际包含哪些步骤？

访问一个 HTTPS 网站，客户端通常先解析名字，选择目的地址与路由，再建立传输连接，完成 TLS 握手，最后发送 HTTP 请求。DNS 成功不意味着端口开放；TCP 成功不意味着证书有效；返回 HTTP 200 也不意味着内容在业务上正确。

![图 1-1：名称解析、路由、TCP 连接、TLS 和 HTTP 是不同检查层；每层成功只支持该层的结论。](asset:servers-network)

分层的价值在于缩小搜索空间。例如 `Connection refused` 常表明目的路径上某处主动拒绝了连接，可能是没有监听或防火墙拒绝；超时可能来自丢包、过滤或不可达，不能单凭超时确定哪台设备有故障。

## 1.2 IP 地址、子网与路由

IPv4 地址是 32 位数，前缀长度 $p$ 指定网络部分。掩码 $M$ 的前 $p$ 位为 1，其余为 0，网络地址为：

$$
N=A\mathbin{\&}M.
$$

例如 `192.0.2.70/26`，最后一字节为 `01000110`，掩码最后一字节为 `11000000`。按位与得到 `01000000`，所以网络地址是 `192.0.2.64`。该子网有 $2^{32-26}=64$ 个地址；在传统 IPv4 广播子网规则下，可分配主机地址通常为 62 个。`/31` 点到点与 `/32` 等情形不能机械减 2。

发送数据时，主机按路由表选择下一跳，通常采用最长前缀匹配。目的地在同一链路时可直接解析邻居地址；不在同一链路时通常交给网关。默认网关的地址是私有地址并不能单独证明 CGNAT：需要结合路由器 WAN 地址、上级网络和公网可达条件判断。

```bash
ip address show
ip route show
ip route get 192.0.2.70
```

最后一行显示系统将如何选择路径，不会因此证明目的主机存在。这里的 `192.0.2.0/24` 是文档地址，不用于真正的互联网服务器。

## 1.3 端口、监听地址与连接身份

IP 把包送到主机或网络接口，传输协议的端口帮助定位应用端点。一个 TCP 连接可由协议及源地址、源端口、目的地址、目的端口区分。

监听 `127.0.0.1:8000` 表示仅 IPv4 回环可达；监听 `0.0.0.0:8000` 通常表示所有本地 IPv4 接口，暴露范围更大，但防火墙仍可能限制访问。IPv6 的 `::` 监听是否同时接受 IPv4，还受系统与程序选项影响。

```bash
ss -ltn
```

这个只读命令列出 TCP 监听端点。能看见监听不证明外部网络能到达，也不证明应用已加载好依赖。先从本机回环验证应用，再从同一局域网验证，最后检查经过网关的路径，能减少同时变动的因素。

## 1.4 带宽、延迟与在途数据

链路速率 $B$ 与往返时延 $R$ 的乘积称为带宽时延积：

$$
\mathrm{BDP}=B R.
$$

单位必须统一。100 Mbit/s、RTT 40 ms 时，BDP 为 4 Mbit，即约 500 kB。若希望持续利用这样的路径，需要允许足够的数据在确认返回前处于在途状态，实际还受拥塞窗口、接收窗口、丢包和协议开销影响。

因此“网络能 ping 通”和“能稳定高速传大文件”是两个不同问题。ping 使用的协议与应用不同，而且对端可能禁用 ICMP；不能把 ping 失败当作 SSH 必然失败。

## 1.5 SSH 的两个身份问题

SSH 同时解决：客户端如何确认连接的是正确服务器；服务器如何确认用户有权登录。主机密钥用于前者，用户公钥或其他认证机制用于后者。

首次连接显示指纹时，应通过可信独立渠道核对。服务器密钥变化可能是重装，也可能是误连或攻击；正确做法是调查与核验，而不是习惯性禁用主机密钥检查或删除所有 known_hosts。

下面是**配置模板**，不是可连接的真实账号：

```sshconfig
Host teaching-server
    HostName 192.0.2.10
    User student
    Port 22
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
    ServerAliveInterval 30
    ServerAliveCountMax 3
```

私钥保存在客户端，不上传到服务器或 Wiki；服务器通常只保存允许登录的公钥。公钥认证的安全还依赖私钥保管、代理使用和终端安全。修改 SSH 服务或防火墙时必须保留恢复通道；不要在唯一远程会话里直接切断自己的管理入口。

## 1.6 安全的排错顺序

1. 确认名字是否解析到预期地址，而不是旧地址。
2. 确认本机路由和目标端口，不把 SSH 端口与 Web 端口混淆。
3. 在目标机确认 sshd 监听与日志；没有权限时请管理员提供相关证据。
4. 核对主机指纹后，再检查用户身份和授权。
5. 最后检查 Shell、启动脚本、远程目录等登录后的问题。

NAT、VPN 或反向隧道改变的是可达路径，不替代身份验证。私有网络也不是可以跳过加密与授权的理由。

<!-- AI-INFRA-BEGIN -->
## AI Infra 进阶：跨节点请求槽位与吞吐上界

> 来源：李博杰《深入理解 AI Infra：量化分析与系统设计》，Copyright 2026 Bojie Li，Apache-2.0。固定版本 58636943ba89f24b854f04f0f8f2fffe7b323829。本节由 X-SIA 选编并重新归类：补充承接说明，调整标题层级、图片路径和脚注前缀，保留选定推导及上游图号；图号和节号不是本卷的新编号。下文的配置、题设和作者报告不代表 X-SIA 已完成对应实测。

本章已经区分带宽与 RTT，这里进一步加入请求记录的占用时间和提交速率。下面采用原著给定的 50 GB/s 路径、256 B 载荷、2 微秒槽位周期等参数做推导；它们不是任意 RDMA 或 PCIe 平台都具有的常数。本批保留模型与例题，未选入该节后半的具体平台实测比较。

[manuscripts/07-数据中心网络.md](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/manuscripts/07-%E6%95%B0%E6%8D%AE%E4%B8%AD%E5%BF%83%E7%BD%91%E7%BB%9C.md)

### 原著 7.3.4 并发与吞吐模型

第 7.3.3 节用复用减少远端读取的次数；仍要经过网络的请求，则要让链路始终有数据可传。本节分析本章算例中一张网卡每方向 50 GB/s 的路径需要多少个并发请求。**请求槽位**是保存一项未完成请求的地址、长度和状态的记录：提交时分配，完成状态处理完后释放，释放前不能供新请求使用。假设每次远程访问传输 256 B，从发起请求到释放请求槽位需要 2 μs。链路在这 2 μs 内可以传送 100,000 B，相当于 390.6 次访问的数据量。为了让等待期间始终有数据可传，至少要维持 391 个在途事务，即已发出但尚未处理完的请求。图 7-24 画出一个槽位从分配到释放的过程。

![请求槽位的生命周期](asset:aib-ch07-figure-7-slot-lifetime)

*图 7-24：一项请求从分配记录开始占用槽位，经历传输与等待，完成状态被处理后归还记录。这里的 2 μs 覆盖完整占用区间。*

一般地，每事务载荷为 $m$，槽位占用时间为 $T$，目标带宽为 $B$，所需并发为

$$
N\ge\left\lceil\frac{BT}{m}\right\rceil.
$$

**带宽—时延积**是目标带宽与等待时间的乘积，表示在等待期间持续利用链路所需的在途数据量。再除以每事务载荷，就得到请求数量。链路越快，等待越长，每次返回的数据越少，系统就需要同时记录更多尚未完成的请求。

**例题 7.3：远程读取的在途槽位不足，为何无法用满出口带宽？** 每个事务传输 256 B，占用槽位 2 μs，路径带宽为 50 GB/s。求使用 128 个活跃槽位时的有效读取带宽；再设请求处理单元连续两项事务的最短启动间隔为 18.6 ns（本节后文 RoCE 可靠连接实现的取值），求同时受槽位数量与启动速率限制时的有效带宽上界。

解答：128 个槽位每 2 μs 周转一次，提供的载荷为 $128\times256$ B，因此最多约为 16.4 GB/s。若只让一个事务在途，则为 0.128 GB/s。分配了多少槽位与实际同时使用多少槽位，是两个不同的数量。

![请求槽位不足造成的链路空闲](asset:aib-ch07-figure-7-9-window)

*图 7-25：128 个槽位在约 0.66 μs 内全部用完，要等最早的槽位在 2 μs 释放后继续提交。391 个槽位足以覆盖等待。蓝色表示载荷发送，灰色表示链路空闲。*

图 7-25 的灰色区间来自槽位尚未释放；即使槽位足够，请求也可能来不及提交。请求处理单元若每 18.6 ns 启动一项事务，每秒最多启动约 5400 万项，256 B 事务只能提供约 13.7 GB/s，比 128 个槽位给出的 16.4 GB/s 还低。即使增加到 391 个槽位，请求处理单元也来不及按这个速度提交请求。将路径带宽、在途请求数与启动速率三项约束合并，得到

$$
B_{\mathrm{eff}}\le
\min\left(B_{\mathrm{path}},\frac{Nm}{T},\frac{m}{\delta}\right),
$$

![槽位与请求发起速率分别限制吞吐](asset:aib-ch07-figure-7-window-rate)

*图 7-26：蓝线只考虑链路和槽位，橙线再加入每 18.6 ns 发起一次请求的约束。增加槽位使蓝线升高，橙线仍受约 13.7 GB/s 的提交速率限制。*

其中，$T$ 是一项请求占用槽位的时间，$\delta$ 是连续两项请求之间的最短启动间隔。前者决定槽位多久可以复用，后者决定每秒最多能发起多少请求。图 7-26 对比了只考虑槽位与再加上发起速率约束时的有效带宽。[^ai-servers-network-07-window]

**讨论：远程读取需要多少并发才能达到 50 GB/s？** 保持 256 B 事务，启动间隔需缩至 $256/(50\times10^9)=5.12$ ns，比下文 UB 实现的 6.2 ns 还短，并至少维持 391 项在途工作。另一条路是合并相邻访问：每次传输改为 4 KiB 后，启动间隔只要不超过 82 ns 就能达到 50 GB/s，18.6 ns 的间隔对应约 220 GB/s，远超链路；在等待时间为 2 μs 时，只需 25 个槽位就能支持 50 GB/s。前者提高事务率，后者让每次请求传输更多数据，降低单位字节的提交开销。

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

[^ai-servers-network-07-window]: [远程读取窗口](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/results/remote-window-book.md)、[逐次等待](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/results/remote-window-source-wait.md)：路径 50 GB/s、每事务 256 B、槽位占用 2 μs。启动间隔 18.6 ns 与 6.2 ns 取自[UB 互联计算](https://github.com/bojieli/ai-infra-book/blob/58636943ba89f24b854f04f0f8f2fffe7b323829/calculations/results/ub-fabric-book.md)的请求速率一项（OpenURMA 工具链中 RoCE 可靠连接每项请求 6 个周期、UB 每项 2 个周期，时钟 322 MHz）。公式中的请求等待与服务启动间隔分别定义。
<!-- AI-INFRA-END -->

## 练习与解题提示

1. `192.0.2.130/25` 的网络地址与传统广播地址是什么？
2. 回环访问成功，局域网访问失败，优先排查哪些层？
3. 1 Gbit/s、20 ms RTT 的 BDP 是多少 MB？这里使用十进制单位。

**提示与答案：** 1. 网络 `.128`，广播 `.255`。2. 监听地址、主机防火墙、接口与路径；不先重写应用业务逻辑。3. $10^9\times0.02/8=2.5\times10^6$ 字节，即 2.5 MB。

## 小结与参考

先建立路径，再建立信任，最后验证应用。不要让一次连接测试承担它无法支持的结论。

- [OpenSSH Manual Pages](https://www.openssh.com/manual.html)，ssh、ssh_config、sshd_config。
- [RFC 9293: Transmission Control Protocol](https://www.rfc-editor.org/rfc/rfc9293.html)。
- [RFC 5737: IPv4 Address Blocks Reserved for Documentation](https://www.rfc-editor.org/rfc/rfc5737.html)。
