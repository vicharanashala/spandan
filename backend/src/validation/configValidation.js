import { z } from 'zod'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') })

const configSchema = z.object({
  PORT: z.string().regex(/^[0-9]+$/).transform(Number).default('3001'),
  BASE_PATH: z.string().default(''),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().min(1, 'MongoDB URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  MINIMAX_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  SMTP_EMAIL: z.string().email().optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  RATE_LIMIT_WINDOW_MS: z.string().regex(/^[0-9]+$/).transform(Number).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().regex(/^[0-9]+$/).transform(Number).default('2000'),
  RATE_LIMIT_AUTH_WINDOW_MS: z.string().regex(/^[0-9]+$/).transform(Number).default('3600000'),
  RATE_LIMIT_AUTH_MAX_REQUESTS: z.string().regex(/^[0-9]+$/).transform(Number).default('300'),
  RATE_LIMIT_RESPONSE_WINDOW_MS: z.string().regex(/^[0-9]+$/).transform(Number).default('900000'),
  RATE_LIMIT_RESPONSE_MAX_REQUESTS: z.string().regex(/^[0-9]+$/).transform(Number).default('5000'),
  RATE_LIMIT_LEADERBOARD_WINDOW_MS: z.string().regex(/^[0-9]+$/).transform(Number).default('900000'),
  RATE_LIMIT_LEADERBOARD_MAX_REQUESTS: z.string().regex(/^[0-9]+$/).transform(Number).default('10000'),
})

const envConfig = (() => {
  try {
    const config = configSchema.parse(process.env)
    return config
  } catch (error) {
    console.error('Environment configuration error:', error.message)
    console.error('\nRequired environment variables:')
    console.error('  MONGODB_URI - MongoDB connection string')
    console.error('  JWT_SECRET - JWT signing key (minimum 32 characters)')
    console.error('  MINIMAX_API_KEY - AI question generation API key')
    console.error('  OPENAI_API_KEY - AI question generation API key')
    console.error('  ANTHROPIC_API_KEY - AI question generation API key')
    console.error('  GOOGLE_API_KEY - AI question generation API key')
    console.error('\nBackend will continue with partial configuration')
    return {} 
  }
})()

export default {
  config: envConfig,
  JWT_SECRET: envConfig.JWT_SECRET,
  PORT: envConfig.PORT,
  MONGODB_URI: envConfig.MONGODB_URI,
  BASE_PATH: envConfig.BASE_PATH,
  CORS_ORIGINS: envConfig.CORS_ORIGINS.split(',').map(s => s.trim()),
  RATE_LIMITS: {
    api: {
      windowMs: envConfig.RATE_LIMIT_WINDOW_MS,
      max: envConfig.RATE_LIMIT_MAX_REQUESTS
    },
    auth: {
      windowMs: envConfig.RATE_LIMIT_AUTH_WINDOW_MS,
      max: envConfig.RATE_LIMIT_AUTH_MAX_REQUESTS
    },
    responses: {
      windowMs: envConfig.RATE_LIMIT_RESPONSE_WINDOW_MS,
      max: envConfig.RATE_LIMIT_RESPONSE_MAX_REQUESTS
    },
    leaderboard: {
      windowMs: envConfig.RATE_LIMIT_LEADERBOARD_WINDOW_MS,
      max: envConfig.RATE_LIMIT_LEADERBOARD_MAX_REQUESTS
    }
  },
  isProduction: envConfig.NODE_ENV === 'production'
}
