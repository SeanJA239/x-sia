import { watch } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, root } from './build.mjs'

const types = {
  '.pdf': 'application/pdf',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
}
export function createServer(directory = path.join(root, 'dist')) {
  // Keep the DNS-rebinding guard even when explicitly binding to 0.0.0.0.
  const allowedHosts = new Set(
    (process.env.BOOKS_ALLOWED_HOSTS ?? 'localhost,127.0.0.1,[::1]')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  )
  if (!allowedHosts.size || allowedHosts.has('*'))
    throw new Error('BOOKS_ALLOWED_HOSTS requires explicit hostnames, not a wildcard')
  return http.createServer(async (req, res) => {
    const headers = {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    }
    const finish = (status, body) => {
      res.writeHead(status, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(req.method === 'HEAD' ? '' : body)
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD')
      finish(405, 'Method not allowed')
      return
    }
    try {
      const host = new URL(`http://${req.headers.host}`).hostname
      if (!allowedHosts.has(host)) {
        finish(403, 'Preview host not allowed')
        return
      }
      const decoded = decodeURIComponent((req.url ?? '/').split('?')[0])
      if (
        decoded.includes('\\') ||
        decoded.includes('\0') ||
        decoded.split('/').some((s) => s === '.' || s === '..')
      ) {
        finish(400, 'Invalid path')
        return
      }
      if (decoded === '/' || decoded === '/books') {
        res.writeHead(308, { ...headers, Location: '/books/' })
        res.end()
        return
      }
      const relative = decoded.startsWith('/books/') ? decoded.slice(7) : decoded.slice(1)
      const filename = path.resolve(directory, relative || 'index.html')
      const boundary = path.resolve(directory) + path.sep
      if (!filename.startsWith(boundary)) {
        finish(403, 'Outside book output')
        return
      }
      const ext = path.extname(filename)
      if (!types[ext]) {
        finish(404, 'Not found')
        return
      }
      const info = await stat(filename)
      if (!info.isFile()) {
        finish(404, 'Not found')
        return
      }
      const body = await readFile(filename)
      res.writeHead(200, { ...headers, 'Content-Type': types[ext], 'Content-Length': body.length })
      res.end(req.method === 'HEAD' ? undefined : body)
    } catch (error) {
      finish(error instanceof URIError ? 400 : 404, 'Book resource unavailable')
    }
  })
}
async function start() {
  const host = process.env.BOOKS_HOST ?? '127.0.0.1'
  const port = Number(process.env.BOOKS_PORT ?? 8083)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid BOOKS_PORT')
  await build()
  const server = createServer()
  server.on('error', (error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  server.listen(port, host, () => console.log('Books preview ready: /books/'))
  const watchers = []
  if (process.argv.includes('--watch')) {
    let timer,
      busy = false,
      pending = false
    const rebuild = async () => {
      if (busy) {
        pending = true
        return
      }
      busy = true
      try {
        await build()
      } catch (error) {
        console.error('Book rebuild failed:', error.message)
      } finally {
        busy = false
        if (pending) {
          pending = false
          void rebuild()
        }
      }
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(rebuild, 250)
    }
    watchers.push(watch(path.join(root, 'content'), { recursive: true }, schedule))
    for (const file of ['catalog.json', 'assets/book.css', 'assets/reader.js'])
      watchers.push(watch(path.join(root, file), schedule))
  }
  const shutdown = () => {
    for (const watcher of watchers) watcher.close()
    server.close(() => process.exit(0))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await start()
