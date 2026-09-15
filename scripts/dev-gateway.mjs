// Loopback-only development gateway. Never log request URLs, headers or bodies.
import http from 'node:http'
import net from 'node:net'

function targetPort(url = '/') {
  const path = url.split('?')[0]
  if (path === '/api/v1' || path.startsWith('/api/v1/')) return 8788
  if (path === '/wiki' || path.startsWith('/wiki/')) return 8082
  if (path === '/books' || path.startsWith('/books/')) return 8083
  return 8081
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
      hostname: '127.0.0.1',
      port: targetPort(req.url),
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
  const upstream = net.connect(targetPort(req.url), '127.0.0.1', () => {
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
server.listen(8787, '127.0.0.1', () =>
  console.log('Local gateway: http://localhost:8787 | Wiki: /wiki/ | Books: /books/'),
)
