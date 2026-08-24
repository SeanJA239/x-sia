import { ScrollViewStyleReset } from 'expo-router/html'
import type { ReactNode } from 'react'

// 该文件仅用于 web 静态渲染，配置每个页面的根 HTML。
// 函数体只在 Node.js 环境执行（构建期），访问不到 DOM / 浏览器 API。
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600;700&family=Archivo:wght@700;800&family=Noto+Sans+SC:wght@400;500;700&display=swap"
          rel="stylesheet"
        />

        {/* 关闭 web 上的 body 滚动，让 ScrollView 行为更接近原生。 */}
        <ScrollViewStyleReset />

        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 静态编译期样式字符串，非用户输入；Expo Router 官方 +html.tsx 注入全局样式的标准写法 */}
        <style dangerouslySetInnerHTML={{ __html: baseStyle }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

const baseStyle = `
html, body, #root {
  background-color: #F5F5F6;
}
`
