// Server-only, public reads. Never forwards browser tokens, cookies or untrusted host headers.
export async function publicApi<T>(path: string): Promise<T> {
  const origin = process.env.WIKI_API_ORIGIN ?? 'http://127.0.0.1:8788'
  let response: Response
  try {
    response = await fetch(`${origin}/api/v1/wiki${path}`, { signal: AbortSignal.timeout(10000) })
  } catch {
    throw new Response('知识库后端暂时不可用，请稍后刷新。', { status: 503 })
  }
  if (!response.ok)
    throw new Response(response.status === 404 ? '条目不存在或尚未发布' : '知识库服务暂时不可用', {
      status: response.status,
    })
  return response.json() as Promise<T>
}
