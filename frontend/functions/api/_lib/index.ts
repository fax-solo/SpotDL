export interface Env {
  DB: D1Database
  JWT_SECRET: string
  ADMIN_USERNAME: string
  ADMIN_PASSWORD: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  ALLOWED_ORIGINS?: string
  LASTFM_API_KEY?: string
}

export type RouteHandler = (context: {
  request: Request
  env: Env
  params: Record<string, string>
  data: Record<string, unknown>
}) => Response | Promise<Response>

export { json, error } from './response'
export { sha256, b64urlDecode, uuid } from './crypto'
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
