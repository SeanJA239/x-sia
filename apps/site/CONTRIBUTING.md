# 给门面站投稿

X-SIA 的内容走双轨制:日常分享发在应用里的平台内发帖（默认轨);更完整、面向社团外部读者的文章走这里——门面站的 `blog/` 目录,通过 PR 投稿（精选轨)。背景见文档站的[投稿指南](https://x-sia.pages.dev/docs/contributing)（部署后替换为实际域名)。

这条轨面向所有社团成员开放,不限于干事。

## 怎么投稿

1. Fork 本仓库。
2. 在 `apps/site/content/blog/` 下新建一个 `.mdx` 文件,文件名即文章 slug（英文、小写、连字符分隔,例如 `why-i-joined-x-sia.mdx`)。
3. 按下面的表格填写 frontmatter。
4. 如果文章带图片,放进 `apps/site/public/blog/<slug>/`,在正文里用相对路径 `/blog/<slug>/xxx.png` 引用。
5. 提交 PR。

## Frontmatter 字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `title` | string | 是 | 文章标题 |
| `description` | string | 是 | 一句话摘要,用于列表页和 SEO |
| `author` | string | 是 | 作者署名,真实姓名或惯用昵称均可 |
| `date` | string（`YYYY-MM-DD`) | 是 | 发布日期 |

示例:

```yaml
---
title: 我为什么加入 X-SIA
description: 一篇关于加入社团这件事的碎碎念。
author: 张三
date: 2026-09-01
---
```

## PR 标题格式

```
blog(<slug>): <中文标题>
```

例如:`blog(why-i-joined-x-sia): 我为什么加入 X-SIA`

## 图片存放位置

图片放进 `apps/site/public/blog/<slug>/`,不要放进 `content/blog/` 或复用别的文章的图片目录。构建时 `public/` 下的内容会被原样发布,路径与线上路径一致。

## Review 与合并时限

PR 由干事负责 review（`CODEOWNERS` 占位,后续补充实际干事的 GitHub 用户名)。承诺 **提交后 7 天内** 给出回复——合并、要求修改,或说明不合适的原因。7 天内没有任何回复视为流程失误,可以在群里 @ 技术组催一下。

内容要求不苛刻,但请确保:

- 事实准确,不代表社团做官方承诺（涉及规则变更、财务等敏感内容请先在群里对齐)。
- 中文标点和排版遵循仓库约定:中文引号用「」,中英文/中文与数字之间加空格。
- 不侵犯他人版权,引用配图请注明来源。
