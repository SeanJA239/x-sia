import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import test from 'node:test'
import { validateRelease } from './release.mjs'
import { root } from './workflow.mjs'

const read = (file) => readFile(path.join(root, file), 'utf8')
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const close = (server) => new Promise((resolve) => server.close(resolve))
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('gateway forwards HTTP and WebSocket paths to configured origins without stripping prefixes', async (t) => {
  const upstreams = {}
  for (const name of ['API', 'APP', 'WIKI', 'BOOKS']) {
    const server = http.createServer((req, res) => {
      res.end(JSON.stringify({ name, path: req.url, host: req.headers.host }))
    })
    server.on('upgrade', (req, socket) => {
      socket.end(
        `HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n${name}:${req.url}`,
      )
    })
    await listen(server)
    upstreams[name] = server
    t.after(() => close(server))
  }
  const reservation = http.createServer()
  await listen(reservation)
  const port = reservation.address().port
  await close(reservation)
  const env = { PATH: process.env.PATH, GATEWAY_HOST: '127.0.0.1', GATEWAY_PORT: String(port) }
  for (const [name, server] of Object.entries(upstreams))
    env[`GATEWAY_${name}_ORIGIN`] = `http://127.0.0.1:${server.address().port}`
  const child = spawn(process.execPath, ['scripts/dev-gateway.mjs'], {
    cwd: root,
    env,
    stdio: 'pipe',
  })
  const stopped = new Promise((resolve) => child.on('exit', resolve))
  let logs = ''
  child.stdout.on('data', (data) => {
    logs += data
  })
  child.stderr.on('data', (data) => {
    logs += data
  })
  t.after(async () => {
    child.kill()
    await stopped
  })
  const origin = `http://127.0.0.1:${port}`
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) assert.fail('Gateway exited before readiness')
    try {
      await fetch(origin)
      ready = true
      break
    } catch {
      await delay(20)
    }
  }
  assert.ok(ready)
  for (const [route, expected] of [
    ['/api/v1', 'API'],
    ['/api/v1/wiki/articles?q=1', 'API'],
    ['/wiki/learn/math/linear', 'WIKI'],
    ['/books/index.html', 'BOOKS'],
    ['/u/arbitrary-id', 'APP'],
    ['/api/v10', 'APP'],
    ['/wikimedia', 'APP'],
  ]) {
    const result = await (await fetch(`${origin}${route}`)).json()
    assert.deepEqual(result, { name: expected, path: route, host: `127.0.0.1:${port}` })
  }
  const redirect = await fetch(`${origin}/wiki?test=1`, { redirect: 'manual' })
  assert.equal(redirect.status, 308)
  assert.equal(redirect.headers.get('location'), '/wiki/?test=1')
  for (const route of ['/wiki/?hmr=1', '/hot?platform=web']) {
    const response = await new Promise((resolve, reject) => {
      let data = ''
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write(
          `GET ${route} HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`,
        )
      })
      socket.setTimeout(3000, () => socket.destroy(new Error('Upgrade timeout')))
      socket.on('data', (chunk) => {
        data += chunk
      })
      socket.on('error', reject)
      socket.on('close', () => resolve(data))
    })
    assert.match(response, /101 Switching Protocols/)
    assert.ok(response.endsWith(`${route.startsWith('/wiki/') ? 'WIKI' : 'APP'}:${route}`))
  }
  upstreams.API.closeAllConnections()
  await close(upstreams.API)
  assert.equal((await fetch(`${origin}/api/v1/private?not-for-logs=1`)).status, 502)
  assert.ok(!logs.includes('not-for-logs'))
  assert.ok(!logs.includes('hmr=1'))
})

test('invalid gateway origins fail without echoing configuration', () => {
  for (const value of [
    'https://upstream',
    'http://user:synthetic-password@localhost',
    'http://localhost/path',
  ]) {
    const result = spawnSync(process.execPath, ['scripts/dev-gateway.mjs'], {
      cwd: root,
      env: { PATH: process.env.PATH, GATEWAY_API_ORIGIN: value },
      encoding: 'utf8',
    })
    assert.notEqual(result.status, 0)
    assert.ok(!result.stderr.includes('synthetic-password'))
  }
})

const validRelease = {
  DEPLOY_ENV: 'production',
  CLOUDFLARE_ACCOUNT_ID: '1'.repeat(32),
  CLOUDFLARE_DATABASE_ID: '11111111-1111-4111-8111-111111111111',
  CLOUDFLARE_DATABASE_NAME: 'x-sia-db',
  CLOUDFLARE_R2_BUCKET: 'x-sia-res',
  CLOUDFLARE_WORKER_NAME: 'x-sia-api-production',
  API_ORIGIN: 'https://api.x-sia.org',
  SIGN_SECRET_PROVISIONED: 'production',
  MIGRATIONS_REVIEWED: 'production',
  ...Object.fromEntries(
    ['PORTAL_IMAGE', 'WIKI_IMAGE', 'SITE_IMAGE'].map((key) => [
      key,
      `registry.x-sia.org/app@sha256:${'a'.repeat(64)}`,
    ]),
  ),
}
test('release validation fails closed; production command always refuses', () => {
  assert.doesNotThrow(() => validateRelease(validRelease))
  for (const key of Object.keys(validRelease)) {
    assert.throws(() => validateRelease({ ...validRelease, [key]: '' }))
    assert.throws(() => validateRelease({ ...validRelease, [key]: 'TODO' }))
  }
  for (const origin of [
    'http://api:8788',
    'https://127.0.0.1',
    'https://api.example',
    'https://user:pass@api.x-sia.org',
    'https://api.x-sia.org/path',
  ])
    assert.throws(() => validateRelease({ ...validRelease, API_ORIGIN: origin }))
  const result = spawnSync(process.execPath, ['scripts/release.mjs', 'production'], {
    cwd: root,
    env: { PATH: process.env.PATH, ...validRelease },
    encoding: 'utf8',
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /deployment is disabled/)
})

test('static deployment invariants: same origin, independent SSR, no production API simulation', async () => {
  const caddy = await read('docker/Caddyfile')
  assert.match(caddy, /@wiki_bare path \/wiki/)
  assert.match(caddy, /redir \/wiki\/ 308/)
  assert.match(caddy, /@wiki path \/wiki\/\*/)
  assert.doesNotMatch(caddy, /^\s*handle_path/m)
  assert.match(caddy, /header_up Host \{upstream_hostport\}/)
  assert.match(caddy, /try_files \{path\} \/index.html/)
  const production = await read('compose.production.yaml')
  assert.doesNotMatch(production, /^ {2}(api|books|gateway):/m)
  assert.doesNotMatch(production, /build:|wrangler_state/)
  assert.match(production, /127\.0\.0\.1:8787:8080/)
  const dockerfile = await read('Dockerfile')
  assert.match(dockerfile, /EXPO_PUBLIC_API_URL=""/)
  assert.match(dockerfile, /--offline --filter wiki deploy --prod/)
  assert.match(dockerfile, /--offline --filter site deploy --prod/)
  assert.doesNotMatch(dockerfile, /deploy --legacy/)
  assert.match(dockerfile, /USER node/)
  assert.match(dockerfile, /USER 10001:10001/)
  assert.match(await read('pnpm-workspace.yaml'), /injectWorkspacePackages: true/)
  assert.match(await read('apps/wiki/react-router.config.ts'), /basename: '\/wiki\/'/)
  const app = JSON.parse(await read('apps/app/app.json'))
  assert.equal(app.expo.web.output, 'single')
  const config = JSON.parse(await read('docker/wrangler.production.example.json'))
  assert.equal(config.env.production.d1_databases[0].database_id, 'REQUIRED_DATABASE_ID')
  assert.ok(!JSON.stringify(config).includes('SIGN_SECRET'))
})
