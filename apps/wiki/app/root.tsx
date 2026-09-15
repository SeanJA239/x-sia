import { type ReactNode, useEffect } from 'react'
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from 'react-router'
import './style.css'
import './curriculum.css'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <a className="skip-link" href="#main">
          跳转到正文
        </a>
        <header className="site-header">
          <a className="brand" href="/">
            X-SIA
          </a>
          <nav className="platform-nav" aria-label="平台导航">
            <a href="/">首页</a>
            <a href="/activities">活动</a>
            <a href="/card">卡片</a>
            <Link to="/" aria-current="page">
              Wiki
            </Link>
            <a href="/resources">资源</a>
            <a href="/profile">我的</a>
          </nav>
        </header>
        <nav className="wiki-subnav" aria-label="Wiki 导航">
          <span>知识手册</span>
          <Link to="/">知识总目</Link>
          <Link to="/paths">学习路线与参考</Link>
          <Link to="/manage">编辑工作台</Link>
        </nav>
        {children}
        <footer className="site-footer">
          X-SIA Wiki · 公开阅读，持续修订。内容授权以具体条目标注为准。
        </footer>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}
export default function Root() {
  useEffect(() => {
    document.documentElement.dataset.wikiHydrated = 'true'
    return () => {
      delete document.documentElement.dataset.wikiHydrated
    }
  }, [])
  return <Outlet />
}
export function ErrorBoundary() {
  const error = useRouteError()
  const status = isRouteErrorResponse(error) ? error.status : 500
  return (
    <main id="main" className="narrow">
      <p className="eyebrow">X-SIA WIKI / {status}</p>
      <h1>{status === 404 ? '条目不存在或尚未发布' : '暂时无法打开知识库'}</h1>
      <p>请确认本地后端正在运行，然后刷新重试。</p>
      <Link to="/">返回知识库首页</Link>
    </main>
  )
}
