# 服务生命周期与 HTTP

> 先修：[网络与 SSH](book:servers/network)、Linux 进程。目标：理解启动、就绪、请求处理和退出的不同状态。systemd 示例仅供使用 systemd 的 Linux 用户会话，不适用于默认没有 systemd 的所有容器。

## 2.1 服务不是一个后台命令

手动运行程序后，Shell 能告诉你它是否返回，但不能自动保证它在登录退出后继续存在、异常后重启或日志可追踪。服务管理器把进程纳入生命周期：依赖准备、启动、监督、停止与资源回收。

![图 2-1：启动请求、进程存在、就绪检查和业务请求成功是逐层加强的证据；停止过程先停止接收，再排空并退出。](asset:servers-services)

需要分清三种检查：**存活**询问进程是否还在工作；**就绪**询问它是否应接受新流量；**业务检查**验证一次实际操作能否得到正确结果。数据库还没连接成功时，进程可能存活但未就绪；一个始终返回 200 的健康端点，也可能掩盖主业务失败。

## 2.2 用 systemd 声明服务契约

下面是用户级教学服务模板。它要求 `%h/engineering-http` 已存在且只含非敏感测试文件；Python 路径需按本机确认。**没有在本书构建时安装或启动这个服务。**

```ini
[Unit]
Description=Loopback-only teaching HTTP service

[Service]
Type=exec
WorkingDirectory=%h/engineering-http
ExecStart=/usr/bin/python3 -m http.server 8000 --bind 127.0.0.1
Restart=on-failure
RestartSec=3
NoNewPrivileges=yes

[Install]
WantedBy=default.target
```

`Type=exec` 让管理器至少等到执行程序的系统调用成功，但不表示 Python 已经监听或业务已就绪。`Restart=on-failure` 有利于恢复暂时故障，却不能修复错误配置；无限快速重启还会放大资源消耗，因此需要重启间隔、启动速率限制和告警。

把文件保存到用户的 unit 目录并加载属于明确的系统配置变更，应先核对路径。只读检查包括：

```bash
systemctl --user status teaching-http.service
journalctl --user -u teaching-http.service -n 50 --no-pager
```

Python `http.server` 仅用于受控教学，不是生产静态服务器，更不应在存有私钥的目录对公网启动。

## 2.3 HTTP：传输成功之后的应用协议

HTTP 请求包括方法、目标、首部及可能的正文。响应包括状态码、首部和正文。GET、POST 等方法表达语义，而不仅是字符串。HTTP 状态码描述的是该次应用协议交互，不能直接替代数据库事务或业务规则的判定。

| 类别 | 常见例子 | 解读边界 |
|---|---|---|
| 2xx | 200、201、204 | 依 API 契约解释结果，不只看数字 |
| 3xx | 301、302、308 | 可能需要跟随重定向；方法保留规则不同 |
| 4xx | 400、401、403、404、409 | 可能是参数、身份、权限或版本冲突 |
| 5xx | 500、502、503、504 | 区分应用失败、上游错误与超时 |

对未知远程服务盲目重试 POST，可能重复扣费或创建对象。要安全重试，需要幂等设计、幂等键或能确认原请求结果的机制。

## 2.4 反向代理改变了请求路径

反向代理面对客户端，再请求后端。它可以终止 TLS、做路径转发、限制请求体并记录访问，但也引入了新的超时、缓冲和身份传递边界。

如果 `/wiki/` 指向一个服务，`/api/` 指向另一个服务，路径前缀是否保留必须由代理与后端共同约定。一个 502 可能只是对应端口没有监听，并不证明数据库损坏。应用绝对路径和静态资源前缀不一致，也会导致 HTML 能显示而 CSS 或图片 404。

`X-Forwarded-For` 之类首部不能无条件信任，因为客户端也可以发送。应用只能按配置相信受控代理提供的转发信息，代理应覆盖或规范化不可信输入。

## 2.5 超时预算与优雅退出

设客户端总预算为 $T_c$，代理与应用内部还要经历排队、连接和处理：

$$
T_{\text{request}}=T_{\text{queue}}+T_{\text{connect}}+T_{\text{work}}+T_{\text{transfer}}.
$$

这是单一路径的简化分解，阶段可能重叠。若客户端 5 秒后放弃，而应用会继续工作 60 秒，超时并未取消实际消耗。理想设计应把截止时间向下传递，并为清理保留余量。简单地把所有超时调得更长，会让队列更容易堆积。

优雅退出通常先让实例不再接收新流量，等待有限时间内的在途请求完成，再释放资源并退出。不能保证无限等待，也不能把长连接永久留住。部署策略必须说明超过宽限期的请求如何处理。

## 2.6 例题：管理器显示 active，网页仍返回 502

沿链路逐层检查：服务实际监听了哪个地址和端口；代理配置指向何处；是否使用了错误的 HTTP/HTTPS 上游协议；就绪检查是否只是进程存在；日志中是否出现启动后退出。

不要立即重启所有服务。先记录监听、服务状态、代理错误与时间对应关系，避免通过重启销毁故障现场。资源图和进程列表只能给线索，最终仍需一条正确的请求响应作为应用层证据。

## 练习与解题提示

1. 为什么 `Type=exec` 不能证明应用已经能够处理请求？
2. GET 超时可以重试，是否意味着所有 POST 都能同样重试？
3. 一个请求排队 1.2 秒、连接 0.1 秒、处理 0.6 秒、传输 0.1 秒，若顺序执行，总耗时多少？优化 CPU 计算能否直接消除排队？

**提示与答案：** 1. exec 成功在监听、依赖初始化之前。2. 不能；需按业务幂等性设计。3. 2 秒；不能直接保证，排队取决于流量与整个服务能力。

## 小结与参考

服务管理关注生命周期，HTTP 关注交互语义，代理关注转发边界。三者必须协同，不能用单一的 active 标记代替最终功能检查。

- systemd：[systemd.service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)、[systemd.exec](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)。
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)。
- Python：[http.server security considerations](https://docs.python.org/3/library/http.server.html#security-considerations)。
