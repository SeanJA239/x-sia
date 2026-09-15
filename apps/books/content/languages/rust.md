# Rust：从 Cargo 到所有权与借用

> 先修：变量、函数、数组的基本概念；无需先掌握 C++。环境：Rust stable、Cargo；示例使用稳定语言特性。本章目标：建立项目，解释所有权转移、借用和 Result，并把编译错误看成接口约束的反馈。

## 6.1 从项目而不是零散编译选项开始

Cargo 管理项目、依赖、构建和测试。下面在新目录建立项目；不要在已有目录中随意覆盖文件。

```bash
cargo new greeting
cd greeting
cargo run
cargo test
```

src/main.rs 是二进制程序入口，Cargo.toml 描述包和依赖，Cargo.lock 记录解析结果。Rust 的编译阶段检查很多类型与借用规则，但编译通过不证明业务逻辑、数值算法或所有外部交互正确。

```rust
fn main() {
    let name = "Rust";
    println!("Hello, {name}!");
}
```

let 默认建立不可变绑定；需要修改绑定时使用 mut。宏调用的感叹号表示它不是普通函数调用。分号会影响表达式是否产生作为块结果的值，学习函数时应留意返回位置。

## 6.2 String 拥有什么？

String 是拥有 UTF-8 文本缓冲的类型；&str 常用来借用一段有效 UTF-8 文本。二者不同，不能只因为都显示文字就忽略分配与寿命。

![Rust 官方教材图 4-1：String 的栈上元数据包含指针、长度和容量，指向堆中的字符数据。原图未修改，MIT 许可，作者 The Rust Project Developers。](asset:rust-string-layout)

图来自 Rust 官方教材，不是本项目伪造的“运行截图”。它帮助理解典型 String 的抽象组成；不要把图中的字段顺序当成稳定的跨语言 ABI 布局。

字符串长度 len() 计算 UTF-8 字节数，不等于屏幕上的字符数。对于每个 Unicode 标量值，UTF-8 编码使用 1–4 个字节，因此一般只能用 $N_{bytes}\geq N_{scalars}$ 作粗略比较；用户感知的字素簇又是另一层概念。

## 6.3 移动为什么使旧绑定失效？

```rust
let first = String::from("hello");
let second = first;
println!("{second}");
// println!("{first}"); // 编译错误：所有权已经移动。
```

Rust 不允许两个普通 String 所有者都以为自己负责释放同一缓冲。赋值把所有权移给 second，first 不再可按原对象使用；并非在运行时把 first 的每个字节都神奇地清零。

![Rust 官方教材图 4-2：复制栈上指针元数据会让两个名字指向同一堆缓冲；Rust 的移动规则要求旧所有者不再使用它，避免双重释放。原图未修改，MIT 许可。](asset:rust-string-move)

这个图展示的是为什么仅复制指针会形成所有权问题，不应把图中两份元数据都解释为同时有效的独立 String 所有者。Copy 类型如许多整数有不同语义，赋值可复制值而不使旧变量失效。

## 6.4 clone 是显式的独立值复制

```rust
let first = String::from("hello");
let second = first.clone();
println!("{first} {second}");
```

![Rust 官方教材图 4-4：String 的 clone 建立独立堆分配，两个所有者分别拥有自己的文本数据。原图未修改，MIT 许可。](asset:rust-string-clone)

对于 String，clone 会复制文本缓冲，而不是只复制元数据。其他类型的 Clone 行为由类型实现决定，例如引用计数类型可以增加计数并共享底层对象。因此不能把所有 clone 都一概称为完整深拷贝。

不应为了消除借用错误就到处 clone。先判断真正需要的是借用、修改、转移还是复制；不必要的复制会模糊接口并增加成本。

## 6.5 借用允许使用而不转移所有权

```rust
fn byte_len(text: &str) -> usize {
    text.len()
}

fn main() {
    let message = String::from("hello");
    let size = byte_len(&message);
    println!("{message}: {size}");
}
```

这里函数借用文本，不负责释放原 String。Rust 对共享引用与可变引用施加规则，以阻止许多无同步别名修改和悬空访问。常见直觉是某一相关使用范围内允许多个共享借用，或一个独占可变借用；实际检查还与非词法生命周期等规则有关，不能只按花括号机械判断。

生命周期标注描述引用之间必须满足的有效期关系，并不让原对象多活一段时间。返回局部 String 的切片仍不合法，增加一个任意 `'a` 名字不会修复对象已经销毁的问题。

## 6.6 Option、Result 与可处理失败

Option 表示可能没有值，Result 表示成功或带原因的失败。它们把分支写进类型，使调用者需要有意识地处理，而不只通过约定猜一个特殊数字。

```rust
fn parse_count(text: &str) -> Result<u32, std::num::ParseIntError> {
    text.parse::<u32>()
}

fn main() {
    match parse_count("12") {
        Ok(count) => println!("count={count}"),
        Err(error) => eprintln!("invalid count: {error}"),
    }
}
```

`?` 可在合适的返回类型上下文传播失败；unwrap 在失败时 panic，不应被当作所有外部输入的默认处理方案。Rust 的内存安全不消除死锁、资源泄漏、逻辑错误、拒绝服务或 unsafe 边界错误。

后续依次学习枚举和模式匹配、trait、泛型、迭代器、模块、测试、智能指针、并发与异步，最后结合 FFI 和工具链分析实际工程边界。

## 练习与解题提示

1. String 赋值后的旧变量为何不能继续使用，而整数赋值通常可以？
2. `"你好".len()` 为何通常为 6 而不是 2？
3. 给函数加生命周期参数，能否安全返回局部 String 的引用？

**提示与答案：** 1. 所有权移动与 Copy 语义不同。2. len 计 UTF-8 字节，两个汉字各占三个字节。3. 不能，标注只描述关系，不延长局部对象寿命。

## 小结与参考

所有权不是为了刁难程序员，而是让资源与别名约束进入接口。先理解错误暴露的不变量，再选择适当类型。

- [The Rust Programming Language](https://doc.rust-lang.org/book/)：官方主线教材，重点对照第 4 章所有权和第 10 章生命周期。
- [Rust 程序设计语言中文版](https://kaisery.github.io/trpl-zh-cn/)：中文译本，遇到版本差异以当前官方文档为准。
- [Rust 语言圣经项目仓库](https://github.com/sunface/rust-course)：中文系统路线与练习，可与官方规则交叉阅读。原独立站本轮访问返回 404，改用项目仓库入口。
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/)：用短例子核对语法与行为。
- [三幅原图所在页面](https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html)：图 4-1、4-2、4-4。
- 原图固定源版本：`1500248d8f230566e4ec9f27fcbb8fe9e2898ab1`。本地来源清单与完整许可在 `assets/third-party/rust/`，原图按下列 MIT 许可转载，未修改。

### 原图版权与许可

Copyright (c) 2010 The Rust Project Developers

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
