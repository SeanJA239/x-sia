const EXCERPT_LENGTH = 120

/** 粗糙地去掉常见 markdown 标记后截前 120 字符，仅用于列表摘要展示。 */
export function makeExcerpt(bodyMd: string): string {
  const plain = bodyMd
    .replace(/!\[[^\]]*]\([^)]*\)/g, '') // 图片
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1') // 链接取文字
    .replace(/^#{1,6}\s+/gm, '') // 标题
    .replace(/[*_~`>#-]/g, '') // 加粗/斜体/删除线/行内代码/引用/列表符号
    .replace(/\s+/g, ' ')
    .trim()
  return plain.slice(0, EXCERPT_LENGTH)
}
