import { z } from 'zod'

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const messages = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(messages)
  }
  return result.data
}

export const signupSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  display_name: z.string().max(100).optional(),
  username: z.string().max(100).optional(),
})

export const loginSchema = z.object({
  login: z.string().min(1, 'Login is required').max(255),
  password: z.string().min(1, 'Password is required').max(128),
})

const idTokenSchema = z.object({
  id_token: z.string().min(1),
})

const codeSchema = z.object({
  code: z.string().min(1),
  code_verifier: z.string().min(1),
  redirect_uri: z.string().min(1),
})

export const googleAuthSchema = z.union([
  idTokenSchema.extend({ display_name: z.string().max(100).optional() }),
  codeSchema.extend({ display_name: z.string().max(100).optional() }),
])

export const guestSchema = z.object({
  device_id: z.string().min(1, 'device_id is required').max(255),
})

export const updateProfileSchema = z.object({
  display_name: z.string().max(100).optional(),
})

export const addHistorySchema = z.object({
  title: z.string().max(500),
  artist: z.string().max(500),
  album: z.string().max(500).optional().default('Unknown Album'),
  artwork_url: z.string().max(2000).optional(),
  duration_ms: z.number().int().optional(),
  isrc: z.string().max(50).optional(),
})
