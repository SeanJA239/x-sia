import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { ArrowRight, FolderOpen, IdCard, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { baseOptions } from '@/lib/layout.shared'
import { appDescription, appName } from '@/lib/shared'
import type { Route } from './+types/home'

export function meta(_: Route.MetaArgs) {
  return [
    { title: `${appName} — 身份、内容与权益一体的社团平台` },
    { name: 'description', content: appDescription },
  ]
}

const highlights = [
  {
    icon: IdCard,
    title: '会员卡与编号',
    description:
      '入社即分配社员编号（如 26001），级 + 顺序号,分配后终身不变。网页会员卡是身份的主形态,会随称号、出勤持续更新。',
  },
  {
    icon: Sparkles,
    title: 'AI 权益',
    description:
      '社团统一代理 AI 请求,成员不接触 API Key。每日额度由权益档位决定,「我的权益」页实时显示余量。',
  },
  {
    icon: FolderOpen,
    title: '资源共享',
    description:
      '往期资料、模板、活动素材集中存放,active 成员可下载。上传者归属可追溯,下载走短时效签名链接。',
  },
]

const joinSteps = [
  { step: '01', title: '注册', description: '用校内邮箱注册账号,创建当届会员资格记录。' },
  { step: '02', title: '现场核验', description: '带账号到社团现场,由干事人工核对身份。' },
  { step: '03', title: '缴费确认', description: '缴纳社费,干事在后台确认,状态推进为 active。' },
  { step: '04', title: '拿到编号', description: '状态变为 active 的一刻,系统分配你的社员编号。' },
]

export default function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="border-b border-fd-border">
          <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-28">
            <p className="font-mono text-xs tracking-wide text-fd-muted-foreground uppercase">
              学生社团 · 身份 + 内容 + 权益
            </p>
            <h1 className="mt-4 max-w-2xl text-3xl leading-tight font-semibold text-fd-foreground sm:text-4xl">
              把「你是谁」「你写了什么」「你能用什么」,放进同一个账号。
            </h1>
            <p className="mt-5 max-w-xl text-base text-fd-muted-foreground">
              {appName}{' '}
              是社团自有的身份、内容与权益平台。不是又一个论坛,也不是又一个网盘——是这三件事第一次被认真地做成一体。
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/docs/join"
                className="inline-flex items-center gap-1.5 rounded-lg bg-fd-primary px-4 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
              >
                阅读加入指南
                <ArrowRight className="size-4" />
              </Link>
              <Link
                to="/docs"
                className="inline-flex items-center gap-1.5 rounded-lg border border-fd-border bg-fd-card px-4 py-2.5 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
              >
                查看文档
              </Link>
              <span
                aria-disabled="true"
                title="应用入口即将开放"
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-dashed border-fd-border px-4 py-2.5 text-sm font-medium text-fd-muted-foreground"
              >
                进入应用 · 即将上线
              </span>
            </div>
          </div>
        </section>

        {/* Highlights */}
        <section className="border-b border-fd-border">
          <div className="mx-auto grid w-full max-w-5xl grid-cols-1 divide-y divide-fd-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {highlights.map(({ icon: Icon, title, description }) => (
              <div key={title} className="px-6 py-10 sm:px-8">
                <Icon className="size-5 text-fd-foreground" strokeWidth={1.75} />
                <h2 className="mt-4 text-base font-semibold text-fd-foreground">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How to join */}
        <section className="border-b border-fd-border">
          <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:px-8">
            <h2 className="text-lg font-semibold text-fd-foreground">如何加入</h2>
            <p className="mt-2 text-sm text-fd-muted-foreground">
              第一年不走线上支付、不发验证邮件——核心步骤都在现场,由干事人工核验。
            </p>
            <ol className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-4">
              {joinSteps.map(({ step, title, description }, i) => (
                <li key={step} className="relative pl-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-fd-muted-foreground">{step}</span>
                    <span className="h-px flex-1 bg-fd-border sm:hidden" />
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-fd-foreground">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-fd-muted-foreground">
                    {description}
                  </p>
                  {i < joinSteps.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute top-2 -right-4 hidden h-px w-8 bg-fd-border sm:block"
                    />
                  )}
                </li>
              ))}
            </ol>
            <Link
              to="/docs/join"
              className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-fd-info hover:underline"
            >
              完整加入指南
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </section>

        {/* CTA footer band */}
        <section>
          <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-4 px-6 py-16 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div>
              <h2 className="text-lg font-semibold text-fd-foreground">准备好了吗</h2>
              <p className="mt-1 text-sm text-fd-muted-foreground">
                文档和平台上线记都在这——从这里开始了解 {appName}。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/docs"
                className="inline-flex items-center gap-1.5 rounded-lg bg-fd-primary px-4 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
              >
                查看文档
              </Link>
              <Link
                to="/blog"
                className="inline-flex items-center gap-1.5 rounded-lg border border-fd-border bg-fd-card px-4 py-2.5 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
              >
                阅读 Blog
              </Link>
            </div>
          </div>
        </section>
      </main>
    </HomeLayout>
  )
}
