import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { AppError } from './lib/errors'
import { requestContext } from './middleware/context'
import { adminRoutes } from './routes/admin'
import { aiRoutes } from './routes/ai'
import { authRoutes } from './routes/auth'
import { entitlementRoutes } from './routes/entitlements'
import { publicRoutes } from './routes/public'
import { resourceRoutes } from './routes/resources'
import type { AppEnv } from './types'

const localOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

const app = new Hono<AppEnv>()

app.use(
  '*',
  cors({
    origin: (origin) => (origin && localOriginPattern.test(origin) ? origin : undefined),
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
)

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status)
  }
  if (err instanceof SyntaxError) {
    return c.json({ error: { code: 'bad_request', message: '请求体不是合法 JSON' } }, 400)
  }
  console.error(err)
  return c.json({ error: { code: 'internal_error', message: '服务器内部错误' } }, 500)
})

const api = new Hono<AppEnv>()
api.use('*', requestContext)
api.route('/', authRoutes)
api.route('/', adminRoutes)
api.route('/', entitlementRoutes)
api.route('/', aiRoutes)
api.route('/', resourceRoutes)
api.route('/', publicRoutes)

app.route('/api/v1', api)

export default app
