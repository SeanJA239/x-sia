// Loopback by default; opt in to container networking. Never log request data.
import http from 'node:http'
import net from 'node:net'

function origin(name, port) {
  const value = process.env[`GATEWAY_${name}_ORIGIN`] ?? `http://127.0.0.1:${port}`
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`Invalid GATEWAY_${name}_ORIGIN`)
  }
  if (
    url.protocol !== 'http:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(`GATEWAY_${name}_ORIGIN must be a plain HTTP origin without credentials`)
  return { hostname: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 80) }
}
const targets = {
  api: origin('API', 8788),
  app: origin('APP', 8081),
  wiki: origin('WIKI', 8082),
  books: origin('BOOKS', 8083),
}
const host = process.env.GATEWAY_HOST ?? '127.0.0.1'
const port = Number(process.env.GATEWAY_PORT ?? 8787)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid GATEWAY_PORT')
function target(url = '/') {
  const path = url.split('?')[0]
  if (path === '/api/v1' || path.startsWith('/api/v1/')) return targets.api
  if (path === '/wiki' || path.startsWith('/wiki/')) return targets.wiki
  if (path === '/books' || path.startsWith('/books/')) return targets.books
  return targets.app
}
const server = http.createServer((req, res) => {
  const barePrefix = ['/wiki', '/books'].find(
    (prefix) => req.url === prefix || req.url?.startsWith(`${prefix}?`),
  )
  if (barePrefix) {
    res.writeHead(308, {
      Location: `${barePrefix}/${req.url.slice(barePrefix.length)}`,
      'Cache-Control': 'no-store',
    })
    res.end()
    return
  }
  const upstream = http.request(
    {
      ...target(req.url),
      method: req.method,
      path: req.url,
      headers: req.headers,
    },
    (reply) => {
      res.writeHead(reply.statusCode ?? 502, reply.headers)
      reply.pipe(res)
      reply.on('error', () => res.destroy())
    },
  )
  upstream.on('error', () => {
    if (res.headersSent) {
      res.destroy()
      return
    }
    res.writeHead(502, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(
      JSON.stringify({
        error: {
          code: 'local_upstream_unavailable',
          message: '本地服务尚未启动或已退出，请检查 API / Wiki / Books / Expo 开发进程。',
        },
      }),
    )
  })
  req.on('aborted', () => upstream.destroy())
  res.on('close', () => {
    if (!res.writableEnded) upstream.destroy()
  })
  req.pipe(upstream)
})
server.on('upgrade', (req, socket, head) => {
  const destination = target(req.url)
  const upstream = net.connect(destination.port, destination.hostname, () => {
    const headers = []
    for (let i = 0; i < req.rawHeaders.length; i += 2)
      headers.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
    upstream.write(
      `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headers.join('\r\n')}\r\n\r\n`,
    )
    if (head.length) upstream.write(head)
    socket.pipe(upstream).pipe(socket)
  })
  upstream.on('error', () => socket.destroy())
  upstream.on('close', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
  socket.on('close', () => upstream.destroy())
})
server.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
server.listen(port, host, () => console.log('Local gateway ready | Wiki: /wiki/ | Books: /books/'))
