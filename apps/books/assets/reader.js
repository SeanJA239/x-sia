;(() => {
  document.body.classList.add('js')
  const theme = document.getElementById('theme')
  const print = document.getElementById('print')
  const nav = document.getElementById('nav-toggle')
  for (const button of [theme, print, nav]) if (button) button.hidden = false
  try {
    const saved = localStorage.getItem('x-sia:books-theme')
    if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved
  } catch {
    /* Offline file URLs and restricted storage still render the book. */
  }
  theme?.addEventListener('click', () => {
    const value = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = value
    try {
      localStorage.setItem('x-sia:books-theme', value)
    } catch {
      /* optional */
    }
  })
  print?.addEventListener('click', () => window.print())
  nav?.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open')
    nav.setAttribute('aria-expanded', String(open))
  })
  const chapterCount = document.body.dataset.chapters
  const input = document.getElementById('book-search')
  if (!input) return
  const status = document.getElementById('search-status')
  const results = document.getElementById('search-results')
  let index, request, timer
  async function getIndex() {
    if (index) return index
    if (!request)
      request = fetch(`${document.body.dataset.base}search-index.json`)
        .then((r) => {
          if (!r.ok) throw new Error('index unavailable')
          return r.json()
        })
        .then((data) => (index = data))
        .catch((error) => {
          request = null
          throw error
        })
    return request
  }
  function appendHighlight(parent, text, query) {
    const at = text.toLocaleLowerCase().indexOf(query)
    if (at < 0) {
      parent.textContent = text
      return
    }
    parent.append(document.createTextNode(text.slice(0, at)))
    const mark = document.createElement('mark')
    mark.textContent = text.slice(at, at + query.length)
    parent.append(mark, document.createTextNode(text.slice(at + query.length)))
  }
  async function search() {
    const query = input.value.trim().toLocaleLowerCase().slice(0, 100)
    results.replaceChildren()
    if (!query) {
      status.textContent = `输入关键词，在全部 ${chapterCount} 章正文中查找。`
      return
    }
    status.textContent = '正在检索…'
    try {
      const data = await getIndex()
      if (input.value.trim().toLocaleLowerCase().slice(0, 100) !== query) return
      const matches = data
        .filter((item) => `${item.title} ${item.text}`.toLocaleLowerCase().includes(query))
        .sort(
          (a, b) =>
            Number(b.title.toLocaleLowerCase().includes(query)) -
            Number(a.title.toLocaleLowerCase().includes(query)),
        )
      status.textContent = `找到 ${matches.length} 章；按标题匹配优先排列。`
      for (const item of matches) {
        const li = document.createElement('li'),
          a = document.createElement('a'),
          p = document.createElement('p')
        a.href = `${document.body.dataset.base}${item.url}`
        appendHighlight(a, `${item.volume} · ${item.title}`, query)
        const position = item.text.toLocaleLowerCase().indexOf(query)
        const start = Math.max(0, position - 45)
        const excerpt = `${start > 0 ? '…' : ''}${item.text.slice(start, start + 155)}…`
        appendHighlight(p, excerpt, query)
        li.append(a, p)
        results.append(li)
      }
    } catch {
      status.textContent =
        '全文索引暂不可读取。file:// 模式下请使用浏览器页内查找，或运行本地预览服务；所有章节仍可离线阅读。'
    }
  }
  input.addEventListener('input', () => {
    clearTimeout(timer)
    timer = setTimeout(search, 130)
  })
  status.textContent = `输入关键词，在全部 ${chapterCount} 章正文中查找。`
})()
