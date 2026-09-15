# Web：HTML、CSS 与 JavaScript 的协作

> 先修：会创建文件、使用浏览器；无需先学服务器框架。环境：现代浏览器，示例只在本地运行。目标：做出结构清楚、可操作且不执行用户输入的小页面，并解释 DOM、样式和事件如何配合。

## 5.1 三种职责，不是三种页面模板

HTML 表达文档结构与语义；CSS 控制呈现与布局；JavaScript 处理行为和状态。浏览器把它们放进同一个运行环境，但三者解决的问题不同。

按钮应优先使用 button 元素，而不是用 div 模拟；标题应表达内容层级，而不是仅为了字号选择 h1。正确语义同时服务键盘用户、辅助技术、搜索与维护者。

![图 5-1：HTML 形成 DOM，CSS 提供样式与布局约束，JavaScript 通过事件更新状态；最终页面还经过布局和绘制。](asset:languages-web)

## 5.2 一个完整的最小页面

将三个文件放在同一目录。HTML 是浏览器进入页面的起点，外部样式与脚本通过相对 URL 引入。

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>问候练习</title>
  <link rel="stylesheet" href="style.css">
  <script src="app.js" defer></script>
</head>
<body>
  <main>
    <h1>问候练习</h1>
    <form id="greeting-form">
      <label for="name">你的名字</label>
      <input id="name" name="name" maxlength="40" required>
      <button type="submit">生成问候</button>
    </form>
    <p id="result" role="status"></p>
  </main>
</body>
</html>
```

`lang` 声明主要语言，charset 说明编码，viewport 让移动设备使用合理布局视口。label 的 for 对应输入的 id，帮助用户和辅助技术理解输入目的。defer 使脚本在文档解析完成后执行，同时不必把脚本随意插在任意位置。

## 5.3 CSS 的层叠与盒模型

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; line-height: 1.7; }
main { max-width: 42rem; margin: 3rem auto; padding: 0 1rem; }
form { display: grid; gap: .75rem; }
input, button { font: inherit; padding: .7rem; }
button { cursor: pointer; }
:focus-visible { outline: 3px solid #245a9d; outline-offset: 3px; }
```

在 content-box 模型下，盒子外部宽度通常由内容宽度、左右 padding、border 和 margin 共同组成。若设置 border-box，声明宽度包含 padding 与 border，但 margin 仍在外部。简化关系可写为 $W_{outer}=W_{border-box}+M_L+M_R$，实际布局还受容器和收缩规则影响。

CSS 冲突不是“写在最后一定获胜”。来源、重要性、层、选择器优先级与顺序共同参与层叠。不要用越来越多的 `!important` 掩盖对规则的误解；先检查浏览器计算样式。

## 5.4 JavaScript：事件驱动地更新状态

```javascript
const form = document.querySelector('#greeting-form');
const nameInput = document.querySelector('#name');
const result = document.querySelector('#result');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    result.textContent = '请输入名字。';
    return;
  }
  result.textContent = `你好，${name}！`;
});
```

查询得到 DOM 元素引用，事件监听器在提交事件到来时执行。preventDefault 阻止本例默认的表单导航；它不停止所有其他监听器。const 不等于对象内容不可修改，它主要限制绑定被重新赋值。

这里使用 textContent 展示输入，不把字符串解释为 HTML。若改成不受控的 innerHTML，就可能把用户输入变成标签或可执行内容。前端长度检查只改善体验；真正接入后端时，服务端仍需验证输入和权限。

## 5.5 异步、网络与错误

请求服务器需要处理等待与失败。Promise 表示未来的结果，async/await 使异步控制流更接近顺序写法，但不会把 CPU 密集计算自动变成后台线程。

fetch 遇到 HTTP 404 或 500 时通常仍返回响应对象；需要检查 response.ok 或状态码，不能只依赖 catch。网络超时、解析错误、业务错误和取消也应分开解释。

同源策略限制不同来源之间的浏览器读取。CORS 是服务器授权浏览器跨源读取的机制，不是身份认证，也不是阻止服务器间请求的网络防火墙。不要通过关闭浏览器安全功能解决开发配置问题。

## 5.6 从静态页面走向应用

接下来应分别系统学习 HTML 语义与表单、CSS 选择器和布局、JavaScript 类型和函数，再进入模块、网络、状态、测试与构建工具。先掌握浏览器原生模型，再学习 React 等框架，才容易区分语言、浏览器和框架各自的行为。

真实应用还需要路由、会话、安全边界与数据持久化。localStorage 的内容可被同源脚本读取，不适合无条件存放高价值秘密；使用它之前需要考虑 XSS 与威胁模型。

本地文件可以打开这个练习，但部分网络 API 在 file:// 下受到限制。后续可使用仅绑定回环的本地开发服务器，勿把存放私钥或个人文件的目录直接开放给外网。

## 练习与解题提示

1. 用户输入 `<img src=x>` 时，本例为什么只显示文字而不是图片？
2. 把 button 换成可点击 div，额外需要补哪些可访问行为？为什么通常不值得？
3. fetch 返回 500，是否一定进入 catch？

**提示与答案：** 1. textContent 不解释 HTML。2. 键盘、焦点、语义与禁用行为等，原生按钮已经提供很多正确行为。3. 不一定，需要检查响应状态。

## 小结与参考

从结构、样式与行为分工开始，用浏览器原生模型解释页面。安全与可访问性不是完成页面后的装饰步骤。

- [MDN 中文 Web 开发学习区](https://developer.mozilla.org/zh-CN/docs/Learn_web_development)：HTML、CSS、JavaScript 的完整入门顺序及练习。
- [MDN 英文学习区](https://developer.mozilla.org/en-US/docs/Learn_web_development)：中文翻译尚未跟进时可核对英文版本。
- [现代 JavaScript 教程](https://zh.javascript.info/)：中文系统讲解语言与浏览器；对应英文站 [javascript.info](https://javascript.info/)。
- [web.dev Learn](https://web.dev/learn)：深入 CSS、性能、可访问性与 Web 平台实践。
- [阮一峰 JavaScript 教程](https://wangdoc.com/javascript/)：中文语言基础参考，阅读时核对现代标准与浏览器差异。
