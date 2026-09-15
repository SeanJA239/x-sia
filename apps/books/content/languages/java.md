# Java：类型、对象与 JVM 执行

> 先修：会创建文本文件与使用终端。环境：JDK 21 或兼容更新版本；示例不使用预览特性。目标：从编译、类与方法理解 Java 程序，区分对象回收、资源释放与线程安全。

## 4.1 JDK、字节码与 JVM

JDK 包含编译器和开发工具；JVM 执行符合规范的字节码。源文件通常先由 javac 编译为 class 文件，再由 Java 启动器装载执行。现代 JVM 可能解释执行，也可能把热点代码即时编译成本机代码。

```java
public class Hello {
    public static void main(String[] args) {
        System.out.println("Hello, Java!");
    }
}
```

保存为 Hello.java，使用 `javac Hello.java` 编译，再执行 `java Hello`，这里不加 .class。公共顶层类的名称和源码文件名通常需要匹配。main 是这个传统启动形式的入口；static 表示无需先创建 Hello 对象即可调用。

![图 4-1：Java 源码编译为 class 字节码，经过类加载与验证进入 JVM，执行中可能被解释或即时编译。](asset:languages-java)

## 4.2 基本类型、引用与对象

int、long、double、boolean 等是基本类型；String、数组和自定义类属于引用类型。引用指向对象，但不应把它机械等同于能任意算术操作的 C 地址。

`==` 对引用比较是否指向同一对象；许多类型通过 equals 表达内容相等。字符串比较通常应使用合适的 equals，而不是依赖字符串常量池造成的偶然身份相同。

Java 的 int 是 32 位有符号整数，其算术溢出行为与标准 C 的有符号溢出规则不同。跨语言移植时必须核对语义，不能只保留外表相似的代码。

数组有运行时长度检查，越界访问抛出异常；这能阻止一类错误，不意味着程序逻辑、权限和资源用量自动正确。null 引用仍可能导致运行失败，应让可空性成为明确的接口约定。

## 4.3 方法与数据处理实例

```java
public class Statistics {
    static double mean(int[] values) {
        if (values == null || values.length == 0) {
            throw new IllegalArgumentException("non-empty array required");
        }
        double sum = 0.0;
        for (int value : values) {
            sum += value;
        }
        return sum / values.length;
    }

    public static void main(String[] args) {
        int[] samples = {2, 4, 9};
        System.out.println(mean(samples)); // 5.0
    }
}
```

增强 for 循环依次取元素。方法返回 double，不在内部负责打印，让调用者可以决定如何展示或继续计算。数学定义仍要求 $N>0$。本例用于小整数教学；大数据和数值分析需要更严格的求和方法。

Java 按值传递参数。对对象参数，传递的值是引用：在方法内修改对象内容可以被调用者观察，但把参数变量重新指向另一个对象不会重绑调用者的变量。这一规则可以解释很多“我在函数里赋值为何外面没变”的疑问。

## 4.4 类、不变量与集合

类不只是把变量包装起来。一个 BankAccount 的余额变化应经过合法操作，以维持业务不变量；直接公开可写字段会让任何调用者绕过检查。构造函数负责让对象从一开始处在合法状态。

集合应按需求选择：List 有顺序，Set 关注唯一性，Map 将键关联到值。泛型帮助表达元素类型；它不意味着运行时没有类型擦除，也不自动消除可变对象和并发问题。

重写 equals 时通常需要相应重写 hashCode。把可变字段参与哈希键计算后，再修改字段，可能破坏在散列表中查找该对象的预期。问题来自数据结构约束，而不是 JVM 丢失了对象。

## 4.5 垃圾回收不替代关闭文件

垃圾回收解决某些对象内存的回收，不保证文件描述符、连接、锁或线程会及时释放。应使用 try-with-resources 管理实现 AutoCloseable 的资源：

```java
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

// 在声明 throws IOException 或合适的异常处理上下文中使用。
// try (var reader = Files.newBufferedReader(Path.of("data.txt"), StandardCharsets.UTF_8)) {
//     System.out.println(reader.readLine());
// }
```

代码片段被注释以免误认为一个独立完整程序；后续 I/O 章节会提供可运行工具。设计时先规定谁负责关闭资源、异常如何传播，再选择具体语法。

GC 的暂停、吞吐与内存需求依实现、收集器、配置和负载而变。不能因为“有 GC”就假设不存在内存泄漏：被长期不必要引用的对象仍然无法回收。

## 4.6 从单线程走向工程项目

对象能被多个线程访问，并不意味着访问自动同步。volatile 解决特定可见性与顺序问题，不使 `counter++` 这种复合读改写普遍变成原子事务。锁、原子类与并发容器各自有适用范围。

虚拟线程降低部分阻塞并发的成本，不会创造 CPU 或数据库容量。大量并发访问外部服务时，仍需要限流、连接池和超时预算，参考[服务器容量](book:servers/capacity)。

工程学习应继续覆盖包与模块、异常设计、泛型、集合、测试、构建工具、JVM 观察和并发。框架只是后来的一层，不应在尚不理解方法调用和对象寿命时成为全部学习内容。

## 练习与解题提示

1. 一个方法把参数数组的第一个元素改为 10，调用者能否看到？把参数重绑为新数组呢？
2. 为什么“程序有垃圾回收”不能证明数据库连接一定会关闭？
3. 两个内容相同的 String，用 == 必然为 true 吗？

**提示与答案：** 1. 修改共享对象可见；重绑方法内的引用变量不改调用者的变量。2. 外部资源有独立生命周期，GC 不提供及时关闭保证。3. 不必然，应依据内容相等需求使用 equals。

## 小结与参考

理解编译与 JVM、引用与对象、GC 与资源三组边界，再进入框架与高并发开发。

- [dev.java Learn](https://dev.java/learn/)：官方学习入口，按语言基础、类、集合与工具组织。
- [Java Language Specification](https://docs.oracle.com/javase/specs/)：核对语言规则与版本，区别于具体 JVM 实现。
- [廖雪峰 Java 教程](https://www.liaoxuefeng.com/wiki/1252599548343744)：中文入门和应用路径；本页不转载其中图片。
- [OpenJDK](https://openjdk.org/)：跟踪实现、JEP 与版本信息，不把未来提案当成当前可用特性。
