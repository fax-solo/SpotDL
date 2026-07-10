import type { PagesFunction } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
  JWT_SECRET: string
  ADMIN_USERNAME: string
  ADMIN_PASSWORD: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  ALLOWED_ORIGINS?: string
}

export type RouteHandler = PagesFunction<Env>

export { json, error } from './response'
export { sha256, uuid } from './crypto'
export { validate } from './validation'
export {
  createToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  getUser,
  requireUser,
  requireAdmin,
  formatUser,
} from './auth'
