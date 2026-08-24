import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** 统一错误载体：`{ error: { code, message } }`，HTTP 状态语义化。 */
export class AppError extends Error {
  readonly status: ContentfulStatusCode
  readonly code: string

  constructor(status: ContentfulStatusCode, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const Errors = {
  unauthorized: (message = '未登录或登录已过期') => new AppError(401, 'unauthorized', message),
  forbidden: (message = '无权限执行此操作') => new AppError(403, 'forbidden', message),
  notFound: (message = '资源不存在') => new AppError(404, 'not_found', message),
  conflict: (code: string, message: string) => new AppError(409, code, message),
  badRequest: (message: string) => new AppError(400, 'bad_request', message),
  quotaExceeded: (message = '今日 AI 额度已用完') => new AppError(429, 'quota_exceeded', message),
  circuitOpen: (message = '全站 AI 用量已触发熔断，请稍后再试') =>
    new AppError(503, 'circuit_open', message),
}
