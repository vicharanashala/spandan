import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })
dotenv.config()

export const config = {
  smtpEmail: process.env.SMTP_EMAIL || '',
  smtpPassword: process.env.SMTP_PASSWORD || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  nvidiaApiKey: process.env.NVIDIA_API_KEY || '',
  minimaxApiKey: process.env.MINIMAX_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  googleApiKey: process.env.GOOGLE_API_KEY || '',
  nodeEnv: process.env.NODE_ENV || 'development'
}

export const AI_PROVIDERS = {
  nvidia: {
    name: 'NVIDIA NIM (Llama 3.1)',
    enabled: !!config.nvidiaApiKey,
    icon: '🟢'
  },
  minimax: {
    name: 'MiniMax',
    enabled: !!config.minimaxApiKey,
    icon: '🔵'
  },
  openai: {
    name: 'OpenAI',
    enabled: !!config.openaiApiKey,
    icon: '🟢'
  },
  anthropic: {
    name: 'Claude',
    enabled: !!config.anthropicApiKey,
    icon: '🟠'
  },
  google: {
    name: 'Gemini',
    enabled: !!config.googleApiKey,
    icon: '🔴'
  }
}