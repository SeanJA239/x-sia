import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'
import { appName, gitConfig } from './shared'

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="font-brand text-[15px] tracking-tight text-fd-foreground">{appName}</span>
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    // Dark theme is out of scope for this site (docs/decisions.md) — the
    // toggle is hidden rather than left dead since RootProvider's theme
    // context is also disabled in root.tsx.
    themeSwitch: { enabled: false },
    links: [
      {
        type: 'main',
        text: '文档',
        url: '/docs',
        active: 'nested-url',
      },
      {
        type: 'main',
        text: 'Blog',
        url: '/blog',
        active: 'nested-url',
      },
    ],
  }
}
